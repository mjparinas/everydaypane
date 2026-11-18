import { finishMusicConnect } from "@/server/musicRoutes";

/** Spotify sends the admin back here; the code is traded for a refresh token, stored encrypted. */
export const GET = (req: Request) => finishMusicConnect("spotify", req);
