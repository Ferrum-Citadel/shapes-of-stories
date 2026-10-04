import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ApiError, api } from "../api/client";
import { loadLocal, saveLocal } from "../lib/local";
import { TERMINAL, watchWork } from "../lib/sse";
import type { Analysis, BeatAnswers, LocalWork, WorkState, WorkView } from "../types";

// Seconds left at the pace seen so far, once three passages have been timed; none before.
export function timeLeft(
  start: { t: number; done: number },
  now: number,
  done: number,
  total: number,
): number | null {
  const timed = done - start.done;
  return timed < 3 ? null : Math.round(((total - done) * (now - start.t)) / 1000 / timed);
}

type Progress = {
  state: WorkState;
  done: number;
  total: number;
  queuePosition: number | null;
  error: string | null;
};
const START: Progress = { state: "queued", done: 0, total: 0, queuePosition: null, error: null };
const merge = (p: Progress, next: Partial<Progress>): Progress => ({ ...p, ...next });

export function useWork(id: string) {
  const [work, setWork] = useState<WorkView | null>(null);
  const [local, setLocal] = useState<LocalWork | undefined>();
  const [answers, setAnswers] = useState<Record<number, BeatAnswers>>({});
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [progress, setProgress] = useReducer(merge, START);
  // Bumped to reopen a stream the browser gave up on while the work still runs.
  const [reconnect, setReconnect] = useState(0);
  // The pace is timed from the first count this page hears, so a page opened mid-run times only what it sees.
  const pace = useRef<{ t: number; done: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // onComplete needs the latest answers without making the watcher effect below depend on them, so the handlers keep this in step as answers arrive.
  const answersRef = useRef(answers);
  const addAnswers = (more: Record<number, BeatAnswers>) => {
    answersRef.current = { ...answersRef.current, ...more };
    setAnswers(answersRef.current);
  };
  const refresh = useCallback(async () => {
    const w = await api.getWork(id);
    setWork(w);
    setProgress({
      state: w.state,
      done: w.done,
      total: w.total,
      queuePosition: w.queue_position,
      error: w.error,
    });
    if (!w.analysis) return w;
    setAnalysis(w.analysis);
    // A work that finished while its page was closed never saw the stream end, so its results, and the question set and model that scored them, reach this device here.
    const l = await loadLocal(id).catch(() => undefined);
    if (
      l &&
      (!l.analysis ||
        l.question_set_version !== w.question_set_version ||
        l.model_id !== w.model_id ||
        l.cost_usd !== w.cost_usd)
    ) {
      const merged = {
        ...l,
        analysis: w.analysis,
        question_set_version: w.question_set_version,
        model_id: w.model_id,
        cost_usd: w.cost_usd,
        answers: { ...l.answers, ...answersRef.current },
        savedAt: Date.now(),
      };
      setLocal(merged);
      await saveLocal(merged).catch(() => {});
    }
    return w;
  }, [id]);
  // Answers the stream has already sent are newer than the device's copy, so they win.
  useEffect(() => {
    loadLocal(id)
      .then((l) => {
        setLocal(l);
        if (l) {
          answersRef.current = { ...l.answers, ...answersRef.current };
          setAnswers(answersRef.current);
        }
      })
      .catch(() => {});
    // refresh sets state only after its first await, so nothing here is set synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((e: unknown) =>
      setProgress({ error: e instanceof ApiError ? e.code : "load_failed" }),
    );
  }, [id, refresh]);
  const workState = work?.state;
  const ticket = work?.events_ticket;
  useEffect(() => {
    if (workState === undefined || ticket === undefined || TERMINAL.has(workState)) return;
    let open = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      if (open) retry = setTimeout(() => setReconnect((n) => n + 1), 2000);
    };
    const stop = watchWork(id, ticket, {
      onSnapshot: (s) => {
        pace.current = { t: Date.now(), done: s.done };
        setSecondsLeft(null);
        setProgress({
          state: s.state,
          done: s.done,
          total: s.total,
          queuePosition: s.queue_position,
        });
        addAnswers(Object.fromEntries(s.beats.map((b) => [b.idx, b.answers])));
      },
      onBeat: (b) => {
        addAnswers({ [b.idx]: b.answers });
        pace.current ??= { t: Date.now(), done: b.done - 1 };
        setSecondsLeft(timeLeft(pace.current, Date.now(), b.done, b.total));
        setProgress({ state: "running", done: b.done, total: b.total });
      },
      // Refreshing on a terminal state updates work.state, which reopens this stream after Resume.
      onState: (s) => {
        setProgress(s.error ? { state: s.state, error: s.error } : { state: s.state });
        // A pause would count as time spent on passages, so the pace starts again after it.
        if (s.state === "paused") {
          pace.current = null;
          setSecondsLeft(null);
        }
        if (TERMINAL.has(s.state)) refresh().catch(() => {});
      },
      // The device's copy is saved before the refresh: an unkept work leaves the server within the hour, and a failed refresh must not cost the device its results.
      onComplete: (a) => {
        setAnalysis(a);
        setProgress({ state: "complete" });
        loadLocal(id)
          .then((l) => {
            if (!l) return;
            const merged = { ...l, analysis: a, answers: answersRef.current, savedAt: Date.now() };
            setLocal(merged);
            return saveLocal(merged);
          })
          .catch(() => {})
          .then(() => refresh())
          .catch(() => {});
      },
      // A stream dropped mid-run, say by a deploy, is reopened unless the work has ended or is gone.
      onClosed: () => {
        refresh().then(
          (w) => {
            if (!TERMINAL.has(w.state)) later();
          },
          (e: unknown) => {
            if (!(e instanceof ApiError && e.code === "not_found")) return later();
            setWork(null);
            setProgress({ error: e.code });
          },
        );
      },
    });
    return () => {
      open = false;
      stop();
      clearTimeout(retry);
    };
    // Depends on the work's state, not on `work` or `answers`, which would reopen the stream and replay its snapshot on every beat and refresh.
  }, [id, workState, ticket, refresh, reconnect]);
  return { work, local, answers, analysis, ...progress, secondsLeft, refresh };
}
