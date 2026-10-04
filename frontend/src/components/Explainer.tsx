import { memo, type ReactElement } from "react";
import { HOW_TO_READ } from "../lib/definitions";
import { GlyphPath } from "./icons";
const CURVE = "M4,30 C50,28 70,12 100,14 S150,32 196,10";
// Each HOW_TO_READ item's sketch, shared with the About page.
export const SKETCHES: Record<(typeof HOW_TO_READ)[number]["sketch"], ReactElement> = {
  line: (
    <svg viewBox="0 0 200 44" className="h-11 w-full" aria-hidden="true">
      <path d={CURVE} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <text
        x="4"
        y="9"
        fontSize="10"
        fontStyle="italic"
        fill="var(--accent)"
        fontFamily="var(--serif)"
      >
        good
      </text>
      <text
        x="4"
        y="42"
        fontSize="10"
        fontStyle="italic"
        fill="var(--accent)"
        fontFamily="var(--serif)"
      >
        ill
      </text>
    </svg>
  ),
  shape: (
    <svg viewBox="0 0 200 44" className="h-11 w-full" aria-hidden="true">
      <path
        d="M4,34 C40,36 55,8 96,12 S140,36 196,6"
        fill="none"
        stroke="currentColor"
        strokeOpacity=".3"
        strokeWidth="2"
        strokeDasharray="5 4"
      />
      <path d={CURVE} fill="none" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 200 44" className="h-11 w-full" aria-hidden="true">
      <path d={CURVE} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <rect x="118" y="4" width="8" height="36" fill="var(--select)" />
      <line x1="122" y1="4" x2="122" y2="40" stroke="currentColor" strokeOpacity=".5" />
      <g transform="translate(62,34)">
        <circle r="7" fill="var(--paper)" stroke="var(--rule)" />
        <GlyphPath type="reveal" size={10} strokeWidth={2.4} />
      </g>
    </svg>
  ),
};
export default memo(function Explainer({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <section
      aria-label="How to read this chart"
      className="enter grid gap-5 border-y py-3 sm:grid-cols-3"
      style={{ borderColor: "var(--rule)" }}
    >
      {HOW_TO_READ.map((h) => (
        <div key={h.title}>
          {SKETCHES[h.sketch]}
          <h3 className="serif opsz-14 mb-1 mt-1.5 text-[14px] font-medium">{h.title}</h3>
          <p className="max-w-[28rem] text-[14px] leading-relaxed text-[var(--muted)]">{h.text}</p>
        </div>
      ))}
    </section>
  );
});
