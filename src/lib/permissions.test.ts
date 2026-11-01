import { describe, expect, it } from "vitest";

import { can } from "./permissions";

describe("permissions", () => {
  it("lets the confirmation team own confirmation and delivery handoff", () => {
    const agent = { role: "CONFIRMATION_AGENT" as const };
    expect(can(agent, "orders:confirm")).toBe(true);
    expect(can(agent, "orders:deliver")).toBe(true);
    expect(can(agent, "profile:manage")).toBe(true);
    expect(can(agent, "users:manage")).toBe(false);
  });

  it("keeps affiliate staff away from money by default", () => {
    const staff = { role: "AFFILIATE_STAFF" as const };
    expect(can(staff, "orders:create")).toBe(true);
    expect(can(staff, "wallet:view")).toBe(false);
    expect(can(staff, "payouts:request")).toBe(false);
  });

  it("allows explicit staff overrides without granting unrelated permissions", () => {
    const staff = {
      role: "AFFILIATE_STAFF" as const,
      staffPermissions: ["wallet:view"] as const,
    };
    expect(can(staff, "wallet:view")).toBe(true);
    expect(can(staff, "payouts:request")).toBe(false);
  });

  it("keeps partner profile permissions separate from platform settings", () => {
    const staff = {
      role: "AFFILIATE_STAFF" as const,
      staffPermissions: ["profile:manage", "team:manage"] as const,
    };
    expect(can(staff, "profile:manage")).toBe(true);
    expect(can(staff, "team:manage")).toBe(true);
    expect(can(staff, "settings:manage")).toBe(false);
    expect(can(staff, "users:manage")).toBe(false);
  });
});
