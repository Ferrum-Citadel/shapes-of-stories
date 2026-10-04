import { pageTitle } from "../lib/ui";

const H2 = "opsz-40 mb-2 text-[21px] font-medium leading-tight";

export default function Privacy() {
  return (
    <div className="serif opsz-14 max-w-[32rem] space-y-6 text-[15px] leading-normal">
      <title>Privacy · Shapes of Stories</title>
      <h1 className={pageTitle}>Privacy</h1>
      <section>
        <h2 className={H2}>Your key</h2>
        <p>
          Your TypeSafe key is held by the page you type it into, only while that page is open, and
          is sent with each analysis you start, each Resume and each key test. It is never saved in
          your browser, so a reload or a new tab asks for it again.
        </p>
      </section>
      <section>
        <h2 className={H2}>What exists while an analysis runs</h2>
        <p>
          On the server, your text and key exist only in the analysis's job record, where both are
          encrypted, and are never logged. Both are deleted when the analysis completes or you
          cancel it. If it fails, the key is deleted at once, and the encrypted text is kept only
          when the analysis can be resumed; whatever is left is deleted once the analysis is a day
          old.
        </p>
      </section>
      <section>
        <h2 className={H2}>What is kept if you click Keep</h2>
        <p>
          Only results derived from your text can be kept, such as the curves, chapter statistics,
          event markers, the shape match, and chapter titles (truncated to 80 characters). Your
          original text and key are never part of what's kept. Unkept results are deleted within
          about an hour after the analysis finishes.
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
