import type { Role } from "@prisma/client";

const opsRoles: Role[] = [
  "SUPER_ADMIN",
  "SUPPORT",
  "FINANCE",
  "CONFIRMATION_AGENT",
  "CATALOG_MANAGER",
];

const partnerRoles: Role[] = ["AFFILIATE", "AFFILIATE_STAFF"];

export function isOpsRole(role: Role | string) {
  return opsRoles.includes(role as Role);
}

export function isPartnerRole(role: Role | string) {
  return partnerRoles.includes(role as Role);
}

export function chatAreaForRole(role: Role | string) {
  return isPartnerRole(role) ? ("app/partner" as const) : ("admin" as const);
}

/** Who this user is allowed to start a direct conversation with. */
export function allowedChatPeerRoles(role: Role | string): Role[] {
  if (role === "SUPER_ADMIN" || role === "SUPPORT") {
    return [
      "SUPER_ADMIN",
      "SUPPORT",
      "FINANCE",
      "CONFIRMATION_AGENT",
      "CATALOG_MANAGER",
      "AFFILIATE",
      "AFFILIATE_STAFF",
    ];
  }
  if (role === "CONFIRMATION_AGENT") {
    return ["SUPER_ADMIN", "SUPPORT", "FINANCE", "CONFIRMATION_AGENT"];
  }
  if (role === "FINANCE") {
    return ["SUPER_ADMIN", "SUPPORT", "CONFIRMATION_AGENT", "FINANCE"];
  }
  if (role === "CATALOG_MANAGER") {
    return ["SUPER_ADMIN", "SUPPORT", "CATALOG_MANAGER"];
  }
  if (role === "AFFILIATE" || role === "AFFILIATE_STAFF") {
    return ["SUPER_ADMIN", "SUPPORT", "CONFIRMATION_AGENT"];
  }
  return ["SUPER_ADMIN", "SUPPORT"];
}

export function canChatWith(
  actorRole: Role | string,
  peerRole: Role | string,
) {
  return allowedChatPeerRoles(actorRole).includes(peerRole as Role);
}
