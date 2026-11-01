"use client";
// Two results side by side.
import type { CardView } from "@/lib/client/brows";
import { PREVIEW_DISCLAIMER } from "@/lib/client/copy";
import type { RenderState } from "@/lib/client/renderState";
import type { RankedItem } from "@/lib/types";
import { referenceSku } from "@/lib/catalogue";
import IntegrityLine from "./IntegrityLine";
import { RenderImage, type Subject } from "./ResultCard";
import styles from "./results.module.css";

interface Props {
  pair: [RankedItem, RankedItem];
  states: Record<string, RenderState>;
  views: Record<string, CardView>;
  subject: Subject;
  onClose: () => void;
  onContinueToBrief: () => void;
}

export default function CompareView({ pair, states, views, subject, onClose, onContinueToBrief }: Props) {
  return (
    <section className="stack" aria-labelledby="compare-h">
      <h1 id="compare-h">Side by side</h1>
      <div className={styles.compare}>
        {pair.map((r) => {
          const v = views[r.item.id];
          return (
            <div key={r.item.id} className={styles.compareCol}>
              <RenderImage ranked={r} state={states[r.item.id]} view={v} subject={subject} />
              <h2 className={`h3 ${styles.compareName}`}>{r.item.name}</h2>
              <p className={styles.compareSku}>Ahead style SKU <strong>{referenceSku(r.item)}</strong></p>
              <div className={styles.compareDetails}>
                <span className={styles.compareSwatch} style={{ backgroundColor: r.item.colour }} aria-label={`Colour ${r.item.colour}`} />
                <p>{r.item.kind === "wig" ? `Wig · ${r.item.length} · ${r.item.texture}` : `Headwear · ${r.item.texture}`}</p>
                <strong>{r.item.colour.toUpperCase()}</strong>
              </div>
              {!v.checking && v.report && <IntegrityLine report={v.report} whose={subject.isSample ? "her" : "your"} />}
            </div>
          );
        })}
      </div>
      <p className="note">{PREVIEW_DISCLAIMER}</p>
      <div className={styles.compareActions}>
        <button type="button" className="btn btn-primary" onClick={onContinueToBrief}>Take these two to my fitting brief</button>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Back to all matches</button>
      </div>
    </section>
  );
}
