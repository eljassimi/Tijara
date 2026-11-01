# Progress

## Phase 1 — Foundation

### Done

- [x] Project configuration and strict TypeScript baseline
- [x] Central brand configuration
- [x] Environment variable contract
- [x] Initial production data model with roles, catalog, orders, finance, support, notifications, and jobs
- [x] Local service plan for PostgreSQL, Redis, MinIO, and Mailpit
- [x] Documented assumptions
- [x] Dependencies installed, Prisma Client generated, schema validated, and strict typecheck passed
- [x] Branded responsive marketing page with FR/AR and RTL
- [x] Login and signup interface foundation
- [x] Responsive affiliate and admin application shells
- [x] Database-backed affiliate/admin dashboard metrics and recent activity
- [x] Living brand guide and legal pages
- [x] Central role/permission map with staff money restrictions
- [x] Production build and desktop/mobile visual verification
- [x] Database-backed password signup/login actions with Argon2 and HTTP-only sessions
- [x] Turnstile verification boundary with a development-only unconfigured bypass
- [x] Server-side role gates for admin and affiliate shells
- [x] Initial PostgreSQL migration created and applied locally
- [x] Local demo seed with two test accounts, six products, variants, stock, orders, finance, and content
- [x] Affiliate product catalog and product detail routes
- [x] Database-backed affiliate modules for orders, wallet, invoices, and settings
- [x] Database-backed admin modules for affiliates, catalog, confirmation, logistics, finance, content, and operations
- [x] Logout action and signed-in account display
- [x] Manual FR/AR and RTL dashboard walkthrough
- [x] Affiliate order creation with Moroccan phone validation, 48-hour duplicate guard, price snapshots, and order timeline
- [x] Explicit confirmation, delivery, and finance state machines with role-gated Server Actions
- [x] Call attempts, stock decrement on confirmation, stock return, courier/parcel handling, and configurable shipping cutoff
- [x] Transactional invoice generation, paid commission wallet credits, notifications, and audit records
- [x] Affiliate wallet balance, reserved payout amounts, payout requests, and finance review flow
- [x] Admin affiliate approval/suspension, product creation/publishing, couriers, announcements, support replies, and operational settings
- [x] Affiliate tickets, profile, RIB, and password update flows
- [x] Browser-verified order → confirmation → delivery → invoice → paid commission path
- [x] Multi-product cart with cart count, checkout totals, frozen line snapshots, and successful browser checkout
- [x] Affiliate staff accounts, activation, and granular permission controls
- [x] Notification center with unread count and mark-all-read action
- [x] Forgot/reset password tokens with SMTP/Mailpit delivery and session revocation
- [x] Authenticated PDF invoice generation and Excel order export
- [x] Six-month performance charts, status donut, announcements, level progress, and top-product/affiliate rankings
- [x] BullMQ confirmation-timeout worker with retry/backoff and visible job records

### Next

- [ ] Import the exact source-store catalog after its URL is supplied
- [ ] Add authenticated automated end-to-end tests
- [ ] Add product media uploads, gallery reorder, ZIP download, video/caption tools, and full cart checkout
- [ ] Add Excel import with row-level validation and background processing
- [ ] Expand BullMQ to email notifications, invoice generation, and large exports
- [ ] Wire production contact information and Turnstile credentials
- [ ] Add Phase 1 tests and run the complete validation suite
