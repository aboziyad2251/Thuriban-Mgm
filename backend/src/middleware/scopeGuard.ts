import { RequestHandler } from 'express';

/**
 * Injects req.scope so downstream route handlers automatically filter by
 * the caller's access boundary — no manual tier checks in routes needed.
 *
 * ADMIN    → {} (unrestricted)
 * MANAGER  → { departmentId } (department-scoped)
 * EMPLOYEE → { userId }        (self-scoped)
 */
export const scopeGuard: RequestHandler = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  switch (req.user.tier) {
    case 'ADMIN':
      req.scope = {};
      break;

    case 'MANAGER':
      if (!req.user.departmentId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Manager has no assigned department' },
        });
      }
      req.scope = { departmentId: req.user.departmentId };
      break;

    case 'EMPLOYEE':
      req.scope = { userId: req.user.userId };
      break;

    default:
      req.scope = {};
  }

  next();
};
