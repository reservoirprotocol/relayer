import * as Sdk from "@reservoir0x/sdk";

import { logger } from "../common/logger";
import { config } from "../config";
import { join, normalize } from "path";

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

export type FlowBulkOrderResponseType = {
  data: FlowOrder[];
  cursor: string;
  hasMore: boolean;
};

export type FlowOrder = {
  id: string;
  chainId: string;
  updatedAt: number;
  isSellOrder: boolean;
  createdAt: number;
  signedOrder: Sdk.Flow.Types.SignedOrder;
};

export class Flow {
  public buildFetchOrderURL(params: FetchOrderParams) {
    const endpoint = "/v2/bulk/orders";
    let url = new URL(normalize(join("https://sv.flow.so", endpoint)));

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

  public async parseFlowOrder(order: FlowOrder) {
    try {
      return new Sdk.Flow.Order(config.chainId, order.signedOrder);
    } catch (err) {
      logger.error("parse-flkow-order", `Failed to parse order ${JSON.stringify(order)} - ${err}`);
    }
  }
}
