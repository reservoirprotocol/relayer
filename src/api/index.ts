import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import express, { json } from "express";
import asyncHandler from "express-async-handler";

import { logger } from "../common/logger";
import { config } from "../config";
import { allQueues } from "../jobs/index";
import { addToOpenSeaRaribleQueue } from "../jobs/opensea-rarible-sync";
import { addToBackfillQueue } from "../jobs/opensea-sync";
import { fastSyncContract } from "../utils/fast-sync-contract";
import { fullSyncCollection } from "../utils/full-sync-collection";

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
    "/collections/full-sync",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });

      await fullSyncCollection(req.body.collection);
    })
  );

  app.post(
    "/contracts/fast-sync",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });

      await fastSyncContract(req.body.contract, req.body.count || 200);
    })
  );

  // app.post(
  //   "/relay/v3",
  //   asyncHandler(async (req, res) => {
  //     res.status(202).json({ message: "Request accepted" });

  //     await relayOrdersToV3(req.body.contract);
  //   })
  // );

  // app.post(
  //   "/relay-all/v3",
  //   asyncHandler(async (req, res) => {
  //     res.status(202).json({ message: "Request accepted" });

  //     await relayAllOrdersToV3(req.body.fromTimestamp, req.body.toTimestamp);
  //   })
  // );

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
