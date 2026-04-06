-- CreateTable
CREATE TABLE "SignalTrade" (
    "id" TEXT NOT NULL,
    "signalEventId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopPrice" DOUBLE PRECISION NOT NULL,
    "tp1Price" DOUBLE PRECISION NOT NULL,
    "tp2Price" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "currentPrice" DOUBLE PRECISION,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "tp1HitAt" TIMESTAMP(3),
    "tp2HitAt" TIMESTAMP(3),
    "stopHitAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "unrealizedPnl" DOUBLE PRECISION,
    "realizedPnl" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignalTrade_signalEventId_key" ON "SignalTrade"("signalEventId");

-- AddForeignKey
ALTER TABLE "SignalTrade" ADD CONSTRAINT "SignalTrade_signalEventId_fkey" FOREIGN KEY ("signalEventId") REFERENCES "SignalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
