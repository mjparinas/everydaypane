import { startMusicConnect } from "@/server/musicRoutes";

/** Sends the admin to Spotify's sign-in page (Settings › Music). */
export const GET = (req: Request) => startMusicConnect("spotify", req);
