import { config } from "../config";
import * as Sdk from "@reservoir0x/sdk";

type FetchOrdersParams = {
  startTime?: number;
  endTime?: number;
};

type FetchOrdersPaginationParams = {
  limit: number;
  cursor: string;
};

export type LooksRareOrder = {
  hash: string;
  collectionAddress: string;
  tokenId: string;
  isOrderAsk: boolean;
  signer: string;
  strategy: string;
  currencyAddress: string;
  amount: string;
  price: string;
  nonce: string;
  startTime: number;
  endTime: number;
  minPercentageToAsk: number;
  params: string;
  status: string;
  signature: string;
  v?: number;
  r?: string;
  s?: string;
};

export class LooksRare {
  // https://api.looksrare.org/api/documentation/#/Orders/OrderController.getOrders
  public buildFetchOrdersURL(params: FetchOrdersParams, pagination?: FetchOrdersPaginationParams) {
    let baseOpenSeaApiUrl: string;
    if (config.chainId === 1) {
      baseOpenSeaApiUrl = "https://api.looksrare.org/api/v1";
    } else {
      baseOpenSeaApiUrl = "https://api-rinkeby.looksrare.org/api/v1";
    }

    let searchParams = new URLSearchParams({
      sort: "NEWEST",
    });

    searchParams.append("status[]", "VALID");

    if (params.startTime) {
      searchParams.append("startTime", String(params.startTime));
    }

    if (params.endTime) {
      searchParams.append("endTime", String(params.endTime));
    }

    if (pagination) {
      searchParams.append("pagination[limit]", String(pagination.limit));
      searchParams.append("pagination[cursor]", pagination.cursor);
    }

    return decodeURI(`${baseOpenSeaApiUrl}/orders?${searchParams.toString()}`);
  }

  public async parseLooksRareOrder(
    looksRareOrder: LooksRareOrder
  ): Promise<Sdk.LooksRare.Order | undefined> {
    try {
      const order = new Sdk.LooksRare.Order(config.chainId, {
        // hash: looksRareOrder.hash,
        collection: looksRareOrder.collectionAddress,
        tokenId: looksRareOrder.tokenId,
        isOrderAsk: Boolean(looksRareOrder.isOrderAsk),
        signer: looksRareOrder.signer,
        strategy: looksRareOrder.strategy,
        currency: looksRareOrder.currencyAddress,
        amount: looksRareOrder.amount,
        price: looksRareOrder.price,
        startTime: looksRareOrder.startTime,
        endTime: looksRareOrder.endTime,
        minPercentageToAsk: looksRareOrder.minPercentageToAsk,
        params: looksRareOrder.params == "" ? "0x" : looksRareOrder.params,
        nonce: looksRareOrder.nonce,
        v: looksRareOrder.v,
        r: looksRareOrder.r,
        s: looksRareOrder.s,
      });

      if (order.hash() === looksRareOrder.hash) {
        order.checkValidity();
        order.checkSignature();
        return order;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }
}
