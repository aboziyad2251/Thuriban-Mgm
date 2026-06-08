import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware }      from '../middleware/auth';
import { requireTier }         from '../middleware/rbac';
import { scopeGuard }          from '../middleware/scopeGuard';
import { requirePermission }   from '../middleware/requirePermission';
import { auditLogger }         from '../middleware/auditLogger';
import prisma                  from '../prisma';

const router = Router();

// Apply audit logging to all mutating routes in this router
router.use(auditLogger);

/**
 * GET /company
 * Any authenticated user can read the company profile.
 */
router.get(
  '/',
  authMiddleware,
  requireTier('EMPLOYEE'),
  requirePermission('company:read'),
  scopeGuard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const company = await prisma.companyProfile.findUnique({
        where: { id: req.user!.companyId },
      });

      if (!company) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Company profile not found' },
        });
      }

      res.json({ success: true, data: company });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /company
 * ADMIN only — update the company profile.
 */
router.put(
  '/',
  authMiddleware,
  requireTier('ADMIN'),
  requirePermission('company:update'),
  scopeGuard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, logoUrl, mission, contactEmail, contactPhone, address, website } = req.body;

      const updated = await prisma.companyProfile.update({
        where: { id: req.user!.companyId },
        data: {
          ...(name         !== undefined && { name }),
          ...(logoUrl      !== undefined && { logoUrl }),
          ...(mission      !== undefined && { mission }),
          ...(contactEmail !== undefined && { contactEmail }),
          ...(contactPhone !== undefined && { contactPhone }),
          ...(address      !== undefined && { address }),
          ...(website      !== undefined && { website }),
        },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
