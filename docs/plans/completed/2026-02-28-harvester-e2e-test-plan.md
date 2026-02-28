# E2E Test Plan: Hybrid Schema Harvester + Factory CLI

**Branch:** `feat/hybrid-schema-harvester`
**Date:** 2026-02-28
**Purpose:** Validate that the factory CLI correctly routes inputs through the right schema discovery path and produces usable output.

---

## Test Strategy

There are **3 distinct input flows** into the schema pipeline. Each must be tested independently.

```
Flow A: URL-based         →  create -c netsuite -o org -a https://...
Flow B: Connector name    →  harvest -c netsuite  (multi-source discovery)
Flow C: Existing schema   →  create -c netsuite -o org -s ./schema.json
```

Tests are ordered from cheapest/fastest (no network, no LLM) to most expensive (live fetch + LLM).

---

## Pre-Requisites

```bash
# Build check — must pass before any tests
npx tsc --noEmit 2>&1 | grep -v node_modules
# Expected: only pre-existing connectorToFabricate.ts:438 error

# Ensure we're on the right branch
git branch --show-current
# Expected: feat/hybrid-schema-harvester
```

---

## GROUP 1: Input Detection (Unit-level, no network)

These tests verify that `detectInputType()` correctly classifies inputs.

### Test 1.1: URL input detected as URL type
```bash
npx ts-node -e "
const { detectInputType } = require('./src/schema/parsers');
const r = detectInputType('https://developers.xero.com/openapi.yaml');
console.log(JSON.stringify(r, null, 2));
"
```
**Expected:** `type: "openapi-url"`, `suggestedParser: "openapi"`

### Test 1.2: Known connector name detected as connector-name type
```bash
npx ts-node -e "
const { detectInputType } = require('./src/schema/parsers');
const connectors = ['netsuite', 'hubspot', 'xero', 'quickbooks', 'slack', 'zoho_books', 'salesforce', 'stripe', 'shopify'];
for (const c of connectors) {
  const r = detectInputType(c);
  console.log(c.padEnd(15), '→', r.type, '|', r.suggestedParser, '| confidence:', r.confidence);
}
"
```
**Expected:** All show `type: "connector-name"`, `suggestedParser: "multi-source"`, `confidence: 0.95`

### Test 1.3: Unknown text falls through to description
```bash
npx ts-node -e "
const { detectInputType } = require('./src/schema/parsers');
const r = detectInputType('A CRM API with contacts and deals');
console.log(JSON.stringify(r, null, 2));
"
```
**Expected:** `type: "description"`, `suggestedParser: "llm"`

### Test 1.4: File path detected correctly
```bash
npx ts-node -e "
const { detectInputType } = require('./src/schema/parsers');
const r = detectInputType('./schemas/netsuite.json');
console.log(JSON.stringify(r, null, 2));
"
```
**Expected:** `type: "openapi"` or `type: "file"` (depends on file content)

---

## GROUP 2: Source Registry (Unit-level, no network)

### Test 2.1: Registry returns correct source configs
```bash
npx ts-node -e "
const { getSourceConfig, getAllKnownConnectors } = require('./src/schema/sources/registry');
console.log('Known connectors:', getAllKnownConnectors().length);
console.log('');
const cfg = getSourceConfig('netsuite');
console.log('netsuite sources:');
console.log('  apideck:', cfg.apideck.category, '→', cfg.apideck.specUrl ? 'has URL' : 'no URL');
console.log('  apisGuru:', cfg.apisGuru.provider || 'none');
console.log('  github:', cfg.github.repos.length, 'known repos');
console.log('  postman:', cfg.postman.collectionUrl ? 'has URL' : 'none');
"
```
**Expected:** netsuite has apideck=accounting, apisGuru=none (not in provider map), github=2 repos, postman=has URL

### Test 2.2: Verticals return correct connectors
```bash
npx ts-node -e "
const { getConnectorsForVertical, getAllVerticals, getVerticalForConnector } = require('./src/schema/sources/verticals');
console.log('Verticals:', getAllVerticals());
console.log('finance:', getConnectorsForVertical('finance'));
console.log('crm:', getConnectorsForVertical('crm'));
console.log('netsuite vertical:', getVerticalForConnector('netsuite'));
console.log('hubspot vertical:', getVerticalForConnector('hubspot'));
"
```
**Expected:** finance includes netsuite/quickbooks/xero, crm includes hubspot/salesforce, reverse lookups correct

### Test 2.3: Entity filtering works
```bash
npx ts-node -e "
const { filterRelevantSchemas } = require('./src/schema/sources/verticals');
const testSchemas = {
  'Bill': { type: 'object' },
  'Invoice': { type: 'object' },
  'RandomEndpoint': { type: 'object' },
  'BillPayment': { type: 'object' },
  'Webhook': { type: 'object' },
};
const filtered = filterRelevantSchemas(testSchemas, 'accounting');
console.log('Input keys:', Object.keys(testSchemas));
console.log('Filtered keys:', Object.keys(filtered));
"
```
**Expected:** Filtered contains Bill, Invoice, BillPayment. RandomEndpoint and Webhook excluded.

---

## GROUP 3: Harvest CLI Command (requires network)

### Test 3.1: List connectors
```bash
npx ts-node src/cli/index.ts harvest --list-connectors
```
**Expected:** Prints sorted list of all known connectors (netsuite, hubspot, slack, etc.)

### Test 3.2: List verticals
```bash
npx ts-node src/cli/index.ts harvest --list-verticals
```
**Expected:** Prints each vertical with its connectors (finance: netsuite, quickbooks, ...)

### Test 3.3: Harvest single connector (netsuite)
```bash
npx ts-node src/cli/index.ts harvest -c netsuite --verbose
```
**Expected:**
- Fetches from multiple sources in parallel
- Shows per-source results (X schemas, Y paths)
- Reconciles (deterministic if no ANTHROPIC_API_KEY, LLM if key is set)
- Saves to `schemas/harvested/netsuite.json`
- Reports entity count and quality score

**Verify output:**
```bash
# Schema file exists
ls -la schemas/harvested/netsuite.json

# Has required ConnectorSchema fields + harvest metadata
npx ts-node -e "
const fs = require('fs');
const s = JSON.parse(fs.readFileSync('schemas/harvested/netsuite.json', 'utf8'));
console.log('name:', s.name);
console.log('version:', s.version);
console.log('baseUrl:', s.baseUrl);
console.log('auth.type:', s.auth?.type);
console.log('entities:', s.entities?.length);
console.log('relationships:', s.relationships?.length);
console.log('_harvestedAt:', new Date(s._harvestedAt).toISOString());
console.log('_qualityScore:', s._qualityScore);
console.log('_sourcesUsed:', s._sourcesUsed);
"
```

### Test 3.4: Harvest single connector (hubspot)
```bash
npx ts-node src/cli/index.ts harvest -c hubspot --verbose
```
**Expected:** Same as 3.3 but for hubspot. Should find APIs.guru + GitHub + Apideck sources.

### Test 3.5: Harvest entire vertical
```bash
npx ts-node src/cli/index.ts harvest -v crm --verbose
```
**Expected:** Harvests hubspot, salesforce, zoho_crm, pipedrive. Some may fail (fewer sources). Summary shows X succeeded, Y failed.

### Test 3.6: Harvest with JSON output
```bash
npx ts-node src/cli/index.ts harvest -c xero --json
```
**Expected:** JSON output with `results` array and `outputDir` field.

### Test 3.7: Harvest unknown connector
```bash
npx ts-node src/cli/index.ts harvest -c nonexistent_api
```
**Expected:** Runs but reports "no sources found" for that connector.

### Test 3.8: Harvest with no args
```bash
npx ts-node src/cli/index.ts harvest
```
**Expected:** Error message: "Specify --connector or --vertical"

---

## GROUP 4: Flow A — URL-Based Schema Inference

Tests the existing URL path (unchanged behavior, regression check).

### Test 4.1: Create with API docs URL (dry-run)
```bash
npx ts-node src/cli/index.ts create \
  -c netsuite \
  -o testorg \
  -a https://developers.apideck.com/specs/accounting.yml \
  --dry-run
```
**Expected:** Shows pipeline configuration without executing. `apiDocsUrl` field populated.

### Test 4.2: parseSchema with URL input directly
```bash
npx ts-node -e "
const { parseSchema } = require('./src/schema/parsers');
(async () => {
  try {
    const result = await parseSchema('https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/master/xero_accounting.yaml', { verbose: true, name: 'xero' });
    console.log('Parser used:', result.parserUsed);
    console.log('Input type:', result.inputType);
    console.log('Entities:', result.schema.entities.length);
    console.log('Quality:', result.metadata.qualityScore);
    console.log('Warnings:', result.warnings.length);
  } catch (e) {
    console.error('ERROR:', e.message);
  }
})();
"
```
**Expected:** `parserUsed: "openapi"`, `inputType: "openapi-url"`, entities > 0

### Test 4.3: parseSchema with non-OpenAPI URL
```bash
npx ts-node -e "
const { parseSchema } = require('./src/schema/parsers');
(async () => {
  try {
    const result = await parseSchema('https://developers.google.com/workspace/products', { verbose: true, name: 'google_workspace' });
    console.log('Parser used:', result.parserUsed);
    console.log('Input type:', result.inputType);
  } catch (e) {
    console.error('ERROR (expected for non-spec URLs):', e.message.slice(0, 200));
  }
})();
"
```
**Expected:** Either routes to LLM agent parser or errors gracefully. Should NOT crash.

---

## GROUP 5: Flow B — Connector Name (Multi-Source Harvester Route)

The core new functionality. Tests that passing a connector name triggers multi-source discovery.

### Test 5.1: parseSchema with connector name "netsuite"
```bash
npx ts-node -e "
const { parseSchema } = require('./src/schema/parsers');
(async () => {
  try {
    const result = await parseSchema('netsuite', { verbose: true });
    console.log('=== RESULT ===');
    console.log('Parser used:', result.parserUsed);
    console.log('Input type:', result.inputType);
    console.log('Confidence:', result.confidence);
    console.log('Entities:', result.schema.entities.length);
    console.log('Entity names:', result.schema.entities.map(e => e.name).join(', '));
    console.log('Auth type:', result.schema.auth.type);
    console.log('Quality:', result.metadata.qualityScore);
    console.log('Sources used:', result.metadata.sourcesUsed);
    console.log('Fetch duration:', result.metadata.fetchDurationMs, 'ms');
    console.log('Warnings:', result.warnings);
  } catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
  }
})();
"
```
**Expected:**
- `parserUsed: "multi-source"`
- `inputType: "connector-name"`
- `confidence: >= 0.6`
- Multiple entities with proper names (Bill, Invoice, Customer, etc.)
- `metadata.sourcesUsed` has 1+ source names

### Test 5.2: parseSchema with "hubspot"
```bash
npx ts-node -e "
const { parseSchema } = require('./src/schema/parsers');
(async () => {
  const result = await parseSchema('hubspot', { verbose: true });
  console.log('Parser used:', result.parserUsed);
  console.log('Entities:', result.schema.entities.length);
  console.log('Entity names:', result.schema.entities.map(e => e.name).join(', '));
  console.log('Sources used:', result.metadata.sourcesUsed);
})();
"
```
**Expected:** `parserUsed: "multi-source"`, CRM entities (Contact, Lead, Company, etc.)

### Test 5.3: parseSchema with "zoho_books"
```bash
npx ts-node -e "
const { parseSchema } = require('./src/schema/parsers');
(async () => {
  const result = await parseSchema('zoho_books', { verbose: true });
  console.log('Parser used:', result.parserUsed);
  console.log('Entities:', result.schema.entities.length);
  console.log('Sources used:', result.metadata.sourcesUsed);
})();
"
```
**Expected:** `parserUsed: "multi-source"`, accounting entities

### Test 5.4: parseSchema with "slack"
```bash
npx ts-node -e "
const { parseSchema } = require('./src/schema/parsers');
(async () => {
  const result = await parseSchema('slack', { verbose: true });
  console.log('Parser used:', result.parserUsed);
  console.log('Entities:', result.schema.entities.length);
  console.log('Sources used:', result.metadata.sourcesUsed);
})();
"
```
**Expected:** `parserUsed: "multi-source"`, slack has GitHub source (slack-api-specs), no Apideck

### Test 5.5: Harvested cache is used on second run
```bash
# First: ensure harvested cache exists from Group 3 tests
ls schemas/harvested/netsuite.json

# Second: run parseSchema again — should hit cache
npx ts-node -e "
const { parseSchema } = require('./src/schema/parsers');
(async () => {
  const start = Date.now();
  const result = await parseSchema('netsuite', { verbose: true });
  const elapsed = Date.now() - start;
  console.log('Parser used:', result.parserUsed);
  console.log('Source:', result.metadata.source);
  console.log('Elapsed:', elapsed, 'ms');
  console.log('Cache hit:', result.metadata.source === 'harvested_cache');
})();
"
```
**Expected:** `metadata.source: "harvested_cache"`, elapsed < 500ms (no network calls)

### Test 5.6: Force multi-source parser on a URL (override)
```bash
npx ts-node -e "
const { parseSchema } = require('./src/schema/parsers');
(async () => {
  // This should still use URL detection, not multi-source, because it's a URL not a name
  const result = await parseSchema('https://developers.apideck.com/specs/accounting.yml', { verbose: true });
  console.log('Parser used:', result.parserUsed);
  console.log('Input type:', result.inputType);
})();
"
```
**Expected:** `parserUsed: "openapi"` — URLs don't trigger multi-source even for known domains

---

## GROUP 6: Flow C — Existing Schema File (regression)

### Test 6.1: Create with existing schema file (dry-run)
```bash
npx ts-node src/cli/index.ts create \
  -c netsuite \
  -o testorg \
  -s ./schemas/netsuite.json \
  --dry-run
```
**Expected:** Shows pipeline config with `schemaPath` populated, no network calls.

---

## GROUP 7: Factory Pipeline Integration

### Test 7.1: Pipeline finds harvested schema when no URL/schema provided
```bash
# Ensure harvested cache exists
ls schemas/harvested/netsuite.json

# Dry run without --api-docs or --schema — should find harvested cache
npx ts-node src/cli/index.ts create \
  -c netsuite \
  -o testorg \
  --skip-data \
  --skip-wiremock \
  --skip-ssl \
  --dry-run
```
**Expected:** Dry run shows pipeline config. No error about missing schema.

### Test 7.2: Pipeline error message suggests harvest when no schema found
```bash
# Remove any cached schema for a connector
rm -f schemas/harvested/bamboohr.json schemas/bamboohr.json

npx ts-node src/cli/index.ts create \
  -c bamboohr \
  -o testorg \
  --dry-run 2>&1 || true
```
**Expected:** If it reaches the "no schema" error, message should include: `Tip: Run 'mock-factory harvest -c bamboohr'`

---

## GROUP 8: Quality Validation

### Test 8.1: Quality scoring on harvested schema
```bash
npx ts-node -e "
const { validateSchemaQuality } = require('./src/schema/parsers/schema-quality-validator');
const fs = require('fs');
const schema = JSON.parse(fs.readFileSync('schemas/harvested/netsuite.json', 'utf8'));
// Strip metadata
delete schema._harvestedAt;
delete schema._qualityScore;
delete schema._sourcesUsed;
const report = validateSchemaQuality(schema);
console.log('Score:', report.score);
console.log('Shallow:', report.isShallow);
console.log('Entity count:', report.details.entityCount);
console.log('Avg fields:', report.details.avgFieldCount);
console.log('Warnings:', report.warnings);
"
```
**Expected:** Score > 50 (not shallow). If < 50, indicates reconciliation produced thin schemas.

---

## GROUP 9: Reconciler Modes

### Test 9.1: Deterministic merge (no ANTHROPIC_API_KEY)
```bash
# Temporarily unset key to force deterministic mode
ANTHROPIC_API_KEY= npx ts-node -e "
const { fetchFromAllSources } = require('./src/schema/sources/multi-source-fetcher');
const { reconcileSchemas } = require('./src/schema/reconciler');
(async () => {
  const sources = await fetchFromAllSources('xero');
  console.log('Sources found:', sources.sources.length);
  const result = await reconcileSchemas('xero', sources.sources, { apiKey: '' });
  console.log('Entities:', result.schema.entities.length);
  console.log('Confidence:', result.confidence);
  console.log('Warnings:', result.warnings);
  // Should warn about deterministic merge
  console.log('Has deterministic warning:', result.warnings.some(w => w.includes('deterministic')));
})();
"
```
**Expected:** Works without error. Warnings include "deterministic merge" note. Confidence ~0.65.

### Test 9.2: LLM reconciliation (with ANTHROPIC_API_KEY)
```bash
# Only run if key is set
if [ -n "$ANTHROPIC_API_KEY" ]; then
  npx ts-node -e "
  const { fetchFromAllSources } = require('./src/schema/sources/multi-source-fetcher');
  const { reconcileSchemas } = require('./src/schema/reconciler');
  (async () => {
    const sources = await fetchFromAllSources('hubspot');
    console.log('Sources found:', sources.sources.length);
    const result = await reconcileSchemas('hubspot', sources.sources);
    console.log('Entities:', result.schema.entities.length);
    console.log('Confidence:', result.confidence);
    console.log('Tokens used:', result.metadata.tokensUsed);
    console.log('Entity names:', result.schema.entities.map(e => e.name).join(', '));
  })();
  "
else
  echo "SKIP: ANTHROPIC_API_KEY not set"
fi
```
**Expected:** Higher confidence (~0.75-0.85), more entities, faker hints populated.

---

## GROUP 10: Edge Cases

### Test 10.1: Connector with very few sources
```bash
npx ts-node -e "
const { fetchFromAllSources } = require('./src/schema/sources/multi-source-fetcher');
(async () => {
  const result = await fetchFromAllSources('workday');
  console.log('Sources:', result.sources.length);
  console.log('Errors:', result.errors);
})();
"
```
**Expected:** May find 0-1 sources. Should not crash.

### Test 10.2: Connector with no sources at all
```bash
npx ts-node -e "
const { fetchFromAllSources } = require('./src/schema/sources/multi-source-fetcher');
(async () => {
  const result = await fetchFromAllSources('totally_unknown_api');
  console.log('Sources:', result.sources.length);
  console.log('Errors:', result.errors.length);
})();
"
```
**Expected:** 0 sources, no crash.

### Test 10.3: parseSchema falls back to LLM for unknown connector name
```bash
npx ts-node -e "
const { detectInputType } = require('./src/schema/parsers');
const r = detectInputType('totally_unknown_api');
console.log(JSON.stringify(r, null, 2));
"
```
**Expected:** `type: "description"`, `suggestedParser: "llm"` — not "connector-name"

### Test 10.4: Cache invalidation (stale cache)
```bash
npx ts-node -e "
const fs = require('fs');
const path = 'schemas/harvested/netsuite.json';
if (fs.existsSync(path)) {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  // Set timestamp to 8 days ago (stale)
  data._harvestedAt = Date.now() - (8 * 24 * 60 * 60 * 1000);
  data._qualityScore = 90;
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
  console.log('Cache set to stale (8 days old)');
} else {
  console.log('No cache file to modify');
}
"

# Now run parseSchema — should re-fetch, not use cache
npx ts-node -e "
const { parseSchema } = require('./src/schema/parsers');
(async () => {
  const result = await parseSchema('netsuite', { verbose: true });
  console.log('Source:', result.metadata.source);
  console.log('Used cache:', result.metadata.source === 'harvested_cache');
})();
"
```
**Expected:** `metadata.source` is NOT "harvested_cache" — stale cache bypassed.

### Test 10.5: Low quality cache is bypassed
```bash
npx ts-node -e "
const fs = require('fs');
const path = 'schemas/harvested/netsuite.json';
if (fs.existsSync(path)) {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  data._harvestedAt = Date.now(); // fresh
  data._qualityScore = 30;        // low quality
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
  console.log('Cache set to low quality (score=30)');
}
"

npx ts-node -e "
const { parseSchema } = require('./src/schema/parsers');
(async () => {
  const result = await parseSchema('netsuite', { verbose: true });
  console.log('Source:', result.metadata.source);
  console.log('Used cache:', result.metadata.source === 'harvested_cache');
})();
"
```
**Expected:** Cache bypassed because quality < 80.

---

## Execution Order

Run groups in this order:
1. **Group 1** (input detection) — no network, instant
2. **Group 2** (registry) — no network, instant
3. **Group 3** (harvest CLI) — needs network, creates cache files for later tests
4. **Group 8** (quality) — no network, uses Group 3 output
5. **Group 5** (connector name flow) — needs network OR uses cache
6. **Group 4** (URL flow) — needs network
7. **Group 6** (existing schema) — no network
8. **Group 7** (pipeline integration) — uses cache from Group 3
9. **Group 9** (reconciler modes) — needs network
10. **Group 10** (edge cases) — mixed

## Pass/Fail Criteria

| Criterion | Threshold |
|-----------|-----------|
| Groups 1-2 must fully pass | 100% |
| Group 3: harvest CLI produces output files | At least 1 connector succeeds |
| Groups 4-6: correct parser routing | 100% — wrong parser = fail |
| Group 5: multi-source produces entities | At least 1 entity per connector |
| Group 7: pipeline finds harvested cache | Must not error when cache exists |
| Group 8: quality score > 50 | Warn if not, fail if 0 |
| Group 9: deterministic mode works without API key | Must not crash |
| Group 10: no crashes on edge cases | 100% |

## Environment Notes

- `ANTHROPIC_API_KEY`: Optional. Without it, Group 9.2 skips, reconciliation uses deterministic merge.
- Network: Groups 3, 4, 5, 9 need internet access to fetch from public registries.
- No database needed: All tests use `--dry-run`, `--skip-data`, `--skip-wiremock`, or call parseSchema directly.
