/**
 * Multi-Source Schema Fetcher
 *
 * Fetches API schemas in parallel from 4 public registries:
 * - APIs.guru (aggregated OpenAPI specs)
 * - GitHub (known repos + code search fallback)
 * - Apideck (unified normalized specs)
 * - Postman (public collections)
 *
 * Each source returns a RawSourceSchema that feeds into the existing
 * parser pipeline and then the reconciler.
 *
 * @module schema/sources/multi-source-fetcher
 */

import logger from '../../utils/logger';
import { SchemaCache } from '../cache/schema-cache';
import {
  getSourceConfig,
  APIS_GURU_INDEX_URL,
  GITHUB_SEARCH_URL,
} from './registry';
import { filterRelevantSchemas, filterRelevantPaths } from './verticals';

// =============================================================================
// TYPES
// =============================================================================

/** Raw schema data from a single source */
export interface RawSourceSchema {
  source: string;
  connector: string;
  openApiVersion?: string;
  schemas: Record<string, unknown>;
  paths: Record<string, unknown>;
  authSchemes: Record<string, unknown>;
  info?: Record<string, unknown>;
  specUrl?: string;
}

/** Result from multi-source fetch */
export interface MultiSourceResult {
  connector: string;
  sources: RawSourceSchema[];
  errors: Array<{ source: string; error: string }>;
  fetchDurationMs: number;
}

// =============================================================================
// CACHE
// =============================================================================

const INDEX_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const SPEC_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const indexCache = new SchemaCache({
  cacheDir: '.cache/harvester/indices',
  defaultTTL: INDEX_CACHE_TTL,
});

const specCache = new SchemaCache({
  cacheDir: '.cache/harvester/specs',
  defaultTTL: SPEC_CACHE_TTL,
});

// =============================================================================
// FETCH HELPERS
// =============================================================================

async function fetchJSON(url: string, headers?: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
}

function parseYAMLorJSON(text: string): unknown {
  // Try JSON first (faster)
  try {
    return JSON.parse(text);
  } catch {
    // Fall back to YAML via js-yaml (devDependency — use require)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const yaml = require('js-yaml');
      return yaml.load(text);
    } catch {
      throw new Error('Content is neither valid JSON nor YAML');
    }
  }
}

// =============================================================================
// INDIVIDUAL SOURCE FETCHERS
// =============================================================================

async function fetchFromApisGuru(connector: string, provider: string): Promise<RawSourceSchema | null> {
  const cacheKey = `apisguru_index`;
  let index = await indexCache.get<Record<string, unknown>>(cacheKey);

  if (!index) {
    logger.info('[apis_guru] Loading API index...');
    index = (await fetchJSON(APIS_GURU_INDEX_URL)) as Record<string, unknown>;
    await indexCache.set(cacheKey, index, INDEX_CACHE_TTL);
  }

  // Find matching entries
  const matches: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(index)) {
    if (key.includes(provider)) {
      matches[key] = value;
    }
  }

  if (Object.keys(matches).length === 0) {
    logger.info(`[apis_guru] No match for provider=${provider}`);
    return null;
  }

  // Pick the first match and preferred version
  const apiKey = Object.keys(matches)[0];
  const apiMeta = matches[apiKey] as Record<string, unknown>;
  const preferred = apiMeta.preferred as string | undefined;
  const versions = (apiMeta.versions || {}) as Record<string, Record<string, unknown>>;
  const versionInfo = (preferred && versions[preferred]) || Object.values(versions)[0];

  if (!versionInfo) return null;

  const specUrl =
    (versionInfo.swaggerUrl as string) || (versionInfo.openApiUrl as string);
  if (!specUrl) return null;

  // Check spec cache
  const specCacheKey = `apisguru_spec_${connector}`;
  let spec = await specCache.get<Record<string, unknown>>(specCacheKey);
  if (!spec) {
    logger.info(`[apis_guru] Fetching spec for ${connector} from ${specUrl}`);
    spec = (await fetchJSON(specUrl)) as Record<string, unknown>;
    await specCache.set(specCacheKey, spec, SPEC_CACHE_TTL);
  }

  const components = (spec.components || {}) as Record<string, Record<string, unknown>>;

  return {
    source: 'apis_guru',
    connector,
    openApiVersion: (spec.openapi || spec.swagger) as string | undefined,
    schemas: components.schemas || (spec.definitions as Record<string, unknown>) || {},
    paths: (spec.paths || {}) as Record<string, unknown>,
    authSchemes:
      components.securitySchemes ||
      (spec.securityDefinitions as Record<string, unknown>) ||
      {},
    info: (spec.info || {}) as Record<string, unknown>,
    specUrl,
  };
}

async function fetchFromGitHub(connector: string, repos: string[]): Promise<RawSourceSchema | null> {
  // 1. Try known repos first
  for (const url of repos) {
    try {
      const specCacheKey = `github_${connector}_${Buffer.from(url).toString('base64').slice(0, 32)}`;
      let spec = await specCache.get<Record<string, unknown>>(specCacheKey);

      if (!spec) {
        logger.info(`[github] Trying known repo: ${url}`);
        const text = await fetchText(url);
        spec = parseYAMLorJSON(text) as Record<string, unknown>;
        await specCache.set(specCacheKey, spec, SPEC_CACHE_TTL);
      }

      if (spec && spec.paths) {
        return extractGitHubResult(connector, spec, url);
      }
    } catch (e) {
      logger.debug(`[github] ${url} failed: ${e}`);
    }
  }

  // 2. Fallback: GitHub code search (unauthenticated, rate-limited)
  try {
    const searchUrl = GITHUB_SEARCH_URL.replace('{connector}', connector);
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const results = (await fetchJSON(searchUrl, headers)) as Record<string, unknown>;

    const items = (results.items || []) as Array<Record<string, string>>;
    for (const item of items.slice(0, 3)) {
      const htmlUrl = item.html_url || '';
      const rawUrl = htmlUrl
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/');
      if (!rawUrl) continue;

      try {
        const text = await fetchText(rawUrl);
        const spec = parseYAMLorJSON(text) as Record<string, unknown>;
        if (spec && spec.paths) {
          return extractGitHubResult(connector, spec, rawUrl);
        }
      } catch {
        continue;
      }
    }
  } catch (e) {
    logger.warn(`[github] Search failed for ${connector}: ${e}`);
  }

  return null;
}

function extractGitHubResult(
  connector: string,
  spec: Record<string, unknown>,
  sourceUrl: string
): RawSourceSchema {
  const components = (spec.components || {}) as Record<string, Record<string, unknown>>;
  return {
    source: `github:${sourceUrl}`,
    connector,
    openApiVersion: (spec.openapi || spec.swagger) as string | undefined,
    schemas: components.schemas || (spec.definitions as Record<string, unknown>) || {},
    paths: (spec.paths || {}) as Record<string, unknown>,
    authSchemes:
      components.securitySchemes ||
      (spec.securityDefinitions as Record<string, unknown>) ||
      {},
    info: (spec.info || {}) as Record<string, unknown>,
    specUrl: sourceUrl,
  };
}

async function fetchFromApideck(
  connector: string,
  category: string,
  specUrl: string
): Promise<RawSourceSchema | null> {
  const specCacheKey = `apideck_${category}`;
  let spec = await specCache.get<Record<string, unknown>>(specCacheKey);

  if (!spec) {
    logger.info(`[apideck] Fetching ${category} spec from ${specUrl}`);
    const text = await fetchText(specUrl);
    spec = parseYAMLorJSON(text) as Record<string, unknown>;
    await specCache.set(specCacheKey, spec, SPEC_CACHE_TTL);
  }

  const components = (spec.components || {}) as Record<string, Record<string, unknown>>;
  const allSchemas = components.schemas || {};
  const allPaths = (spec.paths || {}) as Record<string, unknown>;

  // Filter to relevant entities for this connector's category
  const filteredSchemas = filterRelevantSchemas(allSchemas, category);
  const filteredPaths = filterRelevantPaths(allPaths, category);

  return {
    source: 'apideck',
    connector,
    openApiVersion: spec.openapi as string | undefined,
    schemas: filteredSchemas,
    paths: filteredPaths,
    authSchemes: components.securitySchemes || {},
    specUrl,
  };
}

async function fetchFromPostman(
  connector: string,
  collectionUrl: string
): Promise<RawSourceSchema | null> {
  const specCacheKey = `postman_${connector}`;
  let collection = await specCache.get<Record<string, unknown>>(specCacheKey);

  if (!collection) {
    logger.info(`[postman] Fetching collection for ${connector}`);
    collection = (await fetchJSON(collectionUrl)) as Record<string, unknown>;
    await specCache.set(specCacheKey, collection, SPEC_CACHE_TTL);
  }

  return convertPostmanCollection(connector, collection);
}

// =============================================================================
// POSTMAN COLLECTION CONVERSION
// =============================================================================

function convertPostmanCollection(
  connector: string,
  collection: Record<string, unknown>
): RawSourceSchema | null {
  const items = (collection.item || []) as Array<Record<string, unknown>>;
  const paths: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};

  for (const item of flattenPostmanItems(items)) {
    const request = (item.request || {}) as Record<string, unknown>;
    const url = request.url;
    const pathStr = extractPostmanPath(url);
    const method = ((request.method as string) || 'GET').toLowerCase();

    if (!pathStr) continue;
    if (!paths[pathStr]) paths[pathStr] = {};

    const body = (request.body || {}) as Record<string, unknown>;
    const bodySchema = parsePostmanBody(body);

    (paths[pathStr] as Record<string, unknown>)[method] = {
      summary: item.name,
      ...(bodySchema
        ? { requestBody: { content: { 'application/json': { schema: bodySchema } } } }
        : {}),
      responses: { '200': { description: 'Success' } },
    };

    if (bodySchema && item.name) {
      schemas[String(item.name).replace(/\s+/g, '')] = bodySchema;
    }
  }

  if (Object.keys(paths).length === 0) return null;

  // Extract auth from collection
  const auth = (collection.auth || {}) as Record<string, unknown>;
  const authType = (auth.type || '') as string;
  const authSchemes: Record<string, unknown> = authType
    ? {
        [authType]: {
          type: authType.includes('oauth') ? 'oauth2' : authType,
          source: 'postman_collection',
        },
      }
    : {};

  return {
    source: 'postman',
    connector,
    schemas,
    paths,
    authSchemes,
  };
}

function flattenPostmanItems(
  items: Array<Record<string, unknown>>,
  depth = 0
): Array<Record<string, unknown>> {
  if (depth > 5) return [];
  const flat: Array<Record<string, unknown>> = [];
  for (const item of items) {
    if (item.item) {
      flat.push(...flattenPostmanItems(item.item as Array<Record<string, unknown>>, depth + 1));
    } else if (item.request) {
      flat.push(item);
    }
  }
  return flat;
}

function extractPostmanPath(url: unknown): string | null {
  if (typeof url === 'string') {
    const parts = url.split('//').pop()?.split('/').slice(1) || [];
    return parts.length > 0 ? '/' + parts.join('/') : null;
  }
  if (typeof url === 'object' && url !== null) {
    const raw = (url as Record<string, string>).raw || '';
    const parts = raw.split('//').pop()?.split('/').slice(1) || [];
    const pathStr = parts.join('/').split('?')[0];
    return pathStr ? '/' + pathStr : null;
  }
  return null;
}

function parsePostmanBody(body: Record<string, unknown>): Record<string, unknown> | null {
  if (!body || !body.mode) return null;
  if (body.mode === 'raw') {
    try {
      const obj = JSON.parse(body.raw as string);
      return inferJSONSchema(obj);
    } catch {
      return null;
    }
  }
  return null;
}

function inferJSONSchema(obj: unknown): Record<string, unknown> {
  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      props[k] = inferJSONSchema(v);
    }
    return { type: 'object', properties: props };
  }
  if (Array.isArray(obj)) {
    return { type: 'array', items: obj.length > 0 ? inferJSONSchema(obj[0]) : {} };
  }
  if (typeof obj === 'boolean') return { type: 'boolean' };
  if (typeof obj === 'number') {
    return Number.isInteger(obj) ? { type: 'integer' } : { type: 'number' };
  }
  return { type: 'string' };
}

// =============================================================================
// MAIN MULTI-SOURCE FETCH
// =============================================================================

/**
 * Fetch schemas from all available sources for a connector in parallel.
 *
 * Each source runs independently — individual source failures don't block others.
 * Results are returned as an array of RawSourceSchemas for the reconciler.
 */
export async function fetchFromAllSources(connector: string): Promise<MultiSourceResult> {
  const startTime = Date.now();
  const config = getSourceConfig(connector);
  const sources: RawSourceSchema[] = [];
  const errors: Array<{ source: string; error: string }> = [];

  // Build parallel fetch tasks
  const tasks: Array<{ name: string; task: Promise<RawSourceSchema | null> }> = [];

  // APIs.guru
  if (config.apisGuru.provider) {
    tasks.push({
      name: 'apis_guru',
      task: fetchFromApisGuru(connector, config.apisGuru.provider),
    });
  }

  // GitHub
  if (config.github.repos.length > 0) {
    tasks.push({
      name: 'github',
      task: fetchFromGitHub(connector, config.github.repos),
    });
  } else {
    // Try code search even without known repos
    tasks.push({
      name: 'github',
      task: fetchFromGitHub(connector, []),
    });
  }

  // Apideck
  if (config.apideck.category && config.apideck.specUrl) {
    tasks.push({
      name: 'apideck',
      task: fetchFromApideck(connector, config.apideck.category, config.apideck.specUrl),
    });
  }

  // Postman
  if (config.postman.collectionUrl) {
    tasks.push({
      name: 'postman',
      task: fetchFromPostman(connector, config.postman.collectionUrl),
    });
  }

  // Execute all in parallel
  const results = await Promise.allSettled(tasks.map((t) => t.task));

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const taskName = tasks[i].name;

    if (result.status === 'fulfilled' && result.value) {
      sources.push(result.value);
      logger.info(`[${taskName}] Found schema for ${connector} (${Object.keys(result.value.schemas).length} schemas, ${Object.keys(result.value.paths).length} paths)`);
    } else if (result.status === 'rejected') {
      const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push({ source: taskName, error: errorMsg });
      logger.warn(`[${taskName}] Failed for ${connector}: ${errorMsg}`);
    } else {
      logger.info(`[${taskName}] No schema found for ${connector}`);
    }
  }

  return {
    connector,
    sources,
    errors,
    fetchDurationMs: Date.now() - startTime,
  };
}
