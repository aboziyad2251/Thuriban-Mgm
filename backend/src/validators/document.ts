import { z, ZodSchema } from 'zod';
import { RequestHandler } from 'express';

const accessLevelEnum = z.enum(['PRIVATE', 'DEPARTMENT', 'GLOBAL']);

// ── Upload ────────────────────────────────────────────────────────
export const uploadDocumentSchema = z.object({
  body: z.object({
    name:         z.string().min(2).max(255),
    storagePath:  z.string().min(1),
    mimeType:     z.string().min(1),
    sizeBytes:    z.coerce.number().int().min(1),
    accessLevel:  accessLevelEnum.default('PRIVATE'),
    tags:         z.array(z.string().max(50)).max(10).optional(),
  }),
});

// ── Update ────────────────────────────────────────────────────────
export const updateDocumentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      name:        z.string().min(2).max(255).optional(),
      accessLevel: accessLevelEnum.optional(),
      tags:        z.array(z.string().max(50)).max(10).optional(),
    })
    .refine((d) => Object.values(d).some((v) => v !== undefined), {
      message: 'At least one field must be provided',
    }),
});

// ── Share ─────────────────────────────────────────────────────────
export const shareDocumentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    userIds: z.array(z.string().uuid()).min(1).max(50),
  }),
});

// ── List ──────────────────────────────────────────────────────────
export const listDocumentsSchema = z.object({
  query: z.object({
    accessLevel:  accessLevelEnum.optional(),
    departmentId: z.string().uuid().optional(),
    uploadedById: z.string().uuid().optional(),
    page:         z.coerce.number().int().min(1).default(1),
    limit:        z.coerce.number().int().min(1).max(100).default(20),
    search:       z.string().max(100).optional(),
  }),
});

// ── Get one ───────────────────────────────────────────────────────
export const getDocumentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

// ── Validate middleware factory ───────────────────────────────────
export function validate(schema: ZodSchema): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse({
      body:   req.body,
      params: req.params,
      query:  req.query,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'VALIDATION_ERROR',
          message: 'Validation failed',
          details: result.error.flatten().fieldErrors,
        },
      });
    }

    if (result.data.body   !== undefined) req.body   = result.data.body;
    if (result.data.query  !== undefined) req.query  = result.data.query as any;
    // params are read-only on Express req but we can still assign for TypeScript consumers
    next();
  };
}
