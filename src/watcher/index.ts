import cron from "node-cron";

import { logger } from "../common/logger";
import withMutex from "../common/mutex";
import config from "../config";
import Redis from "../redis";
import * as orders from "../syncer/order";

const init = () => {
  if (!config.skipWatching) {
    // Fetch new orders every 1 minute
    cron.schedule("*/1 * * * *", async () =>
      withMutex("orders-sync", async () => {
        logger.info("watcher_cron", "Triggering orders fetch");

        const cacheKey = "orders-last-synced-timestamp";

        const timestamp = Math.floor(Date.now() / 1000);
        const lastSyncedTimestamp = Number(await Redis.getKey(cacheKey));

        if (lastSyncedTimestamp === 0) {
          // No cache, so we only sync the last minute
          await orders.sync(timestamp - 59, timestamp).catch(() => {});
        } else {
          // Sync from last synced timestamp up to current one
          await orders.sync(lastSyncedTimestamp + 1, timestamp).catch(() => {});
        }

        await Redis.setKey(cacheKey, String(timestamp));
      })
    );
  }
};

export default init;
