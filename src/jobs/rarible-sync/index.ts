import _ from "lodash";
import cron from "node-cron";

import * as realtimeQueue from "./queues/realtime-queue";
import { logger } from "../../common/logger";
import { acquireLock, redis } from "../../common/redis";
import { config } from "../../config";

if (config.doRealtimeWork) {
  if (_.indexOf([0], config.chainId) !== -1) {
    cron.schedule("*/5 * * * * *", async () => {
      const lockAcquired = await acquireLock("rarible-sync-lock", 60 * 5);
      if (lockAcquired) {
        const cacheKey = "rarible-sync-cursor";
        const cursor = await redis.get(cacheKey);

        // If key doesn't exist, set it to empty string which will trigger a sync from the beginning
        if (_.isNull(cursor)) {
          await redis.set(cacheKey, "");
        }

        await realtimeQueue.addToRealtimeQueue();

        logger.debug(
          realtimeQueue.realtimeQueue.name,
          `Start Rarible sync from cursor=(${cursor})`
        );
      }
    });
  }
}
