-- AlterTable
ALTER TABLE "Standard" ADD COLUMN     "licenseRef" TEXT;

-- AlterTable
ALTER TABLE "StandardRevision" ADD COLUMN     "approvedBy" UUID,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "effectiveAt" TIMESTAMP(3),
ADD COLUMN     "scope" TEXT,
ADD COLUMN     "sourceFileName" TEXT;
