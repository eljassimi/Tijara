import { describe, expect, it } from "vitest";

import { loginSchema, signupSchema } from "./auth";

describe("authentication schemas", () => {
  it("accepts Moroccan mobile formats and rejects non-mobile numbers", () => {
    const base = {
      name: "Test User",
      email: "test@example.com",
      socialPage: "https://example.com/page",
      city: "Casablanca",
      password: "a-secure-password",
      terms: true as const,
    };
    expect(
      signupSchema.safeParse({ ...base, phone: "0612345678" }).success,
    ).toBe(true);
    expect(
      signupSchema.safeParse({ ...base, phone: "+212712345678" }).success,
    ).toBe(true);
    expect(
      signupSchema.safeParse({ ...base, phone: "0512345678" }).success,
    ).toBe(false);
  });

  it("normalizes login e-mail addresses", () => {
    const result = loginSchema.parse({
      email: " Seller@Example.com ",
      password: "password123",
    });
    expect(result.email).toBe("seller@example.com");
    expect(result.remember).toBe(true);
  });

  it("accepts social handles and URLs without a protocol", () => {
    const base = {
      name: "Test User",
      email: "test@example.com",
      phone: "0612345678",
      city: "Casablanca",
      password: "a-secure-password",
      terms: true as const,
    };
    expect(
      signupSchema.parse({ ...base, socialPage: "@seller" }).socialPage,
    ).toBe("https://instagram.com/seller");
    expect(
      signupSchema.parse({ ...base, socialPage: "facebook.com/seller" })
        .socialPage,
    ).toBe("https://facebook.com/seller");
  });
});
