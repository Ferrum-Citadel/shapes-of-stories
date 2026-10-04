import { memo, useId, useState } from "react";
import type { ChapterStat, Structure } from "../types";
import { WRITING, writingBackground } from "../lib/definitions";
import { LAYERS, SCORE_MAX } from "../lib/layers";
import { field, useMedia } from "../lib/ui";
import { Icon } from "./icons";
import WritingBar, { pct, shares } from "./WritingBar";
type SortKey = "idx" | "word_count" | "pace" | "tension";
const SORTS: [SortKey, string][] = [
  ["idx", "chapter order"],
  ["word_count", "length"],
  ["pace", "pace"],
  ["tension", "tension"],
];
const CELL = "py-1 pr-2";
// Tailwind's sm breakpoint, read in script so that only one of the two layouts is built; it is read before the first paint, so nothing moves.
const PHONE = "(width < 40rem)";

// Every sort is descending on this value, ties fall back to chapter order; "#" negates the index so it reads 1, 2, 3.
function sortValue(c: ChapterStat, k: SortKey) {
  if (k === "idx") return -c.idx;
  return k === "word_count" ? c.word_count : (c.means[k] ?? -1);
}
const one = (n: number | null | undefined) => n?.toFixed(1) ?? "–";
// Where there is no pointer to hover the bar, its largest share is printed beside it.
function mostly(c: ChapterStat) {
  const [kind, share] = Object.entries(c.mode_share).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!kind) return "";
  return `${kind === "mixed" ? "mixed" : `mostly ${kind}`}, ${pct(share)}`;
}
// A mean drawn as a short bar beside its number, so a column can be scanned by length as well as read.
function MeanCell({ value, axis }: { value: number | null | undefined; axis: "pace" | "tension" }) {
  return (
    <td className={CELL} aria-label={one(value)}>
      <span className="flex items-center gap-1.5">
        <span className="w-[2.25em] tabular-nums">{one(value)}</span>
        {value != null && (
          <span
            aria-hidden
            className="h-1 rounded-full"
            style={{
              width: `${(value / SCORE_MAX) * 48}px`,
              background: LAYERS[axis].color,
              opacity: 0.8,
            }}
          />
        )}
      </span>
    </td>
  );
}

// Chapter order reads upward from 1; every other sort puts the largest first.
const direction = (k: SortKey) => (k === "idx" ? "ascending" : "descending");

function WideTable({
  rows,
  sort,
  onSort,
  onPin,
}: {
  rows: ChapterStat[];
  sort: SortKey;
  onSort: (k: SortKey) => void;
  onPin: (c: ChapterStat) => void;
}) {
  const head = (k: SortKey | null, label: string) => (
    <th
      scope="col"
      className="label pr-2 text-left font-normal"
      aria-sort={k && sort === k ? direction(k) : undefined}
    >
      {k ? (
        <button
          type="button"
          onClick={() => onSort(k)}
          className={`inline-flex min-h-[40px] min-w-[40px] items-center gap-1 uppercase tracking-[.12em] hover:text-[var(--ink)] ${sort === k ? "text-[var(--ink)]" : ""}`}
        >
          {label}
          {sort === k && (
            <Icon name="chevron" size={10} className={k === "idx" ? "-rotate-90" : "rotate-90"} />
          )}
        </button>
      ) : (
        label
      )}
    </th>
  );
  return (
    <table className="w-full border-collapse text-[13.5px]">
      <thead>
        <tr style={{ borderBottom: "1px solid var(--rule)" }}>
          {head("idx", "#")}
          {head(null, "Chapter")}
          {head("word_count", "Words")}
          {head("pace", "Pace")}
          {head("tension", "Tension")}
          {head(null, "Writing")}
          {head(null, "Events")}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          // On a touch screen the title is tall enough to tap, which makes the whole row so.
          <tr
            key={c.idx}
            onClick={() => onPin(c)}
            className="cursor-pointer transition-colors hover:bg-[var(--select)]"
            style={{ borderBottom: "1px dotted var(--rule)" }}
          >
            <td className={CELL}>{c.idx + 1}</td>
            <td className={`serif opsz-14 ${CELL}`}>
              <button type="button" className="text-left [@media(pointer:coarse)]:min-h-[40px]">
                {c.title}
              </button>
            </td>
            <td className={CELL}>{c.word_count.toLocaleString()}</td>
            <MeanCell value={c.means.pace} axis="pace" />
            <MeanCell value={c.means.tension} axis="tension" />
            <td className={CELL}>
              <WritingBar c={c} tip />
            </td>
            <td className={CELL}>{c.event_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// On a phone each chapter is one button of two short lines and its bar, so a long book can be scanned.
function PhoneList({ rows, onPin }: { rows: ChapterStat[]; onPin: (c: ChapterStat) => void }) {
  const uid = useId();
  return (
    <ul role="list" aria-label="Chapters">
      {rows.map((c) => (
        <li key={c.idx} style={{ borderBottom: "1px dotted var(--rule)" }}>
          <button
            type="button"
            onClick={() => onPin(c)}
            aria-labelledby={`${uid}${c.idx}i ${uid}${c.idx}`}
            aria-describedby={`${uid}${c.idx}n ${uid}${c.idx}w`}
            className="press-own block w-full py-1.5 text-left active:bg-[var(--select)]"
          >
            <span className="block leading-snug">
              <span
                id={`${uid}${c.idx}i`}
                className="mr-1.5 inline-block min-w-[1.25rem] text-[13px] tabular-nums text-[var(--muted)]"
              >
                {c.idx + 1}
              </span>
              <span id={`${uid}${c.idx}`} className="serif opsz-14 text-[15px]">
                {c.title}
              </span>
            </span>
            <span id={`${uid}${c.idx}n`} className="block leading-snug text-[var(--muted)]">
              {c.word_count.toLocaleString()} words · pace {one(c.means.pace)} · tension{" "}
              {one(c.means.tension)} · {c.event_count} {c.event_count === 1 ? "event" : "events"}
            </span>
            <span className="mt-1 flex items-center gap-2 leading-tight">
              <WritingBar c={c} />
              <span className="text-[13px] text-[var(--muted)]">{mostly(c)}</span>
            </span>
            {/* A button's content is read as its name only, so the whole breakdown reaches a screen reader as the description. */}
            <span id={`${uid}${c.idx}w`} hidden>
              {shares(c).join(", ") || "no writing measured"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default memo(function ChapterTable({
  chapters,
  structure,
  onPinBeat,
}: {
  chapters: ChapterStat[];
  structure: Structure;
  onPinBeat: (i: number) => void;
}) {
  const [sort, setSort] = useState<SortKey>("idx");
  const phone = useMedia(PHONE);
  const rows = [...chapters].sort(
    (a, b) => sortValue(b, sort) - sortValue(a, sort) || a.idx - b.idx,
  );
  // Each title is a button only so the keyboard can reach its row; the row's own click does the pinning, for a click on the title too.
  const pin = (c: ChapterStat) => {
    const i = structure.beats.findIndex((b) => b.chapter_idx === c.idx);
    if (i >= 0) onPinBeat(i);
  };
  return (
    <div className="text-[14px]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="serif opsz-40 text-[17px] font-medium">Chapters</h2>
        {/* The table's headers sort from 640 px; a phone's list gets the same choice here, read as one quiet sentence with the choice underlined by a hairline. */}
        <label className="flex items-baseline gap-1.5 text-[14px] text-[var(--muted)] sm:hidden">
          Sorted by
          <select
            className={`${field} text-[var(--ink)]`}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      {phone ? (
        <PhoneList rows={rows} onPin={pin} />
      ) : (
        <WideTable rows={rows} sort={sort} onSort={setSort} onPin={pin} />
      )}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-[var(--muted)]">
        <span>Writing, what kind of prose fills the chapter:</span>
        {Object.keys(WRITING.kinds).map((k) => (
          <span key={k}>
            <span
              aria-hidden
              className="mr-1 inline-block h-[10px] w-[16px] rounded-[2px] align-[-1px]"
              style={{ background: writingBackground(k) }}
            />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
});
