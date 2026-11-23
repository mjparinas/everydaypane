import { VIEW_TEMPLATES } from "../src/lib/config/templates";
import { BUILT_IN_THEMES } from "../src/lib/config/themes";
import { WIDGETS } from "../src/lib/config/widgets";

// Bundled by scripts/render-template-previews.mjs into a Node-friendly module.

export const PREVIEW_DATA = VIEW_TEMPLATES.map((t) => {
  const view = t.build();
  const theme = BUILT_IN_THEMES.find((th) => th.id === t.themeId) ?? BUILT_IN_THEMES[0]!;
  const palette = theme.day;
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    tier: t.tier,
    cols: view.cols,
    rows: view.rows,
    gap: view.gap,
    padding: view.padding,
    radius: theme.radius,
    colours: {
      background: palette.background,
      backgroundTo: palette.backgroundTo,
      surface: palette.surface,
      text: palette.text,
      muted: palette.muted,
      accent: palette.accent,
      surfaceOpacity: theme.surfaceOpacity,
    },
    widgets: view.widgets.map((widget) => {
      const info = WIDGETS[widget.type];
      return {
        type: widget.type,
        label: info.label,
        icon: info.icon,
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
        showBackground: widget.showBackground !== false,
        sample: sampleFor(widget),
      };
    }),
  };
});

function sampleFor(widget: {
  type: string;
  text?: string;
  label?: string;
  title?: string;
  events?: { emoji?: string; name: string }[];
}): string[] {
  switch (widget.type) {
    case "clock":
      return ["7:42", widget.label || "Vancouver"];
    case "date":
      return ["Monday", "Nov 23"];
    case "weather":
      return ["9°", "Partly cloudy", "H 11°  L 4°"];
    case "sunTimes":
      return ["↑ 7:32", "↓ 16:18", "8h 46m"];
    case "airQuality":
      return ["AQHI 2", "Low risk"];
    case "agenda":
      return ["9:00  School drop-off", "12:30  Lunch with Sam", "18:00  Soccer practice"];
    case "calendarMonth":
      return ["November 2026", "Su Mo Tu We Th Fr Sa"];
    case "calendarWeek":
      return ["This week", "Mon–Sun"];
    case "calendarUpNext":
      return ["Next up", "Dentist · Tue 2:30"];
    case "countdown": {
      const events = widget.events?.slice(0, 2) ?? [];
      if (events.length) {
        return events.flatMap((e, i) => [`${e.emoji ? `${e.emoji} ` : ""}${e.name}`, `${20 + i * 7} days`]);
      }
      return ["🎄 Christmas", "32 days", "🎆 New Year", "39 days"];
    }
    case "photos":
      return [];
    case "note":
      return (widget.text || "Family note").split("\n").filter(Boolean).slice(0, 4);
    case "wifiQr":
      return ["Join WiFi"];
    case "pomodoro":
      return ["Focus", "24:18", "Round 2 of 4"];
    case "timer":
      return ["🥚 Eggs", "5:00", "🍝 Pasta", "10:00"];
    case "tasks":
      return ["☐ Book flights", "☐ Pack bags", "☑ Groceries"];
    case "chores":
      return ["⭐ Maya 4/7", "☐ Make bed", "☐ Dishes"];
    case "meals":
      return ["Dinner", "Tacos"];
    case "shopping":
      return ["☐ Milk", "☐ Eggs", "☐ Apples"];
    case "messages":
      return ["Dad: On my way!", "Maya: Need permission slip"];
    case "school":
      return ["Open", "Langley SD35"];
    case "presence":
      return ["🏠 Melvin", "🏠 Maya", "🚗 Sam"];
    case "transit":
      return ["501 → Surrey", "6 min", "337 → Guildford", "11 min"];
    case "commute":
      return ["Work", "22 min", "Leave by 8:05"];
    case "ferries":
      return ["Tsawwassen → Swartz", "9:00 · 68% full"];
    case "radar":
      return [];
    case "earth":
      return [];
    case "sports":
      return ["VAN 3–2 CGY", "2nd · 8:14"];
    case "media":
      return ["Now playing", "Abbey Road"];
    case "camera":
      return ["Front door"];
    case "haEntity":
      return [widget.title || "Kitchen", "On"];
    case "alerts":
      return ["All clear"];
    case "garbage":
      return ["Tomorrow", "Recycling + organics"];
    case "quotes":
      return ["“Done is better than perfect.”"];
    case "tides":
      return ["High 3.2 m", "14:18"];
    case "stocks":
      return ["SHOP +1.2%", "RY −0.4%"];
    case "news":
      return ["CBC BC headlines"];
    default:
      return [];
  }
}
