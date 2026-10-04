import { useEffect, useState } from "react";

// A control's height: 40 px for a finger, 32 px where a mouse points more finely.
export const target = "min-h-[40px] [@media(pointer:fine)]:min-h-[32px]";
export const textButton =
  "inline-flex min-h-[40px] items-center text-[var(--muted)] hover:text-[var(--ink)]";
// An underline field; its focus is drawn by `.field` in index.css.
export const field = "field min-h-[40px] border-b border-[var(--rule)] bg-transparent px-0.5 py-1";
// A boxed field, a bordered secondary button beside it, and the small gray note under a form's controls.
export const boxField =
  "block w-full rounded-md border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 focus-visible:border-[var(--ink)]";
export const boxButton =
  "min-h-[40px] shrink-0 rounded-md border border-[var(--rule)] px-4 text-[13px] hover:border-[var(--ink)] disabled:opacity-40 disabled:hover:border-[var(--rule)]";
export const note = "max-w-[28rem] text-[14px] text-[var(--muted)]";
export const pageTitle = "serif opsz-72 text-[36px] font-medium leading-[1.05]";
// A page's own quiet line: loading, nothing found, nothing yet.
export const quiet = "serif opsz-14 text-[16px] italic text-[var(--muted)]";
export const link =
  "text-[var(--ink)] underline decoration-dotted decoration-[var(--muted)] underline-offset-2 hover:decoration-solid hover:decoration-[var(--ink)]";
// The one main action, a pill of wax on a tint of wax: 26 px on a mouse inside a 40 px hit area, 40 px under a finger.
export const actionPill =
  "relative inline-flex min-h-[40px] [@media(pointer:fine)]:min-h-[26px] items-center whitespace-nowrap rounded-full bg-[var(--action-tint)] px-[10px] [font-family:var(--sans)] text-[13px] font-medium not-italic text-[var(--action)] hover:bg-[var(--action-tint-hover)] after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-['']";
// A label around a hidden input shows the input's keyboard focus on itself, flush with it or set off by 2 px.
export const focusRing =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--mark)]";
export const focusRingOffset =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mark)]";
// Radios drawn as one row of buttons, the chosen one filled.
export const segment = {
  group: "m-0 inline-flex min-w-0 overflow-hidden rounded-md border border-[var(--rule)] p-0",
  option:
    "inline-flex min-h-[40px] cursor-pointer items-center whitespace-nowrap px-2.5 text-[var(--muted)] not-has-[:checked]:hover:text-[var(--ink)] has-[:checked]:bg-[var(--ink)] has-[:checked]:text-[var(--bg)] has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-[var(--mark)]",
};
// The compact variant's boundary in index.css, for the few choices made in script: a phone upright or on its side.
export const compact = "(width < 40rem), (max-height: 30rem)";
// Whether a media query holds now.
export const matches = (query: string) => window.matchMedia(query).matches;
// A media query's answer, read before the first paint and kept as it changes.
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matches(query));
  useEffect(() => {
    const m = window.matchMedia(query),
      take = () => setOn(m.matches);
    m.addEventListener("change", take);
    return () => m.removeEventListener("change", take);
  }, [query]);
  return on;
}
// A finger has no hover, so what follows the pointer stays off on touch screens.
export const coarse = () => matches("(pointer: coarse)");
// A panel's offset from its wrapper and its width, kept 8 px inside the page's own width, since a phone's innerWidth grows with whatever overflows.
export function panelOffset(wrap: Element, maxWidth: number) {
  const page = document.documentElement.clientWidth,
    width = Math.min(maxWidth, page * 0.85),
    x = wrap.getBoundingClientRect().left;
  return { left: Math.max(8, Math.min(x, page - 8 - width)) - x, width };
}
