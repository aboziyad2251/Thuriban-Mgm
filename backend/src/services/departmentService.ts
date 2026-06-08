import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { UserPayload } from '../types';

// ── Types ─────────────────────────────────────────────────────────

export interface OrgNode {
  id:            string;
  name:          string;
  type:          'CEO' | 'DEPARTMENT' | 'EMPLOYEE';
  jobTitle?:     string;
  email?:        string;
  avatarInitials: string;
  manager?:      { id: string; name: string; jobTitle?: string; email: string };
  headCount:     number;
  level:         number;
  children:      OrgNode[];
}

interface CreateDeptInput {
  name:         string;
  description?: string;
  parentId?:    string;
  managerId?:   string;
  position?:    number;
}

interface UpdateDeptInput {
  name?:        string;
  description?: string;
  managerId?:   string | null;
  position?:    number;
}

interface ListDeptQuery {
  parentId?: string | 'root';
  page:      number;
  limit:     number;
  search?:   string;
}

interface OrgChartQuery {
  format?:       'tree' | 'flat';
  departmentId?: string;
  maxDepth?:     number;
}

// ── Safe select ───────────────────────────────────────────────────

const DEPT_SELECT = {
  id:          true,
  name:        true,
  description: true,
  companyId:   true,
  managerId:   true,
  parentId:    true,
  headCount:   true,
  level:       true,
  path:        true,
  position:    true,
  createdAt:   true,
  updatedAt:   true,
  manager: { select: { id: true, name: true, email: true, jobTitle: true } },
  parent:  { select: { id: true, name: true } },
} satisfies Prisma.DepartmentSelect;

// ── Helpers ───────────────────────────────────────────────────────

function appError(status: number, code: string, message: string): never {
  const err = new Error(message) as any;
  err.statusCode = status;
  err.code       = code;
  throw err;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** MANAGER scope: can only touch depts where their dept's path is an ancestor. */
async function assertDeptScope(actor: UserPayload, deptId: string): Promise<void> {
  if (actor.tier === 'ADMIN') return;

  const dept = await prisma.department.findUnique({
    where:  { id: deptId },
    select: { companyId: true },
  });

  if (!dept) appError(404, 'NOT_FOUND', 'Department not found');

  // MANAGER cannot create/edit departments — routes enforce ADMIN-only
  appError(403, 'FORBIDDEN', 'Only Admins can manage departments');
}

/** Walk descendant ids (via materialized path prefix). Used to prevent circular moves. */
async function getDescendantIds(deptId: string, companyId: string): Promise<string[]> {
  const dept = await prisma.department.findUnique({
    where:  { id: deptId },
    select: { path: true },
  });
  if (!dept?.path) return [];

  const descendants = await prisma.department.findMany({
    where: {
      companyId,
      path: { startsWith: dept.path + '/' },
    },
    select: { id: true },
  });
  return descendants.map((d) => d.id);
}

// ── Create ────────────────────────────────────────────────────────

export async function createDepartment(actor: UserPayload, input: CreateDeptInput) {
  // ADMIN-only enforced at route level; double-check here
  if (actor.tier !== 'ADMIN') {
    appError(403, 'FORBIDDEN', 'Only Admins can create departments');
  }

  // Verify parentId belongs to same company
  if (input.parentId) {
    const parent = await prisma.department.findFirst({
      where: { id: input.parentId, companyId: actor.companyId },
    });
    if (!parent) appError(404, 'NOT_FOUND', 'Parent department not found in your company');
  }

  // Verify managerId is a user in this company
  if (input.managerId) {
    const mgr = await prisma.user.findFirst({
      where: { id: input.managerId, companyId: actor.companyId, isActive: true },
    });
    if (!mgr) appError(404, 'NOT_FOUND', 'Manager not found or is inactive');
    if (!['ADMIN', 'MANAGER'].includes(mgr.tier)) {
      appError(400, 'INVALID_TIER', 'Department manager must have ADMIN or MANAGER tier');
    }
  }

  const dept = await prisma.department.create({
    data: {
      name:        input.name,
      description: input.description,
      parentId:    input.parentId,
      managerId:   input.managerId,
      position:    input.position ?? 0,
      companyId:   actor.companyId,
      // level + path are set by the DB trigger fn_department_set_level_path
    },
    select: DEPT_SELECT,
  });

  return dept;
}

// ── Get one ───────────────────────────────────────────────────────

export async function getDepartment(actor: UserPayload, deptId: string) {
  const dept = await prisma.department.findFirst({
    where:  { id: deptId, companyId: actor.companyId },
    select: DEPT_SELECT,
  });

  if (!dept) appError(404, 'NOT_FOUND', 'Department not found');
  return dept;
}

// ── List ──────────────────────────────────────────────────────────

export async function listDepartments(actor: UserPayload, query: ListDeptQuery) {
  const where: Prisma.DepartmentWhereInput = {
    companyId: actor.companyId,
  };

  if (query.parentId === 'root') {
    where.parentId = null;
  } else if (query.parentId) {
    where.parentId = query.parentId;
  }

  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' };
  }

  // MANAGER: can only see their own department and children
  if (actor.tier === 'MANAGER' && actor.departmentId) {
    const managerDept = await prisma.department.findUnique({
      where:  { id: actor.departmentId },
      select: { path: true },
    });
    if (managerDept?.path) {
      where.OR = [
        { id:   actor.departmentId },
        { path: { startsWith: managerDept.path + '/' } },
      ];
    } else {
      where.id = actor.departmentId;
    }
  }

  // EMPLOYEE: only their own department
  if (actor.tier === 'EMPLOYEE' && actor.departmentId) {
    where.id = actor.departmentId;
  }

  const skip = (query.page - 1) * query.limit;
  const [total, departments] = await prisma.$transaction([
    prisma.department.count({ where }),
    prisma.department.findMany({
      where,
      select:  DEPT_SELECT,
      orderBy: [{ level: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      skip,
      take: query.limit,
    }),
  ]);

  return {
    data: departments,
    meta: {
      total,
      page:       query.page,
      limit:      query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// ── Update ────────────────────────────────────────────────────────

export async function updateDepartment(
  actor: UserPayload,
  deptId: string,
  input: UpdateDeptInput
) {
  if (actor.tier !== 'ADMIN') {
    appError(403, 'FORBIDDEN', 'Only Admins can update departments');
  }

  const dept = await prisma.department.findFirst({
    where: { id: deptId, companyId: actor.companyId },
  });
  if (!dept) appError(404, 'NOT_FOUND', 'Department not found');

  // Validate new manager
  if (input.managerId !== undefined && input.managerId !== null) {
    const mgr = await prisma.user.findFirst({
      where: { id: input.managerId, companyId: actor.companyId, isActive: true },
    });
    if (!mgr) appError(404, 'NOT_FOUND', 'Manager not found or is inactive');
    if (!['ADMIN', 'MANAGER'].includes(mgr.tier)) {
      appError(400, 'INVALID_TIER', 'Department manager must have ADMIN or MANAGER tier');
    }
  }

  const updated = await prisma.department.update({
    where: { id: deptId },
    data:  {
      ...(input.name        !== undefined && { name:        input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.managerId   !== undefined && { managerId:   input.managerId }),
      ...(input.position    !== undefined && { position:    input.position }),
    },
    select: DEPT_SELECT,
  });

  return updated;
}

// ── Move (reparent) ───────────────────────────────────────────────

export async function moveDepartment(
  actor: UserPayload,
  deptId: string,
  newParentId: string | null
) {
  if (actor.tier !== 'ADMIN') {
    appError(403, 'FORBIDDEN', 'Only Admins can move departments');
  }

  const dept = await prisma.department.findFirst({
    where:  { id: deptId, companyId: actor.companyId },
    select: { id: true, path: true },
  });
  if (!dept) appError(404, 'NOT_FOUND', 'Department not found');

  // Cannot make itself its own parent
  if (newParentId === deptId) {
    appError(400, 'CIRCULAR_HIERARCHY', 'A department cannot be its own parent');
  }

  // Cannot reparent to one of its own descendants (circular hierarchy)
  if (newParentId) {
    const descendantIds = await getDescendantIds(deptId, actor.companyId);
    if (descendantIds.includes(newParentId)) {
      appError(400, 'CIRCULAR_HIERARCHY', 'Cannot move a department into one of its own descendants');
    }

    const newParent = await prisma.department.findFirst({
      where: { id: newParentId, companyId: actor.companyId },
    });
    if (!newParent) appError(404, 'NOT_FOUND', 'Target parent department not found');
  }

  // Trigger fn_department_set_level_path fires on parentId update
  const moved = await prisma.department.update({
    where: { id: deptId },
    data:  { parentId: newParentId },
    select: DEPT_SELECT,
  });

  return moved;
}

// ── Delete ────────────────────────────────────────────────────────

export async function deleteDepartment(actor: UserPayload, deptId: string) {
  if (actor.tier !== 'ADMIN') {
    appError(403, 'FORBIDDEN', 'Only Admins can delete departments');
  }

  const dept = await prisma.department.findFirst({
    where:  { id: deptId, companyId: actor.companyId },
    select: { id: true, headCount: true, _count: { select: { children: true } } },
  });
  if (!dept) appError(404, 'NOT_FOUND', 'Department not found');

  if (dept._count.children > 0) {
    appError(409, 'HAS_CHILDREN', 'Cannot delete a department that has sub-departments. Move or delete children first.');
  }

  if (dept.headCount > 0) {
    appError(409, 'HAS_EMPLOYEES', 'Cannot delete a department with active employees. Reassign them first.');
  }

  await prisma.department.delete({ where: { id: deptId } });

  return { deleted: true, id: deptId };
}

// ── Get ancestors ─────────────────────────────────────────────────

export async function getAncestors(actor: UserPayload, deptId: string) {
  const dept = await prisma.department.findFirst({
    where:  { id: deptId, companyId: actor.companyId },
    select: { path: true },
  });
  if (!dept) appError(404, 'NOT_FOUND', 'Department not found');
  if (!dept!.path) return [];

  // Path looks like '/eng/backend/infra' — split and find each slug's dept
  const pathSegments = dept!.path.split('/').filter(Boolean);
  // pathSegments includes self; ancestors = all but last
  pathSegments.pop();

  if (pathSegments.length === 0) return [];

  // Reconstruct ancestor paths and fetch matching depts
  const ancestorPaths = pathSegments.map(
    (_, i) => '/' + pathSegments.slice(0, i + 1).join('/')
  );

  const ancestors = await prisma.department.findMany({
    where: {
      companyId: actor.companyId,
      path:      { in: ancestorPaths },
    },
    select:  DEPT_SELECT,
    orderBy: { level: 'asc' },
  });

  return ancestors;
}

// ── Org Chart ─────────────────────────────────────────────────────

export async function getOrgChart(
  actor: UserPayload,
  query: OrgChartQuery
): Promise<OrgNode[] | OrgNode> {
  const { format = 'tree', maxDepth = 10 } = query;

  // Fetch all departments for company (or subtree)
  const deptWhere: Prisma.DepartmentWhereInput = {
    companyId: actor.companyId,
  };

  if (query.departmentId) {
    const root = await prisma.department.findFirst({
      where:  { id: query.departmentId, companyId: actor.companyId },
      select: { path: true },
    });
    if (!root) appError(404, 'NOT_FOUND', 'Root department for org chart not found');
    deptWhere.OR = [
      { id: query.departmentId },
      { path: { startsWith: root!.path! + '/' } },
    ];
  }

  const [allDepts, allUsers] = await Promise.all([
    prisma.department.findMany({
      where:   deptWhere,
      select: {
        id:        true,
        name:      true,
        parentId:  true,
        level:     true,
        headCount: true,
        managerId: true,
        manager: { select: { id: true, name: true, email: true, jobTitle: true } },
      },
      orderBy: [{ level: 'asc' }, { position: 'asc' }],
    }),
    prisma.user.findMany({
      where:   { companyId: actor.companyId, isActive: true },
      select: {
        id:         true,
        name:       true,
        email:      true,
        tier:       true,
        jobTitle:   true,
        departmentId: true,
        reportsToId:  true,
      },
    }),
  ]);

  // Build lookup maps
  const deptChildMap = new Map<string | null, typeof allDepts>();
  for (const dept of allDepts) {
    const key = dept.parentId ?? null;
    if (!deptChildMap.has(key)) deptChildMap.set(key, []);
    deptChildMap.get(key)!.push(dept);
  }

  const usersByDept = new Map<string, typeof allUsers>();
  for (const user of allUsers) {
    const key = user.departmentId ?? '__unassigned__';
    if (!usersByDept.has(key)) usersByDept.set(key, []);
    usersByDept.get(key)!.push(user);
  }

  // Recursive tree builder
  function buildDeptNode(
    dept: (typeof allDepts)[0],
    depth: number
  ): OrgNode {
    const node: OrgNode = {
      id:            dept.id,
      name:          dept.name,
      type:          'DEPARTMENT',
      avatarInitials: initials(dept.name),
      headCount:     dept.headCount,
      level:         dept.level,
      children:      [],
      ...(dept.manager && {
        manager: {
          id:       dept.manager.id,
          name:     dept.manager.name,
          email:    dept.manager.email,
          jobTitle: dept.manager.jobTitle ?? undefined,
        },
      }),
    };

    if (depth >= maxDepth) return node;

    // Attach child departments
    const childDepts = deptChildMap.get(dept.id) ?? [];
    for (const child of childDepts) {
      node.children.push(buildDeptNode(child, depth + 1));
    }

    // Attach employees in this department as leaf nodes
    const employees = usersByDept.get(dept.id) ?? [];
    for (const emp of employees) {
      // Skip the manager — already shown on the dept node
      if (emp.id === dept.managerId) continue;

      node.children.push({
        id:             emp.id,
        name:           emp.name,
        type:           'EMPLOYEE',
        email:          emp.email,
        jobTitle:       emp.jobTitle ?? undefined,
        avatarInitials: initials(emp.name),
        headCount:      0,
        level:          dept.level + 1,
        children:       [],
      });
    }

    return node;
  }

  // Find CEO (ADMIN tier, or first user with no reportsToId)
  const ceo = allUsers.find((u) => u.tier === 'ADMIN') ?? null;

  // Start from root departments (no parent, or subtree root)
  const rootParentKey = query.departmentId ? query.departmentId : null;
  const rootDepts     = query.departmentId
    ? [allDepts.find((d) => d.id === query.departmentId)!].filter(Boolean)
    : (deptChildMap.get(null) ?? []);

  const deptTree = rootDepts.map((d) => buildDeptNode(d, 1));

  if (format === 'flat') {
    // BFS flatten
    const flat: OrgNode[] = [];
    const queue = [...deptTree];
    while (queue.length) {
      const node = queue.shift()!;
      flat.push({ ...node, children: [] });
      queue.push(...node.children);
    }
    return flat;
  }

  // Tree mode: wrap in CEO node if not a subtree query
  if (ceo && !query.departmentId) {
    const ceoNode: OrgNode = {
      id:             ceo.id,
      name:           ceo.name,
      type:           'CEO',
      email:          ceo.email,
      jobTitle:       ceo.jobTitle ?? 'Chief Executive Officer',
      avatarInitials: initials(ceo.name),
      headCount:      allUsers.length,
      level:          0,
      children:       deptTree,
    };
    return ceoNode;
  }

  return deptTree;
}
