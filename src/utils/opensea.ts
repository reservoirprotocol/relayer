import { StaticJsonRpcProvider } from "@ethersproject/providers";
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
    offset: String(params.offset),
    limit: String(params.limit),
    side: "1",
    is_english: "false",
    bundled: "false",
    include_bundled: "false",
    include_invalid: "false",
    order_by: "created_date",
    order_direction: "asc",
  });

  if (params.listedBefore) {
    (searchParams as any).listed_before = String(params.listedBefore);
  }

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
  searchParams!.append("include_orders", "true");

  return `${baseOpenSeaApiUrl}/assets?${searchParams!.toString()}`;
};

type FetchEventsParams = {
  contract: string;
  cursor: string;
  limit: number;
};

// https://docs.opensea.io/reference/retrieving-asset-events
export const buildFetchEventsURL = (params: FetchEventsParams) => {
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
    cursor: String(params.cursor),
    limit: String(params.limit),
  });
  return `${baseOpenSeaApiUrl}/events?${searchParams.toString()}`;
};

type FetchListingsParams = {
  contract: string;
  tokenId: string;
  limit: number;
};

// https://docs.opensea.io/reference/asset-listings
export const buildFetchListingsURL = (params: FetchListingsParams) => {
  let baseOpenSeaApiUrl: string;
  if (config.chainId === 1) {
    baseOpenSeaApiUrl = "https://api.opensea.io/api/v1";
  } else {
    baseOpenSeaApiUrl = "https://rinkeby-api.opensea.io/api/v1";
  }

  const searchParams = new URLSearchParams({
    limit: String(params.limit),
  });

  return `${baseOpenSeaApiUrl}/asset/${params.contract}/${
    params.tokenId
  }/listings?${searchParams.toString()}`;
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

const provider = new StaticJsonRpcProvider(
  `https://eth-${
    config.chainId === 1 ? "mainnet" : "rinkeby"
  }.alchemyapi.io/v2/5kzu5Nfv8OySwpTKXUygUbIkli1PRiPT`
);
const exchange = new Sdk.WyvernV23.Exchange(config.chainId);

export const parseOpenSeaOrder = async (
  openSeaOrder: OpenSeaOrder
): Promise<Sdk.WyvernV23.Order | undefined> => {
  try {
    // Try some nonce values before defaulting to on-chain retrieval
    const maxTries = 2;

    let nonce = 0;
    while (nonce < maxTries + 1) {
      const order = new Sdk.WyvernV23.Order(config.chainId, {
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
        nonce:
          nonce === maxTries
            ? (await exchange.getNonce(provider, openSeaOrder.maker.address)).toString()
            : nonce.toString(),
        v: openSeaOrder.v,
        r: openSeaOrder.r,
        s: openSeaOrder.s,
      });

      if (order.prefixHash() === openSeaOrder.prefixed_hash) {
        order.checkValidity();
        order.checkSignature();
        return order;
      }

      nonce++;
    }
  } catch {
    return undefined;
  }

  return undefined;
};
