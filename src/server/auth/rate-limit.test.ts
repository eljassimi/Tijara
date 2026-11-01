import { describe, expect, it } from "vitest";

import {
  clientIpFromHeaders,
  loginAccountIdentity,
} from "./rate-limit-identity";

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

describe("login rate-limit identities", () => {
  it("ignores spoofable forwarding headers unless the proxy is trusted", () => {
    const incoming = headers({ "x-forwarded-for": "203.0.113.7" });
    expect(clientIpFromHeaders(incoming, false)).toBeNull();
    expect(clientIpFromHeaders(incoming, true)).toBe("203.0.113.7");
  });

  it("rejects malformed proxy addresses", () => {
    expect(
      clientIpFromHeaders(headers({ "x-real-ip": "not-an-ip" }), true),
    ).toBeNull();
  });

  it("isolates account failures by client when a trusted address exists", () => {
    expect(loginAccountIdentity("Admin@Tijara.ma", "203.0.113.7")).toBe(
      "admin@tijara.ma:203.0.113.7",
    );
    expect(loginAccountIdentity("Admin@Tijara.ma", "203.0.113.8")).not.toBe(
      loginAccountIdentity("Admin@Tijara.ma", "203.0.113.7"),
    );
  });
});
