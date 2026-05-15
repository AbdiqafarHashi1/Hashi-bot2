-- Phase 9 runtime lifecycle completion + operator terminal command ledger
CREATE TABLE "RuntimeLifecycleState" (
  "id" TEXT NOT NULL DEFAULT 'runtime_lifecycle',
  "stage" TEXT NOT NULL DEFAULT 'boot',
  "status" TEXT NOT NULL DEFAULT 'running',
  "mode" TEXT,
  "marketType" TEXT,
  "completionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes" TEXT,
  "lastTransitionAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuntimeLifecycleState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperatorTerminalCommand" (
  "id" TEXT NOT NULL,
  "command" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'accepted',
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperatorTerminalCommand_pkey" PRIMARY KEY ("id")
);
