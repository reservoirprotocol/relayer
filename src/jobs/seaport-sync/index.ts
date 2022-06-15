import cron from "node-cron";
import { config } from "../../config";
import { acquireLock, redis } from "../../common/redis";
import { logger } from "../../common/logger";
import { realtimeQueue } from "./realtime-queue";

import * as seaportSyncRealtime from "./realtime-queue";

if (config.doRealtimeWork) {
  cron.schedule("* * * * *", async () => {
    const lockAcquired = await acquireLock("seaport-sync-lock", 600);

    if (lockAcquired) {
      const cacheKey = "seaport-sync-last";
      let lastSynced = await redis.get(cacheKey);
      await seaportSyncRealtime.addToRealtimeQueue();

      logger.info(realtimeQueue.name, `Start SeaPort sync from lastSynced=(${lastSynced})`);
    }
  });
}
