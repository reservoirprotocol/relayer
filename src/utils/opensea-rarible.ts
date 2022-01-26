import * as Sdk from "@reservoir0x/sdk";
import { splitSignature } from "@ethersproject/bytes";
import { AddressZero } from "@ethersproject/constants";

import { config } from "../config";

export type OpenSeaRaribleOrder = {
  hash: string;
  make: {
    assetType: {
      contract: string;
    };
  };
  take: {
    value: string;
  };
  maker: string;
  salt: string;
  start: number;
  end: number;
  signature: string;
  lastUpdateAt: string;
  data: {
    exchange: string;
    makerRelayerFee: string;
    takerRelayerFee: string;
    makerProtocolFee: string;
    takerProtocolFee: string;
    feeRecipient: string;
    feeMethod: "PROTOCOL_FEE" | "SPLIT_FEE";
    side: "BUY" | "SELL";
    saleKind: "FIXED_PRICE" | "DUTCH_AUCTION";
    howToCall: "CALL" | "DELEGATE_CALL";
    callData: string;
    replacementPattern: string;
    staticTarget: string;
    staticExtraData: string;
    extra: string;
  };
};

export const parseOpenSeaRaribleOrder = async (order: OpenSeaRaribleOrder) => {
  try {
    const { v, r, s } = splitSignature(order.signature);

    const result = {
      createdAt: order.lastUpdateAt,
      order: new Sdk.WyvernV2.Order(config.chainId, {
        exchange: order.data.exchange,
        maker: order.maker,
        taker: AddressZero,
        makerRelayerFee: Number(order.data.makerRelayerFee),
        takerRelayerFee: Number(order.data.takerRelayerFee),
        feeRecipient: order.data.feeRecipient,
        side: order.data.side === "BUY" ? 0 : 1,
        saleKind: order.data.saleKind === "FIXED_PRICE" ? 0 : 1,
        target: order.make.assetType.contract,
        howToCall: order.data.howToCall === "CALL" ? 0 : 1,
        calldata: order.data.callData,
        replacementPattern: order.data.replacementPattern,
        staticTarget: order.data.staticTarget,
        staticExtradata: order.data.staticExtraData,
        paymentToken: Sdk.Common.Addresses.Eth[config.chainId],
        basePrice: order.take.value,
        extra: order.data.extra,
        listingTime: order.start,
        expirationTime: order.end,
        salt: order.salt,
        v,
        r,
        s,
      }),
    };

    result.order.checkValidity();
    result.order.checkSignature();

    return result;
  } catch {
    return undefined;
  }
};
