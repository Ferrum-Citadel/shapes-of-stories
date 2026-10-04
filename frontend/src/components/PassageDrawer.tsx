import { useRef, type Ref } from "react";
import type { Analysis, Axis, BeatAnswers, Structure } from "../types";
import { chapterTitleOfBeat, type Drivers } from "../lib/bins";
import { Icon } from "./icons";
import PassageScores from "./PassageScores";
import PassageText from "./PassageText";
import { useDrawerReveal } from "./useDrawerReveal";

interface Props {
  beat: number;
  structure: Structure;
  analysis: Analysis;
  answers?: BeatAnswers;
  scoresPending?: boolean;
  text: string | null;
  textDiscarded?: boolean;
  onRetry?: () => void;
  axes: Axis[];
  drivers: Drivers;
  onClose: () => void;
  onSelect: (beat: number) => void;
  topRef?: Ref<HTMLDivElement>;
}
// aria-disabled keeps the button focusable at either end of the work, where the selection clamps a step back in range.
const stepStyle =
  "inline-flex min-h-[40px] items-center gap-1 hover:text-[var(--ink)] aria-disabled:opacity-40 aria-disabled:hover:text-[var(--muted)]";

export default function PassageDrawer({
  beat,
  structure,
  analysis,
  answers,
  scoresPending,
  text,
  textDiscarded,
  onRetry,
  axes,
  drivers,
  onClose,
  onSelect,
  topRef,
}: Props) {
  const content = useRef<HTMLDivElement>(null);
  useDrawerReveal(beat, content);
  const total = structure.beats.length;
  return (
    <section
      aria-label="Passage"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="enter border-y py-3"
      style={{ borderColor: "var(--rule)" }}
    >
      {/* From 640 px the scores and the passage stand side by side, with the label and the steps over the passage's column; the steps keep their place from passage to passage, first on a phone, where the label can wrap. */}
      <div className="grid gap-y-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-x-5">
        <div
          ref={topRef}
          className="flex flex-wrap items-start gap-x-4 sm:col-start-2 sm:max-w-[40rem]"
        >
          <div className="label min-w-0 pt-3 max-sm:order-last max-sm:basis-full sm:flex-1">
            Passage {beat + 1} of {total} · {chapterTitleOfBeat(structure, beat)}
          </div>
          <div className="flex gap-3 text-[13.5px] text-[var(--muted)] max-sm:basis-full">
            <button
              type="button"
              aria-disabled={beat === 0}
              onClick={() => onSelect(beat - 1)}
              className={stepStyle}
            >
              <Icon name="chevron" size={12} className="rotate-180" />
              earlier
            </button>
            <button
              type="button"
              aria-disabled={beat === total - 1}
              onClick={() => onSelect(beat + 1)}
              className={stepStyle}
            >
              later
              <Icon name="chevron" size={12} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto inline-flex min-h-[40px] items-center gap-1 hover:text-[var(--ink)]"
            >
              close
              <Icon name="close" size={12} />
            </button>
          </div>
        </div>
        {/* The same blocks stay from passage to passage, so only what a passage changes moves: the bars, the chips and the text. */}
        <div ref={content} className="grid gap-y-2 sm:col-span-2 sm:grid-cols-subgrid">
          <PassageScores
            beat={beat}
            structure={structure}
            analysis={analysis}
            answers={answers}
            pending={scoresPending}
            axes={axes}
          />
          <PassageText
            beat={beat}
            structure={structure}
            text={text}
            textDiscarded={textDiscarded}
            onRetry={onRetry}
            events={analysis.events.filter((e) => e.beat_idx === beat)}
            axes={axes}
            drivers={drivers}
          />
        </div>
      </div>
    </section>
  );
}
