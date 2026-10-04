import type { EventType } from "../types";

// Lucide (ISC) glyphs on its 24 grid, each icon's shapes joined into one path.
export const EVENT_PATHS: Record<EventType, string> = {
  reveal:
    "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  death:
    "M12.5 17l-.5-1-.5 1h1zM15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1zM14 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M8 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
  arrival_departure:
    "M10 21H2M10 3H7a2 2 0 00-2 2v16M14 12h.01M19 21V5a2 2 0 00-1.675-1.974l-6.163-1.013A1 1 0 0010 3v18a1 1 0 001.124.992zM22 21h-3",
  location_change:
    "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  confrontation:
    "M13 19l6-6M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5M14.828 6.172l2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586M16 16l4 4M19 21l2-2M5 14l4 4M5 21l-2-2M7.5 16.5 4 20",
  reconciliation:
    "M11 17l2 2a1 1 0 1 0 3-3M14 14l2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4M21 3l1 11h-2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8",
  decision:
    "M12 13v8M12 3v3M2.354 10.354a1.207 1.207 0 0 1 0-1.708l2.06-2.06A2 2 0 0 1 5.828 6h12.344a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H5.828a2 2 0 0 1-1.414-.586z",
  betrayal:
    "M12.409 5.824c-.702.792-1.15 1.496-1.415 2.166l2.153 2.156a.5.5 0 0 1 0 .707l-2.293 2.293a.5.5 0 0 0 0 .707L12 15M13.508 20.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 9.591-3.677.6.6 0 0 0 .818.001A5.5 5.5 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5z",
  injury_violence:
    "M10 10.01h.01M10 14.01h.01M14 10.01h.01M14 14.01h.01M18 6v12M6 6v12M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2z",
};
const UI_PATHS = {
  close: "M4 4l8 8M12 4l-8 8",
  chevron: "M5 3l5 5-5 5",
  search: "M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9M10.3 10.3l3.2 3.2",
  replay: "M3 8a5 5 0 1 0 1.5-3.6M3 2.5v3h3",
  question: "M6 6.2a2 2 0 1 1 3 1.7c-.8.5-1 .9-1 1.6M8 12.2v.1",
  sun: "M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1",
  moon: "M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a5 5 0 0 0 7 7z",
  // A circle half shaded by hatching, since the set is stroke only: half light, half dark, as the system has it.
  auto: "M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11v11M8 5h4.6M8 8h5.5M8 11h4.6",
} as const;

// Lucide (ISC) glyphs on its 24 grid for the actions of the reader's own work, drawn like the event glyphs.
const ACTION_PATHS = {
  bookmark: "M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  download: "M12 17V3M6 11l6 6 6-6M19 21H5",
  image:
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21",
} as const;

function Svg({
  d,
  size = 16,
  className,
  grid = 16,
}: {
  d: string;
  size?: number;
  className?: string;
  grid?: 16 | 24;
}) {
  return (
    <svg
      viewBox={`0 0 ${grid} ${grid}`}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={grid === 24 ? 1.75 : 1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
// An event glyph inside a drawing, centered on the origin at `size` units.
export function GlyphPath({
  type,
  size,
  strokeWidth = 1.75,
}: {
  type: EventType;
  size: number;
  strokeWidth?: number;
}) {
  return (
    <g transform={`translate(${-size / 2},${-size / 2}) scale(${size / 24})`}>
      <path
        d={EVENT_PATHS[type]}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
export function EventGlyph({ type, size }: { type: EventType; size?: number }) {
  return <Svg d={EVENT_PATHS[type]} size={size} grid={24} />;
}
export function ActionIcon({ name, size }: { name: keyof typeof ACTION_PATHS; size?: number }) {
  return <Svg d={ACTION_PATHS[name]} size={size} grid={24} />;
}
export function Icon({
  name,
  size,
  className,
}: {
  name: keyof typeof UI_PATHS;
  size?: number;
  className?: string;
}) {
  return <Svg d={UI_PATHS[name]} size={size} className={className} />;
}
