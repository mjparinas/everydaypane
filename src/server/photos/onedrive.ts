import "server-only";

import { cached } from "../cache";
import { filesGranted, graphGet } from "../microsoftPhotos";
import { MAX_PHOTOS, type Listed } from "./types";

const TTL = 30 * 60_000;

interface DriveItem {
  id?: string;
  name?: string;
  file?: { mimeType?: string };
  image?: { width?: number; height?: number };
  photo?: { takenDateTime?: string };
  "@microsoft.graph.downloadUrl"?: string;
}

function trim(items: DriveItem[]): Listed[] {
  return items
    .filter((i) => i.id && i.file?.mimeType?.startsWith("image/") && i["@microsoft.graph.downloadUrl"])
    .slice(0, MAX_PHOTOS)
    .map((i) => ({
      id: i.id!,
      url: i["@microsoft.graph.downloadUrl"]!,
      w: Number(i.image?.width) || 0,
      h: Number(i.image?.height) || 0,
      taken: i.photo?.takenDateTime?.slice(0, 10) ?? null,
    }));
}

async function listFolder(accountId: string, folderId: string): Promise<Listed[]> {
  const path =
    folderId === "root"
      ? "/me/drive/root/children?$select=id,name,file,image,photo,@microsoft.graph.downloadUrl&$top=200"
      : `/me/drive/items/${encodeURIComponent(folderId)}/children?$select=id,name,file,image,photo,@microsoft.graph.downloadUrl&$top=200`;
  const raw = (await graphGet(accountId, path)) as { value?: DriveItem[] };
  const photos = trim(raw.value ?? []);
  if (!photos.length) throw new Error("This OneDrive folder has no photos");
  return photos;
}

export async function listOnedrive(accountId: string, folderId: string, now = Date.now()): Promise<Listed[]> {
  if (!(await filesGranted(accountId))) throw new Error("Connect Microsoft 365 with file access under Settings › Photos");
  const result = await cached(`photos:onedrive:${accountId}:${folderId}`, TTL, () => listFolder(accountId, folderId), now);
  return result.value;
}
