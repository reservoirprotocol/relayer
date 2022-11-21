import cron from "node-cron";
import _ from "lodash";

import { config } from "../../config";
import { acquireLock, redis } from "../../common/redis";
import { logger } from "../../common/logger";

import * as manifoldSyncRealtime from "./realtime-queue";

if (config.doRealtimeWork) {
  cron.schedule("* * * * *", async () => {
    const cacheKey = "manifold-realtime-timestamp";
    await redis.set(cacheKey, 0);
    if (_.indexOf([1, 5], config.chainId) !== -1) {
      const lockAcquired = await acquireLock("manifold-sync-lock", 60 * 5);
      if (lockAcquired) {
        const cacheKey = "manifold-realtime-timestamp";
        const timestamp = await redis.get(cacheKey);

        await manifoldSyncRealtime.addToRealtimeQueue();
        logger.info(
          manifoldSyncRealtime.realtimeQueue.name,
          `Start Manifold sync from timestamp=(${timestamp})`
        );
      }
    }
  });
}
