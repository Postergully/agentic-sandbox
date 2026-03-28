import { Request, Response, NextFunction } from 'express';

export interface PaginationConfig {
  defaultPageSize: number;
  maxPageSize: number;
  cursorField: string;
}

export interface PaginationInfo {
  cursor?: string;
  offset?: number;
  pageSize: number;
  mode: 'cursor' | 'offset';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    hasMore: boolean;
    nextCursor?: string;
    previousCursor?: string;
    totalCount?: number;
    pageSize: number;
  };
}

export interface PaginatedRequest extends Request {
  pagination?: PaginationInfo;
}

const DEFAULT_CONFIG: PaginationConfig = {
  defaultPageSize: 25,
  maxPageSize: 100,
  cursorField: 'id',
};

export function encodeCursor(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64');
}

export function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, 'base64').toString('utf-8');
  } catch {
    throw new Error('Invalid cursor format');
  }
}

export const paginationMiddleware = (config: Partial<PaginationConfig> = {}) => {
  const cfg: PaginationConfig = { ...DEFAULT_CONFIG, ...config };

  return (req: PaginatedRequest, res: Response, next: NextFunction): void => {
    const rawPageSize = req.query.page_size as string | undefined;
    const rawCursor = req.query.cursor as string | undefined;
    const rawOffset = req.query.offset as string | undefined;

    // Determine page size with bounds
    let pageSize = cfg.defaultPageSize;
    if (rawPageSize !== undefined) {
      const parsed = parseInt(rawPageSize, 10);
      if (!isNaN(parsed) && parsed > 0) {
        pageSize = Math.min(parsed, cfg.maxPageSize);
      }
    }

    // Determine pagination mode
    if (rawCursor) {
      let decoded: string;
      try {
        decoded = decodeCursor(rawCursor);
      } catch {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_CURSOR', message: 'Invalid cursor format' },
        });
        return;
      }

      req.pagination = {
        cursor: decoded,
        pageSize,
        mode: 'cursor',
      };
    } else {
      let offset: number | undefined;
      if (rawOffset !== undefined) {
        const parsed = parseInt(rawOffset, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          offset = parsed;
        }
      }

      req.pagination = {
        offset,
        pageSize,
        mode: rawCursor ? 'cursor' : 'offset',
      };
    }

    // Attach paginate helper to response
    res.paginate = function <T>(items: T[], totalCount?: number): void {
      const pagination = req.pagination!;
      const hasMore = items.length > pagination.pageSize;
      const data = hasMore ? items.slice(0, pagination.pageSize) : items;

      const result: PaginatedResponse<T> = {
        data,
        pagination: {
          hasMore,
          pageSize: pagination.pageSize,
        },
      };

      if (totalCount !== undefined) {
        result.pagination.totalCount = totalCount;
      }

      if (hasMore && data.length > 0) {
        const lastItem = data[data.length - 1] as Record<string, unknown>;
        const cursorValue = lastItem[cfg.cursorField];
        if (cursorValue !== undefined) {
          result.pagination.nextCursor = encodeCursor(String(cursorValue));
        }
      }

      if (pagination.mode === 'cursor' && data.length > 0) {
        const firstItem = data[0] as Record<string, unknown>;
        const cursorValue = firstItem[cfg.cursorField];
        if (cursorValue !== undefined) {
          result.pagination.previousCursor = encodeCursor(String(cursorValue));
        }
      }

      res.json(result);
    };

    next();
  };
};

// Augment Express Response type
declare global {
  namespace Express {
    interface Response {
      paginate<T>(items: T[], totalCount?: number): void;
    }
  }
}
