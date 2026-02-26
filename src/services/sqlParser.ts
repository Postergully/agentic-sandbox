/**
 * SQL Parser Service
 *
 * Parses SQL statements using node-sql-parser and extracts
 * structured query information for execution against mock data.
 */

import { Parser, AST } from 'node-sql-parser';

/**
 * Supported comparison operators
 */
export type ComparisonOperator = '=' | '!=' | '<>' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'NOT IN' | 'IS' | 'IS NOT';

/**
 * WHERE clause condition
 */
export interface WhereCondition {
  column: string;
  operator: ComparisonOperator;
  value: unknown;
  /** For IN clauses, array of values */
  values?: unknown[];
}

/**
 * AND/OR grouped conditions
 */
export interface WhereGroup {
  type: 'AND' | 'OR';
  conditions: Array<WhereCondition | WhereGroup>;
}

/**
 * ORDER BY clause
 */
export interface OrderByClause {
  column: string;
  direction: 'ASC' | 'DESC';
}

/**
 * Aggregate function in SELECT
 */
export interface AggregateFunction {
  function: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
  column: string | '*';
  alias?: string;
}

/**
 * Parsed SELECT query structure
 */
export interface ParsedSelectQuery {
  type: 'select';
  /** Table name to query */
  table: string;
  /** Schema/database prefix if specified */
  schema?: string;
  /** Columns to select, or '*' for all */
  columns: string[] | '*';
  /** Aggregate functions (COUNT, SUM, etc.) */
  aggregates?: AggregateFunction[];
  /** WHERE conditions */
  where?: WhereCondition | WhereGroup;
  /** ORDER BY clauses */
  orderBy?: OrderByClause[];
  /** LIMIT value */
  limit?: number;
  /** OFFSET value */
  offset?: number;
  /** GROUP BY columns */
  groupBy?: string[];
  /** DISTINCT flag */
  distinct?: boolean;
}

/**
 * Result of parsing any SQL statement
 */
export type ParsedQuery = ParsedSelectQuery;

/**
 * SQL Parser class
 */
export class SqlParser {
  private parser: Parser;

  constructor() {
    // Use generic database dialect for maximum compatibility
    this.parser = new Parser();
  }

  /**
   * Parse a SQL statement
   * @param sql - SQL string to parse
   * @returns Parsed query structure
   * @throws Error if SQL is invalid or unsupported
   */
  parse(sql: string): ParsedQuery {
    // Clean up the SQL
    const cleanSql = this.cleanSql(sql);

    let ast: AST | AST[];
    try {
      ast = this.parser.astify(cleanSql, { database: 'Postgresql' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parse error';
      throw new Error(`SQL syntax error: ${message}`);
    }

    // Handle single statement (node-sql-parser may return array)
    const statement = Array.isArray(ast) ? ast[0] : ast;

    if (!statement || statement.type !== 'select') {
      throw new Error('Only SELECT statements are supported');
    }

    return this.parseSelect(statement);
  }

  /**
   * Clean and normalize SQL string
   */
  private cleanSql(sql: string): string {
    return sql
      .trim()
      .replace(/;+$/, '') // Remove trailing semicolons
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Parse a SELECT statement AST
   */
  private parseSelect(ast: any): ParsedSelectQuery {
    const result: ParsedSelectQuery = {
      type: 'select',
      table: '',
      columns: '*',
    };

    // Extract table name
    if (ast.from && ast.from.length > 0) {
      const fromClause = ast.from[0];
      if (typeof fromClause === 'object') {
        result.table = fromClause.table || '';
        if (fromClause.db) {
          result.schema = fromClause.db;
        }
      }
    }

    if (!result.table) {
      throw new Error('No table specified in FROM clause');
    }

    // Extract columns
    result.columns = this.parseColumns(ast.columns);

    // Extract aggregates
    const aggregates = this.parseAggregates(ast.columns);
    if (aggregates.length > 0) {
      result.aggregates = aggregates;
    }

    // Extract DISTINCT
    if (ast.distinct) {
      result.distinct = true;
    }

    // Extract WHERE clause
    if (ast.where) {
      result.where = this.parseWhere(ast.where);
    }

    // Extract ORDER BY
    if (ast.orderby && ast.orderby.length > 0) {
      result.orderBy = ast.orderby.map((ob: any) => ({
        column: this.extractColumnName(ob.expr),
        direction: (ob.type?.toUpperCase() || 'ASC') as 'ASC' | 'DESC',
      }));
    }

    // Extract LIMIT
    if (ast.limit) {
      if (Array.isArray(ast.limit)) {
        result.limit = ast.limit[0]?.value;
      } else if (ast.limit.value) {
        result.limit = ast.limit.value[0]?.value || ast.limit.value;
      }
    }

    // Extract OFFSET (may be in limit array or separate)
    if (ast.limit && Array.isArray(ast.limit) && ast.limit.length > 1) {
      result.offset = ast.limit[1]?.value;
    }

    // Extract GROUP BY
    if (ast.groupby && ast.groupby.length > 0) {
      result.groupBy = ast.groupby.map((gb: any) => this.extractColumnName(gb));
    }

    return result;
  }

  /**
   * Parse columns from SELECT clause
   */
  private parseColumns(columns: any): string[] | '*' {
    if (!columns || columns === '*') {
      return '*';
    }

    const columnNames: string[] = [];

    for (const col of columns) {
      if (col.expr?.type === 'column_ref') {
        // Handle column name - it may be a string or an object
        let name: string;
        if (typeof col.expr.column === 'string') {
          name = col.expr.column;
        } else if (col.expr.column?.expr?.value) {
          // Handle quoted identifiers
          name = col.expr.column.expr.value;
        } else {
          // Fallback: stringify and extract
          name = String(col.expr.column);
        }

        if (name !== '*') {
          columnNames.push(col.as || name);
        }
      } else if (col.expr?.type === 'star') {
        return '*';
      }
      // Skip aggregate functions here (handled separately)
    }

    return columnNames.length > 0 ? columnNames : '*';
  }

  /**
   * Parse aggregate functions from SELECT clause
   */
  private parseAggregates(columns: any): AggregateFunction[] {
    if (!columns || columns === '*') {
      return [];
    }

    const aggregates: AggregateFunction[] = [];

    for (const col of columns) {
      if (col.expr?.type === 'aggr_func') {
        const funcName = col.expr.name?.toUpperCase();
        if (['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(funcName)) {
          let column: string | '*' = '*';

          if (col.expr.args?.expr?.type === 'star') {
            column = '*';
          } else if (col.expr.args?.expr?.type === 'column_ref') {
            column = col.expr.args.expr.column;
          }

          aggregates.push({
            function: funcName as AggregateFunction['function'],
            column,
            alias: col.as,
          });
        }
      }
    }

    return aggregates;
  }

  /**
   * Parse WHERE clause
   */
  private parseWhere(where: any): WhereCondition | WhereGroup {
    if (!where) {
      throw new Error('Invalid WHERE clause');
    }

    // Handle AND/OR groups
    if (where.type === 'binary_expr' && (where.operator === 'AND' || where.operator === 'OR')) {
      return {
        type: where.operator as 'AND' | 'OR',
        conditions: [this.parseWhere(where.left), this.parseWhere(where.right)],
      };
    }

    // Handle comparison operators
    if (where.type === 'binary_expr') {
      return this.parseComparison(where);
    }

    throw new Error(`Unsupported WHERE clause type: ${where.type}`);
  }

  /**
   * Parse a comparison expression
   */
  private parseComparison(expr: any): WhereCondition {
    const column = this.extractColumnName(expr.left);
    const operator = this.normalizeOperator(expr.operator);
    let value: unknown = null;
    let values: unknown[] | undefined;

    // Handle different right-hand side types
    if (expr.right.type === 'number') {
      value = expr.right.value;
    } else if (expr.right.type === 'single_quote_string' || expr.right.type === 'string') {
      value = expr.right.value;
    } else if (expr.right.type === 'bool') {
      value = expr.right.value;
    } else if (expr.right.type === 'null') {
      value = null;
    } else if (expr.right.type === 'expr_list') {
      // IN clause
      values = expr.right.value.map((v: any) => v.value);
      value = values && values.length > 0 ? values[0] : null;
    } else if (expr.right.type === 'column_ref') {
      // Column reference on right side (unusual but valid)
      value = expr.right.column;
    } else {
      value = expr.right.value;
    }

    const condition: WhereCondition = {
      column,
      operator,
      value,
    };

    if (values) {
      condition.values = values;
    }

    return condition;
  }

  /**
   * Extract column name from expression
   */
  private extractColumnName(expr: any): string {
    if (typeof expr === 'string') {
      return expr;
    }
    if (expr.type === 'column_ref') {
      // Handle column name - it may be a string or an object
      if (typeof expr.column === 'string') {
        return expr.column;
      } else if (expr.column?.expr?.value) {
        return expr.column.expr.value;
      } else {
        return String(expr.column);
      }
    }
    if (expr.column) {
      if (typeof expr.column === 'string') {
        return expr.column;
      }
      return String(expr.column);
    }
    throw new Error(`Cannot extract column name from: ${JSON.stringify(expr)}`);
  }

  /**
   * Normalize SQL operator to our internal format
   */
  private normalizeOperator(op: string): ComparisonOperator {
    const normalized = op.toUpperCase();

    const operatorMap: Record<string, ComparisonOperator> = {
      '=': '=',
      '!=': '!=',
      '<>': '<>',
      '>': '>',
      '<': '<',
      '>=': '>=',
      '<=': '<=',
      LIKE: 'LIKE',
      IN: 'IN',
      'NOT IN': 'NOT IN',
      IS: 'IS',
      'IS NOT': 'IS NOT',
    };

    const result = operatorMap[normalized];
    if (!result) {
      throw new Error(`Unsupported operator: ${op}`);
    }
    return result;
  }

  /**
   * Validate that a query only uses supported features
   * @returns Array of validation errors (empty if valid)
   */
  validate(query: ParsedQuery): string[] {
    const errors: string[] = [];

    if (!query.table) {
      errors.push('Table name is required');
    }

    // Could add more validation here (e.g., check for unsupported features)

    return errors;
  }
}

// Export singleton instance
export const sqlParser = new SqlParser();

/**
 * Convenience function to parse SQL
 */
export function parseSQL(sql: string): ParsedQuery {
  return sqlParser.parse(sql);
}
