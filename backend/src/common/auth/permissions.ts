export const permissionCatalog = [
  'admin.dashboard.read',
  'users.read',
  'users.manage',
  'users.archive',
  'customers.read',
  'customers.manage',
  'systems.read',
  'systems.manage',
  'contracts.read',
  'contracts.manage',
  'billing.read',
  'billing.manage',
  'payments.read',
  'payments.manage',
  'reports.read',
  'support.read',
  'support.reply',
  'support.assign',
  'support.internal_notes',
  'notifications.read',
  'audit.read',
  'internal_notes.read',
  'internal_notes.manage',
  'assignments.read',
  'assignments.manage',
  'activity.read',
  'website.read',
  'website.manage',
  'integrations.read',
  'integrations.execute',
  'integration.secrets.view',
  'integration.secrets.manage',
  'ai.read',
  'ai.manage',
] as const;

export type PermissionCode = (typeof permissionCatalog)[number];
export type AppRoleCode =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'STAFF'
  | 'CUSTOMER';

const sharedStaffPermissions: PermissionCode[] = [
  'admin.dashboard.read',
  'customers.read',
  'systems.read',
  'contracts.read',
  'billing.read',
  'payments.read',
  'reports.read',
  'support.read',
  'support.reply',
  'support.internal_notes',
  'notifications.read',
  'activity.read',
  'assignments.read',
  'internal_notes.read',
  'internal_notes.manage',
];

const managerPermissions: PermissionCode[] = [
  ...sharedStaffPermissions,
  'users.read',
  'customers.manage',
  'systems.manage',
  'contracts.manage',
  'billing.manage',
  'payments.manage',
  'support.assign',
  'support.internal_notes',
  'audit.read',
  'internal_notes.manage',
  'assignments.manage',
  'website.read',
  'integrations.read',
  'integrations.execute',
  'ai.read',
];

export const rolePermissionMap: Record<AppRoleCode, PermissionCode[]> = {
  SUPER_ADMIN: [...permissionCatalog],
  ADMIN: [...permissionCatalog],
  MANAGER: managerPermissions,
  STAFF: sharedStaffPermissions,
  CUSTOMER: ['notifications.read'],
};

export function sanitizePermissions(value: unknown): PermissionCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter((item): item is PermissionCode =>
        typeof item === 'string' &&
        (permissionCatalog as readonly string[]).includes(item),
      ),
    ),
  );
}

export function resolvePermissionsForRole(
  role: AppRoleCode,
  storedPermissions?: unknown,
): PermissionCode[] {
  const normalized = sanitizePermissions(storedPermissions);
  if (normalized.length) {
    return normalized;
  }

  return rolePermissionMap[role] || [];
}

export function hasPermission(
  permissions: string[] | undefined | null,
  required: PermissionCode | PermissionCode[],
): boolean {
  const current = new Set(permissions || []);
  const requiredList = Array.isArray(required) ? required : [required];
  return requiredList.every((permission) => current.has(permission));
}

const staffHierarchy: AppRoleCode[] = ['STAFF', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'];

export function roleMatchesRequirement(
  userRole: string | undefined | null,
  requiredRole: string,
): boolean {
  if (!userRole) {
    return false;
  }

  if (userRole === requiredRole) {
    return true;
  }

  if (userRole === 'CUSTOMER' || requiredRole === 'CUSTOMER') {
    return false;
  }

  const userIndex = staffHierarchy.indexOf(userRole as AppRoleCode);
  const requiredIndex = staffHierarchy.indexOf(requiredRole as AppRoleCode);

  if (userIndex === -1 || requiredIndex === -1) {
    return false;
  }

  return userIndex >= requiredIndex;
}
