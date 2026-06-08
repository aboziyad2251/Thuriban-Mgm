import { RequestHandler } from 'express';
import { Tier } from '../types';
import { hasPermission } from '../config/permissions';

/**
 * Checks that req.user holds the given permission string.
 * Accepts optional per-call overrides for the permission map.
 *
 * Usage:
 *   router.delete('/users/:id',
 *     authMiddleware,
 *     requirePermission('users:delete'),
 *     handler
 *   );
 */
export function requirePermission(
  permission: string,
  overrides?: Partial<Record<Tier, string[]>>
): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    if (!hasPermission(req.user.tier, permission, overrides)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Missing required permission: "${permission}"`,
        },
      });
    }

    next();
  };
}
