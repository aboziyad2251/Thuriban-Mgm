export type Tier = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

export interface UserPayload {
  userId: string;
  tier: Tier;
  departmentId?: string;
  companyId: string;
}

export interface RequestScope {
  departmentId?: string;
  userId?: string;
}

// Augment Express Request with RBAC fields
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
      scope?: RequestScope;
    }
  }
}
