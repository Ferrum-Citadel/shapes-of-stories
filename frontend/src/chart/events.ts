import type { EventMarker } from "../types";
import { xOf } from "./ChartFrame";

export type Cluster = { x: number; top: EventMarker; members: EventMarker[]; beat: number };

// A bead is 22 units across, so beads this far apart never touch.
const GAP = 24;

// An event joins the last bead when it falls within a bead's width of where that bead is drawn, so beads never overlap; the bead only ever moves right, keeping its distance from the one before.
export function clusterEvents(events: EventMarker[], width: number): Cluster[] {
  const clusters: Cluster[] = [];
  const strong = events
    .filter((e) => e.strength === "strong")
    .map((e) => ({ e, x: xOf(e.bin, width) }))
    .sort((a, b) => a.x - b.x || a.e.beat_idx - b.e.beat_idx);
  for (const { e, x } of strong) {
    const last = clusters.at(-1);
    if (!last || x - last.x >= GAP) {
      clusters.push({ x, top: e, members: [e], beat: e.beat_idx });
      continue;
    }
    last.members.push(e);
    if (e.probability > last.top.probability) Object.assign(last, { x, top: e, beat: e.beat_idx });
  }
  return clusters;
}
