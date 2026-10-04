import { pageTitle } from "../lib/ui";

const H2 = "opsz-40 mb-2 text-[21px] font-medium leading-tight";

export default function Privacy() {
  return (
    <div className="serif opsz-14 max-w-[32rem] space-y-6 text-[15px] leading-normal">
      <title>Privacy · Shapes of Stories</title>
      <h1 className={pageTitle}>Privacy</h1>
      <section>
        <h2 className={H2}>What is never stored</h2>
        <p>
          Your book's text and your TypeSafe key are never logged and never kept: while an analysis
          runs they are held encrypted in its job record, which is cleared when it ends.
        </p>
      </section>
      <section>
        <h2 className={H2}>What exists while an analysis runs</h2>
        <p>
          Your text is compressed and encrypted for the run and is cleared the moment the job
          completes or you cancel it. If a job fails, the encrypted text is kept only long enough
          for you to Resume, and is wiped automatically within a day either way. Your key is
          encrypted for the run and cleared on completion, cancellation, or failure; Resume asks for
          it again.
        </p>
      </section>
      <section>
        <h2 className={H2}>What is kept if you click Keep</h2>
        <p>
          Only the results derived from your text — curves, chapter statistics, event markers, the
          shape match, and chapter titles (truncated to 80 characters) — can be kept. Your original
          text and key are never part of what's kept. Unkept results vanish one hour after the
          analysis finishes.
        </p>
      </section>
      <section>
        <h2 className={H2}>Share links</h2>
        <p>
          A share link shows curves, events, and chapter titles to anyone who has it. It never
          carries your text or key, and revoking it disables the link immediately.
        </p>
      </section>
      <section>
        <h2 className={H2}>TypeSafe</h2>
        <p>
          Passages are sent to TypeSafe under your own key and agreement; TypeSafe states it does
          not train on customer requests.
        </p>
      </section>
    </div>
  );
}
