export interface Faq {
  q: string;
  a: string;
}

export const HOME_FAQS: Faq[] = [
  {
    q: "What is Everydaypane?",
    a: "Everydaypane is a wall dashboard for the home. It shows your family's calendars, weather, photos, chores, meals, transit, sports and smart-home controls on a kitchen screen — built to feel fast on a UniFi UC-Display21 or any browser.",
  },
  {
    q: "Is it free?",
    a: "Yes. Free covers one display with clocks, weather, notes and two Google calendars. Family unlocks every widget, unlimited displays, photos, Home Assistant, transit, chores, meals and more for $7 a month or $59 a year — the best value for most households.",
  },
  {
    q: "Do I need to buy special hardware?",
    a: 'No. Everydaypane runs in a browser. We designed it for the Ubiquiti UniFi UC-Display21 (21.5" 1920×1080 touch), and it works on tablets, smart displays and any screen you already have.',
  },
  {
    q: "How is this different from DAKboard or MagicMirror?",
    a: "Everydaypane is built for a Canadian family kitchen first: Township of Langley garbage, TransLink, BC Ferries, Environment Canada radar, Alert Ready and BC Hydro outages, plus Home Assistant, chores and meals. The wall display is a lightweight page under 40 KB of script — not a heavy web app — so it stays snappy on low-power screens.",
  },
  {
    q: "Can the kids tick off chores and groceries on the wall?",
    a: "Yes, when you allow it on a widget. Taps sync back (Google Tasks and the shopping list included), with an undo window on tasks so a stray tap isn't permanent.",
  },
  {
    q: "Are there ads?",
    a: "No, and there never will be. The Household plan is how Everydaypane stays free of ads and tracking.",
  },
];

export function faqJsonLd(faqs: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
