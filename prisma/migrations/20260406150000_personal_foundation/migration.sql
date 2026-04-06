-- CreateTable
CREATE TABLE "PersonalConnectorStatus" (
    "id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "authPresent" BOOLEAN NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'personal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalConnectorStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalAccountSnapshot" (
    "id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "equity" DOUBLE PRECISION,
    "balance" DOUBLE PRECISION,
    "availableMargin" DOUBLE PRECISION,
    "usedMargin" DOUBLE PRECISION,
    "unrealizedPnl" DOUBLE PRECISION,
    "realizedPnl" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalAccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalPosition" (
    "id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "size" DOUBLE PRECISION,
    "entryPrice" DOUBLE PRECISION,
    "markPrice" DOUBLE PRECISION,
    "unrealizedPnl" DOUBLE PRECISION,
    "realizedPnl" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "externalPositionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalRuntimeEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "connector" TEXT,
    "symbol" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalRuntimeEvent_pkey" PRIMARY KEY ("id")
);
