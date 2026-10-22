"use client";
// One try-on: the render (or its progress, or a kind message), the item name, the integrity check
// and the preview disclaimer. Never shows a broken image.
import AiImage from "@/components/AiImage";
import { PREVIEW_DISCLAIMER } from "@/lib/client/copy";
import { canRetry, progressFraction, shownImage, type RenderState } from "@/lib/client/renderState";
import type { RankedItem } from "@/lib/types";
import IntegrityLine from "./IntegrityLine";
import styles from "./results.module.css";

export interface Subject {
  /** True when the person in the render is an AI sample person (then AiImage labels it). */
  isSample: boolean;
  /** "Sample person 1" or "You". */
  name: string;
}

interface Props {
  ranked: RankedItem;
  state: RenderState;
  subject: Subject;
  /** False in mock mode with the user's own photo: we show the item on our model instead. */
  canRender: boolean;
  selected: boolean;
  onToggleCompare: () => void;
  onRetry: () => void;
}

const REASON: Record<RankedItem["reason"], string> = {
  closest: "Close to your hair",
  something_new: "Something new",
};

export function RenderImage({ ranked, state, subject, canRender }: Pick<Props, "ranked" | "state" | "subject" | "canRender">) {
  const { item } = ranked;
  const src = shownImage(state);
  const who = subject.isSample ? subject.name : "You";
  if (canRender && src) {
    const alt = `${who} wearing the ${item.name.toLowerCase()} ${item.kind === "wig" ? "wig" : ""}`.trim();
    return subject.isSample ? (
      <AiImage src={src} alt={alt} width={821} height={1024} className={styles.render} />
    ) : (
      <figure className={styles.render}>
        {/* eslint-disable-next-line @next/next/no-img-element -- render of the user's own photo */}
        <img src={src} alt={alt} />
      </figure>
    );
  }
  if (canRender && state.phase === "running") {
    const pct = Math.round(progressFraction(state.elapsedMs) * 100);
    return (
      <div className={styles.pending} role="status" aria-live="polite">
        <p className={styles.pendingText}>Putting this on {subject.isSample ? "the photo" : "your photo"}. This usually takes 9 to 30 seconds.</p>
        <div className={styles.bar} aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
        <p className="note">{Math.round(state.elapsedMs / 1000)} s</p>
      </div>
    );
  }
  // Not rendered (demo with your own photo, no recording, or an error): show the item on our model, labelled.
  return (
    <div className={styles.reference}>
      <AiImage src={item.image} alt={`Our model wearing the ${item.name.toLowerCase()}`} width={821} height={1024} />
      <p className={styles.referenceTag}>Shown on our model</p>
    </div>
  );
}

export default function ResultCard(props: Props) {
  const { ranked, state, canRender, selected, onToggleCompare, onRetry } = props;
  const { item } = ranked;
  const errored = state.phase === "error";

  return (
    <article className={styles.card} data-selected={selected} aria-labelledby={`n-${item.id}`}>
      <RenderImage {...props} />
      <div className={styles.body}>
        {item.kind === "wig" && (
          <p className={ranked.reason === "something_new" ? styles.chipNew : styles.chip}>{REASON[ranked.reason]}</p>
        )}
        <h3 id={`n-${item.id}`}>{item.name}</h3>
        {errored && (
          <div className="notice" role="alert">
            <p>{state.result.message}</p>
            {canRetry(state) && (
              <button type="button" className={`btn btn-quiet ${styles.retry}`} onClick={onRetry}>Try this one again</button>
            )}
          </div>
        )}
        {canRender && state.phase === "checking" && <p className="note" role="status">Checking your skin tone</p>}
        {canRender && state.phase === "done" && <IntegrityLine report={state.report} />}
        <p className="note">{PREVIEW_DISCLAIMER}</p>
        <button type="button" className={`btn btn-quiet ${styles.compareBtn}`} aria-pressed={selected} onClick={onToggleCompare}>
          {selected ? "Remove from compare" : "Add to compare"}
        </button>
      </div>
    </article>
  );
}
