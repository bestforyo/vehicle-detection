-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'OPERATOR', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('INSPECTOR', 'ORG_ADMIN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_INSPECTION', 'INSPECTING', 'REVIEW_PENDING', 'NEEDS_MODIFICATION', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionRevisionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PUBLISHED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ShareStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "MediaScanStatus" AS ENUM ('PENDING', 'CLEAN', 'REJECTED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'NONE',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantInvitation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" TEXT,
    "role" "MembershipRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tenantId" UUID,
    "membershipId" UUID,
    "refreshHash" TEXT NOT NULL,
    "previousRefreshHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "refreshFamily" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Standard" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner" TEXT,

    CONSTRAINT "Standard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandardRevision" (
    "id" UUID NOT NULL,
    "standardId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "sourceHash" TEXT,
    "approvalRef" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "StandardRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionTemplate" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "vehicleKind" TEXT NOT NULL,
    "usage" TEXT NOT NULL,
    "standardType" TEXT NOT NULL,
    "standardRevisionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRevision" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "schema" JSONB NOT NULL,
    "approvalRef" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedBy" UUID,
    "standardRevisionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "plateCipher" TEXT,
    "vinCipher" TEXT,
    "mileage" INTEGER,
    "firstRegisteredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionOrder" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderNo" TEXT NOT NULL,
    "vehicleId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "templateRevisionId" UUID NOT NULL,
    "inspectorId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'INSPECTING',
    "currentRevisionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionRevision" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "InspectionRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "schemaSnapshot" JSONB NOT NULL,
    "submittedBy" UUID,
    "submittedAt" TIMESTAMP(3),
    "basedOnRevisionId" UUID,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionAnswer" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "itemKey" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "previewKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT,
    "scanStatus" "MediaScanStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" UUID NOT NULL,
    "orderId" UUID,
    "revisionId" UUID,
    "itemKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionEvidence" (
    "tenantId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "itemKey" TEXT NOT NULL,
    "assetId" UUID NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionEvidence_pkey" PRIMARY KEY ("revisionId","itemKey","assetId")
);

-- CreateTable
CREATE TABLE "ReviewRecord" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "comment" TEXT,
    "targetKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "reportNo" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PUBLISHED',
    "snapshot" JSONB NOT NULL,
    "publishedBy" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportShare" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "ShareStatus" NOT NULL DEFAULT 'ACTIVE',
    "scope" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "requestId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "resourceId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_subjectHash_key" ON "UserIdentity"("provider", "subjectHash");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_status_idx" ON "TenantMembership"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_tenantId_id_key" ON "TenantMembership"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvitation_tokenHash_key" ON "TenantInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "TenantInvitation_tenantId_acceptedAt_expiresAt_idx" ON "TenantInvitation"("tenantId", "acceptedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshHash_key" ON "Session"("refreshHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_refreshFamily_revokedAt_idx" ON "Session"("refreshFamily", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Standard_code_key" ON "Standard"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StandardRevision_standardId_version_key" ON "StandardRevision"("standardId", "version");

-- CreateIndex
CREATE INDEX "InspectionTemplate_tenantId_vehicleKind_usage_idx" ON "InspectionTemplate"("tenantId", "vehicleKind", "usage");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionTemplate_tenantId_code_key" ON "InspectionTemplate"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionTemplate_tenantId_id_key" ON "InspectionTemplate"("tenantId", "id");

-- CreateIndex
CREATE INDEX "TemplateRevision_tenantId_publishedAt_idx" ON "TemplateRevision"("tenantId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateRevision_templateId_revisionNumber_key" ON "TemplateRevision"("templateId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateRevision_tenantId_id_key" ON "TemplateRevision"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Vehicle_tenantId_createdAt_idx" ON "Vehicle"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_tenantId_id_key" ON "Vehicle"("tenantId", "id");

-- CreateIndex
CREATE INDEX "InspectionOrder_tenantId_status_createdAt_idx" ON "InspectionOrder"("tenantId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "InspectionOrder_tenantId_inspectorId_status_createdAt_idx" ON "InspectionOrder"("tenantId", "inspectorId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "InspectionOrder_tenantId_orderNo_key" ON "InspectionOrder"("tenantId", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionOrder_tenantId_id_key" ON "InspectionOrder"("tenantId", "id");

-- CreateIndex
CREATE INDEX "InspectionRevision_tenantId_status_submittedAt_idx" ON "InspectionRevision"("tenantId", "status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionRevision_orderId_revisionNumber_key" ON "InspectionRevision"("orderId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionRevision_tenantId_id_key" ON "InspectionRevision"("tenantId", "id");

-- CreateIndex
CREATE INDEX "InspectionAnswer_tenantId_revisionId_idx" ON "InspectionAnswer"("tenantId", "revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionAnswer_revisionId_itemKey_key" ON "InspectionAnswer"("revisionId", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_objectKey_key" ON "MediaAsset"("objectKey");

-- CreateIndex
CREATE INDEX "MediaAsset_tenantId_orderId_revisionId_itemKey_idx" ON "MediaAsset"("tenantId", "orderId", "revisionId", "itemKey");

-- CreateIndex
CREATE INDEX "MediaAsset_tenantId_scanStatus_idx" ON "MediaAsset"("tenantId", "scanStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_tenantId_id_key" ON "MediaAsset"("tenantId", "id");

-- CreateIndex
CREATE INDEX "InspectionEvidence_tenantId_assetId_idx" ON "InspectionEvidence"("tenantId", "assetId");

-- CreateIndex
CREATE INDEX "ReviewRecord_tenantId_orderId_createdAt_idx" ON "ReviewRecord"("tenantId", "orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_revisionId_key" ON "Report"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reportNo_key" ON "Report"("reportNo");

-- CreateIndex
CREATE INDEX "Report_tenantId_publishedAt_idx" ON "Report"("tenantId", "publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Report_tenantId_id_key" ON "Report"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Report_tenantId_revisionId_key" ON "Report"("tenantId", "revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportShare_tokenHash_key" ON "ReportShare"("tokenHash");

-- CreateIndex
CREATE INDEX "ReportShare_tenantId_reportId_status_idx" ON "ReportShare"("tenantId", "reportId", "status");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_tenantId_actorId_key_key" ON "IdempotencyKey"("tenantId", "actorId", "key");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantInvitation" ADD CONSTRAINT "TenantInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandardRevision" ADD CONSTRAINT "StandardRevision_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "Standard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionTemplate" ADD CONSTRAINT "InspectionTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionTemplate" ADD CONSTRAINT "InspectionTemplate_standardRevisionId_fkey" FOREIGN KEY ("standardRevisionId") REFERENCES "StandardRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRevision" ADD CONSTRAINT "TemplateRevision_standardRevisionId_fkey" FOREIGN KEY ("standardRevisionId") REFERENCES "StandardRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRevision" ADD CONSTRAINT "TemplateRevision_tenantId_templateId_fkey" FOREIGN KEY ("tenantId", "templateId") REFERENCES "InspectionTemplate"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionOrder" ADD CONSTRAINT "InspectionOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionOrder" ADD CONSTRAINT "InspectionOrder_tenantId_vehicleId_fkey" FOREIGN KEY ("tenantId", "vehicleId") REFERENCES "Vehicle"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionOrder" ADD CONSTRAINT "InspectionOrder_tenantId_templateId_fkey" FOREIGN KEY ("tenantId", "templateId") REFERENCES "InspectionTemplate"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionOrder" ADD CONSTRAINT "InspectionOrder_tenantId_templateRevisionId_fkey" FOREIGN KEY ("tenantId", "templateRevisionId") REFERENCES "TemplateRevision"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionOrder" ADD CONSTRAINT "InspectionOrder_tenantId_inspectorId_fkey" FOREIGN KEY ("tenantId", "inspectorId") REFERENCES "TenantMembership"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionRevision" ADD CONSTRAINT "InspectionRevision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionRevision" ADD CONSTRAINT "InspectionRevision_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "InspectionOrder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionAnswer" ADD CONSTRAINT "InspectionAnswer_tenantId_revisionId_fkey" FOREIGN KEY ("tenantId", "revisionId") REFERENCES "InspectionRevision"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "InspectionOrder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionEvidence" ADD CONSTRAINT "InspectionEvidence_tenantId_revisionId_fkey" FOREIGN KEY ("tenantId", "revisionId") REFERENCES "InspectionRevision"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionEvidence" ADD CONSTRAINT "InspectionEvidence_tenantId_assetId_fkey" FOREIGN KEY ("tenantId", "assetId") REFERENCES "MediaAsset"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRecord" ADD CONSTRAINT "ReviewRecord_tenantId_revisionId_fkey" FOREIGN KEY ("tenantId", "revisionId") REFERENCES "InspectionRevision"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "InspectionOrder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_tenantId_revisionId_fkey" FOREIGN KEY ("tenantId", "revisionId") REFERENCES "InspectionRevision"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShare" ADD CONSTRAINT "ReportShare_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShare" ADD CONSTRAINT "ReportShare_tenantId_reportId_fkey" FOREIGN KEY ("tenantId", "reportId") REFERENCES "Report"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
