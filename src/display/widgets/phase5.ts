import type {
  AffirmationData,
  AirportsData,
  CryptoData,
  DadJokeData,
  EmailCountData,
  FitbitData,
  FxData,
  HoroscopeData,
  QuotesData,
  RssData,
  SlackData,
  StocksData,
  TrelloData,
  YnabData,
} from "@/lib/display/types";
import { instagramEmbedUrl, mapsEmbedUrl, tradingViewUrl, vimeoEmbedUrl, youtubeEmbedUrl } from "@/lib/embeds";

import { subscribe } from "../api";
import { fill, fillTile, h } from "../dom";
import { mountIframe } from "./iframeMount";
import type { Mount } from "./types";

export const stocks: Mount<"stocks"> = (el, w) => {
  const root = h("div", { class: "w-stocks" }, h("div", { class: "w-empty" }, "Loading quotes…"));
  el.append(root);
  let data: StocksData | null = null;
  const draw = () => {
    if (!data) return;
    if (!w.symbols.length) return fill(root, h("div", { class: "w-empty" }, "Add symbols in settings."));
    fill(
      root,
      h(
        "ul",
        { class: "p5-list" },
        ...w.symbols.slice(0, w.count).map((sym) => {
          const q = data!.quotes[sym.toUpperCase()];
          if (!q) return h("li", { class: "p5-row" }, sym, h("span", { class: "p5-muted" }, "—"));
          const tail = w.showChange ? ` (${q.change >= 0 ? "+" : ""}${q.changePct.toFixed(1)}%)` : "";
          return h("li", { class: "p5-row" }, sym, h("span", {}, `${q.price.toFixed(2)}${tail}`));
        }),
      ),
    );
  };
  const stop = subscribe<StocksData>("stocks", 60_000, (d) => {
    data = d;
    draw();
  });
  return stop;
};

export const crypto: Mount<"crypto"> = (el, w) => {
  const root = h("div", { class: "w-crypto" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  const stop = subscribe<CryptoData>("crypto", 2 * 60_000, (d) => {
    const rows = w.coins
      .map((id) => d.quotes[id.toLowerCase()])
      .filter(Boolean)
      .slice(0, w.count);
    if (!rows.length) return fill(root, h("div", { class: "w-empty" }, "Add coin ids like bitcoin."));
    fill(
      root,
      h(
        "ul",
        { class: "p5-list" },
        ...rows.map((q) =>
          h("li", { class: "p5-row" }, q!.id, h("span", {}, `${q!.price.toLocaleString()} ${q!.currency} (${q!.changePct.toFixed(1)}%)`)),
        ),
      ),
    );
  });
  return stop;
};

export const fx: Mount<"fx"> = (el, w) => {
  const root = h("div", { class: "w-fx" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  const stop = subscribe<FxData>("fx", 30 * 60_000, (d) => {
    const want = new Set(w.pairs.map((p) => `${p.base}/${p.quote}`));
    const rows = d.rates.filter((r) => want.has(`${r.base}/${r.quote}`)).slice(0, w.count);
    fill(
      root,
      h(
        "ul",
        { class: "p5-list" },
        ...rows.map((r) => h("li", { class: "p5-row" }, `${r.base}/${r.quote}`, h("span", {}, r.rate.toFixed(4)))),
      ),
    );
  });
  return stop;
};

export const ynab: Mount<"ynab"> = (el, w) => {
  const root = h("div", { class: "w-ynab" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  const stop = subscribe<YnabData>("ynab", 2 * 60_000, (d) => {
    if (!d.connected) return fill(root, h("div", { class: "w-empty" }, "Connect YNAB under Settings."));
    fill(
      root,
      h("div", { class: "w-label" }, d.budgetName),
      w.showAccounts
        ? h(
            "ul",
            { class: "p5-list" },
            ...d.accounts.slice(0, w.count).map((a) => h("li", { class: "p5-row" }, a.name, h("span", {}, a.balance.toFixed(0)))),
          )
        : null,
      w.showCategories
        ? h(
            "ul",
            { class: "p5-list" },
            ...d.categories.slice(0, w.count).map((c) => h("li", { class: "p5-row" }, c.name, h("span", {}, c.balance.toFixed(0)))),
          )
        : null,
    );
  });
  return stop;
};

export const fitbit: Mount<"fitbit"> = (el, w) => {
  const root = h("div", { class: "w-fitbit" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  const stop = subscribe<FitbitData>("fitbit", 5 * 60_000, (d) => {
    if (!d.connected) return fill(root, h("div", { class: "w-empty" }, "Connect Fitbit under Settings."));
    fill(
      root,
      h(
        "ul",
        { class: "p5-list" },
        w.showSteps ? h("li", { class: "p5-row" }, "Steps", h("span", {}, String(d.steps))) : null,
        w.showSleep ? h("li", { class: "p5-row" }, "Sleep", h("span", {}, `${(d.sleepMinutes / 60).toFixed(1)} h`)) : null,
        w.showHeart && d.restingHeartRate ? h("li", { class: "p5-row" }, "Resting HR", h("span", {}, String(d.restingHeartRate))) : null,
      ),
    );
  });
  return stop;
};

export const emailCount: Mount<"emailCount"> = (el, w) => {
  const root = h("div", { class: "w-email" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  const stop = subscribe<EmailCountData>("email-count", 2 * 60_000, (d) => {
    if (!d.connected) return fill(root, h("div", { class: "w-empty" }, "Connect Gmail under Settings."));
    fill(
      root,
      w.title ? h("div", { class: "w-label" }, w.title) : h("div", { class: "w-label" }, w.label),
      h("div", { class: "p5-big" }, String(d.unread)),
      h("div", { class: "p5-muted" }, "unread"),
    );
  });
  return stop;
};

function feedListMount(type: "rss" | "news"): Mount<"rss" | "news"> {
  return (el, w) => {
    const root = h("div", { class: "w-rss" }, h("div", { class: "w-empty" }, "Loading headlines…"));
    el.append(root);
    const path = `rss?widget=${encodeURIComponent(w.id)}&count=${w.count}`;
    const stop = subscribe<RssData>(path, 5 * 60_000, (d) => {
      if (!d.items.length) return fill(root, h("div", { class: "w-empty" }, "No headlines right now."));
      fill(root, h("ul", { class: "p5-list" }, ...d.items.map((i) => h("li", { class: "p5-row p5-wrap" }, i.title))));
    });
    void type;
    return stop;
  };
}

export const rss = feedListMount("rss");
export const news = feedListMount("news");

export const dadJoke: Mount<"dadJoke"> = (el, w) => {
  const root = h("div", { class: "w-joke" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  return fitted(el, root, (fit) =>
    subscribe<DadJokeData>(`dad-joke?safe=${w.familyFriendly ? "1" : "0"}`, 10 * 60_000, (d) => {
      fill(root, h("p", { class: "p5-quote" }, d.joke || "No joke right now."));
      fit();
    }),
  );
};

export const quotes: Mount<"quotes"> = (el, w) => {
  const root = h("div", { class: "w-quotes" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  return fitted(el, root, (fit) =>
    subscribe<QuotesData>(`quotes?count=${w.count}&tags=${encodeURIComponent(w.tags.join(","))}`, 15 * 60_000, (d) => {
      fill(root, ...d.quotes.map((q) => h("blockquote", { class: "p5-quote" }, q.text, h("cite", {}, `— ${q.author}`))));
      fit();
    }),
  );
};

export const affirmation: Mount<"affirmation"> = (el, w) => {
  const root = h("div", { class: "w-affirm" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  const custom = encodeURIComponent(w.custom.join("\n"));
  return fitted(el, root, (fit) =>
    subscribe<AffirmationData>(`affirmation?category=${encodeURIComponent(w.category)}&custom=${custom}`, 60 * 60_000, (d) => {
      fill(root, h("p", { class: "p5-quote" }, d.text));
      fit();
    }),
  );
};

// A joke, quote or affirmation is sized for the whole tile and steps down only when it's long (design review, 2026-11-26).
function fitted(el: HTMLElement, root: HTMLElement, start: (fit: () => void) => () => void): () => void {
  const tile = fillTile(el, root, 18);
  const stop = start(tile.fit);
  return () => {
    stop();
    tile.stop();
  };
}

export const horoscope: Mount<"horoscope"> = (el, w) => {
  const root = h("div", { class: "w-horoscope" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  return subscribe<HoroscopeData>(`horoscope?sign=${encodeURIComponent(w.sign)}`, 60 * 60_000, (d) =>
    fill(root, h("div", { class: "w-label" }, d.label), h("p", { class: "p5-quote" }, d.text)),
  );
};

export const trello: Mount<"trello"> = (el, w) => {
  const root = h("div", { class: "w-trello" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  return subscribe<TrelloData>(`trello?board=${encodeURIComponent(w.boardId)}&lists=${w.listCount}&cards=${w.cardCount}`, 60_000, (d) => {
    if (!d.connected) return fill(root, h("div", { class: "w-empty" }, "Add Trello under Settings."));
    fill(
      root,
      ...d.lists.map((l) =>
        h(
          "section",
          { class: "p5-trello-list" },
          h("div", { class: "w-label" }, l.name),
          h("ul", { class: "p5-list" }, ...l.cards.map((c) => h("li", {}, c))),
        ),
      ),
    );
  });
};

export const slack: Mount<"slack"> = (el, w) => {
  const root = h("div", { class: "w-trello" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  return subscribe<SlackData>(`slack?count=${w.count}`, 60_000, (d) => {
    if (!d.connected) return fill(root, h("div", { class: "w-empty" }, "Connect Slack under Settings."));
    fill(root, h("ul", { class: "p5-list" }, ...d.lines.map((l) => h("li", { class: "p5-wrap" }, l.text))));
  });
};

export const airports: Mount<"airports"> = (el, w) => {
  const root = h("div", { class: "w-airports" }, h("div", { class: "w-empty" }, "Loading…"));
  el.append(root);
  return subscribe<AirportsData>("airports", 5 * 60_000, (d) => {
    const rows = d.airports.filter((a) => w.codes.includes(a.code));
    fill(
      root,
      ...rows.map((a) =>
        h("section", { class: "p5-airport" }, h("div", { class: "w-label" }, a.code), h("p", { class: "p5-mono" }, a.summary)),
      ),
    );
  });
};

export const tradingView: Mount<"tradingView"> = (el, w) => {
  const root = h("div", { class: "w-embed cell-embed" });
  el.append(root);
  const dark = document.documentElement.classList.contains("night");
  return mountIframe(root, "TradingView chart", () => tradingViewUrl(w, dark));
};

export const youtube: Mount<"youtube"> = (el, w) => {
  const root = h("div", { class: "w-embed cell-embed" });
  el.append(root);
  const src = youtubeEmbedUrl(w);
  if (!src) {
    fill(root, h("div", { class: "w-empty" }, "Add a video or playlist id."));
    return () => undefined;
  }
  return mountIframe(root, "YouTube", () => src, { sandbox: "allow-scripts allow-same-origin allow-popups" });
};

export const vimeo: Mount<"vimeo"> = (el, w) => {
  const root = h("div", { class: "w-embed cell-embed" });
  el.append(root);
  const src = vimeoEmbedUrl(w);
  if (!src) {
    fill(root, h("div", { class: "w-empty" }, "Add a Vimeo video id."));
    return () => undefined;
  }
  return mountIframe(root, "Vimeo", () => src, { sandbox: "allow-scripts allow-same-origin allow-popups" });
};

export const maps: Mount<"maps"> = (el, w) => {
  const root = h("div", { class: "w-embed cell-embed" });
  el.append(root);
  return mountIframe(root, "Map", () => mapsEmbedUrl(w));
};

export const instagram: Mount<"instagram"> = (el, w) => {
  const root = h("div", { class: "w-embed cell-embed" });
  el.append(root);
  const src = instagramEmbedUrl(w);
  if (!src) {
    fill(root, h("div", { class: "w-empty" }, "Paste a public post link. Profiles cannot be embedded without Meta review."));
    return () => undefined;
  }
  return mountIframe(root, "Instagram", () => src);
};
