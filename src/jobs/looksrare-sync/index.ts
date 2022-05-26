import cron from "node-cron";
import _ from "lodash";

import { config } from "../../config";
import { acquireLock, redis } from "../../common/redis";
import { logger } from "../../common/logger";
import { realtimeQueue } from "./realtime-queue";

import * as looksrareSyncRealtime from "./realtime-queue";

if (config.doRealtimeWork) {
  cron.schedule("*/1 * * * *", async () => {
    const lockAcquired = await acquireLock("looksrare-sync-lock", 120);
    logger.info(realtimeQueue.name, `Start sync lockAcquired=(${lockAcquired})`);

    if (lockAcquired) {
      const cacheKey = "looksrare-sync-last";
      let lastSynced = await redis.get(cacheKey);

      // If key doesn't exist set it to 0 which will cause the queue to sync last 60s
      if (_.isNull(lastSynced)) {
        await redis.set(cacheKey, 0);
      }

      await looksrareSyncRealtime.addToRealtimeQueue();

      logger.info(realtimeQueue.name, `Start sync from lastSynced=(${lastSynced})`);
    }
  });
}
