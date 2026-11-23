import { json, unauthorized } from "@/server/http";
import { trimNoaaStations } from "@/server/tides";
import { adminFor } from "@/server/viewer";

/** Search NOAA tide stations by name fragment (for the tides widget). */
export async function GET(req: Request) {
  if (!(await adminFor(req))) return unauthorized();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return json({ stations: [] });
  const url = `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions&name=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return json({ stations: [], error: `NOAA answered ${r.status}` });
    return json({ stations: trimNoaaStations(await r.json()) });
  } catch {
    return json({ stations: [], error: "Couldn't reach NOAA" }, 502);
  }
}
