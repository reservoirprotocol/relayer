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
  } else if (config.chainId === 5) {
    // TODO: Is this the right URL?
    baseOpenSeaApiUrl = "https://testnets-api.opensea.io/api/v1";
  } else {
    throw new Error("Unsupported chain");
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
