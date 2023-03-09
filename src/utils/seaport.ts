import * as Sdk from "@reservoir0x/sdk";

import { logger } from "../common/logger";
import { config } from "../config";

type FetchOrdersParams = {
  side: "sell" | "buy";
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
  public buildFetchOrdersURL(params: FetchOrdersParams) {
    let baseApiUrl: string;

    let hostname = "api.opensea.io";
    let network = "ethereum";
    switch (config.chainId) {
      case 1:
        break;

      case 5:
        hostname = "testnets-api.opensea.io";
        network = "goerli";
        break;

      case 137:
        network = "matic";
        break;

      default:
        throw new Error("Unsupported chain");
    }

    baseApiUrl = `https://${hostname}/v2/orders/${network}/seaport/${
      params.side === "sell" ? "listings" : "offers"
    }`;

    const queryParams = new URLSearchParams();

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

    return decodeURI(`${baseApiUrl}?${queryParams.toString()}`);
  }

  public async parseSeaportOrder(
    seaportOrder: SeaportOrder
  ): Promise<
    | { kind: "seaport"; order: Sdk.Seaport.Order }
    | { kind: "seaport-v1.4"; order: Sdk.SeaportV14.Order }
    | undefined
  > {
    try {
      if (seaportOrder.protocol_address === Sdk.Seaport.Addresses.Exchange[config.chainId]) {
        return {
          kind: "seaport",
          order: new Sdk.Seaport.Order(config.chainId, {
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
            signature: seaportOrder.protocol_data.signature || undefined,
          }),
        };
      } else if (
        seaportOrder.protocol_address === Sdk.SeaportV14.Addresses.Exchange[config.chainId]
      ) {
        return {
          kind: "seaport-v1.4",
          order: new Sdk.SeaportV14.Order(config.chainId, {
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
            signature: seaportOrder.protocol_data.signature || undefined,
          }),
        };
      }
    } catch (error) {
      logger.error(
        "parse-seaport-order",
        `Failed to parse order ${seaportOrder.order_hash} - ${error}`
      );
    }
  }
}
