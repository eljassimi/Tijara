export const brand = {
  name: "Tijara",
  nameAr: "تجارة",
  tagline: {
    fr: "Vendez sans stock. On s'occupe du reste.",
    ar: "بيع بلا ستوك، والباقي علينا.",
  },
  locale: "fr",
  locales: ["fr", "ar"] as const,
  currency: "MAD",
  country: "MA",
  // Morocco returned to permanent GMT (UTC+0) on 2026-09-20. Prefer UTC over
  // Africa/Casablanca so clocks stay correct even on runtimes with outdated TZ data.
  timezone: "UTC",
} as const;

export type Locale = (typeof brand.locales)[number];
