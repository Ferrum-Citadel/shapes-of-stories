import { useEffect, useId, useState, type ReactNode } from "react";
import { AXIS_INFO, EVENT_NAMES, HOW_TO_READ, REPO_URL } from "../lib/definitions";
import { CREDITS } from "../lib/credits";
import type { Axis, EventType } from "../types";
import { GROUPS } from "../lib/layers";
import { link, pageTitle } from "../lib/ui";
import { getJson } from "../api/client";
import { useLocation } from "react-router";
import { SKETCHES } from "../components/Explainer";
import { Icon } from "../components/icons";

interface Questions {
  version: string;
  axes: { key: string; name: string; question: string; levels: string[] }[];
  events: { key: string; name: string; question: string }[];
}

// The running head, set the same on a section and on a folded group.
const HEAD = "serif opsz-40 text-[21px] font-medium leading-tight";
const H2 = `${HEAD} mb-3`;
const H4 = "serif opsz-40 mt-5 text-[17px] font-medium leading-tight first-letter:uppercase";
const P = "serif opsz-14 mt-2 max-w-[36rem] text-[15px] leading-normal";

// Field names in the questions are written in backticks; set them as code.
const withCode = (s: string): ReactNode[] =>
  s.split(/`([^`]+)`/).map((part, i) =>
    i % 2 ? (
      <code key={i} className="text-[0.85em]">
        {part}
      </code>
    ) : (
      part
    ),
  );

// A group of questions folded away under its name, so the page reads short and the full text is a click off.
function Group({ name, open, children }: { name: string; open: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="hairline mt-4">
      <details className="group" open={open}>
        <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 pt-3 [&::-webkit-details-marker]:hidden">
          <Icon
            name="chevron"
            size={12}
            className="text-[var(--muted)] transition-transform group-open:rotate-90"
          />
          <h3 id={id} className={HEAD}>
            {name}
          </h3>
        </summary>
        <div className="max-w-[36rem] pb-2">{children}</div>
      </details>
    </section>
  );
}

// The questions are fetched with the page and set out as the model is asked them; a link to them opens every group.
function QuestionsInFull({ open }: { open: boolean }) {
  const [q, setQ] = useState<Questions | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getJson<Questions>("/questions.json")
      .then(setQ)
      .catch(() => setFailed(true));
  }, []);
  return (
    <section id="layers">
      <h2 className={H2}>The questions, in full</h2>
      <p className={P}>
        These are the questions word for word as the model is asked them; each level also comes with
        two or three short examples, left out here. It sees each passage as{" "}
        <code className="text-[0.85em]">passage</code>, with the end of the one before it as{" "}
        <code className="text-[0.85em]">previous_passage_tail</code>, which is there for context and
        is not scored. For every layer it weighs five levels, numbered here from 0 to 4 as on the
        chart.
      </p>
      {!q && (
        <p role="status" className={`${P} italic text-[var(--muted)]`}>
          {failed ? "The questions could not be loaded." : "Loading the questions…"}
        </p>
      )}
      {q && (
        <>
          {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((g) => (
            <Group key={g} name={g} open={open}>
              {GROUPS[g]
                .flatMap((k) => q.axes.filter((a) => a.key === k))
                .map((a) => (
                  <div key={a.key}>
                    <h4 className={H4}>{AXIS_INFO[a.key as Axis]?.name ?? a.name}</h4>
                    <p className={P}>{withCode(a.question)}</p>
                    <ol
                      start={0}
                      className="serif opsz-14 mt-2 list-decimal space-y-1 pl-6 text-[14px] leading-normal marker:text-[var(--muted)]"
                    >
                      {a.levels.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ol>
                  </div>
                ))}
            </Group>
          ))}
          <Group name="Events" open={open}>
            {q.events.map((e) => (
              <div key={e.key}>
                <h4 className={H4}>{EVENT_NAMES[e.key as EventType] ?? e.name}</h4>
                <p className={P}>{withCode(e.question)}</p>
              </div>
            ))}
          </Group>
        </>
      )}
    </section>
  );
}

export default function About() {
  // The app's scroll restoration also takes a link to a section there; the page does it itself so it holds under any router.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  return (
    <div className="max-w-[60rem] space-y-8 [&>section]:border-t [&>section]:border-[var(--rule)] [&>section]:pt-5">
      <title>About · Shapes of Stories</title>
      <h1 className={pageTitle}>About</h1>
      <section>
        <h2 className={H2}>Why</h2>
        <p className={P}>
          It began as a way to find out what Jev can do with a whole novel. Jev is a model that
          answers typed questions rather than writing text: ask it how a passage feels and it does
          not describe the passage; it gives a probability for each of five levels. I wanted to know
          whether a few thousand of those small answers, asked of one page after another, would add
          up to something a reader recognizes as the shape of a book.
        </p>
        <p className={P}>
          The other reason is plainer. I like drawing data, and I like reading the drawing
          afterward: finding the place where a line turns, going back to the page, and seeing
          whether the book agrees.
        </p>
      </section>
      <section>
        <h2 className={H2}>How</h2>
        <p className={P}>
          Kurt Vonnegut drew stories as lines on a blackboard, and in 2016 Andrew Reagan and
          colleagues found six basic shapes in 1,327 Project Gutenberg books; this site draws one
          book at a time.
        </p>
        <p className={P}>
          A book is cut into passages of about 800 words, following its paragraph breaks; a
          paragraph too long for one passage is cut at a sentence end. Each passage goes to Jev,
          through TypeSafe, with ten questions about how the passage feels, from fortune and tension
          to sorrow and pace, and nine about what happens in it, such as a reveal, a death or a
          betrayal. For each feeling Jev gives not one number but a probability for each of five
          levels; the score is the average of the levels, weighted by those probabilities.
        </p>
        <p className={P}>
          A single passage's answer is noisy, as any single reading is, so the scores are smoothed
          with a Whittaker–Henderson filter, which follows the trend without inventing bumps that
          are not there. The smoothed fortune line is then compared with a template for each of the
          six shapes, and the closest is named along with how close it came. When none comes close
          enough, it says so.
        </p>
      </section>
      <section>
        <h2 className={H2}>What the numbers mean</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {HOW_TO_READ.map((h) => (
            <div key={h.title}>
              {SKETCHES[h.sketch]}
              <h3 className="serif opsz-14 mb-1 mt-1.5 text-[15px] font-medium">{h.title}</h3>
              <p className="text-[14px] leading-relaxed">{h.text}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted)]">{h.more}</p>
            </div>
          ))}
        </div>
      </section>
      <QuestionsInFull open={hash === "#layers"} />
      <section>
        <h2 className={H2}>Credits</h2>
        <p className={P}>Very little here is my own idea. It stands on this work:</p>
        <dl className="serif opsz-14 mt-3 text-[14px] leading-normal">
          {CREDITS.map((c) => (
            <div
              key={c.work}
              className="grid gap-x-8 gap-y-0.5 border-b border-[var(--rule)] py-2 sm:grid-cols-2"
            >
              <dt>
                {c.url ? (
                  <a className={link} href={c.url}>
                    {c.work}
                  </a>
                ) : (
                  c.work
                )}
              </dt>
              <dd className="italic text-[var(--muted)]">{c.gave}</dd>
            </div>
          ))}
        </dl>
        <p className={P}>
          The same list, with the licenses for the texts, the font and the icons, is in{" "}
          <a className={link} href={`${REPO_URL}/blob/main/CREDITS.md`}>
            CREDITS.md
          </a>
          .
        </p>
      </section>
      <section>
        <h2 className={H2}>What this is not</h2>
        <p className={P}>
          It is not a measurement. Every line is built from judgments: a reading of each passage
          that says, with some doubt, how it seems. Judgments can be wrong, and some of these will
          be, in the ways any reader can be: irony read straight, a dream taken for waking, a quiet
          chapter that matters more than it looks.
        </p>
        <p className={P}>
          The shape match is a comparison, not a verdict, and it says nothing about whether a book
          is any good. Where it is wrong you can see it: click the point that looks off and read the
          passage behind it. I would rather show the working than hide the mistakes.
        </p>
      </section>
    </div>
  );
}
