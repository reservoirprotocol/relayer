import * as Sdk from "@reservoir0x/sdk";

import { config } from "../config";

type FetchOrdersParams = {
  listedAfter: number;
  listedBefore: number;
  offset: number;
  limit: number;
};

// https://docs.opensea.io/reference/retrieving-orders
export const buildFetchOrdersURL = (params: FetchOrdersParams) => {
  let baseOpenSeaApiUrl: string;
  if (config.chainId === 1) {
    baseOpenSeaApiUrl = "https://api.opensea.io/wyvern/v1";
  } else {
    baseOpenSeaApiUrl = "https://rinkeby-api.opensea.io/wyvern/v1";
  }

  const searchParams = new URLSearchParams({
    listed_after: String(params.listedAfter),
    listed_before: String(params.listedBefore),
    offset: String(params.offset),
    limit: String(params.limit),
    side: "1",
    is_english: "false",
    bundled: "false",
    include_bundled: "false",
    include_invalid: "false",
  });
  return `${baseOpenSeaApiUrl}/orders?${searchParams.toString()}`;
};

type FetchAssetsParams = {
  contract?: string;
  tokenIds?: string[];
  collection?: string;
  offset?: number;
  limit?: number;
};

// https://docs.opensea.io/reference/getting-assets
export const buildFetchAssetsURL = (params: FetchAssetsParams) => {
  let baseOpenSeaApiUrl: string;
  if (config.chainId === 1) {
    baseOpenSeaApiUrl = "https://api.opensea.io/api/v1";
  } else {
    baseOpenSeaApiUrl = "https://rinkeby-api.opensea.io/api/v1";
  }

  let searchParams: URLSearchParams;
  if (params.collection) {
    searchParams = new URLSearchParams({
      collection: params.collection,
      offset: String(params.offset),
      limit: String(params.limit),
    });
  } else if (params.contract && params.tokenIds) {
    searchParams = new URLSearchParams({
      asset_contract_address: params.contract,
    });
    for (const tokenId of params.tokenIds) {
      searchParams.append("token_ids", tokenId);
    }
  }

  return `${baseOpenSeaApiUrl}/assets?${searchParams!.toString()}`;
};

type FetchListingsParams = {
  contract: string;
  offset: number;
  limit: number;
};

// https://docs.opensea.io/reference/retrieving-asset-events
export const buildFetchListingsURL = (params: FetchListingsParams) => {
  let baseOpenSeaApiUrl: string;
  if (config.chainId === 1) {
    baseOpenSeaApiUrl = "https://api.opensea.io/api/v1";
  } else {
    baseOpenSeaApiUrl = "https://rinkeby-api.opensea.io/api/v1";
  }

  const searchParams = new URLSearchParams({
    asset_contract_address: params.contract,
    only_opensea: "false",
    event_type: "created",
    offset: String(params.offset),
    limit: String(params.limit),
  });
  return `${baseOpenSeaApiUrl}/events?${searchParams.toString()}`;
};

export type OpenSeaOrder = {
  prefixed_hash: string;
  exchange: string;
  metadata: { asset: { id: string; address: string; quantity?: string } };
  created_date: string;
  maker: { address: string };
  taker: { address: string };
  maker_relayer_fee: string;
  taker_relayer_fee: string;
  fee_recipient: { address: string };
  side: number;
  sale_kind: number;
  target: string;
  how_to_call: number;
  calldata: string;
  replacement_pattern: string;
  static_target: string;
  static_extradata: string;
  payment_token: string;
  base_price: string;
  extra: string;
  listing_time: number;
  expiration_time: number;
  salt: string;
  v?: number;
  r?: string;
  s?: string;
};

export const parseOpenSeaOrder = (
  openSeaOrder: OpenSeaOrder
): Sdk.WyvernV2.Order | undefined => {
  try {
    const order = new Sdk.WyvernV2.Order(config.chainId, {
      exchange: openSeaOrder.exchange,
      maker: openSeaOrder.maker.address,
      taker: openSeaOrder.taker.address,
      makerRelayerFee: Number(openSeaOrder.maker_relayer_fee),
      takerRelayerFee: Number(openSeaOrder.taker_relayer_fee),
      feeRecipient: openSeaOrder.fee_recipient.address,
      side: openSeaOrder.side,
      saleKind: openSeaOrder.sale_kind,
      target: openSeaOrder.target,
      howToCall: openSeaOrder.how_to_call,
      calldata: openSeaOrder.calldata,
      replacementPattern: openSeaOrder.replacement_pattern,
      staticTarget: openSeaOrder.static_target,
      staticExtradata: openSeaOrder.static_extradata,
      paymentToken: openSeaOrder.payment_token,
      basePrice: openSeaOrder.base_price,
      extra: openSeaOrder.extra,
      listingTime: openSeaOrder.listing_time,
      expirationTime: openSeaOrder.expiration_time,
      salt: openSeaOrder.salt,
      v: openSeaOrder.v,
      r: openSeaOrder.r,
      s: openSeaOrder.s,
    });

    if (order.prefixHash() !== openSeaOrder.prefixed_hash) {
      return undefined;
    }

    order.checkValidity();
    order.checkSignature();
  } catch {
    return undefined;
  }
};
