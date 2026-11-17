import type { Widget, WidgetType } from "@/lib/config/schema";
import type { DisplayPayload } from "@/lib/display/types";

export interface WidgetContext {
  payload: DisplayPayload;
  timeZone: string;
  hour12: boolean;
}

export type Cleanup = () => void;
export type Mount<T extends WidgetType> = (el: HTMLElement, widget: Extract<Widget, { type: T }>, ctx: WidgetContext) => Cleanup;
