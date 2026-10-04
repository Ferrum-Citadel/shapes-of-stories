import { useEffect, useState } from "react";

const ASTRAL = /[\uD800-\uDBFF]/;

// A book's text is fetched only once it is first wanted, since most visits never open a passage; it is kept for later passages and dropped if the page closes first.
export function useTextOnDemand(url: string | undefined, wanted: boolean) {
  const [asked, setAsked] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (wanted && !asked) setAsked(true);
  useEffect(() => {
    if (!url || !asked) return;
    const stop = new AbortController();
    fetch(url, { signal: stop.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(setText, () => {
        if (!stop.signal.aborted) setFailed(true);
      });
    return () => stop.abort();
  }, [url, asked, attempt]);
  return {
    text,
    failed,
    retry: () => {
      setFailed(false);
      setAttempt((n) => n + 1);
    },
  };
}
// Offsets count code points, so a book with characters outside the BMP is sliced from its array of them; nothing here holds on to the text, so it goes with the page that loaded it.
export function makeSlicer(text: string): (start: number, end: number) => string {
  if (!ASTRAL.test(text)) return (s, e) => text.slice(s, e);
  const cps = Array.from(text);
  return (s, e) => cps.slice(s, e).join("");
}
// Splitting a beat on "\n\n" gives the server's paragraph indexes (passage_paragraph_spans), also when the beat starts or ends inside a paragraph.
export function paragraphsOf(
  slicer: (start: number, end: number) => string,
  start: number,
  end: number,
): string[] {
  const slice = slicer(start, end);
  const paras = slice.split("\n\n").filter((p) => p.trim().length > 0);
  return paras.length > 0 ? paras : [slice];
}
