import { EVENT_TYPES, type Analysis, type EventType } from "../types";
import { EVENT_NAMES } from "../lib/definitions";
import { EventGlyph } from "./icons";
import { Bars, CELL, ROW, TABLE, TitleRow, Titled } from "./CompareTable";
import type { Side } from "./Comparison";
import WritingBar from "./WritingBar";

type Column = Pick<Side, "label" | "analysis" | "structure">;

// Confident events of each type per 10,000 words, so a long book and a short one compare fairly.
export function eventRates(analysis: Analysis, words: number): Record<EventType, number> {
  const rates = Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as Record<EventType, number>;
  for (const e of analysis.events) if (e.strength === "strong") rates[e.type]++;
  for (const t of EVENT_TYPES) rates[t] = words ? (rates[t] * 10000) / words : 0;
  return rates;
}

const GROUP = "label pb-1 pt-4 text-left font-normal";

export default function Mixes({ a, b }: { a: Column; b: Column }) {
  const ra = eventRates(a.analysis, a.structure.word_count);
  const rb = eventRates(b.analysis, b.structure.word_count);
  const larger = (t: EventType) => Math.max(ra[t], rb[t]);
  const rows = [...EVENT_TYPES].sort((x, y) => larger(y) - larger(x));
  const top = larger(rows[0]) || 1;
  return (
    <table aria-label="Events and writing" className={TABLE}>
      <TitleRow names={[a.label, b.label]} />
      <tbody>
        <tr>
          <th scope="rowgroup" colSpan={3} className={GROUP}>
            Events per 10,000 words
          </th>
        </tr>
        {rows.map((t) => (
          <tr key={t} className={ROW}>
            <th scope="row" className={CELL}>
              <span className="inline-flex items-center gap-2">
                <EventGlyph type={t} size={14} />
                {EVENT_NAMES[t]}
              </span>
            </th>
            <Bars a={ra[t]} b={rb[t]} max={top} />
          </tr>
        ))}
      </tbody>
      <tbody>
        <tr>
          <th scope="rowgroup" colSpan={3} className={GROUP}>
            Writing
          </th>
        </tr>
        {[a, b].map((s, i) => (
          <tr key={i} className={ROW}>
            <th scope="row" className={CELL}>
              <Titled name={s.label} i={i as 0 | 1} />
            </th>
            <td colSpan={2} className={CELL}>
              <WritingBar c={s.analysis} tip width={200} name={s.label} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
