"use client";
// A quiet way in for testers: live try-ons on your own photo need a tester code in Production.
// Everything else (colour matching, the match card) works without one.
import { useId, useState } from "react";
import { TESTER_PROMPT, submitTesterCode } from "@/lib/client/tester";
import styles from "./results.module.css";

export default function TesterCode({ onAccepted }: { onAccepted: () => void }) {
  const id = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const r = await submitTesterCode(code);
    setBusy(false);
    if (r.ok) onAccepted();
    else setError(r.message);
  };

  return (
    <form onSubmit={submit} className={`${styles.tester} stack`} aria-label="Tester code">
      <label htmlFor={id} className="note">{TESTER_PROMPT}</label>
      <div className={styles.testerRow}>
        <input
          id={id}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <button type="submit" className="btn btn-quiet" disabled={busy || !code.trim()}>Use code</button>
      </div>
      {error && <p id={`${id}-err`} className={styles.testerError} role="alert">{error}</p>}
    </form>
  );
}
