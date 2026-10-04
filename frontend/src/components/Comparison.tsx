import type { Analysis, Axis, Structure } from "../types";
import { AXIS_INFO } from "../lib/definitions";
import { pearson } from "../lib/stats";
import CompareChart, { CompareLegend, SIDES } from "../chart/CompareChart";
import DefinitionLine from "./DefinitionLine";
import EarlierQuestions from "./EarlierQuestions";
import LayerChips, { Swatch } from "./LayerChips";
import Mixes from "./Mixes";
import Profile from "./Profile";
import ShapeCard from "./ShapeCard";

export type Side = {
  label: string;
  analysis: Analysis;
  structure: Structure;
  questionSet: string | undefined;
};
export function correlationWords(r: number): string {
  return r >= 0.8
    ? "nearly the same shape"
    : r >= 0.5
      ? "clearly similar"
      : r >= 0.2
        ? "loosely related"
        : r > -0.2
          ? "unrelated"
          : "roughly opposite";
}
function SideCard({ side, i }: { side: Side; i: 0 | 1 }) {
  return (
    <section aria-label={side.label}>
      <p className="serif opsz-40 mb-2 flex items-center gap-2 text-[19px] font-medium leading-tight">
        <Swatch {...SIDES[i]} />
        {side.label}
      </p>
      <EarlierQuestions version={side.questionSet} />
      <ShapeCard
        archetype={side.analysis.archetype}
        fortuneShape={side.analysis.bins.fortune.shape}
        heading="h3"
      />
    </section>
  );
}

const H2 = "serif opsz-40 text-[22px] font-medium leading-tight";

export default function Comparison({
  a,
  b,
  axis,
  onAxis,
}: {
  a: Side;
  b: Side;
  axis: Axis;
  onAxis: (axis: Axis) => void;
}) {
  const r = pearson(a.analysis.bins[axis].shape, b.analysis.bins[axis].shape);
  const names: [string, string] = [a.label, b.label];
  return (
    <>
      {/* The chips carry no definitions, so the line under them explains the layer chosen. */}
      <div className="space-y-1">
        <LayerChips
          active={[axis]}
          onChange={(next) => onAxis(next.find((x) => x !== axis) ?? axis)}
        />
        <DefinitionLine axis={axis} />
      </div>
      <div className="space-y-2">
        <CompareChart
          a={a.analysis.bins[axis].shape}
          b={b.analysis.bins[axis].shape}
          axis={axis}
          names={names}
        />
        <CompareLegend names={names} />
        <p className="serif opsz-14 max-w-[32rem] text-[15px] italic">
          {AXIS_INFO[axis].name} curves correlate {r.toFixed(2)}: {correlationWords(r)}.
        </p>
      </div>
      <section className="space-y-2">
        <h2 className={H2}>Profile</h2>
        <p className="text-[14px] text-[var(--muted)]">
          Each layer&rsquo;s mean score over the whole work, out of 4.
        </p>
        <Profile a={a.analysis} b={b.analysis} names={names} />
      </section>
      <section className="space-y-2">
        <h2 className={H2}>Events and writing</h2>
        <Mixes a={a} b={b} />
      </section>
      <section className="space-y-3">
        <h2 className={H2}>The two shapes</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <SideCard side={a} i={0} />
          <SideCard side={b} i={1} />
        </div>
      </section>
    </>
  );
}
