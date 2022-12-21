import * as Sdk from "@reservoir0x/sdk";

import { logger } from "../common/logger";
import { config } from "../config";

type FetchOrderParams = {
  side: "sell" | "buy";
  orderDirection: "asc" | "desc";
  createdAfter?: number;
  createdBefore?: number;
  orderBy: "createdAt";
  limit?: number;
  cursor?: string | null;
  chainId: number;
};

export type InfinityBulkOrderResponseType = {
  data: InfinityOrder[];
  cursor: string;
  hasMore: boolean;
};

export type InfinityOrder = {
  id: string;
  chainId: string;
  updatedAt: number;
  isSellOrder: boolean;
  createdAt: number;
  signedOrder: Sdk.Infinity.Types.SignedOrder;
};

export class Infinity {
  public buildFetchOrderURL(params: FetchOrderParams) {
    let url = new URL("https://sv.infinity.xyz/v2/bulk/orders");

    if (params.side) {
      url.searchParams.append("side", params.side);
    }

    if (params.orderDirection) {
      url.searchParams.append("orderDirection", params.orderDirection);
    }

    if (params.createdAfter) {
      url.searchParams.append("createdAfter", (params.createdAfter * 1000).toString());
    }

    if (params.createdBefore) {
      url.searchParams.append("createdBefore", (params.createdBefore * 1000).toString());
    }

    if (params.limit) {
      url.searchParams.append("limit", params.limit.toString());
    }

    if (params.cursor) {
      url.searchParams.append("cursor", params.cursor);
    }

    if (params.chainId) {
      url.searchParams.append("chainId", params.chainId.toString());
    }

    url.searchParams.append("orderBy", "createdAt");

    return decodeURI(url.toString());
  }

  public async parseInfinityOrder(order: InfinityOrder) {
    try {
      return new Sdk.Infinity.Order(config.chainId, order.signedOrder);
    } catch (err) {
      logger.error("parse-infinity-order", `Failed to parse order ${order.id} - ${err}`);
    }
  }
}
