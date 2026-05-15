ALTER TABLE "OperatorTerminalCommand"
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "executedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedReason" TEXT;

CREATE TABLE "RuntimePartitionState" (
  "id" TEXT NOT NULL,
  "marketType" TEXT NOT NULL,
  "executionType" TEXT NOT NULL,
  "capitalMode" TEXT NOT NULL,
  "scannerPaused" BOOLEAN NOT NULL DEFAULT false,
  "trackerPaused" BOOLEAN NOT NULL DEFAULT false,
  "dispatchPaused" BOOLEAN NOT NULL DEFAULT false,
  "healthy" BOOLEAN NOT NULL DEFAULT true,
  "readiness" TEXT NOT NULL DEFAULT 'ready',
  "cooldownState" JSONB,
  "suppressionState" JSONB,
  "queueDepth" INTEGER NOT NULL DEFAULT 0,
  "lastScannerAt" TIMESTAMP(3),
  "lastTrackerAt" TIMESTAMP(3),
  "lastDispatchAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuntimePartitionState_pkey" PRIMARY KEY ("id")
);
