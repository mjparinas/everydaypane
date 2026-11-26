import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { CtaBanner, Eyebrow, SitePage } from "@/components/site/SiteChrome";
import { FEATURE_BEHAVIOURS, FEATURE_WIDGET_GROUPS } from "@/lib/marketingFeatures";
import { pageMeta } from "@/lib/pageMeta";

export const metadata: Metadata = pageMeta({
  title: "Features",
  description:
    "Every Everydaypane widget and display behaviour: calendars, photos, chores, meals, TransLink, Home Assistant, BC alerts and more.",
  path: "/features/",
});

export default function FeaturesPage() {
  return (
    <SitePage wide>
      <Eyebrow>Features</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Everything on the Pane</h1>
      <p className="mt-4 max-w-2xl text-lg text-soft">
        Free includes the essentials on two displays (one view).{" "}
        <Link href="/pricing/" className="font-semibold text-brand hover:underline">
          Household
        </Link>{" "}
        unlocks every widget below. Samples are the real wall widgets, drawn from the same feeds as the starter templates.
      </p>
      <div className="mt-12 space-y-14">
        {FEATURE_WIDGET_GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="font-display text-2xl font-extrabold tracking-tight">{g.title}</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((item) => (
                <li key={item.type} className="card overflow-hidden p-0">
                  <div className="relative aspect-[16/10] border-b border-line bg-[#0b1220]">
                    <Image
                      src={item.image}
                      alt={`Sample of the ${item.name} widget`}
                      fill
                      className="object-contain object-center p-2"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold">{item.name}</h3>
                    <p className="mt-1 text-sm text-soft">{item.blurb}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section>
          <h2 className="font-display text-2xl font-extrabold tracking-tight">Display Behaviour</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {FEATURE_BEHAVIOURS.map((item) => (
              <li key={item.name} className={item.image ? "card overflow-hidden p-0 sm:col-span-2" : "card"}>
                {item.image ? (
                  <>
                    <div className="relative aspect-[2/1] border-b border-line bg-[#0b1220]">
                      <Image
                        src={item.image}
                        alt={`${item.name} on the wall`}
                        fill
                        className="object-contain object-center"
                        sizes="(max-width: 640px) 100vw, 66vw"
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold">{item.name}</h3>
                      <p className="mt-1 text-sm text-soft">{item.blurb}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="font-bold">{item.name}</h3>
                    <p className="mt-1 text-sm text-soft">{item.blurb}</p>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="mt-14">
        <CtaBanner
          cta="features-end"
          title="Build Your First View"
          body="Drag widgets onto a 12×8 grid from your phone in a few minutes."
        />
      </div>
    </SitePage>
  );
}
