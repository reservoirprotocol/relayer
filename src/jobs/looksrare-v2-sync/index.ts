import cron from "node-cron";
import _ from "lodash";

import { config } from "../../config";
import { acquireLock, redis } from "../../common/redis";
import { logger } from "../../common/logger";
import { realtimeQueue } from "./realtime-queue";

import * as looksrareSyncRealtime from "./realtime-queue";
import * as looksrareSeaportSyncRealtime from "./realtime-queue-seaport";

if (config.doRealtimeWork && config.doLooksrareWork) {
  cron.schedule("* * * * *", async () => {
    if ([0].includes(config.chainId)) {
      const lockAcquired = await acquireLock("looksrare-v2-sync-lock", 120);

      if (lockAcquired) {
        const cacheKey = "looksrare-v2-sync-last";
        let lastSynced = await redis.get(cacheKey);

        // If key doesn't exist set it to 0 which will cause the queue to sync last 60s
        if (_.isNull(lastSynced)) {
          await redis.set(cacheKey, 0);
        }

        await looksrareSyncRealtime.addToRealtimeQueue();

        logger.debug(
          realtimeQueue.name,
          `Start LookRareV2 sync from lastSynced=(${lastSynced})`
        );
      }

      const seaportLockAcquired = await acquireLock(
        "looksrare-v2-seaport-sync-lock",
        120
      );

      if (seaportLockAcquired) {
        const cacheKey = "looksrare-v2-seaport-sync-last";
        let lastSynced = await redis.get(cacheKey);

        // If key doesn't exist set it to 0 which will cause the queue to sync last 60s
        if (_.isNull(lastSynced)) {
          await redis.set(cacheKey, 0);
        }

        await looksrareSeaportSyncRealtime.addToRealtimeQueue();

        logger.debug(
          realtimeQueue.name,
          `Start LookRareV2 seaport sync from lastSynced=(${lastSynced})`
        );
      }
    }
  });
}
