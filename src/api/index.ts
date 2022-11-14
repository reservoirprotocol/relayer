import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import express, { json } from "express";
import asyncHandler from "express-async-handler";

import { logger } from "../common/logger";
import { config } from "../config";
import { allQueues } from "../jobs";
import { addToRaribleBackfillQueue } from "../jobs/rarible-sync/queues/backfill-queue";
import {
  addToSeaportBackfillQueue,
  createTimeFrameForBackfill,
} from "../jobs/seaport-sync/backfill-queue";
import { addToSyncTokenQueue } from "../jobs/sync-token";
import { addToX2Y2BackfillQueue } from "../jobs/x2y2-sync/queues/backfill-queue";
import { fastSyncContract } from "../utils/fast-sync-contract";
import { relayOrdersByContract, relayOrdersByTimestamp } from "../utils/relay-orders";
import { addToElementBackfillQueue } from "../jobs/element-sync/queues/backfill-queue";

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
      const totalRecords = req.body.totalRecords || 300;
      const limit = req.body.limit || 50;
      const cursor = req.body.cursor || "";

      await fastSyncContract(req.body.contract, totalRecords, limit, cursor);
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
    "/backfill/x2y2",
    asyncHandler(async (req, res) => {
      if (config.chainId === 1) {
        res.status(202).json({ message: "Request accepted" });

        const startTime = Number(req.body.fromTimestamp);
        const endTime = Number(req.body.toTimestamp);
        await addToX2Y2BackfillQueue(startTime, endTime);
      } else {
        res.status(501).json({ message: "X2Y2 not supported" });
      }
    })
  );

  app.post(
    "/backfill/element",
    asyncHandler(async (req, res) => {
      if (config.chainId === 1) {
        res.status(202).json({ message: "Request accepted" });

        const startTime = Number(req.body.fromTimestamp);
        const endTime = Number(req.body.toTimestamp);
        await addToElementBackfillQueue(startTime, endTime);
      } else {
        res.status(501).json({ message: "Element not supported" });
      }
    })
  );

  app.post(
    "/backfill/rarible",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });

      await addToRaribleBackfillQueue();
    })
  );

  app.post(
    "/backfill/seaport",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });
      let fromTimestamp = null;
      let toTimestamp = null;

      if (req.body.fromTimestamp && req.body.toTimestamp) {
        fromTimestamp = req.body.fromTimestamp;
        toTimestamp = req.body.toTimestamp;

        await createTimeFrameForBackfill(fromTimestamp, toTimestamp);
      } else {
        await addToSeaportBackfillQueue(null, null, null, 1);
      }
    })
  );

  app.listen(config.port, () => {
    logger.info("process", `Started on port ${config.port}`);
  });
};
