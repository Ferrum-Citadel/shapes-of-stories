import { memo, useEffect, useRef } from "react";
import Popover from "./Popover";
import { target } from "../lib/ui";
interface Props {
  smoothing: number;
  onSmoothing: (v: number, live: boolean) => void;
  band: boolean;
  onBand: (v: boolean) => void;
  points: boolean;
  onPoints: (v: boolean) => void;
}
const STOP_NAMES = ["detail", "mostly detail", "halfway", "mostly shape", "shape"];
const STOPS = STOP_NAMES.length - 1;
// A mouse needs less room than a finger, so on a fine pointer the controls sit in the same 32 px rows as the layer chips.
export default memo(function ViewControls({
  smoothing,
  onSmoothing,
  band,
  onBand,
  points,
  onPoints,
}: Props) {
  // Only a drag is live, so a plain click on the track tweens; React's onChange is the input event, so the release, which is the native change, is heard directly.
  const range = useRef<HTMLInputElement>(null);
  const down = useRef(false),
    held = useRef(false);
  useEffect(() => {
    const el = range.current!;
    const release = () => {
      down.current = held.current = false;
      onSmoothing(Number(el.value), false);
    };
    el.addEventListener("change", release);
    return () => el.removeEventListener("change", release);
  }, [onSmoothing]);
  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => set(!on)}
      className={`${target} min-w-[40px] px-1 text-[13.5px] ${on ? "text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
    >
      {label}
    </button>
  );
  const dot = (
    <span aria-hidden className="text-[var(--muted)]">
      ·
    </span>
  );
  const end = "text-[13px] text-[var(--muted)]";
  return (
    <div className="flex flex-wrap items-center gap-x-3 text-[13.5px] max-sm:w-full">
      <div className="flex items-center gap-2 max-sm:w-full">
        <span aria-hidden className={end}>
          Detail
        </span>
        <input
          ref={range}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={smoothing}
          onPointerDown={() => (down.current = true)}
          onPointerMove={() => (held.current = down.current)}
          onPointerUp={() => (down.current = held.current = false)}
          onPointerCancel={() => (down.current = held.current = false)}
          onChange={(e) => onSmoothing(Number(e.target.value), held.current)}
          aria-label="Smoothing, from detail to shape"
          aria-valuetext={STOP_NAMES[Math.round(smoothing * STOPS)]}
          className={`smoothing ${target} w-[9rem] max-sm:min-w-0 max-sm:flex-1`}
        />
        <span aria-hidden className={end}>
          Shape
        </span>
      </div>
      <div role="group" aria-label="Chart details" className="flex items-center gap-2">
        {toggle("band", band, onBand)}
        {dot}
        {toggle("points", points, onPoints)}
        <Popover label="What the controls show" title="Band, points, smoothing">
          <p>
            The band shows how sure the reading was; wider is less sure. The points are the readings
            before smoothing. The slider sets how much smoothing, from the detail curve to the shape
            curve.
          </p>
        </Popover>
      </div>
    </div>
  );
});
