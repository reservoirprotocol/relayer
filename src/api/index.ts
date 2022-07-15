import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import express, { json } from "express";
import asyncHandler from "express-async-handler";

import { logger } from "../common/logger";
import { config } from "../config";
import { allQueues } from "../jobs";
import { addToOpenSeaBackfillQueue } from "../jobs/opensea-sync";
import {
  addToSeaportBackfillQueue,
  createTimeFrameForBackfill,
} from "../jobs/seaport-sync/backfill-queue";
import { addToX2Y2BackfillQueue } from "../jobs/x2y2-sync/backfill-queue";
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
    "/backfill/opensea",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });

      const fromMinute = Math.floor(req.body.fromTimestamp / 60) - 1;
      const toMinute = Math.floor(req.body.toTimestamp / 60) + 1;
      await addToOpenSeaBackfillQueue(fromMinute, toMinute);
    })
  );

  app.post(
    "/backfill/x2y2",
    asyncHandler(async (req, res) => {
      if (config.chainId === 4) {
        res.status(501).json({ message: "X2Y2 Backfill isn't supported on rinkeby" });
      } else {
        res.status(202).json({ message: "Request accepted" });

        const startTime = Number(req.body.fromTimestamp);
        const endTime = Number(req.body.toTimestamp);
        await addToX2Y2BackfillQueue(startTime, endTime);
      }
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
