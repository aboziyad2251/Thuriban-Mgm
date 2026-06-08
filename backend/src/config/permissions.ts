import { Tier } from '../types';

export const DEFAULT_PERMISSION_MAP: Record<Tier, string[]> = {
  ADMIN:    ['*'],
  MANAGER:  ['users:read', 'users:create', 'departments:read', 'departments:update', 'tasks:*', 'company:read', 'documents:read', 'documents:create', 'documents:delete'],
  EMPLOYEE: ['users:read:self', 'tasks:read', 'tasks:update:self', 'company:read', 'documents:read', 'documents:create'],
};

/**
 * Returns true if the given tier holds the requested permission.
 * Supports wildcard '*' and namespace wildcards like 'tasks:*'.
 */
export function hasPermission(
  tier: Tier,
  permission: string,
  overrides?: Partial<Record<Tier, string[]>>
): boolean {
  const allowed = overrides?.[tier] ?? DEFAULT_PERMISSION_MAP[tier];

  for (const p of allowed) {
    if (p === '*') return true;
    if (p === permission) return true;
    if (p.endsWith(':*')) {
      const ns = p.slice(0, -2); // e.g. 'tasks'
      if (permission === ns || permission.startsWith(`${ns}:`)) return true;
    }
  }

  return false;
}
