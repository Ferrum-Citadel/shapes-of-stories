import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import ArcChart from "../chart/ArcChart";
import ChartTooltip from "../chart/ChartTooltip";
import EventRibbon, { EventLegend } from "../chart/EventRibbon";
import { useChartSize } from "../chart/useChartSize";
import { useOpening } from "../chart/useOpening";
import { useRevealOnPin } from "../chart/useRevealOnPin";
import { usePinHint, useSelection } from "../lib/selection";
import { driversOf } from "../lib/bins";
import { prefersReducedMotion } from "../lib/motion";
import { ShapeLine } from "./ShapeCard";
import LayerChips from "./LayerChips";
import ViewControls from "./ViewControls";
import DefinitionLine from "./DefinitionLine";
import Explainer from "./Explainer";
import PassageDrawer from "./PassageDrawer";
import ChapterTable from "./ChapterTable";
import type { Analysis, Axis, BeatAnswers, Structure } from "../types";
import { templateOf } from "../lib/definitions";
import WorkHeader from "./WorkHeader";
import RoomLinks, { type Room } from "./RoomLinks";
import { compact, matches } from "../lib/ui";
import { useTextOnDemand } from "../lib/text";
import { useFileOnDemand } from "../lib/gallery";
import { passageSummary, readingSentence } from "../lib/reading";

interface Props {
  title: string;
  author: string | null;
  meta: string;
  questionSet: string | undefined;
  analysis: Analysis;
  structure: Structure;
  text?: string;
  textUrl?: string;
  textDiscarded?: boolean;
  answers?: Record<number, BeatAnswers>;
  answersUrl?: string;
  actions?: (axes: Axis[]) => ReactNode;
  metaActions?: (axes: Axis[]) => ReactNode;
  seenKey: string;
  shared?: boolean;
  compareTo?: string;
  room?: Room;
}

export default function WorkViewer({
  title,
  author,
  meta,
  questionSet,
  analysis,
  structure,
  text = "",
  textUrl,
  textDiscarded,
  answers: given = {},
  answersUrl,
  actions,
  metaActions,
  seenKey,
  shared,
  compareTo,
  room,
}: Props) {
  const [axes, setAxes] = useState<Axis[]>(["fortune"]);
  const [smoothing, setSmoothing] = useState(1);
  const [live, setLive] = useState(false);
  const [band, setBand] = useState(true);
  const [points, setPoints] = useState(() => !matches(compact));
  // The chip last pointed at keeps the words; the chip or the line under the pointer highlights its layer, and the line outranks the chip.
  const [focusAxis, setFocusAxis] = useState<Axis | null>(null);
  const [chipAxis, setChipAxis] = useState<Axis | null>(null);
  const [lineAxis, setLineAxis] = useState<Axis | null>(null);
  const [explainer, setExplainer] = useState(false);
  const { pinned, shown, setHover, pin, unpin, select, onKeyDown } = useSelection(
    structure.beats.length,
  );
  const hint = usePinHint(pinned);
  const chart = useRef<HTMLDivElement>(null);
  const { drawIn, replays, replay, onDrawn } = useOpening(seenKey, chart);
  // A mouse over the chart, the keyboard reaching it or a finger pressing on it is the first sign a passage will be opened, so the text sets off then rather than at the pin.
  const [intent, setIntent] = useState(false);
  // The ribbon's active bead is announced by its own label, so the summary keeps quiet while the keys walk the ribbon.
  const [inRibbon, setInRibbon] = useState(false);
  const wanted = pinned !== null || intent;
  const book = useTextOnDemand(textUrl, wanted);
  // A gallery work's own scores set off with its text; the drawer holds their place while they come and reads the curve if they never do.
  const scores = useFileOnDemand<Record<number, BeatAnswers>>(answersUrl, wanted);
  const answers = scores.value ?? given;
  const size = useChartSize(chart);
  // The opening has nothing to sketch from without a shape, so there is nothing to replay.
  const canReplay = templateOf(analysis.archetype) !== undefined;
  const sentenceId = useId();
  const sentence = useMemo(
    () => readingSentence(analysis, structure.chapters),
    [analysis, structure],
  );
  const reading = useMemo(() => ({ id: sentenceId, text: sentence }), [sentenceId, sentence]);
  const closeDrawer = useCallback(() => {
    unpin();
    chart.current?.focus();
  }, [unpin]);
  const reveal = useRevealOnPin(pinned);
  const { arm } = reveal;
  const pinFromChart = useCallback(
    (i: number) => {
      arm(pinned === null);
      pin(i);
    },
    [pinned, pin, arm],
  );
  const drivers = useMemo(
    () => (pinned === null ? {} : driversOf(analysis, axes, pinned)),
    [pinned, analysis, axes],
  );
  const summary = useMemo(
    () =>
      shown === null
        ? ""
        : passageSummary(structure, shown, answers[shown], axes, shown === pinned),
    [shown, pinned, answers, structure, axes],
  );
  // A chip turned off gives the line back to the first layer drawn, so it never explains a layer that is not there.
  const changeAxes = useCallback(
    (a: Axis[]) => {
      setFocusAxis(a.find((x) => !axes.includes(x)) ?? null);
      setLineAxis(null);
      setAxes(a);
    },
    [axes],
  );
  const focusChip = useCallback((a: Axis | null) => {
    setChipAxis(a);
    if (a) setFocusAxis(a);
  }, []);
  const changeSmoothing = useCallback((v: number, isLive: boolean) => {
    setSmoothing(v);
    setLive(isLive);
  }, []);
  const toggleExplainer = useCallback(() => setExplainer((v) => !v), []);
  const pinFromTable = useCallback(
    (i: number) => {
      select(i);
      chart.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
      });
    },
    [select],
  );
  return (
    // A small screen puts the chart straight after the title and before the shape line and the controls, while from 1280 px the shape block stands beside the title and the controls above the full-width rest.
    <div className="flex flex-col gap-4 lg:gap-3">
      <WorkHeader
        title={title}
        author={author}
        meta={meta}
        questionSet={questionSet}
        compareTo={compareTo}
        actions={actions?.(axes)}
        metaActions={metaActions?.(axes)}
        sentence={sentence}
        sentenceId={sentenceId}
        analysis={analysis}
        onReplay={canReplay ? replay : undefined}
      >
        <div className="xl:hidden compact:order-2">
          <ShapeLine archetype={analysis.archetype} onReplay={canReplay ? replay : undefined} />
        </div>
        <div className="flex flex-col gap-4 compact:order-2">
          {/* From 640 px the chips and the view controls share rows wherever they fit. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <LayerChips active={axes} onChange={changeAxes} onFocusAxis={focusChip} />
            <div className="max-sm:w-full sm:ml-auto">
              <ViewControls
                smoothing={smoothing}
                onSmoothing={changeSmoothing}
                band={band}
                onBand={setBand}
                points={points}
                onPoints={setPoints}
              />
            </div>
          </div>
          <DefinitionLine
            axis={lineAxis ?? focusAxis ?? axes[0]}
            explainerOpen={explainer}
            onToggleExplainer={toggleExplainer}
          />
        </div>
      </WorkHeader>
      {/* An empty wrapper takes no gap while the explainer is closed. */}
      <div className="empty:hidden compact:order-2">
        <Explainer open={explainer} />
      </div>
      <div className="flex flex-col gap-4 compact:order-1">
        <div
          ref={chart}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") setIntent(true);
          }}
          onFocus={() => setIntent(true)}
          onKeyDownCapture={(e) =>
            setInRibbon(e.target instanceof Element && e.target.closest("[data-ribbon]") !== null)
          }
          onBlur={() => setInRibbon(false)}
          onPointerDown={(e) => {
            setIntent(true);
            reveal.onPointerDown(e);
          }}
          onClickCapture={reveal.onClickCapture}
          onClick={reveal.onClick}
          className="relative rounded"
          role="group"
          aria-label="Arc chart. Use arrow keys to move between passages, Escape to close."
        >
          {/* A replay remounts the chart, so one pressed mid-opening starts it afresh. */}
          <ArcChart
            key={replays}
            analysis={analysis}
            structure={structure}
            axes={axes}
            smoothing={smoothing}
            showBand={band}
            showRaw={points}
            shown={shown}
            pinned={pinned}
            focusAxis={lineAxis ?? focusAxis}
            highlight={lineAxis ?? chipAxis}
            onHover={setHover}
            onLineHover={setLineAxis}
            onPin={pinFromChart}
            drawIn={drawIn}
            onDrawn={onDrawn}
            reading={reading}
            live={live}
            hint={hint}
            {...size}
          />
          <EventRibbon
            events={analysis.events}
            structure={structure}
            shown={shown}
            pinned={pinned}
            onHover={setHover}
            onPin={pinFromChart}
            width={size.width}
          />
          <ChartTooltip
            shown={shown}
            pinned={pinned}
            analysis={analysis}
            structure={structure}
            axes={axes}
            chartRef={chart}
            drawnWidth={size.width}
          />
        </div>
        <EventLegend />
        <p className="sr-only" aria-live={inRibbon ? "off" : "polite"} data-summary>
          {summary}
        </p>
        {pinned !== null && (
          <PassageDrawer
            beat={pinned}
            structure={structure}
            analysis={analysis}
            answers={answers[pinned]}
            scoresPending={answersUrl !== undefined && scores.value === null && !scores.failed}
            text={shared ? "" : textUrl ? book.text : text}
            onRetry={book.failed ? book.retry : undefined}
            textDiscarded={textDiscarded}
            axes={axes}
            drivers={drivers}
            onClose={closeDrawer}
            onSelect={select}
            topRef={reveal.row}
          />
        )}
      </div>
      <div className="flex flex-col gap-4 compact:order-3">
        <ChapterTable chapters={analysis.chapters} structure={structure} onPinBeat={pinFromTable} />
        {room && <RoomLinks room={room} />}
      </div>
    </div>
  );
}
