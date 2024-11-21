import cron from "node-cron";

import * as realtimeQueueListings from "./queues/realtime-queue-listings";
import { acquireLock } from "../../common/redis";
import { config } from "../../config";
import { Okx } from "../../utils/okx";

if (config.doRealtimeWork && config.doOkxWork) {
  if (new Okx().getChainName()) {
    cron.schedule("*/30 * * * * *", async () => {
      const lockAcquired = await acquireLock(
        realtimeQueueListings.getLockKey(),
        60 * 10
      );

      if (lockAcquired) {
        await realtimeQueueListings.addToRealtimeQueue();
      }
    });
  }
}
