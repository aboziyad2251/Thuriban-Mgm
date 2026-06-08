import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { UserPayload } from '../types';

// ── Types ─────────────────────────────────────────────────────────

type AccessLevel = 'PRIVATE' | 'DEPARTMENT' | 'GLOBAL';

interface UploadInput {
  name:         string;
  storagePath:  string;
  mimeType:     string;
  sizeBytes:    number;
  accessLevel:  AccessLevel;
  tags?:        string[];
}

interface UpdateInput {
  name?:        string;
  accessLevel?: AccessLevel;
  tags?:        string[];
}

interface ListQuery {
  accessLevel?:  AccessLevel;
  departmentId?: string;
  uploadedById?: string;
  page:          number;
  limit:         number;
  search?:       string;
}

// ── Safe select (never exposes storagePath) ───────────────────────

const SAFE_SELECT = {
  id:          true,
  name:        true,
  mimeType:    true,
  sizeBytes:   true,
  accessLevel: true,
  companyId:   true,
  uploadedById:true,
  departmentId:true,
  tags:        true,
  createdAt:   true,
  updatedAt:   true,
  uploadedBy:  { select: { id: true, name: true, email: true } },
  department:  { select: { id: true, name: true } },
  sharedWith:  { select: { userId: true, grantedById: true } },
} satisfies Prisma.DocumentSelect;

// ── Helpers ───────────────────────────────────────────────────────

function appError(status: number, code: string, message: string): never {
  const err = new Error(message) as any;
  err.statusCode = status;
  err.code       = code;
  throw err;
}

/** Returns true if actor is allowed to read this document. */
function canAccess(actor: UserPayload, doc: {
  uploadedById: string;
  departmentId: string | null;
  accessLevel:  string;
  sharedWith:   { userId: string }[];
}): boolean {
  if (actor.tier === 'ADMIN')                                           return true;
  if (doc.uploadedById === actor.userId)                                return true;
  if (doc.accessLevel  === 'GLOBAL')                                    return true;
  if (doc.sharedWith.some((s) => s.userId === actor.userId))            return true;
  if (actor.tier === 'MANAGER' && doc.departmentId === actor.departmentId) return true;
  return false;
}

// ── Upload ────────────────────────────────────────────────────────

export async function uploadDocument(actor: UserPayload, input: UploadInput) {
  const doc = await prisma.document.create({
    data: {
      name:         input.name,
      storagePath:  input.storagePath,
      mimeType:     input.mimeType,
      sizeBytes:    input.sizeBytes,
      accessLevel:  input.accessLevel,
      tags:         input.tags ?? [],
      companyId:    actor.companyId,
      uploadedById: actor.userId,
      departmentId: actor.departmentId ?? null,
    },
    select: SAFE_SELECT,
  });
  return doc;
}

// ── List ──────────────────────────────────────────────────────────

export async function listDocuments(actor: UserPayload, query: ListQuery) {
  const page  = query.page  ?? 1;
  const limit = query.limit ?? 20;
  const skip  = (page - 1) * limit;

  // ── Tier-locked base filter ───────────────────────────────────
  // This is constructed FIRST and is never relaxed by optional filters.
  let where: Prisma.DocumentWhereInput;

  if (actor.tier === 'ADMIN') {
    where = { companyId: actor.companyId };

  } else if (actor.tier === 'MANAGER') {
    where = {
      companyId: actor.companyId,
      OR: [
        { uploadedById:  actor.userId },
        { departmentId:  actor.departmentId },
        { accessLevel:  'GLOBAL' },
        { sharedWith: { some: { userId: actor.userId } } },
      ],
    };

  } else {
    // EMPLOYEE — most restricted
    where = {
      companyId: actor.companyId,
      OR: [
        { uploadedById: actor.userId },
        { accessLevel: 'GLOBAL' },
        { sharedWith: { some: { userId: actor.userId } } },
      ],
    };
  }

  // ── Optional filters (AND on top of base — bypass-protected) ──

  // accessLevel filter: safe for all tiers (narrows within what they can already see)
  if (query.accessLevel) {
    where = { ...where, accessLevel: query.accessLevel };
  }

  // departmentId filter
  if (query.departmentId) {
    if (actor.tier === 'ADMIN') {
      where = { ...where, departmentId: query.departmentId };
    } else if (actor.tier === 'MANAGER') {
      // Only allow if they're filtering their own department
      if (query.departmentId === actor.departmentId) {
        where = { ...where, departmentId: query.departmentId };
      }
      // Otherwise: silently ignore — cannot see other depts
    }
    // EMPLOYEE: silently ignored — they have no dept-level visibility
  }

  // uploadedById filter
  if (query.uploadedById) {
    if (actor.tier === 'ADMIN') {
      where = { ...where, uploadedById: query.uploadedById };
    } else if (actor.tier === 'MANAGER') {
      // Only allow filtering by own uploads (anything else could expose cross-dept data)
      if (query.uploadedById === actor.userId) {
        where = { ...where, uploadedById: query.uploadedById };
      }
      // Otherwise: silently ignored
    } else {
      // EMPLOYEE: only allow filtering by own uploads
      if (query.uploadedById === actor.userId) {
        where = { ...where, uploadedById: query.uploadedById };
      }
    }
  }

  // search: safe narrow on top of existing filter
  if (query.search) {
    where = { ...where, name: { contains: query.search, mode: 'insensitive' } };
  }

  const [total, data] = await prisma.$transaction([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      select:  SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take:    limit,
    }),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ── Get one ───────────────────────────────────────────────────────

export async function getDocument(actor: UserPayload, documentId: string) {
  const doc = await prisma.document.findFirst({
    where:  { id: documentId, companyId: actor.companyId },
    select: SAFE_SELECT,
  });

  if (!doc) appError(404, 'NOT_FOUND', 'Document not found');

  if (!canAccess(actor, doc!)) {
    appError(403, 'FORBIDDEN', 'You do not have access to this document');
  }

  return doc;
}

// ── Download path (returns storagePath for presigned URL generation) ─

export async function getDocumentDownloadPath(
  actor: UserPayload,
  documentId: string
): Promise<{ storagePath: string; name: string }> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, companyId: actor.companyId },
    select: {
      id:          true,
      name:        true,
      uploadedById:true,
      departmentId:true,
      accessLevel: true,
      storagePath: true,
      sharedWith:  { select: { userId: true } },
    },
  });

  if (!doc) appError(404, 'NOT_FOUND', 'Document not found');

  if (!canAccess(actor, doc!)) {
    appError(403, 'FORBIDDEN', 'You do not have access to this document');
  }

  return { storagePath: doc!.storagePath, name: doc!.name };
}

// ── Update ────────────────────────────────────────────────────────

export async function updateDocument(
  actor: UserPayload,
  documentId: string,
  input: UpdateInput
) {
  const doc = await prisma.document.findFirst({
    where:  { id: documentId, companyId: actor.companyId },
    select: { id: true, uploadedById: true },
  });

  if (!doc) appError(404, 'NOT_FOUND', 'Document not found');

  if (actor.tier !== 'ADMIN' && doc!.uploadedById !== actor.userId) {
    appError(403, 'FORBIDDEN', 'Only the document owner or an Admin can update it');
  }

  const updated = await prisma.document.update({
    where: { id: documentId },
    data: {
      ...(input.name        !== undefined && { name:        input.name }),
      ...(input.accessLevel !== undefined && { accessLevel: input.accessLevel }),
      ...(input.tags        !== undefined && { tags:        input.tags }),
    },
    select: SAFE_SELECT,
  });

  return updated;
}

// ── Share ─────────────────────────────────────────────────────────

export async function shareDocument(
  actor: UserPayload,
  documentId: string,
  userIds: string[]
) {
  const doc = await prisma.document.findFirst({
    where:  { id: documentId, companyId: actor.companyId },
    select: { id: true, uploadedById: true },
  });

  if (!doc) appError(404, 'NOT_FOUND', 'Document not found');

  if (actor.tier !== 'ADMIN' && doc!.uploadedById !== actor.userId) {
    appError(403, 'FORBIDDEN', 'Only the document owner or an Admin can share it');
  }

  // Verify all target users belong to the same company
  const validUsers = await prisma.user.findMany({
    where:  { id: { in: userIds }, companyId: actor.companyId, isActive: true },
    select: { id: true },
  });

  const validSet    = new Set(validUsers.map((u) => u.id));
  const invalidIds  = userIds.filter((id) => !validSet.has(id));

  if (invalidIds.length > 0) {
    appError(400, 'INVALID_USER_IDS', `Users not found in company: ${invalidIds.join(', ')}`);
  }

  await prisma.documentShare.createMany({
    data: userIds.map((userId) => ({
      documentId,
      userId,
      grantedById: actor.userId,
    })),
    skipDuplicates: true,
  });

  return { shared: userIds.length };
}

// ── Delete ────────────────────────────────────────────────────────

export async function deleteDocument(actor: UserPayload, documentId: string) {
  const doc = await prisma.document.findFirst({
    where:  { id: documentId, companyId: actor.companyId },
    select: { id: true, uploadedById: true },
  });

  if (!doc) appError(404, 'NOT_FOUND', 'Document not found');

  if (actor.tier !== 'ADMIN' && doc!.uploadedById !== actor.userId) {
    appError(403, 'FORBIDDEN', 'Only the document owner or an Admin can delete it');
  }

  await prisma.document.delete({ where: { id: documentId } });

  return { deleted: true, id: documentId };
}
