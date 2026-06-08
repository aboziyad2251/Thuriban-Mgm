import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware }     from '../middleware/auth';
import { requireTier }        from '../middleware/rbac';
import { requirePermission }  from '../middleware/requirePermission';
import { scopeGuard }         from '../middleware/scopeGuard';
import { auditLogger }        from '../middleware/auditLogger';
import { validate }           from '../validators/employee';
import {
  registerEmployeeSchema,
  updateEmployeeSchema,
  offboardEmployeeSchema,
  listEmployeesSchema,
} from '../validators/employee';
import * as svc from '../services/employeeService';

const router = Router();

// Attach audit logger to all mutating routes in this router
router.use(auditLogger);

// All routes require a valid JWT
router.use(authMiddleware);

// ── GET /employees ────────────────────────────────────────────────
/**
 * ADMIN    → all employees in company (filterable)
 * MANAGER  → all employees in their department
 * EMPLOYEE → only themselves
 */
router.get(
  '/',
  requirePermission('users:read'),
  scopeGuard,
  validate(listEmployeesSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await svc.listEmployees(req.user!, req.query as any);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /employees ───────────────────────────────────────────────
/**
 * ADMIN   → can register MANAGER or EMPLOYEE in any department
 * MANAGER → can register EMPLOYEE in their own department only
 * EMPLOYEE → blocked
 */
router.post(
  '/',
  requireTier('MANAGER'),
  requirePermission('users:create'),
  scopeGuard,
  validate(registerEmployeeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employee = await svc.registerEmployee(req.user!, req.body);
      res.status(201).json({ success: true, data: employee });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /employees/:id ────────────────────────────────────────────
/**
 * ADMIN   → any employee in company
 * MANAGER → any employee in their department
 * EMPLOYEE → only themselves
 */
router.get(
  '/:id',
  requirePermission('users:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employee = await svc.getEmployee(req.user!, req.params.id);
      res.json({ success: true, data: employee });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /employees/:id ──────────────────────────────────────────
/**
 * ADMIN   → update any field for any employee
 * MANAGER → update name/phone/jobTitle for their department employees
 * EMPLOYEE → update own name/phone/jobTitle only
 *
 * Nobody (except ADMIN) can change tier or departmentId via this route.
 */
router.patch(
  '/:id',
  validate(updateEmployeeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await svc.updateEmployee(req.user!, req.params.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /employees/:id/offboard ──────────────────────────────────
/**
 * CRITICAL ROUTE — does NOT delete the record.
 *
 * Side effects (all atomic in a DB transaction):
 *   1. Sets isActive = false
 *   2. Increments tokenVersion → immediately invalidates all JWT tokens
 *   3. Records terminationDate, terminationReason, offboardType, terminatedById
 *   4. Writes a dedicated OFFBOARD audit log entry
 *
 * ADMIN   → can offboard anyone (except themselves)
 * MANAGER → can offboard EMPLOYEE in their department only
 * EMPLOYEE → blocked
 *
 * Edge cases enforced in service layer:
 *   - Cannot offboard an already-inactive employee (409)
 *   - Cannot offboard yourself (403)
 *   - MANAGER cannot offboard another MANAGER (403)
 *   - Only ADMIN can offboard an ADMIN (403)
 *   - effectiveDate cannot exceed 90 days in the future (400)
 */
router.post(
  '/:id/offboard',
  requireTier('MANAGER'),
  requirePermission('users:delete'),
  validate(offboardEmployeeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await svc.offboardEmployee(req.user!, req.params.id, req.body);
      res.json({
        success: true,
        message: `Employee has been offboarded (${req.body.offboardType})`,
        data:    result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /employees/:id/history ────────────────────────────────────
/**
 * Returns the AuditLog trail for a specific employee.
 * ADMIN + MANAGER only.
 */
router.get(
  '/:id/history',
  requireTier('MANAGER'),
  requirePermission('users:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const logs = await svc.getEmployeeHistory(req.user!, req.params.id);
      res.json({ success: true, data: logs });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
