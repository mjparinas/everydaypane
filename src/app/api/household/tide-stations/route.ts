import { json, unauthorized } from "@/server/http";
import { iwlsStations, matchIwlsStations, trimNoaaStations } from "@/server/tides";
import { adminFor } from "@/server/viewer";

/**
 * Tide stations by name for the tides widget's settings: Canada's (IWLS, the whole list kept a day and searched
 * here) and the US's (NOAA's own search), Canada first. Answers in the place finder's shape, with the station id.
 */
export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return json({ matches: [] });
  const [ca, us] = await Promise.allSettled([
    iwlsStations().then((all) => matchIwlsStations(all, q)),
    fetch(`https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions&name=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(10_000),
    }).then(async (r) => (r.ok ? trimNoaaStations(await r.json()) : [])),
  ]);
  const matches = [
    ...(ca.status === "fulfilled" ? ca.value : []),
    ...(us.status === "fulfilled"
      ? us.value.map((s) => ({ id: s.id, label: `${s.name}${s.region ? `, ${s.region}` : ""} (US)`, latitude: 0, longitude: 0 }))
      : []),
  ].slice(0, 12);
  if (!matches.length && ca.status === "rejected" && us.status === "rejected")
    return json({ error: "Couldn't reach the tide services" }, 502);
  return json({ matches });
}
