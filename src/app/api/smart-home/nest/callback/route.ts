import { finishSmartHomeConnect } from "@/server/smartHomeRoutes";

export const GET = (req: Request) => finishSmartHomeConnect("nest", req);
