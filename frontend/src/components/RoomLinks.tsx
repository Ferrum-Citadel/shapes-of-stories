import { Link } from "react-router";
import { link } from "../lib/ui";

type Neighbor = { slug: string; title: string };
export type Room = { prev?: Neighbor; next?: Neighbor };

const linkClass = `${link} inline-flex min-h-[40px] items-center`;

// The works on either side of this one in its gallery family, in title order.
export default function RoomLinks({ room: { prev, next } }: { room: Room }) {
  if (!prev && !next) return null;
  return (
    <nav aria-label="In this room" className="flex flex-wrap items-center gap-x-4 text-[14px]">
      <span className="label">In this room</span>
      {prev && (
        <Link to={`/gallery/${prev.slug}`} className={linkClass} viewTransition>
          <span aria-hidden>←&nbsp;</span>
          {prev.title}
        </Link>
      )}
      {next && (
        <Link to={`/gallery/${next.slug}`} className={linkClass} viewTransition>
          {next.title}
          <span aria-hidden>&nbsp;→</span>
        </Link>
      )}
    </nav>
  );
}
