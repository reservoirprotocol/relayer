import * as Sdk from "@reservoir0x/sdk";

import { config } from "../config";

type FetchOrdersParams = {
  side: "sell" | "buy";
  status?: string;
  createdAfter?: number;
  createdBefore?: number;
  contract?: string;
  endTime?: number;
  limit?: number;
  cursor?: string;
  sort?: string;
};

export type X2Y2Order = {
  created_at: number;
  currency: string;
  end_at: number;
  amount: number;
  id: number;
  is_bundle: boolean;
  is_collection_offer: boolean;
  item_hash: string;
  maker: string;
  token: {
    contract: string;
    erc_type: string;
    token_id: string;
  };
  royalty_fee: number;
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
    const baseApiUrl = `https://${
      config.chainId === 5 ? "goerli-" : ""
    }api.x2y2.org/v1/${params.side === "sell" ? "orders" : "offers"}`;

    const queryParams = new URLSearchParams();

    if (params.status) {
      queryParams.append("status", String(params.status));
    }

    if (params.createdAfter) {
      queryParams.append("created_after", String(params.createdAfter));
    }

    if (params.createdBefore) {
      queryParams.append("created_before", String(params.createdBefore));
    }

    if (params.contract) {
      queryParams.append("contract", String(params.contract));
    }

    if (params.limit) {
      queryParams.append("limit", String(params.limit));
    }

    if (params.cursor) {
      queryParams.append("cursor", String(params.cursor));
    }

    if (params.sort) {
      queryParams.append("sort", String(params.sort));
    }

    return decodeURI(`${baseApiUrl}?${queryParams.toString()}`);
  }

  public async parseX2Y2Order(
    x2y2Order: X2Y2Order
  ): Promise<Sdk.X2Y2.Order | undefined> {
    try {
      // TODO: Integrate bundle orders
      if (x2y2Order.is_bundle) {
        return undefined;
      }

      return new Sdk.X2Y2.Order(config.chainId, {
        id: x2y2Order.id,
        currency: x2y2Order.currency,
        maker: x2y2Order.maker,
        delegateType:
          x2y2Order.token?.erc_type === "erc1155"
            ? Sdk.X2Y2.Types.DelegationType.ERC1155
            : Sdk.X2Y2.Types.DelegationType.ERC721,
        nft: {
          token: x2y2Order.token.contract,
          tokenId: x2y2Order.is_collection_offer
            ? undefined
            : x2y2Order.token.token_id,
        },
        taker: x2y2Order.taker || "",
        price: x2y2Order.price,
        amount: x2y2Order.amount,
        type: x2y2Order.type,
        itemHash: x2y2Order.item_hash,
        kind: x2y2Order.is_collection_offer
          ? "collection-wide"
          : "single-token",
        deadline: x2y2Order.end_at,
        royalty_fee: x2y2Order.royalty_fee,
      });
    } catch {
      // Skip any errors
    }
  }
}
