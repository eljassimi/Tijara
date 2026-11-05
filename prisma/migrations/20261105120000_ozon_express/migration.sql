-- AlterTable
ALTER TABLE `City` ADD COLUMN `ozonCityId` INTEGER NULL,
    ADD COLUMN `ozonRef` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `City_ozonCityId_key` ON `City`(`ozonCityId`);

-- CreateIndex
CREATE INDEX `City_ozonRef_idx` ON `City`(`ozonRef`);

-- AlterTable
ALTER TABLE `Courier` ADD COLUMN `provider` ENUM('NONE', 'OZON_EXPRESS') NOT NULL DEFAULT 'NONE',
    ADD COLUMN `apiKey` TEXT NULL,
    ADD COLUMN `stockMode` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `allowOpen` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `webhookToken` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Courier_webhookToken_key` ON `Courier`(`webhookToken`);

-- CreateIndex
CREATE INDEX `Courier_provider_integrationStatus_idx` ON `Courier`(`provider`, `integrationStatus`);

-- CreateTable
CREATE TABLE `DeliveryNote` (
    `id` VARCHAR(191) NOT NULL,
    `courierId` VARCHAR(191) NOT NULL,
    `externalRef` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'SAVED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NULL,
    `savedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DeliveryNote_courierId_externalRef_key`(`courierId`, `externalRef`),
    INDEX `DeliveryNote_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `providerStatus` VARCHAR(191) NULL,
    ADD COLUMN `deliveryNoteId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Order_parcelCode_idx` ON `Order`(`parcelCode`);

-- CreateIndex
CREATE INDEX `Order_deliveryNoteId_idx` ON `Order`(`deliveryNoteId`);

-- AddForeignKey
ALTER TABLE `DeliveryNote` ADD CONSTRAINT `DeliveryNote_courierId_fkey` FOREIGN KEY (`courierId`) REFERENCES `Courier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryNote` ADD CONSTRAINT `DeliveryNote_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_deliveryNoteId_fkey` FOREIGN KEY (`deliveryNoteId`) REFERENCES `DeliveryNote`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
