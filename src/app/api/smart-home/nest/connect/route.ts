import { startSmartHomeConnect } from "@/server/smartHomeRoutes";

export const GET = (req: Request) => startSmartHomeConnect("nest", req);
