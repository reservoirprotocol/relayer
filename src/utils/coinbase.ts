import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";
import { config } from "../config";
import { getUnixTime } from "date-fns";
import {logger} from "../common/logger";

type FetchOrdersParams = {
  side?: "sell" | "buy",
  createdAfter?: string;
  endTime?: string;
  limit?: number;
  isDesc?: string;
};

type FetchOrdersPaginationParams = {
  pageToken: string;
};

export type CoinbaseOrder = {
  id: string;
  orderType: string;
  maker: string,
  expiry: string;
  createdAt: string,
  startTime: string,
  fees: { recipient: string, amount: string }[],
  currencyAddress: string,
  takerAmount: string,
  collectionAddress: string,
  tokenId: string,
  nonce: string;
};

export class Coinbase {
  public buildFetchOrdersURL(params: FetchOrdersParams, pagination?: FetchOrdersPaginationParams) {
    let baseApiUrl: string;
    if (config.chainId === 1) {
      baseApiUrl = "https://nft-api.coinbase.com";
    } else {
      throw new Error("Unsupported chain");
    }

    const searchParams = new URLSearchParams();

    if (params.isDesc) {
      searchParams.append("isDesc", String(params.isDesc));
    }

    if (params.createdAfter) {
      searchParams.append("createdAfter", String(params.createdAfter));
    }

    if (params.limit) {
      searchParams.append("limit", String(params.limit));
    }

    if (pagination) {
      if (pagination.pageToken) {
        searchParams.append("pageToken", String(pagination.pageToken));
      }
    }

    const path = params.side === "sell" ? "orders" : "offers";

    return decodeURI(`${baseApiUrl}/api/nft/marketplaceorderbook/v1/${path}?${searchParams.toString()}`);
  }

  public async parseCoinbaseOrder(
    coinbaseOrder: CoinbaseOrder
  ): Promise<Sdk.ZeroExV4.Order | undefined> {
    const makerParams = _.split(coinbaseOrder.maker, "/");
    const fees = _.map(coinbaseOrder.fees, fee => ({
      recipient: fee.recipient,
      amount: fee.amount,
      feeData: "0x",
    }));

    try {
      const order = new Sdk.ZeroExV4.Order(config.chainId, {
        direction: coinbaseOrder.orderType === "list" ? 0 : 1,
        maker: makerParams[2],
        expiry: getUnixTime(new Date(coinbaseOrder.expiry)),
        erc20Token: coinbaseOrder.currencyAddress === "" ? Sdk.ZeroExV4.Addresses.Eth[config.chainId] : coinbaseOrder.currencyAddress,
        erc20TokenAmount: coinbaseOrder.takerAmount,
        nft: coinbaseOrder.collectionAddress,
        nftId: coinbaseOrder.tokenId,
        fees,
        taker: Sdk.Common.Addresses.Eth[config.chainId],
        nftProperties: [],
        nonce: coinbaseOrder.nonce,
        cbOrderId: coinbaseOrder.id,
      });

      if (order.hash()) {
        order.checkValidity();
        if (!order.params.cbOrderId) {
          order.checkSignature();
        }
        return order;
      }
    } catch (error) {
      logger.error(
        "parse-coinbase-order",
        `Coinbase failed to parse order, error=${error}`
      );
    }
  }
}
