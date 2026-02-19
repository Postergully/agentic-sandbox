/**
 * Schema Quality Validator
 *
 * Non-blocking quality gate that scores parsed schemas and warns
 * about shallow or suspicious patterns (e.g., version-prefix names,
 * too few fields, extreme endpoint:entity ratios).
 */

import { ConnectorSchema } from '../connector-schema';

export interface QualityReport {
  /** Quality score 0-100 */
  score: number;
  /** True when score < 50 — schema is likely too shallow for useful data generation */
  isShallow: boolean;
  /** Human-readable warnings (non-blocking) */
  warnings: string[];
  /** Detailed metrics */
  details: {
    entityCount: number;
    avgFieldCount: number;
    endpointEntityRatio: number;
  };
}

/**
 * Validate schema quality and return a non-blocking report.
 *
 * Scoring:
 * - Entity count: 0-30 points (>=5 entities = full marks)
 * - Avg field count: 0-40 points (>=5 fields avg = full marks)
 * - Name quality: 0-15 points (deducted if all names match version patterns)
 * - Endpoint balance: 0-15 points (deducted if ratio > 10:1)
 */
export function validateSchemaQuality(schema: ConnectorSchema): QualityReport {
  const warnings: string[] = [];
  let score = 100;

  const entityCount = schema.entities.length;
  const totalFields = schema.entities.reduce((sum, e) => sum + e.fields.length, 0);
  const avgFieldCount = entityCount > 0 ? Math.round(totalFields / entityCount) : 0;
  const totalEndpoints = schema.entities.reduce((sum, e) => sum + e.endpoints.length, 0);
  const endpointEntityRatio = entityCount > 0 ? Math.round(totalEndpoints / entityCount) : 0;

  // --- Entity count check (0-30 points) ---
  if (entityCount < 2) {
    score -= 30;
    warnings.push(`Schema has only ${entityCount} entity — most APIs have multiple entities.`);
  } else if (entityCount < 5) {
    score -= 15;
    warnings.push(`Schema has only ${entityCount} entities — consider verifying completeness.`);
  }

  // --- Average field count check (0-40 points) ---
  const shallowEntities = schema.entities.filter((e) => e.fields.length < 3);
  if (shallowEntities.length > 0) {
    const penalty = Math.min(40, shallowEntities.reduce((sum, e) => sum + (3 - e.fields.length) * 7 + 5, 0));
    score -= penalty;
    for (const e of shallowEntities) {
      warnings.push(`Entity "${e.name}" has only ${e.fields.length} field(s) — may be too shallow for realistic data.`);
    }
  } else if (avgFieldCount < 5) {
    score -= 10;
  }

  // --- Name quality check (0-15 points) ---
  const versionNamePattern = /^V\d/;
  const versionNamedEntities = schema.entities.filter((e) => versionNamePattern.test(e.name));
  if (versionNamedEntities.length === entityCount && entityCount > 0) {
    score -= 15;
    warnings.push(
      `All ${entityCount} entity names start with a version prefix (V1, V2, ...) — this usually indicates failed entity extraction from versioned API paths.`
    );
  }

  // --- Endpoint:entity ratio check (0-15 points) ---
  if (endpointEntityRatio > 10) {
    score -= 15;
    warnings.push(
      `Endpoint-to-entity ratio is ${endpointEntityRatio}:1 (${totalEndpoints} endpoints / ${entityCount} entities) — entities may be collapsed.`
    );
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    isShallow: score < 50,
    warnings,
    details: {
      entityCount,
      avgFieldCount,
      endpointEntityRatio,
    },
  };
}
