-- Prepare delivery-company handoff now and API synchronization later.
CREATE TYPE "DeliverySyncStatus" AS ENUM ('NOT_SENT', 'SENT_MANUALLY', 'SYNCED', 'FAILED');
CREATE TYPE "DeliveryIntegrationMode" AS ENUM ('MANUAL', 'API');
CREATE TYPE "DeliveryIntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'CONNECTED', 'PAUSED');

ALTER TABLE "Order"
ADD COLUMN "deliverySyncStatus" "DeliverySyncStatus" NOT NULL DEFAULT 'NOT_SENT',
ADD COLUMN "sentToCourierAt" TIMESTAMP(3),
ADD COLUMN "deliverySyncError" TEXT;

ALTER TABLE "Courier"
ADD COLUMN "integrationMode" "DeliveryIntegrationMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "integrationStatus" "DeliveryIntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
ADD COLUMN "externalAccountId" TEXT,
ADD COLUMN "apiBaseUrl" TEXT;

CREATE INDEX "Order_deliverySyncStatus_confirmedAt_idx"
ON "Order"("deliverySyncStatus", "confirmedAt");
-- Consolidate the former logistics users into the confirmation team. The same
-- team now confirms orders and records delivery-company handoff.
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM (
  'SUPER_ADMIN',
  'CATALOG_MANAGER',
  'CONFIRMATION_AGENT',
  'FINANCE',
  'SUPPORT',
  'AFFILIATE',
  'AFFILIATE_STAFF'
);
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role"
  USING (
    CASE
      WHEN "role"::text = 'LOGISTICS' THEN 'CONFIRMATION_AGENT'
      ELSE "role"::text
    END
  )::"Role";
DROP TYPE "Role_old";

