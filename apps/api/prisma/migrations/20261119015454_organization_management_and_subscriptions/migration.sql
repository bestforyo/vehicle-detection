-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "monthlyOrderLimit" INTEGER,
ADD COLUMN     "planCode" TEXT NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "seatLimit" INTEGER NOT NULL DEFAULT 5;
