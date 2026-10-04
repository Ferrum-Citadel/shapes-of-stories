import { AXES, type Analysis, type Axis } from "../types";
import { AXIS_INFO, DIFFERENCE_WORDS } from "../lib/definitions";
import { meanScores } from "../lib/stats";
import { Swatch } from "./LayerChips";
import { Bars, CELL, ROW, TABLE, TitleRow } from "./CompareTable";

const cut = (t: string) => (t.length > 28 ? `${t.slice(0, 28).trimEnd()}…` : t);

// Half a point on the four-point scale is where two works read differently rather than alike.
export function differenceWords(
  axis: Axis,
  a: number | null,
  b: number | null,
  names: [string, string],
): string | null {
  if (a === null || b === null || Math.abs(a - b) < 0.5) return null;
  return `${cut(names[a > b ? 0 : 1])} is ${DIFFERENCE_WORDS[axis]}`;
}

export default function Profile({
  a,
  b,
  names,
}: {
  a: Analysis;
  b: Analysis;
  names: [string, string];
}) {
  const ma = meanScores(a);
  const mb = meanScores(b);
  return (
    <table aria-label="Mean score on each layer" className={TABLE}>
      <TitleRow names={names} />
      <tbody>
        {AXES.map((ax) => {
          const words = differenceWords(ax, ma[ax], mb[ax], names);
          return (
            <tr key={ax} className={ROW}>
              <th scope="row" className={CELL}>
                <span className="inline-flex items-center gap-2">
                  <Swatch axis={ax} />
                  {AXIS_INFO[ax].name}
                </span>
                {/* On a phone the words go under the name, where the narrow column has room. */}
                {words && (
                  <span className="serif block text-[13px] italic text-[var(--muted)] sm:ml-3 sm:inline">
                    {words}
                  </span>
                )}
              </th>
              <Bars a={ma[ax]} b={mb[ax]} max={4} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
