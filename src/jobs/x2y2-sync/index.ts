import _ from "lodash";
import cron from "node-cron";

import * as realtimeQueueListings from "./queues/realtime-queue";
import * as realtimeQueueOffers from "./queues/realtime-queue-offers";
import { logger } from "../../common/logger";
import { acquireLock, redis } from "../../common/redis";
import { config } from "../../config";

if (config.doRealtimeWork) {
  cron.schedule("*/5 * * * * *", async () => {
    if ([1, 5].includes(config.chainId)) {
      const lockAcquired = await acquireLock("x2y2-sync-lock", 60 * 5);
      if (lockAcquired) {
        const cacheKey = "x2y2-sync-cursor";
        const cursor = await redis.get(cacheKey);

        // If key doesn't exist, set it to empty string which will trigger a sync from the beginning
        if (_.isNull(cursor)) {
          await redis.set(cacheKey, "");
        }

        await realtimeQueueListings.addToRealtimeQueue();
        logger.info(
          realtimeQueueListings.realtimeQueue.name,
          `Start X2Y2 listings sync from cursor=(${cursor})`
        );
      }
    }
  });

  cron.schedule("*/5 * * * * *", async () => {
    // Only sync offers on mainnet
    if ([1].includes(config.chainId)) {
      const lockAcquired = await acquireLock("x2y2-sync-offers-lock", 60 * 5);
      if (lockAcquired) {
        const cacheKey = "x2y2-sync-offers-cursor";
        const cursor = await redis.get(cacheKey);

        // If key doesn't exist, set it to empty string which will trigger a sync from the beginning
        if (_.isNull(cursor)) {
          await redis.set(cacheKey, "");
        }

        await realtimeQueueOffers.addToRealtimeQueue();
        logger.info(
          realtimeQueueOffers.realtimeQueue.name,
          `Start X2Y2 offers sync from cursor=(${cursor})`
        );
      }
    }
  });
}
