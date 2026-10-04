import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigationType, useSearchParams } from "react-router";
import type { GalleryEntry } from "../types";
import { asEntry, keptMine, listLocal, setKeptMine } from "../lib/local";
import {
  INDEX,
  byTitle,
  fold,
  forgetFile,
  galleryFile,
  groupByFamily,
  keptFile,
} from "../lib/gallery";
import Plate, { Invite } from "../components/Plate";
import IndexRow from "../components/IndexRow";
import { Icon } from "../components/icons";
import { field, link, pageTitle, quiet, segment } from "../lib/ui";
import { justLeft } from "../lib/motion";

const GRID = "grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 min-[900px]:grid-cols-3";
const ONES =
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(
    " ",
  );
const TENS = "twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
// The placeholder reads as prose, so the count is spelled out below a hundred.
const inWords = (n: number) =>
  n < 20
    ? ONES[n]
    : n < 100
      ? TENS[Math.floor(n / 10) - 2] + (n % 10 ? `-${ONES[n % 10]}` : "")
      : String(n);
// "/" anywhere on the wall goes to the search, unless the reader is typing elsewhere or holding a shortcut.
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function Head({ id, name, note }: { id?: string; name: string; note: string }) {
  return (
    <div className="serif mb-4 flex flex-col gap-x-3.5 gap-y-1 sm:flex-row sm:items-baseline">
      <h2 id={id} className="opsz-40 shrink-0 text-[22px] font-medium leading-tight">
        {name}
      </h2>
      <p className="opsz-14 max-w-[68ch] text-[15px] italic text-[var(--muted)]">{note}</p>
    </div>
  );
}

export default function Gallery() {
  // A wall already fetched this visit is drawn at once, so a title traveling back finds its plate.
  const [items, setItems] = useState<GalleryEntry[]>(() => keptFile(INDEX) ?? []);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(() =>
    keptFile(INDEX) ? "ready" : "loading",
  );
  // The arrangement and the filter live in the address, so a step back from a work finds the wall as it was left and its title the plate or row it came from.
  const [params, setParams] = useSearchParams();
  const mode = params.get("view") === "title" ? "title" : "shape";
  // The field keeps its own copy, so typing never waits on the address; only a move from elsewhere, such as the bar's link to the bare wall, resets it.
  const urlQ = params.get("q") ?? "";
  const how = useNavigationType();
  const [q, setQ] = useState(urlQ);
  const [seen, setSeen] = useState(urlQ);
  if (urlQ !== seen) {
    setSeen(urlQ);
    if (how !== "REPLACE") setQ(urlQ);
  }
  const keep = (k: "view" | "q", v: string) =>
    setParams(
      (p) => {
        if (v) p.set(k, v);
        else p.delete(k);
        return p;
      },
      { replace: true, preventScrollReset: true },
    );
  const uid = useId();
  const wall = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  // Where focus was when "/" moved it to the search, so Escape can give it back.
  const cameFrom = useRef<Element | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.defaultPrevented || e.isComposing || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      e.preventDefault();
      cameFrom.current = document.activeElement;
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Arriving straight from a work, the wall centers its plate before the new page is pictured, so the traveling title lands in view; this runs after the scroll restoration.
  useLayoutEffect(() => {
    const path = justLeft();
    if (!path) return;
    const at = [...wall.current!.querySelectorAll("a")].find(
      (a) => a.getAttribute("href") === path,
    );
    at?.scrollIntoView?.({ block: "center" });
  }, []);
  // The reader's own works, kept for the visit so a step back draws their plates at once; a store the browser refuses leaves the wall as it is.
  const [mine, setMine] = useState<GalleryEntry[]>(() => keptMine() ?? []);
  useEffect(() => {
    listLocal()
      .then((ls) => {
        const m = ls.flatMap(asEntry);
        setKeptMine(m);
        setMine(m);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    galleryFile<GalleryEntry[]>(INDEX)
      .then((d) => {
        setItems(d);
        setStatus("ready");
      })
      .catch(() => {
        forgetFile(INDEX);
        setStatus("failed");
      });
  }, []);
  const needle = fold(q.trim());
  const ready = status === "ready";
  const match = (g: GalleryEntry) => !needle || fold(`${g.title} ${g.author}`).includes(needle);
  const shown = items.filter(match);
  const mineShown = mine.filter(match);
  const families = groupByFamily(shown);
  const own = (rows: boolean) =>
    mineShown.length > 0 && (
      <section aria-labelledby={`${uid}-mine`} className="hairline pt-5">
        <Head id={`${uid}-mine`} name="Your works" note="Analyzed on this device, and kept here." />
        {rows ? (
          <ul>
            {byTitle(mineShown).map((g) => (
              <IndexRow key={g.slug} g={g} to={`/works/${g.slug}`} />
            ))}
          </ul>
        ) : (
          <ul className={GRID}>
            {mineShown.map((g) => (
              <Plate key={g.slug} g={g} to={`/works/${g.slug}`} />
            ))}
            {ready && families.length === 0 && <Invite />}
          </ul>
        )}
      </section>
    );
  return (
    <div ref={wall} className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <title>Shapes of Stories</title>
          <h1 className={pageTitle}>Every story has a shape</h1>
          <p className="mt-2 max-w-[560px] text-[13.5px] text-[var(--muted)]">
            {ready ? `${items.length} public-domain classics` : "Public-domain classics"}, read
            passage by passage and drawn as the rise and fall of their characters' fortunes. Browse
            without a key;{" "}
            <Link to="/import" className={link} viewTransition>
              analyze your own book
            </Link>{" "}
            for about two cents.
          </p>
        </div>
        {/* The search is 18 rem beside the switch, and takes its own full line on a phone. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px]">
          <div className="relative w-full sm:w-72">
            <Icon
              name="search"
              className="pointer-events-none absolute left-0.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              ref={search}
              type="search"
              aria-label="Find a title or author"
              placeholder={`Search ${ready ? `${inWords(items.length)} books` : "the books"} by title or author`}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                keep("q", e.target.value);
              }}
              onBlur={() => (cameFrom.current = null)}
              onKeyDown={(e) => {
                if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
                // Escape would clear a search field; the typed text stays.
                e.preventDefault();
                const back = cameFrom.current;
                if (back instanceof HTMLElement && document.contains(back)) back.focus();
                if (document.activeElement === e.currentTarget) e.currentTarget.blur();
              }}
              className={`peer w-full pl-6 pr-6 [&::-webkit-search-cancel-button]:appearance-none ${field}`}
            />
            {/* The hint shows only while the field is empty and unfocused, and only where there is a keyboard. */}
            <kbd className="pointer-events-none absolute right-0.5 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--rule)] px-1.5 font-[inherit] text-[11px] leading-[16px] text-[var(--muted)] [@media(pointer:fine)]:peer-[:placeholder-shown:not(:focus)]:block">
              /
            </kbd>
          </div>
          <fieldset role="radiogroup" aria-label="Arrange" className={`shrink-0 ${segment.group}`}>
            {(["shape", "title"] as const).map((m) => (
              <label key={m} className={segment.option}>
                <input
                  type="radio"
                  name={uid}
                  className="sr-only"
                  checked={mode === m}
                  onChange={() => keep("view", m === "title" ? m : "")}
                />
                By {m}
              </label>
            ))}
          </fieldset>
        </div>
      </div>
      {own(mode === "title")}
      {!ready && (
        <p role="status" className={quiet}>
          {status === "loading" ? "Loading the wall…" : "The gallery could not be loaded."}
        </p>
      )}
      {ready && items.length > 0 && shown.length + mineShown.length === 0 && (
        <p role="status" className={quiet}>
          Nothing by that name here.{" "}
          <Link
            to="/import"
            className={`inline-flex min-h-[40px] items-center ${link}`}
            viewTransition
          >
            Analyze it?
          </Link>
        </p>
      )}
      {ready &&
        (mode === "shape" ? (
          families.map((f, i, all) => (
            <section key={f.key} aria-labelledby={`${uid}-${f.key}`} className="hairline pt-5">
              <Head
                id={`${uid}-${f.key}`}
                name={f.name}
                note={f.quote ? `${f.description} ${f.quote}` : f.description}
              />
              <ul className={GRID}>
                {f.items.map((g) => (
                  <Plate key={g.slug} g={g} />
                ))}
                {i === all.length - 1 && <Invite />}
              </ul>
            </section>
          ))
        ) : (
          <ul className="hairline">
            {mineShown.length > 0 && shown.length > 0 && (
              <li className="pt-5">
                <Head name="The gallery" note="Public-domain classics." />
              </li>
            )}
            {byTitle(shown).map((g) => (
              <IndexRow key={g.slug} g={g} />
            ))}
            <Invite className="mt-5" />
          </ul>
        ))}
    </div>
  );
}
