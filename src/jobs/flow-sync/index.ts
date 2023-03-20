import cron from "node-cron";
import _ from "lodash";
import { config } from "../../config";
import { acquireLock, redis } from "../../common/redis";
import { logger } from "../../common/logger";

import { cacheKeys, lockNames } from "./utils";
import * as RealtimeListingsQueue from "./queues/realtime-queue-listings";
import * as RealtimeOffersQueue from "./queues/realtime-queue-offers";

if (config.doRealtimeWork) {
  cron.schedule("*/5 * * * * *", async () => {
    if (_.indexOf([1, 5], config.chainId) !== -1) {
      const lockAcquired = await acquireLock(lockNames.syncListingsLock, 60 * 5);
      if (lockAcquired) {
        const cacheKey = cacheKeys.syncListingsCursor;
        const cursor = await redis.get(cacheKey);

        if (_.isNull(cursor)) {
          await redis.set(cacheKey, "");
        }

        await RealtimeListingsQueue.addToRealtimeQueue();
        logger.info(RealtimeListingsQueue.realtimeQueue.name, `Start Flow realtime`);
      }
    }
  });

  cron.schedule("*/5 * * * * *", async () => {
    if (_.indexOf([1, 5], config.chainId) !== -1) {
      const lockAcquired = await acquireLock(lockNames.syncOffersLock, 60 * 5);
      if (lockAcquired) {
        const cacheKey = cacheKeys.syncOffersCursor;
        const cursor = await redis.get(cacheKey);

        // If key doesn't exist, set it to empty string which will trigger a sync from the beginning
        if (_.isNull(cursor)) {
          await redis.set(cacheKey, "");
        }

        await RealtimeOffersQueue.addToRealtimeQueue();
        logger.info(
          RealtimeOffersQueue.realtimeQueue.name,
          `Start Flow offers sync from cursor=(${cursor})`
        );
      }
    }
  });
}
