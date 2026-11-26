// Transit agencies the departures widget can read (regional packs, Melvin, 2026-11-26: "Do 1, 2, 3, 4", item 3 being
// regional packs so the local strength scales beyond the Lower Mainland). Every one publishes GTFS-realtime trip
// updates and a static GTFS zip, so one reader (src/server/translink.ts) serves them all. TransLink is the only one that
// needs a key (TRANSLINK_API_KEY in Vercel); the rest are open with no sign-up. Feeds checked 2026-11-26: the realtime
// files of TTC, Edmonton, Halifax and King County Metro answered with protobuf, Calgary's open data portal redirects to
// its file; the static zips of Edmonton, Halifax, Calgary and TTC answered (King County's wasn't reachable from the
// sandbox, its address is the one King County Metro publishes).
//
// Shared by the server, the household panel and the display (the display only reads names), so no zod and no server
// imports here.

export const TRANSIT_AGENCY_IDS = ["translink", "ttc", "calgary", "edmonton", "halifax", "kingCounty", "bcTransitVictoria"] as const;
export type TransitAgencyId = (typeof TRANSIT_AGENCY_IDS)[number];

export interface TransitAgency {
  /** The agency's own name, as on the wall's credit line. */
  name: string;
  /** Where it runs, for the household panel's picker. */
  area: string;
  realtimeUrl: string;
  staticUrl: string;
  /** True when realtimeUrl needs `?apikey=` (TransLink only). */
  needsKey: boolean;
  /** The credit line under the departures. TransLink's licence asks for its own wording. */
  credit: string;
  /** Licence notice shown in the widget's settings, when the agency asks for one. */
  notice?: string;
}

export const TRANSIT_AGENCIES: Record<TransitAgencyId, TransitAgency> = {
  translink: {
    name: "TransLink",
    area: "Metro Vancouver",
    realtimeUrl: "https://gtfsapi.translink.ca/v3/gtfsrealtime",
    staticUrl: "https://gtfs-static.translink.ca/gtfs/google_transit.zip",
    needsKey: true,
    credit: "Live times from TransLink",
    notice:
      "Route and arrival data used in this product or service is provided by permission of TransLink. TransLink assumes no responsibility for the accuracy or currency of the Data used in this product or service.",
  },
  ttc: {
    name: "TTC",
    area: "Toronto",
    realtimeUrl: "https://bustime.ttc.ca/gtfsrt/trips",
    staticUrl:
      "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/7795b45e-e65a-4465-81fc-c36b9dfff169/resource/cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/opendata_ttc_schedules.zip",
    needsKey: false,
    credit: "Live times from the TTC · Open Government Licence – Toronto",
  },
  calgary: {
    name: "Calgary Transit",
    area: "Calgary",
    realtimeUrl: "https://data.calgary.ca/download/gs4m-mdc2/application%2Foctet-stream",
    staticUrl: "https://data.calgary.ca/download/npk7-z3bj/application%2Fzip",
    needsKey: false,
    credit: "Live times from Calgary Transit · Open Government Licence – City of Calgary",
  },
  edmonton: {
    name: "Edmonton Transit Service",
    area: "Edmonton",
    realtimeUrl: "https://gtfs.edmonton.ca/TMGTFSRealTimeWebService/TripUpdate/TripUpdates.pb",
    staticUrl: "https://gtfs.edmonton.ca/TMGTFSRealTimeWebService/GTFS/gtfs.zip",
    needsKey: false,
    credit: "Live times from ETS · Open Government Licence – City of Edmonton",
  },
  halifax: {
    name: "Halifax Transit",
    area: "Halifax",
    realtimeUrl: "https://gtfs.halifax.ca/realtime/TripUpdate/TripUpdates.pb",
    staticUrl: "https://gtfs.halifax.ca/static/google_transit.zip",
    needsKey: false,
    credit: "Live times from Halifax Transit",
  },
  kingCounty: {
    name: "King County Metro",
    area: "Seattle and King County",
    realtimeUrl: "https://s3.amazonaws.com/kcm-alerts-realtime-prod/tripupdates.pb",
    staticUrl: "https://metro.kingcounty.gov/GTFS/google_transit.zip",
    needsKey: false,
    credit: "Live times from King County Metro",
  },
  // BC Transit's open data page (bctransit.com/open-data, read 2026-11-26) lists Victoria as operator 48; its other
  // systems (Kelowna, Nanaimo…) use the same addresses with their own operatorIds.
  bcTransitVictoria: {
    name: "BC Transit",
    area: "Greater Victoria",
    realtimeUrl: "https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48",
    staticUrl: "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48",
    needsKey: false,
    credit: "Live times from BC Transit · Open Government Licence – British Columbia",
  },
};

export const agencyOf = (id: string | undefined): TransitAgency =>
  TRANSIT_AGENCIES[(id as TransitAgencyId) ?? "translink"] ?? TRANSIT_AGENCIES.translink;

/** The key departures are filed under in the transit feed: TransLink's stops keep their bare id, as before. */
export const stopKey = (agency: TransitAgencyId, stopId: string) => (agency === "translink" ? stopId : `${agency}:${stopId}`);
