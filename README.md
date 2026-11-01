# Tijara

Moroccan cash-on-delivery affiliate commerce platform. French is the default locale; Arabic is fully RTL. Currency is MAD.

## Local setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

Open `http://localhost:3000/fr`.

Run the background worker in a second terminal when testing scheduled confirmation timeouts:

```bash
pnpm worker
```

Mailpit is available at `http://localhost:8025` for password-reset emails.

## Production proxy

Set `TRUST_PROXY="true"` in production when Tijara runs behind a trusted reverse proxy. This makes the login, signup, and password-reset rate limits use the real client IP supplied by that proxy. Leave it `false` when the app is directly exposed.

## Local demo access

The seed command creates two local-only test accounts:

- Admin: `admin@tijara.test` / `DemoTijara2026!`
- Affiliate: `affiliate@tijara.test` / `DemoTijara2026!`

The catalog currently contains six records whose names clearly include “Démo”. They are temporary test content and should be replaced after the source-store URL is supplied.

The operational MVP includes catalog publishing, cart checkout, order confirmation and delivery state machines, invoicing, commission credits, payout requests, staff permissions, tickets, notifications, PDF invoices, Excel exports, password recovery, and FR/AR dashboards.

MySQL is exposed locally on port `3307` to avoid collisions with a default local installation. Redis, MinIO, and Mailpit retain their standard ports.

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

See `docs/PROGRESS.md` for the active phase and `docs/DECISIONS.md` for implementation assumptions.
