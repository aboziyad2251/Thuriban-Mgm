import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware }    from '../middleware/auth';
import { requireTier }       from '../middleware/rbac';
import { requirePermission } from '../middleware/requirePermission';
import { auditLogger }       from '../middleware/auditLogger';
import {
  validate,
  uploadDocumentSchema,
  listDocumentsSchema,
  updateDocumentSchema,
  shareDocumentSchema,
  getDocumentSchema,
} from '../validators/document';
import * as svc from '../services/documentService';

const router = Router();

router.use(authMiddleware);

// ── POST /documents ───────────────────────────────────────────────
// All authenticated tiers can upload
router.post(
  '/',
  auditLogger,
  validate(uploadDocumentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await svc.uploadDocument(req.user!, req.body);
      res.status(201).json({ success: true, data: doc });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /documents ────────────────────────────────────────────────
// Tier-scoped in service layer — cannot bypass
router.get(
  '/',
  requirePermission('documents:read'),
  validate(listDocumentsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await svc.listDocuments(req.user!, req.query as any);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /documents/:id ────────────────────────────────────────────
router.get(
  '/:id',
  requirePermission('documents:read'),
  validate(getDocumentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await svc.getDocument(req.user!, req.params.id);
      res.json({ success: true, data: doc });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /documents/:id/download ───────────────────────────────────
// Returns the storage path (caller generates presigned URL)
router.get(
  '/:id/download',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { storagePath, name } = await svc.getDocumentDownloadPath(req.user!, req.params.id);
      // In production: generate a presigned S3 URL from storagePath here
      res.json({ success: true, data: { downloadUrl: storagePath, name } });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /documents/:id ──────────────────────────────────────────
// Owner or ADMIN only (enforced in service)
router.patch(
  '/:id',
  auditLogger,
  validate(updateDocumentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await svc.updateDocument(req.user!, req.params.id, req.body);
      res.json({ success: true, data: doc });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /documents/:id/share ─────────────────────────────────────
// MANAGER+ at route level; owner-or-ADMIN check in service
router.post(
  '/:id/share',
  requireTier('MANAGER'),
  auditLogger,
  validate(shareDocumentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await svc.shareDocument(req.user!, req.params.id, req.body.userIds);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /documents/:id ─────────────────────────────────────────
// Owner or ADMIN only (enforced in service)
router.delete(
  '/:id',
  auditLogger,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await svc.deleteDocument(req.user!, req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
