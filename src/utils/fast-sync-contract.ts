import _ from "lodash";

import { logger } from "../common/logger";
import * as seaport from "../jobs/seaport-sync/utils";

export const fastSyncContract = async (contract: string, slug: string) => {
  logger.info("fast_sync_contract", `Fast syncing contract / slug ${contract} ${slug}`);

  await Promise.all([
    slug ? seaport.fetchListingsBySlug(slug) : new Promise<void>((resolve) => resolve()),
  ]);
};
