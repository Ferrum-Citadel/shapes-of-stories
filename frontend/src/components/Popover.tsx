import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { panelOffset } from "../lib/ui";
import { Icon } from "./icons";

const WIDTH = 300;

export default function Popover({
  label,
  title,
  children,
  className = "",
}: {
  label: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState({ left: 0, width: WIDTH });
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const leaveTimer = useRef<number | undefined>(undefined),
    openTimer = useRef<number | undefined>(undefined);
  // Hover and focus open it for as long as they last; a click or a tap pins it until the next one, so the click that follows a hover, or the tap that also hovers and focuses, never closes it.
  const pinned = useRef(false);
  // Placed from its button and the page's own width before it is first drawn, since a phone's innerWidth grows with whatever overflows and a panel drawn past the edge makes it jump.
  const place = () => {
    if (wrap.current) setAt(panelOffset(wrap.current, WIDTH));
  };
  const show = () => {
    window.clearTimeout(leaveTimer.current);
    window.clearTimeout(openTimer.current);
    if (!open) {
      pinned.current = false;
      place();
    }
    setOpen(true);
  };
  // A mouse has to rest on the "?" for a moment, so passing over it does not open the card; focus and a tap open it at once.
  const showSoon = () => {
    window.clearTimeout(leaveTimer.current);
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(show, 250);
  };
  const hideSoon = () => {
    window.clearTimeout(openTimer.current);
    if (pinned.current) return;
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setOpen(false), 150);
  };
  useEffect(
    () => () => {
      window.clearTimeout(leaveTimer.current);
      window.clearTimeout(openTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <span
      ref={wrap}
      className={`relative inline-flex ${className}`}
      onMouseEnter={open ? show : showSoon}
      onMouseLeave={hideSoon}
      // Escape closes only the popover, not a drawer around it.
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onFocus={show}
        onBlur={(e) => {
          if (e.relatedTarget instanceof Node && !wrap.current?.contains(e.relatedTarget))
            pinned.current = false;
          hideSoon();
        }}
        onClick={() => {
          if (open && pinned.current) setOpen(false);
          else {
            show();
            pinned.current = true;
          }
        }}
        className="relative inline-grid h-[18px] w-[18px] place-items-center rounded-full border text-[var(--muted)] hover:text-[var(--ink)] after:absolute after:-inset-[12px] after:content-['']"
        style={{ borderColor: "var(--rule)" }}
      >
        <Icon name="question" size={12} />
      </button>
      {open && (
        <div
          id={id}
          className="enter quick panel absolute top-7 z-20 rounded-lg p-3 text-[14px] leading-relaxed"
          style={at}
        >
          <div className="serif opsz-14 mb-1 text-[14px] font-medium">{title}</div>
          {children}
        </div>
      )}
    </span>
  );
}
