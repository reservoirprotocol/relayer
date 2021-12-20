import cron from "node-cron";

import withMutex from "../common/mutex";
import config from "../config";
import Redis from "../redis";
import * as orders from "../syncer/order";

const init = () => {
  if (!config.skipWatching) {
    // Fetch new orders every 1 minute
    return;
    cron.schedule("*/1 * * * *", async () =>
      withMutex("orders-sync", async () => {
        const cacheKey = "orders-last-synced-timestamp";

        const timestamp = Math.floor(Date.now() / 1000);
        const lastSyncedTimestamp = Number(await Redis.getKey(cacheKey));

        if (lastSyncedTimestamp === 0) {
          // No cache, so we only sync the last minute
          await orders.sync(timestamp - 59, timestamp);
        } else {
          // Sync from last synced timestamp up to current one
          await orders.sync(lastSyncedTimestamp + 1, timestamp);
        }

        await Redis.setKey(cacheKey, String(timestamp));
      })
    );
  }
};

export default init;
