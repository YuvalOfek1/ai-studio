/*
  Warnings:

  - You are about to drop the column `costEstimate` on the `Job` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Job" DROP COLUMN "costEstimate",
ADD COLUMN     "costAmount" DOUBLE PRECISION,
ADD COLUMN     "costCurrency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "costEstimated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "costQuantity" DOUBLE PRECISION,
ADD COLUMN     "costRate" DOUBLE PRECISION,
ADD COLUMN     "costUnit" TEXT;

-- CreateTable
CREATE TABLE "PricingRate" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingRate_providerId_modelId_key" ON "PricingRate"("providerId", "modelId");
