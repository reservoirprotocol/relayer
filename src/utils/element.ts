import * as Sdk from "@reservoir0x/sdk";
import BigNumber from "bignumber.js";

import { config } from "../config";

type FetchOrdersParams = {
  chain: "eth" | "bsc" | "polygon" | "avalanche";
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

export type Fee = {
  recipient: string;
  amount: string;
  feeData: string;
};

export type ElementOrder = {
  chain: string;
  createTime: number;
  expirationTime: number;
  listingTime: number;

  hash: string;
  exchange: string;
  maker: string;
  taker: string;

  side: number;
  saleKind: number;
  paymentToken: string;
  basePrice: string;

  extra: string;
  quantity: number;

  nonce: string;
  hashNonce: string;

  assetContract: string;
  assetTokenId: string;

  schema: string;
  properties:
    | {
        propertyValidator: string;
        propertyData: string;
      }[]
    | null;

  fees: Fee[];

  signatureType: number;
  v: number;
  r: string;
  s: string;
};

export enum SaleKind {
  FixedPrice,
  DutchAuction,
  EnglishAuction,
}

export interface ExpiryInfo {
  saleKind: SaleKind;
  extra: string;
  listingTime: string;
  expirationTime: string;
}

export function encodeExpiry(
  orderSaleKind: BigNumber.Value,
  extra: BigNumber.Value,
  listingTime: BigNumber.Value,
  expiryTime: BigNumber.Value
): string {
  // priceType (4bit) + reserved(156bit) + extra(32bit) + listingTime(32bit) + expiryTime(32bit) = 256bit
  return (
    "0x" +
    formatNumber(orderSaleKind, 4) +
    formatNumber(0, 156) +
    formatNumber(extra, 32) +
    formatNumber(listingTime, 32) +
    formatNumber(expiryTime, 32)
  );
}

export function decodeExpiry(expiry: string): ExpiryInfo {
  // priceType (4bit) + reserved(156bit) + extra(32bit) + listingTime(32bit) + expiryTime(32bit) = 256bit
  const hex = formatNumber(expiry, 256);
  const orderSaleKindHex = "0x" + hex.substring(0, 1);
  const extraHex = "0x" + hex.substring(40, 48);
  const listingTimeHex = "0x" + hex.substring(48, 56);
  const expiryTimeHex = "0x" + hex.substring(56, 64);
  return {
    saleKind: parseInt(orderSaleKindHex),
    extra: parseInt(extraHex).toString(),
    listingTime: parseInt(listingTimeHex).toString(),
    expirationTime: parseInt(expiryTimeHex).toString(),
  };
}

function formatNumber(num: BigNumber.Value, bitCount: number) {
  BigNumber.config({ EXPONENTIAL_AT: 1024 });
  const hexStr = new BigNumber(num).toString(16);
  return formatHexBytes(hexStr, bitCount);
}

function formatHexBytes(hexStr: string, bitCount: number) {
  const count = bitCount / 4;
  const str = hexStr.toLowerCase().startsWith("0x")
    ? hexStr.substring(2).toLowerCase()
    : hexStr.toLowerCase();
  if (str.length > count) {
    return str.substring(str.length - count);
  }
  let zero = "";
  for (let i = str.length; i < count; i++) {
    zero += "0";
  }
  return zero + str;
}

function calcPayERC20Amount(totalTokenAmount: any, fees: Fee[]): string {
  let payAmount = new BigNumber(totalTokenAmount);
  for (let i = 0; i < fees.length; i++) {
    payAmount = payAmount.minus(fees[i].amount);
  }
  BigNumber.config({ EXPONENTIAL_AT: 1024 });
  return payAmount.toString(10);
}

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export class Element {
  // https://api.element.market/openapi/#/
  public buildFetchOrdersURL(params: FetchOrdersParams) {
    // For now there's no support for testnets
    const baseApiUrl = `https://api.element.market/openapi/v1/orders`;
    const queryParams = new URLSearchParams();

    if (params.chain) {
      queryParams.append("chain", String(params.chain));
    }

    if (params.token_ids) {
      queryParams.append("token_ids", String(params.token_ids));
    }

    if (params.asset_contract_address) {
      queryParams.append("asset_contract_address", String(params.asset_contract_address));
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

    if (params.offset) {
      queryParams.append("offset", String(params.offset));
    }

    if (params.order_by) {
      queryParams.append("order_by", String(params.order_by));
    }

    return decodeURI(`${baseApiUrl}?${queryParams.toString()}`);
  }

  public async parseOrder(params: ElementOrder): Promise<Sdk.Element.Order | undefined> {
    try {
      // https://github.com/element-market/element-js-sdk/blob/main/src/elementEx/orderConverter.ts
      const expiryHex = encodeExpiry(
        params.saleKind,
        params.extra,
        params.listingTime,
        params.expirationTime
      );
      const erc20TokenAmount = calcPayERC20Amount(params.basePrice, params.fees);
      const erc20Token =
        params.paymentToken.toLowerCase() == NULL_ADDRESS ? ETH_TOKEN_ADDRESS : params.paymentToken;
      return new Sdk.Element.Order(config.chainId, {
        direction:
          params.side === 1
            ? Sdk.Element.Types.TradeDirection.SELL
            : Sdk.Element.Types.TradeDirection.BUY,
        maker: params.maker,
        taker: params.taker,
        expiry: expiryHex,
        nonce: params.nonce,
        erc20Token: erc20Token,
        erc20TokenAmount: erc20TokenAmount,
        hashNonce: params.hashNonce,
        fees: params.fees!.map(({ recipient, amount, feeData }) => ({
          recipient: recipient,
          amount: amount,
          feeData: feeData,
        })),
        nft: params.assetContract,
        nftId: params.assetTokenId,
        nftProperties: params.properties ?? [],
        nftAmount: params.schema === "ERC721" ? undefined : String(params.quantity),
        signatureType: params.signatureType,
        v: params.v,
        r: params.r,
        s: params.s,
      });
    } catch (e) {
      // console.log("error", e);
      // Skip any errors
    }
  }
}
