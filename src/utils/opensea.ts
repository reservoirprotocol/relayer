import { Builders, Helpers, Order } from "@georgeroman/wyvern-v2-sdk";

import { config } from "../config";

type FetchOrdersParams = {
  listedAfter: number;
  listedBefore: number;
  offset: number;
  limit: number;
};

// https://docs.opensea.io/reference/retrieving-orders
export const buildFetchOrdersURL = (params: FetchOrdersParams) => {
  let baseOpenseaApiUrl: string;
  if (config.chainId === 1) {
    baseOpenseaApiUrl = "https://api.opensea.io/wyvern/v1";
  } else {
    baseOpenseaApiUrl = "https://rinkeby-api.opensea.io/wyvern/v1";
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
  return `${baseOpenseaApiUrl}/orders?${searchParams.toString()}`;
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
  let baseOpenseaApiUrl: string;
  if (config.chainId === 1) {
    baseOpenseaApiUrl = "https://api.opensea.io/api/v1";
  } else {
    baseOpenseaApiUrl = "https://rinkeby-api.opensea.io/api/v1";
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

  return `${baseOpenseaApiUrl}/assets?${searchParams!.toString()}`;
};

type FetchListingsParams = {
  contract: string;
  offset: number;
  limit: number;
};

// https://docs.opensea.io/reference/retrieving-asset-events
export const buildFetchListingsURL = (params: FetchListingsParams) => {
  let baseOpenseaApiUrl: string;
  if (config.chainId === 1) {
    baseOpenseaApiUrl = "https://api.opensea.io/api/v1";
  } else {
    baseOpenseaApiUrl = "https://rinkeby-api.opensea.io/api/v1";
  }

  const searchParams = new URLSearchParams({
    asset_contract_address: params.contract,
    only_opensea: "false",
    event_type: "created",
    offset: String(params.offset),
    limit: String(params.limit),
  });
  return `${baseOpenseaApiUrl}/events?${searchParams.toString()}`;
};

export type OpenseaOrder = {
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

// TODO: Replace old SDK with new one
export const parseOpenseaOrder = (
  openseaOrder: OpenseaOrder
): Order | undefined => {
  try {
    let order: Order | undefined;
    if (openseaOrder.metadata.asset.quantity) {
      // ERC1155
      order = Builders.Erc1155.SingleItem.sell({
        exchange: openseaOrder.exchange,
        maker: openseaOrder.maker.address,
        target: openseaOrder.metadata.asset.address,
        tokenId: openseaOrder.metadata.asset.id,
        paymentToken: openseaOrder.payment_token,
        basePrice: openseaOrder.base_price,
        fee: openseaOrder.maker_relayer_fee,
        feeRecipient: openseaOrder.fee_recipient.address,
        listingTime: openseaOrder.listing_time.toString(),
        expirationTime: openseaOrder.expiration_time.toString(),
        salt: openseaOrder.salt,
        extra: openseaOrder.extra,
        v: openseaOrder.v,
        r: openseaOrder.r,
        s: openseaOrder.s,
      });
    } else {
      // ERC721
      order = Builders.Erc721.SingleItem.sell({
        exchange: openseaOrder.exchange,
        maker: openseaOrder.maker.address,
        target: openseaOrder.metadata.asset.address,
        tokenId: openseaOrder.metadata.asset.id,
        paymentToken: openseaOrder.payment_token,
        basePrice: openseaOrder.base_price,
        fee: openseaOrder.maker_relayer_fee,
        feeRecipient: openseaOrder.fee_recipient.address,
        listingTime: openseaOrder.listing_time.toString(),
        expirationTime: openseaOrder.expiration_time.toString(),
        salt: openseaOrder.salt,
        extra: openseaOrder.extra,
        v: openseaOrder.v,
        r: openseaOrder.r,
        s: openseaOrder.s,
      });
    }

    if (!order) {
      return undefined;
    }

    if (Helpers.Order.hash(order) !== openseaOrder.prefixed_hash) {
      return undefined;
    }

    if (!Helpers.Order.verifySignature(order)) {
      return undefined;
    }

    return Helpers.Order.normalize(order);
  } catch {
    return undefined;
  }
};
