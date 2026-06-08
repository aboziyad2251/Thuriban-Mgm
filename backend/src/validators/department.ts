import { z, ZodSchema } from 'zod';
import { RequestHandler } from 'express';

const uuid = z.string().uuid('Must be a valid UUID');
const name = z.string().min(2, 'Name must be at least 2 characters').max(100).trim();

// ── Create ────────────────────────────────────────────────────────
export const createDepartmentSchema = z.object({
  body: z.object({
    name,
    description: z.string().max(500).optional(),
    parentId:   uuid.optional(),
    managerId:  uuid.optional(),
    position:   z.coerce.number().int().min(0).default(0),
  }),
});

// ── Update ────────────────────────────────────────────────────────
export const updateDepartmentSchema = z.object({
  params: z.object({ id: uuid }),
  body: z
    .object({
      name:        name.optional(),
      description: z.string().max(500).optional(),
      managerId:   uuid.nullable().optional(),
      position:    z.coerce.number().int().min(0).optional(),
    })
    .refine((d) => Object.values(d).some((v) => v !== undefined), {
      message: 'At least one field must be provided',
    }),
});

// ── Move (reparent) ───────────────────────────────────────────────
export const moveDepartmentSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    newParentId: uuid.nullable(),   // null = promote to root
  }),
});

// ── List ──────────────────────────────────────────────────────────
export const listDepartmentsSchema = z.object({
  query: z.object({
    parentId:       z.union([uuid, z.literal('root')]).optional(),
    page:           z.coerce.number().int().min(1).default(1),
    limit:          z.coerce.number().int().min(1).max(200).default(50),
    search:         z.string().max(100).optional(),
  }),
});

// ── Org Chart ─────────────────────────────────────────────────────
export const orgChartSchema = z.object({
  query: z.object({
    format:       z.enum(['tree', 'flat']).default('tree'),
    departmentId: uuid.optional(),
    maxDepth:     z.coerce.number().int().min(1).max(10).default(10),
  }),
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
          message: 'Invalid request data',
          details: result.error.flatten().fieldErrors,
        },
      });
    }

    if (result.data.body   !== undefined) req.body   = result.data.body;
    if (result.data.query  !== undefined) req.query  = result.data.query as any;
    next();
  };
}
