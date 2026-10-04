import { memo } from "react";
import { line } from "d3-shape";
import { linear } from "../lib/scale";
import type { Archetype } from "../types";
import {
  SHAPE_CARD_NOTE,
  SHAPE_Z,
  confidenceSentence,
  matchWords,
  shapeInfo,
  shapeSentence,
  templateSamples,
} from "../lib/definitions";
import { BINS } from "../lib/bins";
import { zscore } from "../lib/stats";
import Popover from "./Popover";
import { Icon } from "./icons";

function Replay({ onReplay }: { onReplay: () => void }) {
  return (
    <button
      type="button"
      onClick={onReplay}
      className="serif normal-case tracking-normal text-[13px] italic text-[var(--ink)] decoration-dotted underline-offset-2 hover:underline relative inline-flex min-h-[20px] items-center gap-1 after:absolute after:-inset-[10px] after:content-['']"
    >
      <Icon name="replay" size={12} />
      replay
    </button>
  );
}

export default memo(function ShapeCard({
  archetype: a,
  fortuneShape,
  onReplay,
  heading: Heading = "h2",
}: {
  archetype: Archetype;
  fortuneShape: number[];
  onReplay?: () => void;
  heading?: "h2" | "h3";
}) {
  const x = linear([0, BINS - 1], [0, 160]);
  const y = linear([...SHAPE_Z], [56, 4]);
  const ln = line<number>()
    .x((_, i) => x(i))
    .y((v) => y(v));
  const z = zscore(fortuneShape);
  const tpl = templateSamples(a);
  const name = shapeInfo(a)?.name ?? a.caption;
  return (
    // The compare page's half-width cells would otherwise blow the sketch up past the work page's column.
    <aside aria-label="Story shape" className="sm:max-w-[280px]">
      <div className="label flex items-center justify-between">
        Story shape{onReplay && <Replay onReplay={onReplay} />}
      </div>
      <Heading className="serif opsz-40 mt-0.5 text-[22px] font-medium">{name}</Heading>
      <p className="mt-1 text-[14px] leading-snug">{shapeSentence(a)}</p>
      <svg viewBox="0 0 160 60" className="mt-2 w-full" aria-hidden>
        <path
          d={ln(z) ?? ""}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        {tpl && (
          <path
            d={ln(tpl) ?? ""}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {/* The "?" flows after the sentence's last word, held to it by a no-break space; a div because the popover's card is one. */}
      <div className="mt-2 text-[14px] text-[var(--muted)] [text-wrap:pretty]">
        {confidenceSentence(a)}&nbsp;
        <Popover label="What the match means" title="The match" className="align-middle">
          {SHAPE_CARD_NOTE}
        </Popover>
      </div>
    </aside>
  );
});

// The phone's one line under the chart, which already draws the curve: the shape's name and how close it came, the rest behind its "?".
export const ShapeLine = memo(function ShapeLine({
  archetype: a,
  onReplay,
}: {
  archetype: Archetype;
  onReplay?: () => void;
}) {
  const name = shapeInfo(a)?.name ?? a.caption;
  return (
    <aside aria-label="Story shape" className="hairline flex flex-wrap items-center gap-x-2.5 pt-2">
      <span className="label">Shape</span>
      <span className="serif opsz-14 text-[16px] font-medium">{name}</span>
      {a.state !== "none" && (
        <span className="text-[14px] text-[var(--muted)]">{matchWords(a)}</span>
      )}
      <Popover label="About this shape" title={name}>
        <p>{shapeSentence(a)}</p>
        <p className="mt-1">{confidenceSentence(a)}</p>
        <p className="mt-1 text-[13px] text-[var(--muted)]">{SHAPE_CARD_NOTE}</p>
      </Popover>
      {onReplay && (
        <span className="ml-auto pl-2">
          <Replay onReplay={onReplay} />
        </span>
      )}
    </aside>
  );
});
