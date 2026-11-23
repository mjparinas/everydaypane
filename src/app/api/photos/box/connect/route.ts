import { startPhotoOAuth } from "@/server/photoOAuthRoutes";

export const GET = (req: Request) => startPhotoOAuth("box", req);
