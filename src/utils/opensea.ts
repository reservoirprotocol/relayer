import { config } from "../config";

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
