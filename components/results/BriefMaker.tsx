"use client";
// "Make a brief for my stylist": a short-lived link with the chosen items, colours and notes. No photos are kept.
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { NOTES_MAX, createBrief } from "@/lib/client/briefApi";
import type { Whose } from "@/lib/client/copy";
import styles from "./results.module.css";

interface Props {
  items: string[];
  /** True when the items are the ones chosen for compare, false when they are the top matches. */
  chosen: boolean;
  hairColour?: string;
  browColour?: string;
  whose: Whose;
}

export default function BriefMaker({ items, chosen, hairColour, browColour, whose }: Props) {
  const router = useRouter();
  const notesId = useId();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const make = async () => {
    setBusy(true);
    setError(undefined);
    const r = await createBrief({ items, hairColour, browColour, notes });
    if (r.ok) router.push(`/brief/${encodeURIComponent(r.brief.id)}`);
    else { setError(r.message); setBusy(false); }
  };

  return (
    <section id="fitting-brief" className={`stack ${styles.panel}`} aria-labelledby="brief-h">
      <p className={styles.bagEyebrow}>TAKE IT WITH YOU</p>
      <h2 id="brief-h" className={styles.panelHead}>Create your fitting brief</h2>
      <p className="note">
        {chosen ? "Your saved looks" : "Four suggested looks"} with colour references and notes, ready to share with {whose === "her" ? "her" : "your"} specialist.
        It contains no photo and expires after seven days.
      </p>
      <p className={styles.bagNotice}>This is a fitting shortlist, not a retailer cart. Your specialist can match these style directions to real products, current prices and stock.</p>
      <div className={styles.field}>
        <label htmlFor={notesId}>Notes for the stylist (optional)</label>
        <textarea
          id={notesId}
          value={notes}
          maxLength={NOTES_MAX}
          rows={3}
          onChange={(e) => setNotes(e.target.value)}
          aria-describedby={`${notesId}-hint`}
        />
        <p id={`${notesId}-hint`} className="note">For example, how you usually wear your hair. Please leave out health details.</p>
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      <button type="button" className="btn btn-quiet" onClick={make} disabled={busy || !items.length}>
        {busy ? "Preparing your brief…" : "Create fitting brief"}
      </button>
    </section>
  );
}
