-- CreateTable
CREATE TABLE "Order" (
    "hash" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("hash")
);
