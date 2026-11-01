export const roles = [
  "SUPER_ADMIN",
  "CATALOG_MANAGER",
  "CONFIRMATION_AGENT",
  "FINANCE",
  "SUPPORT",
  "AFFILIATE",
  "AFFILIATE_STAFF",
] as const;

export type AppRole = (typeof roles)[number];

export const permissions = [
  "admin:view",
  "users:manage",
  "catalog:manage",
  "orders:create",
  "orders:view",
  "orders:export",
  "orders:confirm",
  "orders:deliver",
  "finance:manage",
  "wallet:view",
  "payouts:request",
  "support:manage",
  "settings:manage",
  "profile:manage",
  "team:manage",
  "brand:view",
] as const;

export type Permission = (typeof permissions)[number];

const allPermissions = new Set<Permission>(permissions);

export const rolePermissions: Record<AppRole, ReadonlySet<Permission>> = {
  SUPER_ADMIN: allPermissions,
  CATALOG_MANAGER: new Set([
    "admin:view",
    "catalog:manage",
    "brand:view",
    "profile:manage",
  ]),
  CONFIRMATION_AGENT: new Set([
    "admin:view",
    "orders:view",
    "orders:confirm",
    "orders:deliver",
    "profile:manage",
  ]),
  FINANCE: new Set([
    "admin:view",
    "orders:view",
    "orders:export",
    "finance:manage",
    "profile:manage",
  ]),
  SUPPORT: new Set([
    "admin:view",
    "orders:view",
    "support:manage",
    "profile:manage",
  ]),
  AFFILIATE: new Set([
    "orders:create",
    "orders:view",
    "wallet:view",
    "payouts:request",
    "profile:manage",
    "team:manage",
  ]),
  AFFILIATE_STAFF: new Set(["orders:create", "orders:view"]),
};

export type PermissionSubject = {
  role: AppRole;
  staffPermissions?: readonly Permission[];
};

export function can(
  subject: PermissionSubject,
  permission: Permission,
): boolean {
  if (subject.role === "AFFILIATE_STAFF" && subject.staffPermissions) {
    return subject.staffPermissions.includes(permission);
  }
  return rolePermissions[subject.role].has(permission);
}
