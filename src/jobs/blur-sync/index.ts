import cron from "node-cron";
import _ from "lodash";

import { logger } from "../../common/logger";
import { acquireLock, redis } from "../../common/redis";
import { config } from "../../config";
import * as RealtimeListingsQueue from "./queues/realtime-queue-listings";
import { cacheKeys, lockNames } from "./utils";

if (config.doRealtimeWork) {
  cron.schedule("*/5 * * * * *", async () => {
    if (config.chainId === 1) {
      const lockAcquired = await acquireLock(lockNames.syncListingsLock, 60 * 5);
      if (lockAcquired) {
        const cacheKey = cacheKeys.syncListingsCursor;
        const cursor = await redis.get(cacheKey);

        if (_.isNull(cursor)) {
          await redis.set(cacheKey, "");
        }

        await RealtimeListingsQueue.addToRealtimeQueue();
        logger.info(
          RealtimeListingsQueue.realtimeQueue.name,
          "Starting Blur realtime listings sync"
        );
      }
    }
  });
}
