import { cloneElement, useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { panelOffset } from "../lib/ui";

const WIDTH = 260;

// A short note for whatever it wraps, shown while that is hovered or focused; the child must be focusable itself.
export default function Tip({
  text,
  children,
}: {
  text: ReactNode;
  children: ReactElement<{ "aria-describedby"?: string }>;
}) {
  // The panel's offset from the child while it is shown, null while it is hidden.
  const [left, setLeft] = useState<number | null>(null);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  // An empty text keeps the panel closed while the child stays hovered or focused.
  const open = left !== null && !!text;
  const show = () => {
    if (wrap.current) setLeft(panelOffset(wrap.current, WIDTH).left);
  };
  const hide = () => setLeft(null);
  // Hover and focus each keep it open, so a pointer leaving a focused child does not hide it.
  const hovered = useRef(false),
    focused = useRef(false);
  const track = (r: typeof hovered, on: boolean) => {
    r.current = on;
    if (on) show();
    else if (!hovered.current && !focused.current) hide();
  };
  // Listened for on the document, so Escape also dismisses a tooltip opened by the pointer alone.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <span
      ref={wrap}
      className="relative inline-flex"
      onMouseEnter={() => track(hovered, true)}
      onMouseLeave={() => track(hovered, false)}
      onFocus={() => track(focused, true)}
      onBlur={() => track(focused, false)}
    >
      {cloneElement(children, { "aria-describedby": open ? id : undefined })}
      {open && (
        // The pointer passes through, so a panel over the next bar down never stands between it and that bar.
        <span className="pointer-events-none absolute top-full z-20 pt-1.5" style={{ left }}>
          <span
            id={id}
            role="tooltip"
            className="enter quick panel block w-max rounded-md px-2.5 py-1.5 text-[13px] leading-snug"
            style={{ maxWidth: `min(${WIDTH}px, 85vw)` }}
          >
            {text}
          </span>
        </span>
      )}
    </span>
  );
}
