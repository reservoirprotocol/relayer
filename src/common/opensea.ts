import { Builders, Helpers, Order } from "@georgeroman/wyvern-v2-sdk";

import config from "../config";

export type OpenseaOrder = {
  prefixed_hash: string;
  exchange: string;
  asset: { token_id: string; asset_contract: { address: string } };
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

type FetchOrdersParams = {
  listed_after: number;
  listed_before: number;
  offset: number;
  limit: number;
};

// https://docs.opensea.io/reference/retrieving-orders
export const buildFetchOrdersURL = (params: FetchOrdersParams) => {
  const searchParams = new URLSearchParams({
    listed_after: String(params.listed_after),
    listed_before: String(params.listed_before),
    offset: String(params.offset),
    limit: String(params.limit),
    // Only sell orders
    side: "1",
  });
  return `${config.baseOpenseaApiUrl}/orders?${searchParams.toString()}`;
};

export const parseOpenseaOrder = (
  openseaOrder: OpenseaOrder
): Order | undefined => {
  try {
    const order = Builders.Erc721.SingleItem.sell({
      exchange: openseaOrder.exchange,
      maker: openseaOrder.maker.address,
      target: openseaOrder.asset.asset_contract.address,
      tokenId: openseaOrder.asset.token_id,
      paymentToken: openseaOrder.payment_token,
      basePrice: openseaOrder.base_price,
      fee: openseaOrder.maker_relayer_fee,
      feeRecipient: openseaOrder.fee_recipient.address,
      listingTime: openseaOrder.listing_time,
      expirationTime: openseaOrder.expiration_time,
      salt: openseaOrder.salt,
      extra: openseaOrder.extra,
      v: openseaOrder.v,
      r: openseaOrder.r,
      s: openseaOrder.s,
    });

    if (Helpers.Order.hash(order) !== openseaOrder.prefixed_hash) {
      return undefined;
    }

    if (!Helpers.Order.verifySignature(order)) {
      return undefined;
    }

    return order;
  } catch {
    return undefined;
  }
};
