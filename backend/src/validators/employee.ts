import { z } from 'zod';

// ── Shared primitives ─────────────────────────────────────────────
const uuid    = z.string().uuid('Must be a valid UUID');
const email   = z.string().email('Must be a valid email').toLowerCase();
const name    = z.string().min(2, 'Name must be at least 2 characters').max(100).trim();
const phone   = z.string().regex(/^\+?[\d\s\-().]{7,20}$/, 'Invalid phone number').optional();

// ── Register employee ─────────────────────────────────────────────
export const registerEmployeeSchema = z.object({
  body: z.object({
    email,
    name,
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[0-9]/, 'Password must contain a number'),
    tier: z.enum(['MANAGER', 'EMPLOYEE'], {
      errorMap: () => ({ message: 'Tier must be MANAGER or EMPLOYEE' }),
    }),
    departmentId: uuid,          // always required for MANAGER/EMPLOYEE
    phone:        phone,
    jobTitle:     z.string().max(100).optional(),
  }),
});

// ── Update employee profile ───────────────────────────────────────
export const updateEmployeeSchema = z.object({
  params: z.object({ id: uuid }),
  body: z
    .object({
      name:        name.optional(),
      phone:       phone,
      jobTitle:    z.string().max(100).optional(),
      // Fields below are ADMIN/MANAGER-only — enforced in service layer
      tier:        z.enum(['MANAGER', 'EMPLOYEE']).optional(),
      departmentId: uuid.optional(),
    })
    .refine(obj => Object.keys(obj).length > 0, {
      message: 'Request body must contain at least one field to update',
    }),
});

// ── Offboard employee ─────────────────────────────────────────────
export const offboardEmployeeSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    offboardType: z.enum(['FIRED', 'RESIGNED'], {
      errorMap: () => ({ message: 'offboardType must be FIRED or RESIGNED' }),
    }),
    reason: z
      .string()
      .min(10, 'Reason must be at least 10 characters')
      .max(1000),
    effectiveDate: z
      .string()
      .datetime({ message: 'effectiveDate must be an ISO 8601 datetime' })
      .optional(),
  }),
});

// ── List query params ─────────────────────────────────────────────
export const listEmployeesSchema = z.object({
  query: z.object({
    isActive:     z.enum(['true', 'false']).optional(),
    tier:         z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
    departmentId: uuid.optional(),
    page:         z.coerce.number().int().min(1).default(1),
    limit:        z.coerce.number().int().min(1).max(100).default(20),
    search:       z.string().max(100).optional(),
  }),
});

// ── Validate middleware factory ───────────────────────────────────
import { RequestHandler } from 'express';
import { ZodSchema } from 'zod';

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

    // Attach parsed+coerced values back
    req.body   = result.data.body   ?? req.body;
    req.query  = result.data.query  ?? req.query;
    next();
  };
}
