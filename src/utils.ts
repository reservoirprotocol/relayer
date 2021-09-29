import { AddressZero } from "@ethersproject/constants";
import { Builders, Order } from "@georgeroman/wyvern-v2-sdk";

import config from "./config";
import { OpenseaOrder } from "./types";

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
    // Only ETH sell orders
    payment_token_address: AddressZero,
    // Ignore English auction orders which have the signature stripped
    is_english: "false",
    bundled: "false",
    include_bundled: "false",
    include_invalid: "false",
    // Only sell orders
    side: "1",
  });
  return `${config.baseOpenseaApiUrl}/orders?${searchParams.toString()}`;
};

export const parseOpenseaOrder = (
  openseaOrder: OpenseaOrder
): Order | undefined => {
  try {
    return Builders.Erc721.SingleItem.sell({
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
  } catch {
    return undefined;
  }
};
