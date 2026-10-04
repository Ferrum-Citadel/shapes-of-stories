import {
  isScored,
  type Analysis,
  type Axis,
  type BeatAnswers,
  type Chapter,
  type ChapterStat,
  type Structure,
} from "../types";
import { chapterName, chapterTitleOfBeat } from "./bins";
import { AXIS_INFO, shapeInfo } from "./definitions";

// A shape's name in a sentence is lower case, but the people some shapes are named after keep their capital.
const lower = (name: string) =>
  name.replace(/\b(?!Cinderella|Icarus|Oedipus)\w+/g, (w) => w.toLowerCase());
const article = (name: string) => `${/^[aeiou]/i.test(name) ? "an" : "a"} ${lower(name)}`;

function shapeClause(a: Analysis["archetype"]): string {
  if (a.state === "none") return "No clear shape";
  const name = article(shapeInfo(a)?.name ?? a.caption);
  return a.state === "leans" ? `Leans toward ${name}` : name[0].toUpperCase() + name.slice(1);
}

// The highest and the lowest of the chapters with a mean for this layer; a tie goes to the earlier chapter.
function extremes(chapters: ChapterStat[], axis: "fortune" | "tension") {
  const known = chapters.filter((c) => c.means[axis] != null);
  if (known.length < 2) return null;
  const v = (c: ChapterStat) => c.means[axis]!;
  const hi = known.reduce((m, c) => (v(c) > v(m) ? c : m));
  const lo = known.reduce((m, c) => (v(c) < v(m) ? c : m));
  return hi === lo ? null : { hi, lo };
}

// "A tragedy: fortune peaks in chapter V and falls to its lowest in IX; tension highest in VII."
export function readingSentence(analysis: Analysis, chapters: Chapter[] = []): string {
  let named = false;
  // The first chapter named by a numeral is called "chapter V", the rest only "IX".
  const place = (c: ChapterStat) => {
    const name = chapterName(chapters[c.idx]?.title ?? c.title, c.idx);
    if (name.startsWith("around ")) return name;
    if (!name.startsWith("chapter ")) return `in ${name}`;
    const said = named ? name.slice("chapter ".length) : name;
    named = true;
    return `in ${said}`;
  };
  const clauses: string[] = [];
  const f = extremes(analysis.chapters, "fortune");
  if (f)
    clauses.push(
      f.hi.idx < f.lo.idx
        ? `fortune peaks ${place(f.hi)} and falls to its lowest ${place(f.lo)}`
        : `fortune is lowest ${place(f.lo)} and climbs to its height ${place(f.hi)}`,
    );
  const t = extremes(analysis.chapters, "tension");
  if (t) clauses.push(`tension highest ${place(t.hi)}`);
  const shape = shapeClause(analysis.archetype);
  return clauses.length ? `${shape}: ${clauses.join("; ")}.` : `${shape}.`;
}

// What a screen reader hears as the passage under the pointer or the keys changes.
export function passageSummary(
  structure: Structure,
  beat: number,
  answers: BeatAnswers | undefined,
  axes: Axis[],
  pinned: boolean,
) {
  const scores =
    answers && isScored(answers)
      ? `: ${axes.map((a) => `${AXIS_INFO[a].name} ${answers.scores[a].score.toFixed(1)}`).join(", ")}`
      : "";
  return `Passage ${beat + 1} of ${structure.beats.length} · ${chapterTitleOfBeat(structure, beat)}${scores}${pinned ? " · pinned" : ""}`;
}
