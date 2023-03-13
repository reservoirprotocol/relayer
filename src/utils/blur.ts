import * as Sdk from "@reservoir0x/sdk";

import { logger } from "../common/logger";
import { config } from "../config";

type FetchOrdersParams = {
  pageSize: number;
  cursor: string;
  contractAddress?: string;
  direction?: "asc" | "desc";
};

export type FetchedOrder = {
  id: number;
  marketplace: string;
  data: {
    createdAt: string;
  };
  order?: {
    orderHash: string;
    trader: string;
    side: number;
    matchingPolicy: string;
    collection: string;
    tokenId: string;
    amount: string;
    paymentToken: string;
    price: string;
    listingTime: string;
    expirationTime: string;
    fees: [number, string][];
    salt: string;
    nonce: string;
    extraParams: string;
    v: number;
    r: string;
    s: string;
    extraSignature: string;
    signatureVersion: number;
  };
};

export const blurUrl = config.blurUrl;

export class Blur {
  public buildFetchOrdersURL(params: FetchOrdersParams) {
    const endpoint = new URL(blurUrl);

    if (!params.direction || params.direction === "asc") {
      endpoint.searchParams.append("afterID", params.cursor);
    } else {
      endpoint.searchParams.append("beforeID", params.cursor);
    }

    if (params.contractAddress) {
      endpoint.searchParams.append("contractAddress", params.contractAddress);
    }

    endpoint.searchParams.append("pageSize", params.pageSize.toString());

    return endpoint.toString();
  }

  public parseFetchedOrder({ marketplace, order }: FetchedOrder) {
    if (marketplace === "BLUR") {
      try {
        if (order) {
          return new Sdk.Blur.Order(config.chainId, {
            trader: order.trader,
            side: order.side,
            matchingPolicy: order.matchingPolicy,
            collection: order.collection,
            tokenId: order.tokenId,
            amount: order.amount,
            paymentToken: order.paymentToken,
            price: order.price,
            listingTime: order.listingTime,
            expirationTime: order.expirationTime,
            fees: order.fees.map(([rate, recipient]) => ({ rate, recipient })),
            salt: order.salt,
            nonce: order.nonce,
            extraParams: order.extraParams,
            v: order.v,
            r: order.r,
            s: order.s,
            extraSignature: order.extraSignature,
            signatureVersion: order.signatureVersion,
          });
        }
      } catch (error) {
        logger.error(
          "parse-fetched-blur-order",
          `Failed to parse fetched Blur order ${JSON.stringify(order)}: ${error}`
        );
      }
    }
  }
}
