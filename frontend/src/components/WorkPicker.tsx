import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { GalleryEntry } from "../types";
import { fold } from "../lib/gallery";
import { field } from "../lib/ui";
import { Icon } from "./icons";
import { Sketch } from "./Plate";

// A gallery work carries its sparkline; a work of the reader's own carries a line about it instead.
export type Choice = { ref: string; title: string; author: string } & (
  { entry: GalleryEntry } | { note: string }
);

const POPOVER =
  "absolute inset-x-0 top-full z-20 mt-1 min-w-[16rem] rounded-md border border-[var(--rule)] bg-[var(--paper)] shadow-[0_8px_24px_var(--shadow)]";

function Row({
  c,
  id,
  active,
  onPick,
  onHover,
}: {
  c: Choice;
  id: string;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onClick={onPick}
      onMouseMove={onHover}
      className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-1.5 ${active ? "bg-[var(--select)] shadow-[inset_2px_0_0_var(--mark)]" : ""}`}
    >
      <span className="min-w-0">
        <span className="serif opsz-14 block truncate text-[15px] font-medium leading-tight">
          {c.title}
        </span>
        <span className="block truncate text-[13px] text-[var(--muted)]">{c.author}</span>
      </span>
      {"entry" in c ? (
        <Sketch g={c.entry} w={48} h={16} pad={1.5} className="block h-4 w-12" />
      ) : (
        <i className="serif text-[13px] text-[var(--muted)]">{c.note}</i>
      )}
    </div>
  );
}

// The file row's place in `active`: past every work, whatever the filter leaves.
const FILE = Infinity;

// An ARIA 1.2 combobox: the field filters by title and author, the list offers gallery works, then the reader's own, then a results file.
export default function WorkPicker({
  label,
  current,
  choices,
  onChange,
  onFile,
}: {
  label: string;
  current: string;
  choices: Choice[];
  onChange: (ref: string) => void;
  onFile: (file: File) => void;
}) {
  const id = useId();
  const file = useRef<HTMLInputElement>(null);
  // Set while the file dialog is up, so the field's focus coming back does not reopen the list.
  const dialog = useRef(false);
  // What the reader has typed; null shows the chosen work's title.
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = fold((text ?? "").trim());
  const shown = choices.filter((c) => fold(`${c.title} ${c.author}`).includes(q));
  const gallery = shown.filter((c) => "entry" in c);
  const own = shown.filter((c) => !("entry" in c));
  const ordered = [...gallery, ...own];
  // A filter that leaves fewer rows pulls the active one back with it, to none when nothing matches; typing never lands on the file row.
  const cur = active === FILE ? ordered.length : Math.min(active, ordered.length - 1);
  const optId = (i: number) => `${id}-o${i}`;
  const activeId = cur >= 0 ? optId(cur) : undefined;
  // The active row scrolls into the list's view as the arrow keys walk past its edge.
  useEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeId]);
  const close = () => {
    setOpen(false);
    setText(null);
    setActive(-1);
  };
  const pick = (c: Choice) => {
    onChange(c.ref);
    close();
  };
  const openFile = () => {
    dialog.current = true;
    file.current?.click();
    close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      const next = Math.max(0, cur + step);
      if (open) setActive(next >= ordered.length ? FILE : next);
    } else if (e.key === "Enter" && open && cur === ordered.length) {
      e.preventDefault();
      openFile();
    } else if (e.key === "Enter" && open && ordered[cur]) {
      e.preventDefault();
      pick(ordered[cur]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  };
  const row = (c: Choice, i: number) => (
    <Row
      key={c.ref}
      c={c}
      id={optId(i)}
      active={i === cur}
      onPick={() => pick(c)}
      onHover={() => setActive(i)}
    />
  );
  return (
    <div className="relative">
      <label htmlFor={`${id}-in`} className="label block">
        {label}
      </label>
      <input
        id={`${id}-in`}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? activeId : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder="Title or author"
        value={text ?? current}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={(e) => {
          if (dialog.current) {
            dialog.current = false;
            return;
          }
          setOpen(true);
          // Selected after the click has placed its caret, so typing replaces the chosen title.
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onBlur={() => {
          // A dialog takes the window's focus and leaves the flag; a move to another control clears it.
          if (document.hasFocus()) dialog.current = false;
          close();
        }}
        onKeyDown={onKey}
        className={`${field} serif opsz-14 w-full pr-6 text-[16px]`}
      />
      <Icon
        name="chevron"
        size={12}
        className="pointer-events-none absolute bottom-3 right-1 rotate-90 text-[var(--muted)]"
      />
      {open && (
        <div
          // A press anywhere in the list (a row, its label, the scrollbar) would otherwise blur the field and close it.
          onMouseDown={(e) => e.preventDefault()}
          className={`${POPOVER} max-h-[20rem] overflow-y-auto py-1`}
        >
          {ordered.length === 0 && (
            <div aria-hidden className="px-3 py-2 text-[14px] text-[var(--muted)]">
              No work by that title or author.
            </div>
          )}
          <div id={`${id}-list`} role="listbox" aria-label={label}>
            {gallery.map(row)}
            {own.length > 0 && (
              <div role="group" aria-labelledby={`${id}-own`}>
                <div id={`${id}-own`} className="label px-3 pb-0.5 pt-2">
                  Your works
                </div>
                {own.map((c, i) => row(c, gallery.length + i))}
              </div>
            )}
            <div
              id={optId(ordered.length)}
              role="option"
              aria-selected={cur === ordered.length}
              onClick={openFile}
              onMouseMove={() => setActive(FILE)}
              className={`hairline mt-1 flex min-h-[40px] cursor-pointer items-center px-3 text-[14px] text-[var(--ink)] ${cur === ordered.length ? "bg-[var(--select)] shadow-[inset_2px_0_0_var(--mark)]" : ""}`}
            >
              Open a results file…
            </div>
          </div>
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept=".json"
        hidden
        aria-label={`Results file for the ${label.toLowerCase()}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // Emptied, so choosing the same file again still counts as a change.
          e.target.value = "";
        }}
      />
      {/* Always present and only its text changes, so a screen reader announces the change. */}
      <p role="status" className="sr-only">
        {open && ordered.length === 0 ? "No work by that title or author." : ""}
      </p>
    </div>
  );
}
