import cron from "node-cron";

import * as realtimeQueueListings from "./queues/realtime-queue-listings";
import { acquireLock } from "../../common/redis";
import { config } from "../../config";
import { Okx } from "../../utils/okx";

if (config.doRealtimeWork) {
  if (new Okx().getChainName()) {
    cron.schedule("*/20 * * * * *", async () => {
      const lockAcquired = await acquireLock(
        realtimeQueueListings.getLockKey(),
        30
      );
      if (lockAcquired) {
        await realtimeQueueListings.addToRealtimeQueue();
      }
    });
  }
}
