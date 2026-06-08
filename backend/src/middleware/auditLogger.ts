import { RequestHandler } from 'express';
import prisma from '../prisma';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE = new Set(['password', 'passwordHash', 'passwordConfirmation', 'token', 'secret', 'refreshToken']);

function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  return Object.fromEntries(
    Object.entries(body).filter(([k]) => !SENSITIVE.has(k))
  );
}

/**
 * Fires an async AuditLog write after every mutating request.
 * Non-blocking — uses res.on('finish') and never awaits.
 */
export const auditLogger: RequestHandler = (req, _res, next) => {
  if (!MUTATING.has(req.method)) return next();

  _res.on('finish', () => {
    const userId     = req.user?.userId ?? null;
    const action     = `${req.method} ${req.route?.path ?? req.originalUrl}`;
    const resource   = req.baseUrl || req.path;
    const resourceId = req.params?.id ?? null;
    const metadata   = sanitize(req.body ?? {});
    const ipAddress  = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
                       ?? req.socket.remoteAddress
                       ?? null;

    prisma.auditLog
      .create({
        data: {
          userId,
          action,
          resource,
          resourceId,
          metadata,
          ipAddress,
        },
      })
      .catch((err) => console.error('[AuditLog] write failed:', err.message));
  });

  next();
};
