import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { hasSeen, markSeen } from "./storage";
import { coarse } from "./ui";

export function useSelection(total: number) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  // Unpinning also drops the hover, which a touch screen never clears on its own.
  const pin = useCallback(
    (i: number) => {
      if (pinned === i) {
        setPinned(null);
        setHover(null);
      } else setPinned(i);
    },
    [pinned],
  );
  const unpin = useCallback(() => setPinned(null), []);
  const select = useCallback(
    (i: number) => setPinned(Math.max(0, Math.min(total - 1, i))),
    [total],
  );
  const onKeyDown = (e: KeyboardEvent) => {
    const cur = pinned ?? hover;
    let next: number | null;
    if (e.key === "ArrowRight") next = cur === null ? 0 : Math.min(total - 1, cur + 1);
    else if (e.key === "ArrowLeft") next = cur === null ? 0 : Math.max(0, cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = total - 1;
    else if (e.key === "Escape") next = null;
    else return;
    e.preventDefault();
    // A step drops the hover, so the column and the summary follow the keys while the mouse rests on the chart.
    if (next !== null) setHover(null);
    setPinned(next);
  };
  // The pointer keeps reading the chart while a passage is pinned; let go of the chart and the pinned one shows again.
  return { pinned, shown: hover ?? pinned, setHover, pin, unpin, select, onKeyDown };
}

const PIN_HINT = "sos.seen.pinhint";

// The first pin on this device says Escape lets go, for as long as that passage stays pinned; a finger has no Escape.
export function usePinHint(pinned: number | null) {
  const [beat, setBeat] = useState<number | null | false>(() =>
    coarse() || hasSeen(PIN_HINT) ? false : null,
  );
  if (beat === null && pinned !== null) setBeat(pinned);
  else if (typeof beat === "number" && pinned !== beat) setBeat(false);
  useEffect(() => {
    if (typeof beat === "number") markSeen(PIN_HINT);
  }, [beat]);
  return typeof beat === "number" && beat === pinned;
}
