// Calendar titles in title case on the wall (Melvin, 2026-11-26: "on the calendar, can you make all the entries title
// case please"). Only the copy the wall shows changes; the events in Google, Microsoft or the iCal link never do.
//
// Rules, chosen to never make a title worse:
// - A word that already has a capital after its first letter (BC, PRO-D, YMCA, iPhone, McDonald) is left alone, so
//   acronyms and names someone typed on purpose survive. A title typed all in capitals is therefore left as typed.
// - Every other word gets a capital first letter, each part of a hyphenated word too ("drop-off" → "Drop-Off").
// - Short joining words (a, of, the, and…) stay lower case unless they start or end the title or follow a colon,
//   dash or opening bracket.
// - Email addresses, web addresses and words with a dot inside (zoom.us) are left alone.

const SMALL = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "en",
  "for",
  "from",
  "if",
  "in",
  "into",
  "nor",
  "of",
  "on",
  "onto",
  "or",
  "per",
  "so",
  "than",
  "the",
  "to",
  "via",
  "vs",
  "with",
  "yet",
]);

const LETTER = /\p{L}/u;
const UPPER = /\p{Lu}/u;

function hasInnerCapital(word: string): boolean {
  let seenLetter = false;
  for (const ch of word) {
    if (!LETTER.test(ch)) continue;
    if (seenLetter && UPPER.test(ch)) return true;
    seenLetter = true;
  }
  return false;
}

/** The first letter of each hyphen-separated part in capitals; everything else as it was. */
function capitalise(word: string): string {
  return (
    word
      .split("-")
      // "2nd" and "7pm" start with a number, so they keep their small letters.
      .map((part) => part.replace(/^([^\p{L}\p{N}]*)(\p{L})/u, (_, lead: string, ch: string) => lead + ch.toLocaleUpperCase()))
      .join("-")
  );
}

export function titleCase(title: string): string {
  const tokens = title.split(/(\s+)/);
  const words = tokens.map((t, i) => ({ t, i })).filter(({ t }) => t !== "" && !/^\s+$/.test(t));
  const out = [...tokens];
  words.forEach(({ t, i }, n) => {
    if (!LETTER.test(t) || /[@/]|\.\p{L}/u.test(t) || hasInnerCapital(t)) return;
    const bare = t.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").toLocaleLowerCase();
    const prev = words[n - 1]?.t ?? "";
    const startsPhrase = n === 0 || /[:–—-]$/.test(prev) || /^[([{"“]/.test(t);
    const endsTitle = n === words.length - 1;
    if (SMALL.has(bare) && !startsPhrase && !endsTitle) out[i] = t.toLocaleLowerCase();
    else out[i] = capitalise(t);
  });
  return out.join("");
}
