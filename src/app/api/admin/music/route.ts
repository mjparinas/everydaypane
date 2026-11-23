import type { MusicService } from "@/lib/display/types";
import { json, sameOrigin, unauthorized } from "@/server/http";
import { disconnectMusic, musicConfigured, musicConnected, MusicDisconnected } from "@/server/musicAuth";
import { sonosPlayers } from "@/server/sonos";
import { adminFor } from "@/server/viewer";

// Spotify and Sonos signed in directly, for Settings › Music: whether each is set up and connected, and the Sonos
// speakers for the music widget's picker. Tokens never leave the server.

async function status(accountId: string, service: MusicService) {
  const configured = musicConfigured(service);
  return { configured, connected: configured && (await musicConnected(accountId, service)) };
}

export async function GET(req: Request) {
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const spotify = await status(accountId, "spotify");
  const sonos: { configured: boolean; connected: boolean; expired?: boolean; error?: string; players: { id: string; name: string }[] } = {
    ...(await status(accountId, "sonos")),
    players: [],
  };
  if (sonos.connected) {
    try {
      sonos.players = await sonosPlayers(accountId);
    } catch (error) {
      if (error instanceof MusicDisconnected) Object.assign(sonos, { connected: false, expired: true });
      else sonos.error = "Sonos didn't answer. Try again in a minute.";
    }
  }
  return json({ spotify, sonos });
}

/** Disconnects one service: ?service=spotify or sonos. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Not allowed" }, 403);
  const session = await adminFor(req);
  if (!session) return unauthorized();
  const accountId = session.accountId;
  const service = new URL(req.url).searchParams.get("service");
  if (service !== "spotify" && service !== "sonos") return json({ error: "Bad request" }, 400);
  await disconnectMusic(accountId, service);
  return json({ ok: true });
}
