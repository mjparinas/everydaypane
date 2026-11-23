/** One photo a source listed; shared across photo source modules. */
export interface Listed {
  id: string;
  /** Where the full image is; proxied at display size. */
  url: string;
  w: number;
  h: number;
  taken: string | null;
}

export const MAX_PHOTOS = 1500;
