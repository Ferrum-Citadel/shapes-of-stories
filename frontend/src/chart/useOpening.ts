import { useCallback, useState, type RefObject } from "react";
import { prefersReducedMotion } from "../lib/motion";
import { hasSeen, markSeen } from "../lib/storage";

// The opening stroke plays on a first visit and can be replayed; it ends by clearing drawIn, so a later change of smoothing does not replay it.
export function useOpening(seenKey: string, chart: RefObject<HTMLDivElement | null>) {
  const [drawIn, setDrawIn] = useState(() => !hasSeen(seenKey));
  const [replays, setReplays] = useState(0);
  const replay = useCallback(() => {
    chart.current?.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    setDrawIn(true);
    setReplays((n) => n + 1);
  }, [chart]);
  const onDrawn = useCallback(() => {
    markSeen(seenKey);
    setDrawIn(false);
  }, [seenKey]);
  return { drawIn, replays, replay, onDrawn };
}
