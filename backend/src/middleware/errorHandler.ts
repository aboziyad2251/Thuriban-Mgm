import { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';

const IS_DEV = process.env.NODE_ENV === 'development';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // ── Prisma known errors ──────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return res.status(409).json({
          success: false,
          error: { code: 'CONFLICT', message: 'Unique constraint violation', details: err.meta },
        });
      case 'P2025':
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Record not found', details: err.meta },
        });
      default:
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Database error',
            details: IS_DEV ? err.message : undefined,
          },
        });
    }
  }

  // ── Prisma validation errors ─────────────────────────────────
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid data provided',
        details: IS_DEV ? err.message : undefined,
      },
    });
  }

  // ── Generic / application errors ────────────────────────────
  const status  = err.statusCode ?? err.status ?? 500;
  const code    = err.code ?? 'INTERNAL_ERROR';
  const message = err.message ?? 'Internal server error';

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details: IS_DEV ? err.stack : undefined,
    },
  });
};
