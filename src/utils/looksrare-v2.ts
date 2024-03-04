import * as Sdk from "@reservoir0x/sdk";

import { config } from "../config";
import { logger } from "../common/logger";
import _ from "lodash";

type FetchOrdersParams = {
  startTime?: number;
  endTime?: number;
};

type FetchOrdersPaginationParams = {
  limit: number;
  cursor: string;
};

export type LooksRareOrderV2 = {
  id: string;
  hash: string;
  quoteType: number;
  globalNonce: string;
  subsetNonce: string;
  orderNonce: string;
  collection: string;
  currency: string;
  signer: string;
  strategyId: number;
  collectionType: number;
  startTime: number;
  endTime: number;
  price: string;
  additionalParameters: string;
  signature: string;
  createdAt: string;
  merkleRoot: null | string;
  merkleProof: null | Sdk.LooksRareV2.Types.MerkleTreeNode[];
  amounts: string[];
  itemIds: string[];
  status: string;
};

export class LooksRareV2 {
  // https://api.looksrare.org/api/documentation/#/Orders/OrderController.getOrders
  public buildFetchOrdersURL(
    params: FetchOrdersParams,
    pagination?: FetchOrdersPaginationParams,
    seaport?: Boolean
  ) {
    let baseApiUrl: string;
    if (config.chainId === 1) {
      baseApiUrl = "https://api.looksrare.org/api/v2";
    } else if (config.chainId === 5) {
      baseApiUrl = "https://api-goerli.looksrare.org/api/v2";
    } else {
      throw new Error("Unsupported chain");
    }

    const searchParams = new URLSearchParams({
      // isOrderAsk: "true",
      sort: "NEWEST",
    });

    searchParams.append("status", "VALID");

    if (params.startTime) {
      searchParams.append("startTime", String(params.startTime));
    }

    if (params.endTime) {
      searchParams.append("endTime", String(params.endTime));
    }

    if (pagination) {
      searchParams.append("pagination[first]", String(pagination.limit));
      searchParams.append("pagination[cursor]", pagination.cursor);
    }

    return decodeURI(
      `${baseApiUrl}/orders${
        seaport ? "/seaport" : ""
      }?${searchParams.toString()}`
    );
  }

  public async parseLooksRareOrder(
    looksRareOrder: LooksRareOrderV2
  ): Promise<Sdk.LooksRareV2.Order | undefined> {
    try {
      const merkleTree =
        looksRareOrder.merkleRoot && looksRareOrder.merkleProof
          ? {
              root: looksRareOrder.merkleRoot,
              proof: looksRareOrder.merkleProof,
            }
          : undefined;

      const order = new Sdk.LooksRareV2.Order(config.chainId, {
        ...looksRareOrder,
        merkleTree,
      });

      if (order.hash() === looksRareOrder.hash) {
        order.checkValidity();
        order.checkSignature();
        return order;
      }
    } catch (error) {
      logger.error(
        "parse-looks-rare-order",
        `Failed to parse order ${looksRareOrder} - ${error}`
      );
      // Skip any errors
    }
  }
}
