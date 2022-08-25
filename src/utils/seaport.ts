import * as Sdk from "@reservoir0x/sdk";

import { config } from "../config";
import { logger } from "../common/logger";

type FetchOrdersParams = {
  orderBy?: "created_date";
  orderDirection?: "asc" | "desc";
  limit?: number;
  cursor?: string | null;
  listedBefore?: number | null;
  listedAfter?: number | null;
};

export type SeaportOrder = {
  created_date: string;
  order_hash: string;
  maker: {
    address: string;
  };
  protocol_address: string;
  protocol_data: {
    parameters: {
      offerer: string;
      zone: string;
      zoneHash: string;
      conduitKey: string;
      salt: string;
      consideration: Sdk.Seaport.Types.ConsiderationItem[];
      offer: Sdk.Seaport.Types.OfferItem[];
      counter: number;
      orderType: number;
      startTime: number;
      endTime: number;
    };
    signature: string;
  };
  client_signature: string;
};

export class Seaport {
  // https://hackmd.io/7AnOgEqFT2mZHqUQ4bXwsw#GET-apiorders
  public buildFetchOrdersURL(params: FetchOrdersParams) {
    let baseOpenSeaApiUrl: string;
    if (config.chainId === 1) {
      baseOpenSeaApiUrl = "https://api.opensea.io/v2/orders/ethereum/seaport/listings";
    } else {
      baseOpenSeaApiUrl = "https://testnets-api.opensea.io/v2/orders/rinkeby/seaport/listings";
    }

    let queryParams = new URLSearchParams();

    if (params.orderBy) {
      queryParams.append("order_by", String(params.orderBy));
    }

    if (params.limit) {
      queryParams.append("limit", String(params.limit));
    }

    if (params.orderDirection) {
      queryParams.append("order_direction", String(params.orderDirection));
    }

    if (params.cursor) {
      queryParams.append("cursor", String(params.cursor));
    }

    if (params.listedBefore) {
      queryParams.append("listed_before", String(params.listedBefore));
    }

    if (params.listedAfter) {
      queryParams.append("listed_after", String(params.listedAfter));
    }

    return decodeURI(`${baseOpenSeaApiUrl}?${queryParams.toString()}`);
  }

  public async parseSeaportOrder(
    seaportOrder: SeaportOrder
  ): Promise<Sdk.Seaport.Order | undefined> {
    try {
      return new Sdk.Seaport.Order(config.chainId, {
        endTime: seaportOrder.protocol_data.parameters.endTime,
        startTime: seaportOrder.protocol_data.parameters.startTime,
        consideration: seaportOrder.protocol_data.parameters.consideration,
        offer: seaportOrder.protocol_data.parameters.offer,
        conduitKey: seaportOrder.protocol_data.parameters.conduitKey,
        salt: seaportOrder.protocol_data.parameters.salt,
        zone: seaportOrder.protocol_data.parameters.zone,
        zoneHash: seaportOrder.protocol_data.parameters.zoneHash,
        offerer: seaportOrder.protocol_data.parameters.offerer,
        counter: `${seaportOrder.protocol_data.parameters.counter}`,
        orderType: seaportOrder.protocol_data.parameters.orderType,
        signature: seaportOrder.protocol_data.signature,
      });
    } catch (error) {
      logger.error(
        "parse-seaport-order",
        `Failed to parse order ${seaportOrder.order_hash} - ${error}`
      );
      return undefined;
    }
  }
}
