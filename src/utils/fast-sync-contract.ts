import axios from "axios";

import { logger } from "../common/logger";
import { config } from "../config";
import { addToSyncTokenQueue } from "../jobs/sync-token";

import { buildFetchEventsURL } from "./opensea";
import _ from "lodash";

export const fastSyncContract = async (contract: string, totalRecords: number) => {
  logger.info("fast_sync_contract", `Fast syncing contract ${contract} from OpenSea`);

  // Fetch recent listings
  {
    const limit = 50;
    let count = 0;
    let cursor = "";
    let done = false;

    while (!done) {
      const url = buildFetchEventsURL({
        contract,
        cursor,
        limit,
      });

      await axios
        .get(
          url,
          config.chainId === 1
            ? {
                headers: {
                  "x-api-key": config.backfillOpenseaApiKey,
                  "user-agent":
                    "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
                },
                timeout: 5000,
              }
            : // Skip including the API key on Rinkeby or else the request will fail
              { timeout: 5000 }
        )
        .then(async (response: any) => {
          for (const event of response.data.asset_events) {
            if (!event.asset_bundle) {
              ++count;
              await addToSyncTokenQueue(`${contract}:${event.asset.token_id}`);

              // If we reached the total required records break the loop
              if (count == totalRecords) {
                break;
              }
            }
          }

          logger.info("fast_sync_contract", `Syncing ${_.size(response.data.asset_events)} events OpenSea`);

          if (response.data.next && count < totalRecords) {
            cursor = response.data.next;
          } else {
            done = true;
          }

          // Wait for one second to avoid rate-limiting
          await new Promise((resolve) => setTimeout(resolve, 2000));
        })
        .catch((error) => {
          logger.error("fast_sync_contract", `Failed to get contract events: ${error}`);
          throw error;
        });
    }

    logger.info("fast_sync_contract", `Got ${count} orders for contract ${contract}`);
  }
};
