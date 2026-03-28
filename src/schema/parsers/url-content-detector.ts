/**
 * URL Content Detector
 *
 * Deterministic layer that fetches a URL, parses the response, and decides
 * whether it's an OpenAPI spec or some other API documentation format.
 *
 * Layer 1 of the self-healing pipeline: fetch + detect before routing.
 *
 * @module url-content-detector
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export interface URLContentDetection {
  isOpenAPI: boolean;
  confidence: number;
  reason: string;
  parsedContent: object | null;
  rawContent: string;
  contentSummary: string;
  /** If the URL returned HTML, this will be true */
  isHTML: boolean;
  /** If HTML contained an embedded spec URL, it will be here */
  discoveredSpecUrl: string | null;
  metadata: {
    contentType: string;
    contentLength: number;
    url: string;
    topLevelKeys: string[];
    isJSON: boolean;
  };
}

interface CacheEntry {
  data: URLContentDetection;
  timestamp: number;
  ttl: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const FETCH_TIMEOUT_MS = 30_000;
const CACHE_DIR = '.cache/url-content';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const SUMMARY_MAX_DEPTH = 3;
const SUMMARY_MAX_VALUE_LENGTH = 100;
const SUMMARY_MAX_BYTES = 3072; // ~3KB

// =============================================================================
// CACHE HELPERS
// =============================================================================

function urlHash(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCachePath(url: string): string {
  return path.join(CACHE_DIR, `${urlHash(url)}.json`);
}

function readCache(url: string): URLContentDetection | null {
  const cachePath = getCachePath(url);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const entry: CacheEntry = JSON.parse(raw);

    if (Date.now() > entry.timestamp + entry.ttl) {
      fs.unlinkSync(cachePath);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(url: string, data: URLContentDetection): void {
  ensureCacheDir();
  const entry: CacheEntry = {
    data,
    timestamp: Date.now(),
    ttl: CACHE_TTL_MS,
  };
  fs.writeFileSync(getCachePath(url), JSON.stringify(entry), 'utf8');
}

// =============================================================================
// CONTENT SUMMARY GENERATOR
// =============================================================================

/**
 * Generate a depth-limited summary of a parsed document.
 * Walks the tree to depth 3, truncates values to 100 chars, caps total at ~3KB.
 */
export function generateContentSummary(
  content: object,
  maxBytes: number = SUMMARY_MAX_BYTES
): string {
  const lines: string[] = [];
  let currentBytes = 0;

  function walk(obj: unknown, indent: number, depth: number): void {
    if (currentBytes >= maxBytes) return;
    if (depth > SUMMARY_MAX_DEPTH) {
      const line = `${'  '.repeat(indent)}...`;
      lines.push(line);
      currentBytes += line.length + 1;
      return;
    }

    if (Array.isArray(obj)) {
      const line = `${'  '.repeat(indent)}[Array: ${obj.length} items]`;
      lines.push(line);
      currentBytes += line.length + 1;
      if (obj.length > 0 && depth < SUMMARY_MAX_DEPTH) {
        walk(obj[0], indent + 1, depth + 1);
        if (obj.length > 1) {
          const moreLine = `${'  '.repeat(indent + 1)}... (${obj.length - 1} more)`;
          lines.push(moreLine);
          currentBytes += moreLine.length + 1;
        }
      }
      return;
    }

    if (obj !== null && typeof obj === 'object') {
      const keys = Object.keys(obj as Record<string, unknown>);
      for (const key of keys) {
        if (currentBytes >= maxBytes) return;
        const value = (obj as Record<string, unknown>)[key];

        if (value === null || value === undefined) {
          const line = `${'  '.repeat(indent)}${key}: null`;
          lines.push(line);
          currentBytes += line.length + 1;
        } else if (typeof value === 'string') {
          const truncated =
            value.length > SUMMARY_MAX_VALUE_LENGTH
              ? value.slice(0, SUMMARY_MAX_VALUE_LENGTH) + '...'
              : value;
          const line = `${'  '.repeat(indent)}${key}: "${truncated}"`;
          lines.push(line);
          currentBytes += line.length + 1;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          const line = `${'  '.repeat(indent)}${key}: ${value}`;
          lines.push(line);
          currentBytes += line.length + 1;
        } else if (Array.isArray(value)) {
          const line = `${'  '.repeat(indent)}${key}:`;
          lines.push(line);
          currentBytes += line.length + 1;
          walk(value, indent + 1, depth + 1);
        } else if (typeof value === 'object') {
          const line = `${'  '.repeat(indent)}${key}:`;
          lines.push(line);
          currentBytes += line.length + 1;
          walk(value, indent + 1, depth + 1);
        }
      }
      return;
    }

    // Primitive
    const strVal = String(obj);
    const truncated =
      strVal.length > SUMMARY_MAX_VALUE_LENGTH
        ? strVal.slice(0, SUMMARY_MAX_VALUE_LENGTH) + '...'
        : strVal;
    const line = `${'  '.repeat(indent)}${truncated}`;
    lines.push(line);
    currentBytes += line.length + 1;
  }

  walk(content, 0, 0);
  return lines.join('\n');
}

// =============================================================================
// OPENAPI DETECTION
// =============================================================================

function detectOpenAPI(parsed: object): { isOpenAPI: boolean; confidence: number; reason: string } {
  const obj = parsed as Record<string, unknown>;
  const keys = Object.keys(obj);

  // OpenAPI 3.x: has "openapi" key starting with "3."
  if (typeof obj.openapi === 'string' && obj.openapi.startsWith('3.')) {
    return {
      isOpenAPI: true,
      confidence: 0.99,
      reason: `OpenAPI ${obj.openapi} specification detected`,
    };
  }

  // Swagger 2.x: has "swagger" key starting with "2."
  if (typeof obj.swagger === 'string' && obj.swagger.startsWith('2.')) {
    return {
      isOpenAPI: true,
      confidence: 0.99,
      reason: `Swagger ${obj.swagger} specification detected`,
    };
  }

  // Heuristic: has both "paths" and "info" keys (likely OpenAPI without version key)
  if (keys.includes('paths') && keys.includes('info')) {
    return {
      isOpenAPI: true,
      confidence: 0.8,
      reason: 'Document has "paths" and "info" keys (likely OpenAPI)',
    };
  }

  return {
    isOpenAPI: false,
    confidence: 0.9,
    reason: `Not an OpenAPI spec. Top-level keys: ${keys.slice(0, 10).join(', ')}`,
  };
}

// =============================================================================
// HTML SPEC URL EXTRACTION
// =============================================================================

/**
 * Detect if raw content is HTML and try to extract an embedded OpenAPI spec URL.
 *
 * Handles common API documentation frameworks:
 * - Redoc: spec-url attribute or redoc.init() call
 * - Swagger UI: url param in SwaggerUIBundle config
 * - drf-yasg (Django): ?format=openapi or ?format=json query params
 * - RapiDoc: spec-url attribute
 * - Generic: links to .yaml/.yml/.json files that look like specs
 */
function extractSpecUrlFromHTML(html: string, baseUrl: string): string | null {
  // Normalize base URL for resolving relative paths
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }

  function resolve(candidate: string): string {
    try {
      return new URL(candidate, base).href;
    } catch {
      return candidate;
    }
  }

  // 1. drf-yasg: page URL with ?format=openapi or ?format=json
  //    These frameworks serve the spec from the same URL with a format query param
  if (
    html.includes('drf-yasg') ||
    html.includes('django-rest-framework') ||
    html.includes('redoc-init.js') ||
    html.includes('swagger-ui-init.js')
  ) {
    // Try the standard drf-yasg format params
    const drfUrl = new URL(baseUrl);
    drfUrl.searchParams.set('format', 'openapi');
    return drfUrl.href;
  }

  // 2. Redoc: spec-url="..." attribute
  const redocSpecUrl = html.match(/spec-url=["']([^"']+)["']/i);
  if (redocSpecUrl) {
    return resolve(redocSpecUrl[1]);
  }

  // 3. Redoc: Redoc.init("url", ...)
  const redocInit = html.match(/Redoc\.init\(\s*["']([^"']+)["']/i);
  if (redocInit) {
    return resolve(redocInit[1]);
  }

  // 4. Swagger UI: url: "..." in SwaggerUIBundle config
  const swaggerUrl = html.match(/SwaggerUIBundle\(\s*\{[^}]*url\s*:\s*["']([^"']+)["']/s);
  if (swaggerUrl) {
    return resolve(swaggerUrl[1]);
  }

  // 5. Swagger UI: url = "..." standalone assignment pattern
  const swaggerUrl2 = html.match(/swagger[_-]?ui[^{]*\{[^}]*url\s*[:=]\s*["']([^"']+)["']/si);
  if (swaggerUrl2) {
    return resolve(swaggerUrl2[1]);
  }

  // 6. RapiDoc: spec-url="..."
  const rapidocUrl = html.match(/<rapi-doc[^>]*spec-url=["']([^"']+)["']/i);
  if (rapidocUrl) {
    return resolve(rapidocUrl[1]);
  }

  // 7. Generic: link or script referencing openapi/swagger spec files
  const specFilePatterns = [
    /["']((?:https?:\/\/[^"']*|\/[^"']*)?(?:openapi|swagger)[^"']*\.(?:json|ya?ml))["']/gi,
    /["']((?:https?:\/\/[^"']*|\/[^"']*)\.(?:json|ya?ml))["']/gi,
  ];

  for (const pattern of specFilePatterns) {
    const matches = [...html.matchAll(pattern)];
    for (const match of matches) {
      const candidate = match[1];
      // Filter out obvious non-spec files (CSS, JS, images, fonts)
      if (/\.(css|js|png|jpg|gif|svg|woff|ttf|ico)/i.test(candidate)) continue;
      // Prioritize candidates with openapi/swagger in the name
      if (/openapi|swagger|api-spec|api-docs/i.test(candidate)) {
        return resolve(candidate);
      }
    }
  }

  return null;
}

/**
 * Check if raw content looks like HTML
 */
function isHTMLContent(content: string, contentType: string): boolean {
  if (contentType.includes('text/html')) return true;
  const trimmed = content.trimStart().slice(0, 500).toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html') || trimmed.includes('<head');
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Fetch a URL, parse its content, and detect whether it's an OpenAPI specification.
 *
 * @param url - The URL to fetch and analyze
 * @returns Detection result with parsed content, summary, and metadata
 */
export async function fetchAndDetectContent(url: string): Promise<URLContentDetection> {
  // Check cache first
  const cached = readCache(url);
  if (cached) {
    return cached;
  }

  // Fetch with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let rawContent: string;
  let contentType = '';

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, application/yaml, text/yaml, text/plain, */*',
        'User-Agent': 'agentic-sandbox/1.0',
      },
    });

    if (!response.ok) {
      const errorResult: URLContentDetection = {
        isOpenAPI: false,
        confidence: 0,
        reason: `HTTP ${response.status}: ${response.statusText}`,
        parsedContent: null,
        rawContent: '',
        contentSummary: '',
        isHTML: false,
        discoveredSpecUrl: null,
        metadata: {
          contentType: response.headers.get('content-type') || '',
          contentLength: 0,
          url,
          topLevelKeys: [],
          isJSON: false,
        },
      };
      return errorResult;
    }

    contentType = response.headers.get('content-type') || '';
    rawContent = await response.text();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === 'AbortError'
          ? `Timeout after ${FETCH_TIMEOUT_MS}ms`
          : error.message
        : 'Unknown fetch error';

    return {
      isOpenAPI: false,
      confidence: 0,
      reason: `Fetch failed: ${message}`,
      parsedContent: null,
      rawContent: '',
      contentSummary: '',
      isHTML: false,
      discoveredSpecUrl: null,
      metadata: {
        contentType: '',
        contentLength: 0,
        url,
        topLevelKeys: [],
        isJSON: false,
      },
    };
  } finally {
    clearTimeout(timeout);
  }

  // Try to parse as JSON first
  let parsedContent: object | null = null;
  let isJSON = false;

  try {
    parsedContent = JSON.parse(rawContent);
    isJSON = true;
  } catch {
    // Try YAML
    try {
      // Dynamic import for js-yaml (devDependency, used in CLI context)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const yaml = require('js-yaml');
      const yamlResult = yaml.load(rawContent);
      if (yamlResult && typeof yamlResult === 'object') {
        parsedContent = yamlResult as object;
      }
    } catch {
      // Neither JSON nor YAML
    }
  }

  const topLevelKeys = parsedContent ? Object.keys(parsedContent) : [];

  // Check if content is HTML (common for API docs pages)
  const htmlDetected = !parsedContent && isHTMLContent(rawContent, contentType);
  let discoveredSpecUrl: string | null = null;

  if (htmlDetected) {
    // Try to extract embedded OpenAPI spec URL from the HTML
    discoveredSpecUrl = extractSpecUrlFromHTML(rawContent, url);
  }

  // Detect if OpenAPI
  let detection: { isOpenAPI: boolean; confidence: number; reason: string };
  if (parsedContent) {
    detection = detectOpenAPI(parsedContent);
  } else if (htmlDetected && discoveredSpecUrl) {
    detection = {
      isOpenAPI: false,
      confidence: 0.7,
      reason: `HTML docs page detected. Found embedded spec URL: ${discoveredSpecUrl}`,
    };
  } else if (htmlDetected) {
    detection = {
      isOpenAPI: false,
      confidence: 0.3,
      reason: 'HTML docs page detected but no embedded spec URL found',
    };
  } else {
    detection = {
      isOpenAPI: false,
      confidence: 0.5,
      reason: 'Content could not be parsed as JSON or YAML',
    };
  }

  // Generate summary
  const contentSummary = parsedContent
    ? generateContentSummary(parsedContent)
    : rawContent.slice(0, SUMMARY_MAX_BYTES);

  const result: URLContentDetection = {
    isOpenAPI: detection.isOpenAPI,
    confidence: detection.confidence,
    reason: detection.reason,
    parsedContent,
    rawContent,
    contentSummary,
    isHTML: htmlDetected,
    discoveredSpecUrl,
    metadata: {
      contentType,
      contentLength: rawContent.length,
      url,
      topLevelKeys,
      isJSON,
    },
  };

  // Cache the result (without rawContent to save disk space)
  const cacheResult = { ...result, rawContent: '' };
  writeCache(url, cacheResult);

  return result;
}
