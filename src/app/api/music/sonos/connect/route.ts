import { startMusicConnect } from "@/server/musicRoutes";

/** Sends the admin to Sonos's sign-in page (Settings › Music). */
export const GET = (req: Request) => startMusicConnect("sonos", req);
