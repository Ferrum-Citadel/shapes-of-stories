import { useId, useRef, useState } from "react";
import { ApiError, api, errorMessage } from "../api/client";
import { boxButton, boxField, link, note } from "../lib/ui";

// 8 characters is the server's floor; spaces are never part of a key.
export const plausibleKey = (k: string) => k.length >= 8 && !/\s/.test(k);

function keyVerdict(r: Awaited<ReturnType<typeof api.checkKey>>) {
  if (r.ok) return `Key works (…${r.last4})`;
  if (r.error === "key_rejected") return "Key rejected";
  return r.error === "rate_limited"
    ? "TypeSafe is rate-limiting this key; try again shortly"
    : "Could not check";
}

// The key belongs to the page, which sends it with the analysis; testing it happens here.
export default function KeyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const id = useId();
  // The key last typed, so a check that answers after an edit is not shown under the new key.
  const latest = useRef(value);
  const wrong = value !== "" && !plausibleKey(value);
  const test = () => {
    const asked = value;
    const say = (s: string) => {
      if (latest.current === asked) setStatus(s);
    };
    api.checkKey(asked).then(
      (r) => say(keyVerdict(r)),
      (e: unknown) =>
        say(
          e instanceof ApiError && e.code === "rate_limited" ? errorMessage(e) : "Could not check",
        ),
    );
  };
  return (
    <>
      <div>
        <label htmlFor={id} className="label block">
          TypeSafe API key
        </label>
        <div className="mt-1 flex items-stretch gap-2">
          <input
            id={id}
            type="password"
            className={`min-w-0 flex-1 ${boxField}`}
            value={value}
            onChange={(e) => {
              latest.current = e.target.value.trim();
              onChange(latest.current);
              setStatus(null);
            }}
            autoComplete="off"
            aria-invalid={wrong}
            aria-describedby={wrong ? `${id}-hint` : undefined}
          />
          <button
            type="button"
            className={boxButton}
            disabled={!plausibleKey(value)}
            onClick={test}
          >
            Test key
          </button>
        </div>
        {wrong && (
          <p id={`${id}-hint`} className="mt-1 text-[13px] text-[var(--bad)]">
            A key has no spaces and at least 8 characters.
          </p>
        )}
        <p role="status" className="text-[13px] text-[var(--muted)]">
          {status}
        </p>
      </div>
      <p className={note}>
        Your key goes to TypeSafe once per analysis and is held only while the analysis runs; you
        can make and revoke keys in{" "}
        <a className={link} href="https://console.typesafe.ai">
          your TypeSafe console
        </a>
        .
      </p>
    </>
  );
}
