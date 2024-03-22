import * as Sdk from "@reservoir0x/sdk";
import { IPart } from "@reservoir0x/sdk/dist/rarible/types";

import { config } from "../config";

type FetchOrdersParams = {
  continuation?: string;
  size?: number;
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
  lastUpdatedAt: string;
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
    let baseApiUrl: string;
    if ([1, 137].includes(config.chainId)) {
      baseApiUrl = "https://api.rarible.org/v0.1/orders/sell/";
    } else if (config.chainId === 5) {
      baseApiUrl = "https://testnet-api.rarible.org/v0.1/orders/sell/";
    } else {
      throw new Error("Unsupported chain");
    }

    const queryParams = new URLSearchParams();

    queryParams.append("platform", "RARIBLE");

    queryParams.append(
      "blockchain",
      config.chainId === 137 ? "POLYGON" : "ETHEREUM"
    );

    if (params.size) {
      queryParams.append("size", String(params.size));
    }

    if (params.continuation) {
      queryParams.append("continuation", params.continuation);
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
