import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
import { UserPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required');

/**
 * 1. Validates Bearer JWT.
 * 2. Checks tokenVersion against DB — any increment (offboard / manual revoke)
 *    instantly invalidates all previously issued tokens for that user.
 * 3. Rejects inactive (offboarded) users even if their token is technically valid.
 *
 * Trade-off: one DB SELECT per authenticated request.
 * For high-traffic deployments, replace the DB lookup with a Redis cache
 * keyed by userId → { tokenVersion, isActive } with a short TTL (~30 s).
 */
export const authMiddleware: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header' },
    });
  }

  const token = authHeader.slice(7);
  let decoded: UserPayload & { tokenVersion: number };

  // ── Step 1: verify signature & expiry ───────────────────────
  try {
    decoded = jwt.verify(token, JWT_SECRET!) as UserPayload & { tokenVersion: number };
  } catch (err: any) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(expired ? 403 : 401).json({
      success: false,
      error: {
        code:    expired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED',
        message: expired ? 'Token has expired' : 'Invalid token',
      },
    });
  }

  // ── Step 2: validate tokenVersion + isActive in DB ──────────
  try {
    const dbUser = await prisma.user.findUnique({
      where:  { id: decoded.userId },
      select: { id: true, isActive: true, tokenVersion: true },
    });

    if (!dbUser) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not found' },
      });
    }

    if (!dbUser.isActive) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_INACTIVE', message: 'This account has been deactivated' },
      });
    }

    if (dbUser.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({
        success: false,
        error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked. Please sign in again.' },
      });
    }
  } catch (err) {
    return next(err);
  }

  req.user = decoded;
  next();
};
