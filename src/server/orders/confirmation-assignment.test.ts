import { describe, expect, it } from "vitest";

import {
  assertConfirmationAssignmentAccess,
  computeConfirmationEarnings,
  confirmationAssignmentScope,
  DEFAULT_CONFIRMATION_REWARD_DH,
} from "./confirmation-assignment";

describe("confirmationAssignmentScope", () => {
  it("scopes confirmation agents to their own orders", () => {
    expect(
      confirmationAssignmentScope({
        id: "agent-1",
        role: "CONFIRMATION_AGENT",
      }),
    ).toEqual({ confirmationAgentId: "agent-1" });
  });

  it("does not restrict super admins", () => {
    expect(
      confirmationAssignmentScope({ id: "admin-1", role: "SUPER_ADMIN" }),
    ).toEqual({});
  });
});

describe("assertConfirmationAssignmentAccess", () => {
  it("blocks agents from another agent's order", () => {
    expect(() =>
      assertConfirmationAssignmentAccess(
        { id: "agent-1", role: "CONFIRMATION_AGENT" },
        { confirmationAgentId: "agent-2" },
      ),
    ).toThrow(/another confirmation agent/);
  });

  it("allows an agent on their own or unassigned order", () => {
    expect(() =>
      assertConfirmationAssignmentAccess(
        { id: "agent-1", role: "CONFIRMATION_AGENT" },
        { confirmationAgentId: "agent-1" },
      ),
    ).not.toThrow();
    expect(() =>
      assertConfirmationAssignmentAccess(
        { id: "agent-1", role: "CONFIRMATION_AGENT" },
        { confirmationAgentId: null },
      ),
    ).not.toThrow();
  });

  it("allows super admins on any order", () => {
    expect(() =>
      assertConfirmationAssignmentAccess(
        { id: "admin-1", role: "SUPER_ADMIN" },
        { confirmationAgentId: "agent-2" },
      ),
    ).not.toThrow();
  });
});

describe("computeConfirmationEarnings", () => {
  it("sums snapshotted rewards and fills legacy rows with the current rate", () => {
    expect(
      computeConfirmationEarnings({
        deliveredCount: 5,
        rewardSum: 30,
        rewardRate: DEFAULT_CONFIRMATION_REWARD_DH,
        rowsWithReward: 3,
      }),
    ).toEqual({ earnedCount: 5, earnedTotal: 50 });
  });

  it("uses only the current rate when nothing was snapshotted", () => {
    expect(
      computeConfirmationEarnings({
        deliveredCount: 4,
        rewardSum: 0,
        rewardRate: 12,
        rowsWithReward: 0,
      }),
    ).toEqual({ earnedCount: 4, earnedTotal: 48 });
  });
});
