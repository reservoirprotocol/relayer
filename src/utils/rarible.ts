import * as Sdk from "@reservoir0x/sdk";
import { IPart } from "@reservoir0x/sdk/dist/rarible/types";

import { config } from "../config";

type FetchOrdersParams = {
  blockchain: string;
  continuation?: string;
  size?: number;
  sort?: "DB_UPDATE_DESC" | "DB_UPDATE_ASC";
};

export type RaribleOrder = {
  id: string;
  type: string;
  maker: string;
  make: {
    type: {
      "@type"?: string;
      supply?: string;
      uri?: string;
      assetClass?: string;
      contract?: string;
      tokenId?: string;
      creators?: IPart[];
      royalties?: IPart[];
      signatures?: string[];
    };
    value?: string;
  };
  take: {
    type: {
      "@type"?: string;
      supply?: string;
      uri?: string;
      assetClass?: string;
      contract?: string;
      tokenId?: string;
      creators?: IPart[];
      royalties?: IPart[];
      signatures?: string[];
    };
    value?: string;
  };
  fill: string;
  fillValue: number;
  makeStock: string;
  makeStockValue: number;
  cancelled: boolean;
  optionalRoyalties: boolean;
  salt: string;
  start?: number;
  end?: number;
  signature: string;
  createdAt: string;
  lastUpdateAt: string;
  dbUpdatedAt: string;
  hash: string;
  makeBalance: string;
  makePrice: number;
  makePriceUsd: number;
  priceHistory: any;
  status: string;
  data: any;
};

export class Rarible {
  public buildFetchOrdersURL(params: FetchOrdersParams) {
    //TESTNET: https://testnet-api.rarible.org/v0.1/doc
    let baseApiUrl = "";
    if (config.chainId === 1) {
      baseApiUrl = "https://api.rarible.org/v0.1/orders/sync/";
    } else if (config.chainId === 5) {
      baseApiUrl = "https://testnet-api.rarible.org/v0.1/orders/sync/";
    } else {
      throw new Error("Unsupported chain");
    }

    const queryParams = new URLSearchParams();

    if (params.blockchain) {
      queryParams.append("blockchain", params.blockchain);
    }

    if (params.size) {
      queryParams.append("size", String(params.size));
    }

    if (params.continuation) {
      queryParams.append("continuation", params.continuation);
    }

    if (params.sort) {
      queryParams.append("sort", String(params.sort));
    }

    return decodeURI(`${baseApiUrl}?${queryParams.toString()}`);
  }

  public async parseRaribleOrder(
    raribleOrder: RaribleOrder
  ): Promise<Sdk.Rarible.Order | undefined> {
    try {
      const order = new Sdk.Rarible.Order(config.chainId, raribleOrder as any);
      return order;
    } catch {}
  }
}
