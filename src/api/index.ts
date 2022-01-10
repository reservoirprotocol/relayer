import express, { json } from "express";
import asyncHandler from "express-async-handler";

import { logger } from "../common/logger";
import { relayOrdersToV3 } from "../common/relay";
import { config } from "../config";
import { addToBackfillQueue } from "../jobs/opensea-sync";

export const start = async () => {
  const app = express();
  app.use(json({ limit: "50mb" }));

  app.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ message: "Success" });
    })
  );

  // Restart syncing from the current minute
  app.post(
    "/sync",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });

      await addToBackfillQueue(req.body.fromMinute, req.body.toMinute);
    })
  );

  // Relay orders to Indexer V3
  app.post(
    "/relay/v3",
    asyncHandler(async (req, res) => {
      res.status(202).json({ message: "Request accepted" });

      await relayOrdersToV3(req.body.contract);
    })
  );

  app.listen(config.port, () => {
    logger.info("process", `Started on port ${config.port}`);
  });
};
