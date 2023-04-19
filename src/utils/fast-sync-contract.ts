import _ from "lodash";

import { logger } from "../common/logger";
import * as blur from "../jobs/blur-sync/utils";
import * as seaport from "../jobs/seaport-sync/utils";

export const fastSyncContract = async (contract: string) => {
  logger.info("fast_sync_contract", `Fast syncing contract ${contract}`);

  await Promise.all([
    blur.fetchOrders("", 5, "desc", contract),
    seaport.fetchOrders("sell", { contract, maxOrders: 300 }),
  ]);
};
