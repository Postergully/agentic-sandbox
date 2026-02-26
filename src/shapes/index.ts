/**
 * API Shape Registry
 *
 * Central registry for all available API shapes.
 * Provides lookup and management of connector shapes.
 */

import { ApiShape, ShapeRegistryEntry, isApiShape } from './base';
import { snowflakeShape } from './snowflake';

/**
 * Shape Registry - manages all available API shapes
 */
class ShapeRegistry {
  private shapes: Map<string, ShapeRegistryEntry> = new Map();

  constructor() {
    // Register built-in shapes
    this.register(snowflakeShape, '1.0.0');
  }

  /**
   * Register a new shape
   * @param shape - Shape instance to register
   * @param version - Version string
   * @param enabled - Whether the shape is enabled (default: true)
   */
  register(shape: ApiShape, version: string, enabled = true): void {
    if (!isApiShape(shape)) {
      throw new Error(`Invalid shape: ${shape}`);
    }

    this.shapes.set(shape.name, {
      shape,
      version,
      enabled,
    });
  }

  /**
   * Get a shape by name
   * @param name - Shape name
   * @returns Shape instance or undefined
   */
  get(name: string): ApiShape | undefined {
    const entry = this.shapes.get(name);
    if (!entry || !entry.enabled) {
      return undefined;
    }
    return entry.shape;
  }

  /**
   * Get a shape entry with metadata
   * @param name - Shape name
   * @returns Registry entry or undefined
   */
  getEntry(name: string): ShapeRegistryEntry | undefined {
    return this.shapes.get(name);
  }

  /**
   * Check if a shape exists and is enabled
   * @param name - Shape name
   */
  has(name: string): boolean {
    const entry = this.shapes.get(name);
    return entry !== undefined && entry.enabled;
  }

  /**
   * Get all registered shape names
   */
  getNames(): string[] {
    return Array.from(this.shapes.keys());
  }

  /**
   * Get all enabled shapes
   */
  getEnabledShapes(): ApiShape[] {
    return Array.from(this.shapes.values())
      .filter((entry) => entry.enabled)
      .map((entry) => entry.shape);
  }

  /**
   * Enable or disable a shape
   * @param name - Shape name
   * @param enabled - Enable state
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const entry = this.shapes.get(name);
    if (!entry) {
      return false;
    }
    entry.enabled = enabled;
    return true;
  }

  /**
   * Get shape info for all registered shapes
   */
  getInfo(): Array<{ name: string; displayName: string; version: string; enabled: boolean }> {
    return Array.from(this.shapes.entries()).map(([name, entry]) => ({
      name,
      displayName: entry.shape.displayName,
      version: entry.version,
      enabled: entry.enabled,
    }));
  }
}

// Export singleton instance
export const shapeRegistry = new ShapeRegistry();

// Export convenience function
export function getShape(name: string): ApiShape | undefined {
  return shapeRegistry.get(name);
}

// Re-export types and shapes
export * from './base';
export { snowflakeShape, SnowflakeShape, createStatementStatusResponse } from './snowflake';
