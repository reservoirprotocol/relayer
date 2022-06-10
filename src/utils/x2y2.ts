import { config } from "../config";
import * as Sdk from "@reservoir0x/sdk";

type FetchOrdersParams = {
  status?: string;
  createdAfter?: number;
  endTime?: number;
  limit?: number;
};

export type X2Y2Order = {
  created_at: number;
  currency: string;
  end_at: number;
  id: number;
  is_bundle: boolean;
  item_hash: string;
  maker: string;
  nft: {
    token: string;
    token_id: string;
  };
  price: string;
  side: number;
  status: string;
  taker: string | null;
  type: string;
  updated_at: number;
};

export class X2Y2 {
  // https://hackmd.io/7AnOgEqFT2mZHqUQ4bXwsw#GET-apiorders
  public buildFetchOrdersURL(params: FetchOrdersParams) {
    const baseOpenSeaApiUrl = "https://api.x2y2.org/api/orders"; // For now there's no support for rinkeby net

    let queryParams = new URLSearchParams();

    if (params.status) {
      queryParams.append("status", String(params.status));
    }

    if (params.createdAfter) {
      queryParams.append("created_after", String(params.createdAfter));
    }

    if (params.limit) {
      queryParams.append("limit", String(params.limit));
    }

    return decodeURI(`${baseOpenSeaApiUrl}?${queryParams.toString()}`);
  }

  public async parseX2Y2Order(x2y2Order: X2Y2Order): Promise<Sdk.X2Y2.Order | undefined> {
    try {
      return new Sdk.X2Y2.Order(config.chainId, {
        id: x2y2Order.id,
        currency: x2y2Order.currency,
        maker: x2y2Order.maker,
        nft: {
          token: x2y2Order.nft.token,
          tokenId: x2y2Order.nft.token_id,
        },
        taker: x2y2Order.taker || "",
        price: x2y2Order.price,
        type: x2y2Order.type,
        itemHash: x2y2Order.item_hash,
        kind: x2y2Order.is_bundle ? undefined : "single-token",
        deadline: x2y2Order.end_at,
      });
    } catch {
      return undefined;
    }
  }
}
