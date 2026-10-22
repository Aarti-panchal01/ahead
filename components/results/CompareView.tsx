"use client";
// Two results side by side.
import { PREVIEW_DISCLAIMER } from "@/lib/client/copy";
import type { RenderState } from "@/lib/client/renderState";
import type { RankedItem } from "@/lib/types";
import IntegrityLine from "./IntegrityLine";
import { RenderImage, type Subject } from "./ResultCard";
import styles from "./results.module.css";

interface Props {
  pair: [RankedItem, RankedItem];
  states: Record<string, RenderState>;
  subject: Subject;
  canRender: boolean;
  onClose: () => void;
}

export default function CompareView({ pair, states, subject, canRender, onClose }: Props) {
  return (
    <section className="stack" aria-labelledby="compare-h">
      <h2 id="compare-h">Side by side</h2>
      <div className={styles.compare}>
        {pair.map((r) => {
          const s = states[r.item.id];
          return (
            <div key={r.item.id} className={styles.compareCol}>
              <RenderImage ranked={r} state={s} subject={subject} canRender={canRender} />
              <h3 className={styles.compareName}>{r.item.name}</h3>
              {canRender && s.phase === "done" && <IntegrityLine report={s.report} />}
            </div>
          );
        })}
      </div>
      <p className="note">{PREVIEW_DISCLAIMER}</p>
      <button type="button" className="btn btn-quiet" onClick={onClose}>Back to all matches</button>
    </section>
  );
}
