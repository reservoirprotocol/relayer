import cron from "node-cron";
import _ from "lodash";

import { config } from "../../config";
import { acquireLock, redis } from "../../common/redis";
import { logger } from "../../common/logger";
import { realtimeQueue } from "./realtime-queue";

import * as x2y2SyncRealtime from "./realtime-queue";

if (config.doRealtimeWork) {
  cron.schedule("* * * * *", async () => {
    // X2Y2 for now support only the mainnet
    if (config.chainId === 1) {
      const lockAcquired = await acquireLock("x2y2-sync-lock", 120);

      if (lockAcquired) {
        const cacheKey = "x2y2-sync-last";
        let lastSynced = await redis.get(cacheKey);

        // If key doesn't exist set it to 0 which will cause the queue to sync from the first available order
        if (_.isNull(lastSynced)) {
          await redis.set(cacheKey, 0);
        }

        await x2y2SyncRealtime.addToRealtimeQueue();

        logger.info(realtimeQueue.name, `Start X2Y2 sync from lastSynced=(${lastSynced})`);
      }
    }
  });
}
