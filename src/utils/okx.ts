import * as Sdk from "@reservoir0x/sdk";
import crypto from "crypto";

import { config } from "../config";

type FetchOrdersParams = {
  side: "buy" | "sell";
  createAfter?: number;
  createBefore?: number;
  limit?: number;
  cursor?: string;
  collectionAddress?: string;
  tokenId?: string;
};

export type OkxOrder = {
  orderId: string;
  createTime: number;
  protocolAddress: string;
  protocolData: {
    parameters: Sdk.SeaportBase.Types.OrderComponents;
    signature: string;
  };
};

const BASE_OKX_URL = "https://www.okx.com";

export class Okx {
  public getChainName() {
    switch (config.chainId) {
      case 1:
        return "eth";
      case 10:
        return "optimism";
      case 56:
        return "bsc";
      case 137:
        return "polygon";
      case 324:
        return "zksync-era";
      case 1101:
        return "polygon-zkevm";
      case 8453:
        return "base";
      case 42161:
        return "arbitrum one";
      case 42170:
        return "arbitrum nova";
      case 43114:
        return "avax";
      case 59144:
        return "linea";
      default:
        return undefined;
    }
  }

  public buildAuthHeaders(url: string, method: "GET" | "POST", data?: object) {
    const sign = (s: string) =>
      crypto
        .createHmac("sha256", config.okxSecretKey)
        .update(s)
        .digest("base64");

    const timestamp = new Date().toISOString();
    const signature = sign(
      `${timestamp}${method}${url.slice(BASE_OKX_URL.length)}${
        data ? JSON.stringify(data) : ""
      }`
    );

    return {
      "OK-ACCESS-KEY": config.okxApiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": config.okxPassphrase,
    };
  }

  // https://www.okx.com/web3/build/docs/api/marketplace-order-api
  public buildFetchOrdersURL(params: FetchOrdersParams) {
    const baseApiUrl = `${BASE_OKX_URL}/api/v5/mktplace/nft/markets/${
      params.side === "buy" ? "offers" : "listings"
    }`;

    const queryParams = new URLSearchParams();
    queryParams.append("chain", this.getChainName()!);
    queryParams.append("status", "active");
    queryParams.append("platform", "okx");
    queryParams.append("sort", "create_time_desc");

    if (params.createAfter !== undefined) {
      queryParams.append("createAfter", String(params.createAfter));
    }

    if (params.createBefore !== undefined) {
      queryParams.append("createBefore", String(params.createBefore));
    }

    if (params.limit !== undefined) {
      queryParams.append("limit", String(params.limit));
    }

    if (params.cursor !== undefined) {
      queryParams.append("cursor", String(params.cursor));
    }

    if (params.collectionAddress !== undefined) {
      queryParams.append("collectionAddress", String(params.collectionAddress));
    }

    if (params.tokenId !== undefined) {
      queryParams.append("tokenId", String(params.tokenId));
    }

    return decodeURI(`${baseApiUrl}?${queryParams.toString()}`);
  }

  public async parseOrder(
    params: OkxOrder
  ): Promise<Sdk.SeaportV15.Order | undefined> {
    try {
      if (
        params.protocolAddress.toLowerCase() !==
        Sdk.SeaportV15.Addresses.Exchange[config.chainId]
      ) {
        return undefined;
      }

      const signature = params.protocolData.signature;
      const order = new Sdk.SeaportV15.Order(config.chainId, {
        ...params.protocolData.parameters,
        signature: signature && signature !== "0x" ? signature : undefined,
      });

      (order.params as any).okxOrderId = params.orderId;

      return order;
    } catch {
      // Skip any errors
    }
  }
}
