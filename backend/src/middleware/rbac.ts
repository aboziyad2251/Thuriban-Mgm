import { RequestHandler } from 'express';
import { Tier } from '../types';

// Lower rank = more powerful
const TIER_RANK: Record<Tier, number> = {
  ADMIN:    1,
  MANAGER:  2,
  EMPLOYEE: 3,
};

/**
 * Blocks requests from tiers weaker than minimumTier.
 *
 * requireTier('MANAGER') → allows ADMIN + MANAGER, blocks EMPLOYEE
 * requireTier('ADMIN')   → allows ADMIN only
 */
export function requireTier(minimumTier: Tier): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    if (TIER_RANK[req.user.tier] > TIER_RANK[minimumTier]) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Requires at least ${minimumTier} tier. Your tier: ${req.user.tier}`,
        },
      });
    }

    next();
  };
}
