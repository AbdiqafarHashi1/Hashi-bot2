-- AlterTable
ALTER TABLE "SignalEvent"
ADD COLUMN "cycleId" TEXT,
ADD COLUMN "telegramDispatchStatus" TEXT,
ADD COLUMN "telegramDispatchedAt" TIMESTAMP(3),
ADD COLUMN "telegramDispatchReason" TEXT;

-- AlterTable
ALTER TABLE "SignalTrade"
ADD COLUMN "cycleId" TEXT,
ADD COLUMN "paperEquityBase" DOUBLE PRECISION,
ADD COLUMN "leverage" DOUBLE PRECISION,
ADD COLUMN "riskPct" DOUBLE PRECISION,
ADD COLUMN "riskAmount" DOUBLE PRECISION,
ADD COLUMN "quantity" DOUBLE PRECISION,
ADD COLUMN "notional" DOUBLE PRECISION;
