# Decisions

## 2026-10-25 — Foundation assumptions

- The first implementation checkpoint is the project tree and Prisma schema, as requested by the brief. UI pages are intentionally deferred until that checkpoint is reviewed.
- Cloudflare Turnstile is selected over reCAPTCHA because it is vendor-neutral and works without Google cookies.
- Password hashes live on `User.passwordHash`; OAuth-compatible Auth.js account models remain available for future providers.
- Affiliate staff members are regular users linked to their owner through `AffiliateStaff`. Fine-grained permissions are stored in `StaffPermission`.
- Order status history uses a unified `statusType` plus string `fromStatus`/`toStatus` fields. This keeps one audit timeline while the three status dimensions remain strongly typed on `Order`.
- Ledger balances are calculated from `WalletTransaction.amount`; no mutable cached balance is stored in Phase 1.
- Product tags such as “new” are derived from publish date; no separate mutable flag is introduced.
- Production contact details remain environment-driven and blank until supplied.
- TypeScript is pinned to 5.9.3 because the current Next.js ESLint stack does not yet support the registry's TypeScript 7 compiler API. Revisit this pin when `typescript-eslint` adds support.
- Auth.js currently rejects its Credentials provider when database sessions are enabled. Tijara will keep database sessions as required and use a first-party password verification/session service against the Auth.js-compatible Prisma tables rather than silently falling back to JWT sessions.
- Local PostgreSQL is exposed on port 5434 because port 5432 is already in use by another service on the development machine.
