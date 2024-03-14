import * as Sdk from "@reservoir0x/sdk";

import { config } from "../config";

type FetchOrdersParams = {
  chain: string;
  token_ids?: string;
  asset_contract_address?: string;
  sale_kind?: string;
  side?: string; // 0=buy 1=sell
  maker?: string;
  taker?: string;
  payment_token?: string;
  order_by?: "created_at" | "base_price";
  direction?: "desc" | "asc";
  listed_before?: number; // seconds
  listed_after?: number; // seconds
  limit?: number;
  offset?: number;
};

export type ElementOrder = {
  chain: string;
  createTime: number;
  expirationTime: number;
  listingTime: number;

  orderHash: string;
  maker: string;
  taker: string;

  standard: string;
  side: number;
  saleKind: number;
  paymentToken: string;
  price: number;

  extra: string;
  quantity: string;

  contractAddress: string;
  tokenId: string;

  schema: string;
  exchangeData: string;
};

export enum SaleKind {
  FixedPrice,
  DutchAuction,
  EnglishAuction,
  BatchSignedOrder,
  ContractOffer = 7,
}

export class Element {
  public getChainName() {
    switch (config.chainId) {
      // case 1:
      //   return "eth";
      case 10:
        return "optimism";
      case 56:
        return "bsc";
      // case 137:
      //   return "polygon";
      // case 204:
      //   return "opbnb";
      case 324:
        return "zksync";
      // case 8453:
      //   return "base";
      case 42161:
        return "arbitrum";
      case 43114:
        return "avalanche";
      case 59144:
        return "linea";
      case 81457:
        return "blast";
      case 534352:
        return "scroll";
      default:
        return undefined;
    }
  }

  // https://api.element.market/openapi/#/
  public buildFetchOrdersURL(params: FetchOrdersParams) {
    // For now there's no support for testnets
    // https://element.readme.io/reference/retrieve-orders-list
    const baseApiUrl = `https://api.element.market/openapi/v1/orders/list`;
    const queryParams = new URLSearchParams();

    if (params.chain) {
      queryParams.append("chain", String(params.chain));
    }

    if (params.token_ids) {
      queryParams.append("token_ids", String(params.token_ids));
    }

    if (params.asset_contract_address) {
      queryParams.append(
        "asset_contract_address",
        String(params.asset_contract_address)
      );
    }

    if (params.sale_kind) {
      queryParams.append("sale_kind", String(params.sale_kind));
    }

    if (params.limit) {
      queryParams.append("limit", String(params.limit));
    }

    if (params.listed_after) {
      queryParams.append("listed_after", String(params.listed_after));
    }

    if (params.listed_before) {
      queryParams.append("listed_before", String(params.listed_before));
    }

    if (params.offset) {
      queryParams.append("offset", String(params.offset));
    }

    if (params.order_by) {
      queryParams.append("order_by", String(params.order_by));
    }

    if (params.side) {
      queryParams.append("side", String(params.side));
    }

    return decodeURI(`${baseApiUrl}?${queryParams.toString()}`);
  }

  public async parseOrder(
    params: ElementOrder
  ): Promise<Sdk.Element.Order | undefined> {
    try {
      if (!params.exchangeData) {
        return undefined;
      }

      const json = JSON.parse(params.exchangeData);
      if (params.saleKind === SaleKind.BatchSignedOrder) {
        return new Sdk.Element.Order(config.chainId, {
          ...json,
          erc20Token: json.paymentToken,
        });
      } else {
        const nftProperties =
          params.schema.toLowerCase() === "erc721"
            ? json.order.nftProperties
            : json.order.erc1155TokenProperties;
        return new Sdk.Element.Order(config.chainId, {
          direction:
            params.side === 1
              ? Sdk.Element.Types.TradeDirection.SELL
              : Sdk.Element.Types.TradeDirection.BUY,
          ...json.order,
          ...json.signature,
          nft: params.contractAddress,
          nftId: params.tokenId,
          nftProperties: nftProperties ?? [],
          nftAmount:
            params.schema.toLowerCase() === "erc721"
              ? undefined
              : String(params.quantity),
        });
      }
    } catch {
      // Skip any errors
    }
  }
}
