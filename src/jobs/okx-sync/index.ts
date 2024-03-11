import _ from "lodash";
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
        await realtimeQueueListings.realtimeQueue.obliterate({ force: true, count: 500 });
        // await realtimeQueueListings.addToRealtimeQueue();
      }
    });
  }
}
