import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware }    from '../middleware/auth';
import { requireTier }       from '../middleware/rbac';
import { requirePermission } from '../middleware/requirePermission';
import { auditLogger }       from '../middleware/auditLogger';
import {
  validate,
  createDepartmentSchema,
  updateDepartmentSchema,
  moveDepartmentSchema,
  listDepartmentsSchema,
  orgChartSchema,
} from '../validators/department';
import * as svc from '../services/departmentService';

const router = Router();

router.use(auditLogger);
router.use(authMiddleware);

// ── GET /departments ──────────────────────────────────────────────
// All tiers: scope filtered in service
router.get(
  '/',
  requirePermission('departments:read'),
  validate(listDepartmentsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await svc.listDepartments(req.user!, req.query as any);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /departments/org-chart ────────────────────────────────────
// All tiers can view
router.get(
  '/org-chart',
  requirePermission('departments:read'),
  validate(orgChartSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tree = await svc.getOrgChart(req.user!, req.query as any);
      res.json({ success: true, data: tree });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /departments ─────────────────────────────────────────────
// ADMIN only
router.post(
  '/',
  requireTier('ADMIN'),
  requirePermission('departments:create'),
  validate(createDepartmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dept = await svc.createDepartment(req.user!, req.body);
      res.status(201).json({ success: true, data: dept });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /departments/:id ──────────────────────────────────────────
router.get(
  '/:id',
  requirePermission('departments:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dept = await svc.getDepartment(req.user!, req.params.id);
      res.json({ success: true, data: dept });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /departments/:id/ancestors ────────────────────────────────
router.get(
  '/:id/ancestors',
  requirePermission('departments:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ancestors = await svc.getAncestors(req.user!, req.params.id);
      res.json({ success: true, data: ancestors });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /departments/:id ────────────────────────────────────────
// ADMIN only
router.patch(
  '/:id',
  requireTier('ADMIN'),
  requirePermission('departments:update'),
  validate(updateDepartmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dept = await svc.updateDepartment(req.user!, req.params.id, req.body);
      res.json({ success: true, data: dept });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /departments/:id/move ────────────────────────────────────
// ADMIN only — reparent a department
router.post(
  '/:id/move',
  requireTier('ADMIN'),
  requirePermission('departments:update'),
  validate(moveDepartmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dept = await svc.moveDepartment(
        req.user!,
        req.params.id,
        req.body.newParentId ?? null
      );
      res.json({ success: true, data: dept });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /departments/:id ───────────────────────────────────────
// ADMIN only — blocks if dept has children or employees
router.delete(
  '/:id',
  requireTier('ADMIN'),
  requirePermission('departments:delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await svc.deleteDepartment(req.user!, req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
