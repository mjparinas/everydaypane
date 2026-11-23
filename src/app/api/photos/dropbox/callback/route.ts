import { finishPhotoOAuth } from "@/server/photoOAuthRoutes";

export const GET = (req: Request) => finishPhotoOAuth("dropbox", req);
