import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { UserPayload, Tier } from '../types';

// Columns safe to return to API consumers (never expose passwordHash/tokenVersion)
const SAFE_SELECT = {
  id:               true,
  email:            true,
  name:             true,
  tier:             true,
  departmentId:     true,
  companyId:        true,
  isActive:         true,
  terminationDate:  true,
  terminationReason:true,
  offboardType:     true,
  terminatedById:   true,
  createdAt:        true,
  updatedAt:        true,
  department: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

// ── Helpers ───────────────────────────────────────────────────────

/** Throws a typed AppError that errorHandler maps to HTTP status. */
function appError(status: number, code: string, message: string): never {
  const err = new Error(message) as any;
  err.statusCode = status;
  err.code       = code;
  throw err;
}

/** Ensures actor has authority over target employee. */
function assertScope(actor: UserPayload, targetDeptId: string | null | undefined): void {
  if (actor.tier === 'ADMIN') return;
  if (actor.tier === 'MANAGER') {
    if (!actor.departmentId || actor.departmentId !== targetDeptId) {
      appError(403, 'FORBIDDEN', 'Managers can only manage employees within their own department');
    }
    return;
  }
  // EMPLOYEE: no management authority
  appError(403, 'FORBIDDEN', 'Employees cannot perform this action');
}

// ── Register ──────────────────────────────────────────────────────

export interface RegisterInput {
  email:        string;
  name:         string;
  password:     string;
  tier:         'MANAGER' | 'EMPLOYEE';
  departmentId: string;
  phone?:       string;
  jobTitle?:    string;
}

export async function registerEmployee(actor: UserPayload, input: RegisterInput) {
  // Edge case: Manager cannot register employees outside their department
  if (actor.tier === 'MANAGER' && actor.departmentId !== input.departmentId) {
    appError(403, 'FORBIDDEN', 'Managers can only register employees in their own department');
  }

  // Edge case: Manager cannot register another Manager
  if (actor.tier === 'MANAGER' && input.tier === 'MANAGER') {
    appError(403, 'FORBIDDEN', 'Managers cannot register other managers');
  }

  // Verify department belongs to the same company
  const dept = await prisma.department.findFirst({
    where: { id: input.departmentId, companyId: actor.companyId },
  });
  if (!dept) {
    appError(404, 'NOT_FOUND', 'Department not found within your company');
  }

  // Prevent duplicate email (Prisma P2002 would also catch this, but fail earlier)
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    appError(409, 'CONFLICT', `Email "${input.email}" is already registered`);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const employee = await prisma.user.create({
    data: {
      email:        input.email,
      name:         input.name,
      passwordHash,
      tier:         input.tier,
      departmentId: input.departmentId,
      companyId:    actor.companyId,
    },
    select: SAFE_SELECT,
  });

  return employee;
}

// ── List ──────────────────────────────────────────────────────────

export interface ListQuery {
  isActive?:     'true' | 'false';
  tier?:         Tier;
  departmentId?: string;
  page:          number;
  limit:         number;
  search?:       string;
}

export async function listEmployees(actor: UserPayload, query: ListQuery) {
  const where: Prisma.UserWhereInput = {
    companyId: actor.companyId,
  };

  // Scope filtering
  if (actor.tier === 'MANAGER') {
    where.departmentId = actor.departmentId;
  } else if (actor.tier === 'EMPLOYEE') {
    // Employees can only see themselves
    where.id = actor.userId;
  }

  // Optional filters (ADMIN/MANAGER can apply these; EMPLOYEE where clause already locked)
  if (query.isActive !== undefined && actor.tier !== 'EMPLOYEE') {
    where.isActive = query.isActive === 'true';
  }
  if (query.tier && actor.tier !== 'EMPLOYEE') {
    where.tier = query.tier;
  }
  if (query.departmentId && actor.tier === 'ADMIN') {
    where.departmentId = query.departmentId;
  }
  if (query.search) {
    where.OR = [
      { name:  { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const skip  = (query.page - 1) * query.limit;
  const [total, employees] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
    }),
  ]);

  return {
    data:  employees,
    meta: {
      total,
      page:       query.page,
      limit:      query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ── Get one ───────────────────────────────────────────────────────

export async function getEmployee(actor: UserPayload, targetId: string) {
  const user = await prisma.user.findFirst({
    where: { id: targetId, companyId: actor.companyId },
    select: SAFE_SELECT,
  });

  if (!user) appError(404, 'NOT_FOUND', 'Employee not found');

  // EMPLOYEE can only read themselves
  if (actor.tier === 'EMPLOYEE' && actor.userId !== targetId) {
    appError(403, 'FORBIDDEN', 'Employees can only view their own profile');
  }

  // MANAGER can only read their department
  if (actor.tier === 'MANAGER' && user!.departmentId !== actor.departmentId) {
    appError(403, 'FORBIDDEN', 'Managers can only view employees in their department');
  }

  return user;
}

// ── Update ────────────────────────────────────────────────────────

export interface UpdateInput {
  name?:         string;
  phone?:        string;
  jobTitle?:     string;
  tier?:         'MANAGER' | 'EMPLOYEE';
  departmentId?: string;
}

export async function updateEmployee(
  actor: UserPayload,
  targetId: string,
  input: UpdateInput
) {
  // Fetch target to check scope
  const target = await prisma.user.findFirst({
    where: { id: targetId, companyId: actor.companyId },
    select: { id: true, tier: true, departmentId: true, isActive: true },
  });

  if (!target) appError(404, 'NOT_FOUND', 'Employee not found');

  // Cannot update an offboarded employee
  if (!target!.isActive) {
    appError(409, 'CONFLICT', 'Cannot update a deactivated (offboarded) employee');
  }

  // EMPLOYEE: can only update themselves, and only non-privileged fields
  if (actor.tier === 'EMPLOYEE') {
    if (actor.userId !== targetId) {
      appError(403, 'FORBIDDEN', 'Employees can only update their own profile');
    }
    if (input.tier || input.departmentId) {
      appError(403, 'FORBIDDEN', 'Employees cannot change their own tier or department');
    }
  }

  // MANAGER: can only update employees in their department, cannot change tier/dept
  if (actor.tier === 'MANAGER') {
    assertScope(actor, target!.departmentId);
    if (input.tier || input.departmentId) {
      appError(403, 'FORBIDDEN', 'Managers cannot change an employee\'s tier or department');
    }
  }

  // If ADMIN changes departmentId, verify new dept is in same company
  if (input.departmentId && actor.tier === 'ADMIN') {
    const dept = await prisma.department.findFirst({
      where: { id: input.departmentId, companyId: actor.companyId },
    });
    if (!dept) appError(404, 'NOT_FOUND', 'Target department not found in your company');
  }

  // Prevent demoting an ADMIN via this route
  if (target!.tier === 'ADMIN') {
    appError(403, 'FORBIDDEN', 'Admin accounts cannot be modified through this route');
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data:  {
      ...(input.name         && { name:         input.name }),
      ...(input.tier         && { tier:         input.tier }),
      ...(input.departmentId && { departmentId: input.departmentId }),
    },
    select: SAFE_SELECT,
  });

  return updated;
}

// ── Offboard ──────────────────────────────────────────────────────

export interface OffboardInput {
  offboardType:  'FIRED' | 'RESIGNED';
  reason:        string;
  effectiveDate?: string;
}

export async function offboardEmployee(
  actor: UserPayload,
  targetId: string,
  input: OffboardInput
) {
  // ── Fetch target ─────────────────────────────────────────────
  const target = await prisma.user.findFirst({
    where: { id: targetId, companyId: actor.companyId },
    select: { id: true, tier: true, departmentId: true, isActive: true, email: true },
  });

  if (!target) appError(404, 'NOT_FOUND', 'Employee not found');

  // ── Edge cases ───────────────────────────────────────────────

  // Cannot offboard someone already offboarded
  if (!target!.isActive) {
    appError(409, 'CONFLICT', 'Employee is already deactivated');
  }

  // Cannot offboard yourself
  if (actor.userId === targetId) {
    appError(403, 'FORBIDDEN', 'You cannot offboard yourself through this route');
  }

  // ADMINs cannot be offboarded by anyone other than another ADMIN
  if (target!.tier === 'ADMIN' && actor.tier !== 'ADMIN') {
    appError(403, 'FORBIDDEN', 'Only an Admin can offboard another Admin');
  }

  // MANAGER scope guard
  if (actor.tier === 'MANAGER') {
    assertScope(actor, target!.departmentId);
    // Managers cannot fire other managers
    if (target!.tier === 'MANAGER') {
      appError(403, 'FORBIDDEN', 'Managers cannot offboard other managers');
    }
  }

  // EMPLOYEE cannot offboard anyone
  if (actor.tier === 'EMPLOYEE') {
    appError(403, 'FORBIDDEN', 'Employees cannot offboard other users');
  }

  const terminationDate = input.effectiveDate
    ? new Date(input.effectiveDate)
    : new Date();

  // Effective date cannot be in the future beyond 90 days
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 90);
  if (terminationDate > maxDate) {
    appError(400, 'INVALID_DATE', 'Effective date cannot be more than 90 days in the future');
  }

  // ── Atomic: deactivate + increment tokenVersion ──────────────
  // Using a transaction so both writes succeed or neither does.
  const [offboarded] = await prisma.$transaction([
    prisma.user.update({
      where: { id: targetId },
      data: {
        isActive:          false,
        tokenVersion:      { increment: 1 },   // revokes ALL existing JWT tokens
        terminationDate,
        terminationReason: input.reason,
        offboardType:      input.offboardType,
        terminatedById:    actor.userId,
      },
      select: {
        ...SAFE_SELECT,
        tokenVersion: true,  // include for audit
      },
    }),
    // Explicit audit log entry for the offboarding event
    prisma.auditLog.create({
      data: {
        userId:     actor.userId,
        action:     `OFFBOARD_${input.offboardType}`,
        resource:   'User',
        resourceId: targetId,
        metadata: {
          targetEmail:      target!.email,
          offboardType:     input.offboardType,
          reason:           input.reason,
          effectiveDate:    terminationDate.toISOString(),
          performedByTier:  actor.tier,
        },
        ipAddress: null,
      },
    }),
  ]);

  // Strip tokenVersion before returning to client
  const { tokenVersion: _tv, ...safeOffboarded } = offboarded as any;
  return safeOffboarded;
}

// ── Get employee audit history ────────────────────────────────────

export async function getEmployeeHistory(actor: UserPayload, targetId: string) {
  // EMPLOYEE cannot view their own audit trail
  if (actor.tier === 'EMPLOYEE') {
    appError(403, 'FORBIDDEN', 'Employees cannot access audit logs');
  }

  // Verify target exists in company
  const target = await prisma.user.findFirst({
    where: { id: targetId, companyId: actor.companyId },
    select: { id: true, departmentId: true },
  });

  if (!target) appError(404, 'NOT_FOUND', 'Employee not found');

  // MANAGER scope guard
  if (actor.tier === 'MANAGER') {
    assertScope(actor, target!.departmentId);
  }

  const logs = await prisma.auditLog.findMany({
    where:   { resourceId: targetId, resource: 'User' },
    orderBy: { createdAt: 'desc' },
    take:    100,
    select: {
      id:         true,
      action:     true,
      resource:   true,
      resourceId: true,
      metadata:   true,
      ipAddress:  true,
      createdAt:  true,
      user: { select: { id: true, name: true, tier: true } },
    },
  });

  return logs;
}
