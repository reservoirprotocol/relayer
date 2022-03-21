import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import express, { json } from "express";
import asyncHandler from "express-async-handler";

import { logger } from "../common/logger";
import { config } from "../config";
import { allQueues } from "../jobs";
import { addToOpenSeaRaribleQueue } from "../jobs/opensea-rarible-sync";
import { addToBackfillQueue } from "../jobs/opensea-sync/backfill-queue";
import { fastSyncContract } from "../utils/fast-sync-contract";
import { addToSyncTokenQueue } from "../jobs/sync-token";
import { relayOrdersByContract, relayOrdersByTimestamp } from "../utils/relay-orders";

export const start = async () => {
  const app = express();
  app.use(json({ limit: "50mb" }));

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/bullmq");

  createBullBoard({
    queues: allQueues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });

  app.use("/admin/bullmq", serverAdapter.getRouter());

  app.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ message: "Success" });
    })
  );

  app.post(
    "/fast-contract-sync",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });

      await fastSyncContract(req.body.contract, req.body.totalRecords || 300);
    })
  );

  app.post(
    "/fast-token-sync",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });

      await addToSyncTokenQueue(req.body.token, req.body.limit || 20);
    })
  );

  app.post(
    "/relay-orders-by-contract",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });

      await relayOrdersByContract(req.body.contract);
    })
  );

  app.post(
    "/relay-orders-by-timestamp",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });

      await relayOrdersByTimestamp(req.body.fromTimestamp, req.body.toTimestamp);
    })
  );

  app.post(
    "/sync/opensea-rarible",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });

      await addToOpenSeaRaribleQueue(null, req.body.stop);
    })
  );

  app.post(
    "/backfill",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });

      const fromMinute = Math.floor(req.body.fromTimestamp / 60) - 1;
      const toMinute = Math.floor(req.body.toTimestamp / 60) + 1;
      await addToBackfillQueue(fromMinute, toMinute);
    })
  );

  app.listen(config.port, () => {
    logger.info("process", `Started on port ${config.port}`);
  });
};
