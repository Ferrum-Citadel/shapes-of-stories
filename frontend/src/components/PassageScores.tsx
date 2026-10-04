import {
  AXES,
  isScored,
  type Analysis,
  type Axis,
  type BeatAnswers,
  type ScoredAnswers,
  type Structure,
} from "../types";
import { LAYERS, MODE_CONFIDENCE } from "../lib/layers";
import { AXIS_INFO, SPREAD_NOTE, WRITING } from "../lib/definitions";
import { passageMean } from "../lib/bins";
import Popover from "./Popover";
import { Swatch } from "./LayerChips";
import ScoreBar from "./ScoreBar";

// A kind of writing chosen with little confidence reads as mixed.
function writingOf(scored: ScoredAnswers | null) {
  if (!scored) return "–";
  return scored.mode.confidence < MODE_CONFIDENCE ? "mixed" : scored.mode.choice;
}

// The passage's scores, the drawn layers first, or its values read from the curve when it could not be scored; scores on their way keep the scored layout blank, so nothing moves when they arrive.
export default function PassageScores({
  beat,
  structure,
  analysis,
  answers,
  pending,
  axes,
}: {
  beat: number;
  structure: Structure;
  analysis: Analysis;
  answers?: BeatAnswers;
  pending?: boolean;
  axes: Axis[];
}) {
  const ordered = [...axes, ...AXES.filter((a) => !axes.includes(a))];
  const scored = answers && isScored(answers) ? answers : null;
  const ownScores = scored !== null || pending;
  const row = (ax: Axis, i: number) => {
    const val = scored
      ? scored.scores[ax].score
      : pending
        ? null
        : passageMean(analysis.bins[ax].raw, beat, structure);
    const { name, low, high } = AXIS_INFO[ax];
    return (
      <div key={ax} className={i === axes.length ? "hairline mt-1 pt-1" : ""}>
        <div data-score-row className="flex items-center justify-between py-0.5 text-[13px]">
          <span className="inline-flex items-center gap-1.5">
            <Swatch axis={ax} />
            {name}
          </span>
          <ScoreBar
            score={val}
            sd={scored?.scores[ax].sd}
            color={LAYERS[ax].color}
            label={val === null ? undefined : `${val.toFixed(1)} of 4, ${low} to ${high}`}
            move
          />
        </div>
        {/* The first row names its scale's ends once, for every row below it. */}
        {i === 0 && (
          <div className="-mt-0.5 mb-0.5 flex items-center justify-end gap-1 text-[11.5px] text-[var(--muted)]">
            <span aria-hidden>
              {low} · {high}
            </span>
            {ownScores && (
              <Popover label="What the range means" title="The range on the bar">
                {SPREAD_NOTE}
              </Popover>
            )}
          </div>
        )}
      </div>
    );
  };
  return (
    <div>
      {!ownScores && <div className="text-[13px] font-medium">From the curve</div>}
      {answers && !scored && (
        <p className="mb-1 text-[13px] text-[var(--muted)]">
          This passage could not be scored; the values are read from the curve around it.
        </p>
      )}
      {ordered.map(row)}
      <div className="mt-1 flex items-center justify-between py-0.5 text-[13px]">
        <span className="inline-flex items-center gap-1">
          {WRITING.title}
          <Popover label="What Writing means" title={WRITING.title}>
            <p>{WRITING.definition}</p>
            <ul className="mt-1 list-disc pl-4">
              {Object.entries(WRITING.kinds).map(([k, v]) => (
                <li key={k}>
                  <b className="font-medium">{k}</b>: {v}
                </li>
              ))}
            </ul>
          </Popover>
        </span>
        <span>{writingOf(scored)}</span>
      </div>
    </div>
  );
}
