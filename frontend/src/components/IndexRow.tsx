import { Link } from "react-router";
import type { GalleryEntry } from "../types";
import { familyOf } from "../lib/gallery";
import { SHAPE_INFO } from "../lib/definitions";
import { Sketch } from "./Plate";
import { useTitleTravel } from "../lib/motion";

export default function IndexRow({
  g,
  to = `/gallery/${g.slug}`,
}: {
  g: GalleryEntry;
  to?: string;
}) {
  const travel = useTitleTravel(to);
  return (
    <li>
      <Link
        to={to}
        viewTransition
        className="press-soft grid items-center gap-x-6 gap-y-1 border-b border-[var(--rule)] py-2.5 transition-[background-color,opacity] hover:bg-[var(--select)] focus-visible:bg-[var(--select)] sm:grid-cols-[1fr_auto_170px]"
      >
        <div className="min-w-0">
          <div className="serif opsz-14 text-[18px] font-medium leading-tight" style={travel}>
            {g.title}
          </div>
          <div className="text-[14px] text-[var(--muted)]">{g.author}</div>
        </div>
        <span className="serif text-[13.5px] italic text-[var(--muted)] sm:whitespace-nowrap">
          {SHAPE_INFO[familyOf(g)].name} · {Math.round(g.word_count / 1000)}k words
        </span>
        <Sketch
          g={g}
          w={170}
          h={34}
          pad={3}
          className="block h-[34px] w-full max-w-[340px] sm:w-[170px]"
        />
      </Link>
    </li>
  );
}
