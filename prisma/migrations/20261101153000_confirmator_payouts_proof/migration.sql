-- AlterTable
ALTER TABLE "User" ADD COLUMN "bankName" TEXT,
ADD COLUMN "rib" TEXT;

-- AlterTable
ALTER TABLE "PayoutRequest" ADD COLUMN "proofObjectKey" TEXT,
ADD COLUMN "proofUrl" TEXT;

-- CreateTable
CREATE TABLE "ConfirmatorPayoutRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "bankName" TEXT NOT NULL,
    "rib" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "bankReference" TEXT,
    "proofObjectKey" TEXT,
    "proofUrl" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfirmatorPayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmatorPayoutRequest_reference_key" ON "ConfirmatorPayoutRequest"("reference");

-- CreateIndex
CREATE INDEX "ConfirmatorPayoutRequest_agentId_status_createdAt_idx" ON "ConfirmatorPayoutRequest"("agentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ConfirmatorPayoutRequest_status_createdAt_idx" ON "ConfirmatorPayoutRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ConfirmatorPayoutRequest" ADD CONSTRAINT "ConfirmatorPayoutRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmatorPayoutRequest" ADD CONSTRAINT "ConfirmatorPayoutRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
