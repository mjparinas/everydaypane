import { z } from "zod";

import { airthingsDevices, AirthingsRefused, checkAirthingsClient, saveAirthingsClient } from "@/server/airthings";
import { json, readJson, sameOrigin, unauthorized } from "@/server/http";
import { adminFor } from "@/server/viewer";

// Settings › Indoor air: whether an Airthings API client is saved, and its devices for the widget's picker. The id and
// secret go in only; nothing here ever sends them back.

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  try {
    const devices = await airthingsDevices(session.accountId);
    return json({ configured: devices !== null, devices: devices ?? [], error: "" });
  } catch (e) {
    return json({
      configured: true,
      devices: [],
      error:
        e instanceof AirthingsRefused
          ? "Airthings refused the saved API client. Paste it again."
          : "Couldn't reach Airthings. Try again in a minute.",
    });
  }
}

const putBody = z.object({
  clientId: z.string().trim().min(8).max(100),
  clientSecret: z.string().trim().min(8).max(200),
});

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const parsed = putBody.safeParse(await readJson(req, 1000).catch(() => null));
  if (!parsed.success) return json({ error: "Paste both the client id and the secret." }, 400);
  const { clientId, clientSecret } = parsed.data;
  let devices;
  try {
    devices = await checkAirthingsClient(clientId, clientSecret);
  } catch (e) {
    if (e instanceof AirthingsRefused) return json({ error: "Airthings didn't accept that client id and secret." }, 400);
    return json({ error: "Couldn't reach Airthings to check it. Try again in a minute." }, 502);
  }
  await saveAirthingsClient(session.accountId, { id: clientId, secret: clientSecret });
  return json({ configured: true, devices, error: "" });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  await saveAirthingsClient(session.accountId, null);
  return json({ configured: false, devices: [], error: "" });
}
