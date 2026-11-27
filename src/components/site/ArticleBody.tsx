import Link from "next/link";

import type { Block, Figure } from "@/content/posts";
import { SIGNUP_PATH } from "@/lib/site";

/** Renders blog blocks. Inline **bold** and [label](/path/) links. */
export function ArticleBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="article-body space-y-4 text-[1.05rem] leading-relaxed text-ink">
      {blocks.map((b, i) => {
        if ("p" in b) return <p key={i} className="text-soft" dangerouslySetInnerHTML={{ __html: inline(b.p) }} />;
        if ("h2" in b)
          return (
            <h2 key={i} className="!mt-10 font-display text-2xl font-extrabold tracking-tight text-ink">
              {b.h2}
            </h2>
          );
        if ("h3" in b)
          return (
            <h3 key={i} className="!mt-8 text-xl font-bold tracking-tight text-ink">
              {b.h3}
            </h3>
          );
        if ("ul" in b)
          return (
            <ul key={i} className="list-disc space-y-2 pl-6 text-soft">
              {b.ul.map((item) => (
                <li key={item} dangerouslySetInnerHTML={{ __html: inline(item) }} />
              ))}
            </ul>
          );
        if ("ol" in b)
          return (
            <ol key={i} className="list-decimal space-y-2 pl-6 text-soft">
              {b.ol.map((item) => (
                <li key={item} dangerouslySetInnerHTML={{ __html: inline(item) }} />
              ))}
            </ol>
          );
        if ("tip" in b)
          return (
            <p key={i} className="rounded-2xl border border-sky/30 bg-sky/10 px-4 py-3 text-sm text-ink">
              <span className="font-bold text-brand">Tip. </span>
              <span dangerouslySetInnerHTML={{ __html: inline(b.tip) }} />
            </p>
          );
        if ("img" in b) return <Picture key={i} figure={b.img} />;
        if ("gallery" in b)
          return (
            <div key={i} className="!my-8 grid gap-4 sm:grid-cols-2">
              {b.gallery.map((f) => (
                <Picture key={f.src} figure={f} inGallery />
              ))}
            </div>
          );
        if ("cta" in b)
          return (
            <p key={i} className="rounded-2xl border border-line bg-panel px-5 py-4">
              <span className="font-semibold">Ready to try it? </span>
              <Link href={SIGNUP_PATH} className="font-semibold text-brand hover:underline">
                Start Free on Everydaypane
              </Link>
              .
            </p>
          );
        return null;
      })}
    </div>
  );
}

const WIDTH: Record<NonNullable<Figure["size"]>, string> = {
  full: "w-full",
  narrow: "mx-auto w-full max-w-md",
  phone: "mx-auto w-full max-w-[18rem]",
};

/** One captioned screenshot. Lazy-loaded, with its real size so the text doesn't jump as it arrives. */
function Picture({ figure, inGallery = false }: { figure: Figure; inGallery?: boolean }) {
  const width = inGallery ? "w-full" : WIDTH[figure.size ?? "full"];
  return (
    <figure className={`${inGallery ? "" : "!my-8"} ${width}`}>
      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        {/* eslint-disable-next-line @next/next/no-img-element -- static screenshots in /public, already sized */}
        <img
          src={figure.src}
          alt={figure.alt}
          width={figure.w}
          height={figure.h}
          loading="lazy"
          decoding="async"
          className="h-auto w-full"
        />
      </div>
      {figure.caption ? (
        <figcaption className="mt-2 text-center text-sm text-soft" dangerouslySetInnerHTML={{ __html: inline(figure.caption) }} />
      ) : null}
    </figure>
  );
}

function inline(text: string): string {
  return (
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Commands and paths in backticks (the Raspberry Pi guide, 2026-11-27), kept on one line so they read as typed.
      .replace(
        /`([^`]+)`/g,
        '<code class="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[0.9em] text-ink break-all">$1</code>',
      )
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-ink">$1</strong>')
      .replace(/\[(.+?)\]\((\/[^)]+)\)/g, '<a class="font-semibold text-brand underline-offset-2 hover:underline" href="$2">$1</a>')
  );
}
