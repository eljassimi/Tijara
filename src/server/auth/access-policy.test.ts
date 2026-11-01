import { describe, expect, it } from "vitest";

import { accountCanAccess } from "./access-policy";

describe("accountCanAccess", () => {
  it("blocks staff when the affiliate owner is suspended", () => {
    expect(
      accountCanAccess({
        status: "ACTIVE",
        staffMembership: {
          active: true,
          affiliateProfile: { user: { status: "SUSPENDED" } },
        },
      }),
    ).toBe(false);
  });

  it("allows active staff of an active affiliate", () => {
    expect(
      accountCanAccess({
        status: "ACTIVE",
        staffMembership: {
          active: true,
          affiliateProfile: { user: { status: "ACTIVE" } },
        },
      }),
    ).toBe(true);
  });
});
