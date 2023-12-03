import _ from "lodash";
import cron from "node-cron";

import * as realtimeQueueListings from "./queues/realtime-queue";
import * as realtimeQueueOffers from "./queues/realtime-queue-offers";
import { logger } from "../../common/logger";
import { acquireLock, redis } from "../../common/redis";
import { config } from "../../config";
import { Element } from "../../utils/element";

if (config.doRealtimeWork) {
  cron.schedule("*/5 * * * * *", async () => {
    if (new Element().getChainName()) {
      const lockAcquired = await acquireLock("element-sync-lock", 60 * 5);
      if (lockAcquired) {
        const cacheKey = "element-sync-cursor";
        const cursor = await redis.get(cacheKey);

        // If key doesn't exist, set it to empty string which will trigger a sync from the beginning
        if (_.isNull(cursor)) {
          await redis.set(cacheKey, "");
        }

        await realtimeQueueListings.addToRealtimeQueue();
        logger.info(
          realtimeQueueListings.realtimeQueue.name,
          `Start Element listings sync from cursor=(${cursor})`
        );
      }
    }
  });

  cron.schedule("*/5 * * * * *", async () => {
    if (new Element().getChainName()) {
      const lockAcquired = await acquireLock("element-sync-offers-lock", 60 * 5);
      if (lockAcquired) {
        const cacheKey = "element-sync-offers-cursor";
        const cursor = await redis.get(cacheKey);

        // If key doesn't exist, set it to empty string which will trigger a sync from the beginning
        if (_.isNull(cursor)) {
          await redis.set(cacheKey, "");
        }

        await realtimeQueueOffers.addToRealtimeQueue();
        logger.info(
          realtimeQueueOffers.realtimeQueue.name,
          `Start Element offers sync from cursor=(${cursor})`
        );
      }
    }
  });
}
