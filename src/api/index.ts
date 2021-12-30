import express, { json } from "express";
import asyncHandler from "express-async-handler";

import { logger } from "../common/logger";
import withMutex from "../common/mutex";
import Redis from "../redis";
import config from "../config";
import * as orders from "../syncer/order";

const init = () => {
  const app = express();
  app.use(json({ limit: "50mb" }));

  app.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ message: "Success" });
    })
  );

  // TODO: Did we actually use this?
  app.post(
    "/sync",
    asyncHandler(async (req, res) => {
      const triggered = withMutex("sync-lock", async () => {
        await orders.sync(Number(req.body.from), Number(req.body.to));
      });

      if (triggered) {
        res.json({ message: "Success" });
      } else {
        res.json({ message: "Already syncing" });
      }
    })
  );

  app.post(
    "/clear",
    asyncHandler(async (req, res) => {
      await Redis.deleteKey("orders-last-synced-timestamp");

      res.json({ message: "Success" });
    })
  );

  app.listen(config.port, () => {
    logger.info("process", `Started on port ${config.port}`);
  });
};

export default init;
