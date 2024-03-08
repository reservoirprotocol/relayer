import cron from "node-cron";
import _ from "lodash";

import { config } from "../../config";
import { acquireLock, redis } from "../../common/redis";
import { logger } from "../../common/logger";

import * as manifoldSyncRealtime from "./realtime-queue";

if (config.doRealtimeWork) {
  cron.schedule("* * * * *", async () => {
    if (_.indexOf([1, 5], config.chainId) !== -1) {
      const lockAcquired = await acquireLock("manifold-sync-lock", 60 * 5);
      if (lockAcquired) {
        const cacheIdKey = "manifold-realtime-id";
        const cachePageKey = "manifold-realtime-page";
        const id = Number((await redis.get(cacheIdKey)) || 0);
        const page = Number((await redis.get(cachePageKey)) || 1);

        await manifoldSyncRealtime.addToRealtimeQueue();

        logger.debug(
          manifoldSyncRealtime.realtimeQueue.name,
          `Start Manifold sync from id=(${id}), page=(${page})`
        );
      }
    }
  });
}
