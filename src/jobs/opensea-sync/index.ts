import cron from "node-cron";

import "./realtime-queue";
import "./backfill-queue";

import { acquireLock, redis } from "../../common/redis";
import { config } from "../../config";
import { logger } from "../../common/logger";
import { realtimeQueue } from "./realtime-queue";

import * as openseaSyncRealtime from "./realtime-queue";

if (config.doBackgroundWork) {
  // Fetch new orders every 1 minute
  cron.schedule("*/1 * * * *", async () => {
    const currentTimestamp = Math.floor(Date.now() / 1000 / 60);

    const lockAcquired = await acquireLock("opensea-sync-lock", 60);

    if (lockAcquired) {
      const cacheKey = "opensea-sync-last-second";
      let lastSyncedSecond = Number(await redis.get(cacheKey));

      if (lastSyncedSecond === 0) {
        // No cache, so we only sync the last minute
        lastSyncedSecond = currentTimestamp - 60;
        await redis.set(cacheKey, lastSyncedSecond);
      }

      await openseaSyncRealtime.addToRealtimeQueue();

      logger.info(realtimeQueue.name, `Start sync from lastSyncedSecond=(${lastSyncedSecond})`);
    }
  });
}
