import express, { json } from "express";
import asyncHandler from "express-async-handler";

import logger from "../common/logger";
import withMutex from "../common/mutex";
import config from "../config";
import * as orders from "../syncer/order";

const init = () => {
  const app = express();
  app.use(json({ limit: "50mb" }));

  app.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ data: { message: "Success" } });
    })
  );

  app.post(
    "/sync",
    asyncHandler(async (req, res) => {
      const triggered = withMutex("sync-lock", async () => {
        await orders.sync(Number(req.body.from), Number(req.body.to));
      });

      if (triggered) {
        res.json({ data: { message: "Syncing triggered" } });
      } else {
        res.json({ data: { message: "Already syncing" } });
      }
    })
  );

  app.listen(config.port, () => {
    logger.info(`API started on port ${config.port}`);
  });
};

export default init;
