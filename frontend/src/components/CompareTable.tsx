import { Swatch } from "./LayerChips";
import ScoreBar from "./ScoreBar";
import { SIDES } from "../chart/CompareChart";

// The two-column tables of the comparison share these rows and cells.
export const TABLE = "w-full table-fixed border-collapse text-[14px]";
export const ROW = "border-b border-[var(--rule)]";
export const CELL = "py-2 pr-3 text-left align-middle font-normal";

// A work's swatch and its title on one line, so the columns are told apart without their colors.
export function Titled({ name, i }: { name: string; i: 0 | 1 }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Swatch {...SIDES[i]} />
      <span
        title={name}
        className="serif opsz-14 line-clamp-2 text-[15px] font-medium leading-tight"
      >
        {name}
      </span>
    </span>
  );
}

// The header row, once per table: an empty corner, then each work's swatch and title.
export function TitleRow({ names }: { names: [string, string] }) {
  return (
    <thead>
      <tr className={ROW}>
        <td className="w-[36%] sm:w-auto" />
        {names.map((n, i) => (
          <th key={i} scope="col" className={`${CELL} w-[32%] sm:w-[13rem]`}>
            <Titled name={n} i={i as 0 | 1} />
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function Bars({ a, b, max }: { a: number | null; b: number | null; max: number }) {
  return (
    <>
      {([a, b] as const).map((v, i) => (
        <td key={i} className={`${CELL} text-[13px]`}>
          <ScoreBar score={v} max={max} color={SIDES[i].color} />
        </td>
      ))}
    </>
  );
}
