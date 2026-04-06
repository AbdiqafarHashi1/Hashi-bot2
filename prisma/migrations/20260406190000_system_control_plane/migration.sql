-- CreateTable
CREATE TABLE "SystemControl" (
    "id" TEXT NOT NULL DEFAULT 'system',
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "activeMode" TEXT NOT NULL DEFAULT 'signal',
    "killSwitchActive" BOOLEAN NOT NULL DEFAULT false,
    "allowedSymbols" TEXT[] DEFAULT ARRAY['ETHUSDT']::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemControl_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SystemControl" ("id", "isRunning", "activeMode", "killSwitchActive", "allowedSymbols", "updatedAt")
VALUES ('system', false, 'signal', false, ARRAY['ETHUSDT']::TEXT[], CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
