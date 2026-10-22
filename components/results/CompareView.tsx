"use client";
// Two results side by side.
import type { CardView } from "@/lib/client/brows";
import { PREVIEW_DISCLAIMER } from "@/lib/client/copy";
import type { RenderState } from "@/lib/client/renderState";
import type { RankedItem } from "@/lib/types";
import IntegrityLine from "./IntegrityLine";
import { RenderImage, type Subject } from "./ResultCard";
import styles from "./results.module.css";

interface Props {
  pair: [RankedItem, RankedItem];
  states: Record<string, RenderState>;
  views: Record<string, CardView>;
  subject: Subject;
  onClose: () => void;
}

export default function CompareView({ pair, states, views, subject, onClose }: Props) {
  return (
    <section className="stack" aria-labelledby="compare-h">
      <h2 id="compare-h">Side by side</h2>
      <div className={styles.compare}>
        {pair.map((r) => {
          const v = views[r.item.id];
          return (
            <div key={r.item.id} className={styles.compareCol}>
              <RenderImage ranked={r} state={states[r.item.id]} view={v} subject={subject} />
              <h3 className={styles.compareName}>{r.item.name}</h3>
              {!v.checking && v.report && <IntegrityLine report={v.report} />}
            </div>
          );
        })}
      </div>
      <p className="note">{PREVIEW_DISCLAIMER}</p>
      <button type="button" className="btn btn-quiet" onClick={onClose}>Back to all matches</button>
    </section>
  );
}
