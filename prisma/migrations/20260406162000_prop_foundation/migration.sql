-- CreateTable
CREATE TABLE "PropConnectorStatus" (
    "id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "authPresent" BOOLEAN NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'prop',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropConnectorStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropAccountSnapshot" (
    "id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "equity" DOUBLE PRECISION,
    "balance" DOUBLE PRECISION,
    "availableMargin" DOUBLE PRECISION,
    "usedMargin" DOUBLE PRECISION,
    "unrealizedPnl" DOUBLE PRECISION,
    "realizedPnl" DOUBLE PRECISION,
    "dailyLossPct" DOUBLE PRECISION,
    "trailingDrawdownPct" DOUBLE PRECISION,
    "openRiskPct" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropAccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropPosition" (
    "id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "size" DOUBLE PRECISION,
    "entryPrice" DOUBLE PRECISION,
    "markPrice" DOUBLE PRECISION,
    "unrealizedPnl" DOUBLE PRECISION,
    "realizedPnl" DOUBLE PRECISION,
    "drawdownImpact" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "externalPositionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropComplianceEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "lockType" TEXT,
    "reason" TEXT,
    "severity" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropComplianceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropRuntimeEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "connector" TEXT,
    "symbol" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropRuntimeEvent_pkey" PRIMARY KEY ("id")
);
