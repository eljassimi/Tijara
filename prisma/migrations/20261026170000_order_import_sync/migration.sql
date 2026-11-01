ALTER TABLE "AffiliateProfile"
ADD COLUMN "orderSheetUrl" TEXT,
ADD COLUMN "orderSheetLastSyncedAt" TIMESTAMP(3);

ALTER TABLE "Order"
ADD COLUMN "importSource" TEXT,
ADD COLUMN "externalReference" TEXT;

CREATE UNIQUE INDEX "Order_affiliateId_importSource_externalReference_key"
ON "Order"("affiliateId", "importSource", "externalReference");

ALTER TABLE "ImportJob"
ADD COLUMN "skippedRows" INTEGER NOT NULL DEFAULT 0;
