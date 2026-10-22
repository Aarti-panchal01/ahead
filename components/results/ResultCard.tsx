"use client";
// One try-on: the render (or its progress, or the item on our model), the item name, the integrity check and the
// preview disclaimer. Never shows a broken image, and a sample card never says a combination is missing.
import type { ReactNode } from "react";
import AiImage from "@/components/AiImage";
import type { CardView } from "@/lib/client/brows";
import { PREVIEW_DISCLAIMER } from "@/lib/client/copy";
import { canRetry, progressFraction, type RenderState } from "@/lib/client/renderState";
import { matchLabelText, type MatchLabel } from "@/lib/rank";
import type { RankedItem } from "@/lib/types";
import IntegrityLine from "./IntegrityLine";
import styles from "./results.module.css";

export interface Subject {
  /** True when the person in the render is an AI sample person (then AiImage labels it). */
  isSample: boolean;
  /** "Sample person 1" or "You". */
  name: string;
}

interface ImageProps {
  ranked: RankedItem;
  state: RenderState;
  view: CardView;
  subject: Subject;
}

export function RenderImage({ ranked, state, view, subject }: ImageProps) {
  const { item } = ranked;
  const who = subject.isSample ? subject.name : "You";
  if (view.src) {
    const what = `${item.name.toLowerCase()}${item.kind === "wig" ? " wig" : ""}`;
    const alt = `${who} wearing the ${what}${view.withBrows ? ", with brows" : ""}`;
    return subject.isSample ? (
      <AiImage src={view.src} alt={alt} width={821} height={1024} className={styles.render} />
    ) : (
      <figure className={styles.render}>
        {/* eslint-disable-next-line @next/next/no-img-element -- render of the user's own photo, same-origin */}
        <img src={view.src} alt={alt} />
      </figure>
    );
  }
  if (state.phase === "running") {
    const pct = Math.round(progressFraction(state.elapsedMs) * 100);
    return (
      <div className={styles.pending} role="status" aria-live="polite">
        <p className={styles.pendingText}>
          Putting this on {subject.isSample ? "her photo" : "your photo"}. This usually takes 9 to 30 seconds.
        </p>
        <div className={styles.bar} aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
        <p className="note">{Math.round(state.elapsedMs / 1000)} s</p>
      </div>
    );
  }
  // Sample people only ever see themselves: no model photo, ever. Before the render starts, a quiet placeholder;
  // after a genuine failure the card's error message says what happened.
  if (subject.isSample) {
    return (
      <div className={styles.pending} role="status">
        <p className={styles.pendingText}>{state.phase === "error" ? "This preview didn't load." : "Getting her preview ready."}</p>
      </div>
    );
  }
  // Own photo, not rendered (yet, or it couldn't be): the item on our model, labelled.
  return (
    <div className={styles.reference}>
      <AiImage src={item.image} alt={`Our model wearing the ${item.name.toLowerCase()}`} width={821} height={1024} />
      <p className={styles.referenceTag}>Shown on our model</p>
    </div>
  );
}

interface Props extends ImageProps {
  /** Chip for wigs; wraps have none. */
  label?: MatchLabel;
  whose: "her" | "your";
  /** Own photo in live mode, not rendered yet: offer the render on tap (it costs units). */
  onDemand?: boolean;
  onRender?: () => void;
  selected: boolean;
  onToggleCompare: () => void;
  onRetry: () => void;
  /** The match card toggle, wigs only. */
  matchOpen?: boolean;
  onToggleMatch?: () => void;
  match?: ReactNode;
  /** Lets the results screen see when this card comes near the viewport (lib/client/visibility.ts). */
  cardRef?: (el: HTMLElement | null) => void;
}

export default function ResultCard(props: Props) {
  const { ranked, state, view, subject, label, whose, onDemand, onRender, selected, onToggleCompare, onRetry, matchOpen, onToggleMatch, match, cardRef } = props;
  const { item } = ranked;
  const errored = state.phase === "error";

  return (
    <article ref={cardRef} className={styles.card} data-selected={selected} aria-labelledby={`n-${item.id}`}>
      <RenderImage ranked={ranked} state={state} view={view} subject={subject} />
      <div className={styles.body}>
        {label && (
          <p className={label === "close" || label === "colour" ? styles.chip : label === "new" ? styles.chipNew : styles.chipNeutral}>
            {matchLabelText(label, whose)}
          </p>
        )}
        <h3 id={`n-${item.id}`}>{item.name}</h3>
        {onDemand && state.phase === "idle" && (
          <button type="button" className={`btn btn-quiet ${styles.renderBtn}`} onClick={onRender}>Show me in this one</button>
        )}
        {errored && (
          <div className="notice" role="alert">
            <p>{state.result.message}</p>
            {canRetry(state) && (
              <button type="button" className={`btn btn-quiet ${styles.retry}`} onClick={onRetry}>Try this one again</button>
            )}
          </div>
        )}
        {view.browsNote && <p className="note" role="status">{view.browsNote}</p>}
        {view.checking && <p className="note" role="status">Checking {whose === "her" ? "her" : "your"} skin tone</p>}
        {!view.checking && view.report && <IntegrityLine report={view.report} whose={whose} />}
        <p className="note">{PREVIEW_DISCLAIMER}</p>
        {match && matchOpen && match}
        <div className={styles.cardActions}>
          {onToggleMatch && (
            <button type="button" className={`btn btn-quiet ${styles.compareBtn}`} aria-expanded={Boolean(matchOpen)} onClick={onToggleMatch}>
              {matchOpen ? "Hide the colour match" : "See the colour match"}
            </button>
          )}
          <button type="button" className={`btn btn-quiet ${styles.compareBtn}`} aria-pressed={selected} onClick={onToggleCompare}>
            {selected ? "Remove from compare" : "Add to compare"}
          </button>
        </div>
      </div>
    </article>
  );
}
