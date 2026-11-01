"use client";
// One try-on: the render (or its progress, or a private placeholder), the item name, the integrity check and the
// preview disclaimer. Never shows a broken image, and a sample card never says a combination is missing.
import { useState, type ReactNode } from "react";
import AiImage from "@/components/AiImage";
import type { CardView } from "@/lib/client/brows";
import { PREVIEW_DISCLAIMER } from "@/lib/client/copy";
import { canRetry, progressFraction, type RenderState } from "@/lib/client/renderState";
import { matchLabelText, type MatchLabel } from "@/lib/rank";
import type { RankedItem } from "@/lib/types";
import { referenceSku } from "@/lib/catalogue";
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
  /** True while the card is far below the fold: hold the image back so the top card's image loads first (LCP). */
  deferImage?: boolean;
  /** Explanation when this style was withheld because the live allowance is exhausted. */
  quotaMessage?: string;
}

export function RenderImage({ ranked, state, view, subject, deferImage, quotaMessage, perspective = "you" }: ImageProps & { perspective?: "you" | "model" }) {
  const { item } = ranked;
  const who = subject.isSample ? subject.name : "You";
  if (view.src && deferImage) {
    return <div className={styles.pending} aria-hidden="true" />;
  }
  if (view.src) {
    const what = `${item.name.toLowerCase()}${item.kind === "wig" ? " wig" : ""}`;
    const src = perspective === "model" ? item.image : view.src;
    const imageWho = perspective === "model" ? "Reference model" : who;
    const alt = `${imageWho} wearing the ${what}${perspective !== "model" && view.withBrows ? ", with brows" : ""}`;
    // Keyed by src: the brows or corrected version is a new <img>, not the same element with its src swapped to a
    // data: URL. That keeps the page's LCP image tied to its real request (Lighthouse can't time a data: URL).
    return subject.isSample || perspective === "model" ? (
      <AiImage key={src} src={src} alt={alt} width={821} height={1024} className={styles.render} />
    ) : (
      <figure key={src} className={styles.render}>
        {/* eslint-disable-next-line @next/next/no-img-element -- render of the user's own photo, same-origin */}
        <img src={src} alt={alt} decoding="async" />
      </figure>
    );
  }
  if (quotaMessage && state.phase === "idle") {
    return <div className={`${styles.pending} ${styles.quotaBlocked}`} role="status">{quotaMessage}</div>;
  }
  if (state.phase === "checking") {
    return (
      <div className={`${styles.pending} ${styles.pendingLive}`} role="status" aria-live="polite">
        <p className={styles.pendingText}>Protecting your face and checking skin tone…</p>
        <div className={styles.skeletonLines} aria-hidden="true"><span /><span /><span /></div>
      </div>
    );
  }
  if (state.phase === "running") {
    const pct = Math.round(progressFraction(state.elapsedMs) * 100);
    return (
      <div className={`${styles.pending} ${styles.pendingLive}`} role="status" aria-live="polite">
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
  // Never substitute a different person's face for the user's result. The reference photo stays
  // server-side as a try-on input; this tile is only a clear placeholder until their render exists.
  return (
    <div className={styles.selfPreview} aria-label={`Preview of ${item.name} on your photo`}>
      <div className={styles.selfPreviewMark} aria-hidden="true"><span>YOUR PHOTO</span></div>
      <div className={styles.selfPreviewCopy}>
        <span className={styles.selfPreviewDot} style={{ background: item.colour }} aria-hidden="true" />
        <p>{state.phase === "error" ? "This look did not render on your photo." : "This look will be shown on your photo."}</p>
        <span>{state.phase === "error" ? "Try again or choose another style." : "Your personalized preview will appear here."}</span>
      </div>
    </div>
  );
}

interface Props extends ImageProps {
  /** Chip for wigs; wraps have none. */
  label?: MatchLabel;
  whose: "her" | "your";
  /** Own photo in live mode, not rendered yet: offer the render on tap (it costs units). */
  onDemand?: boolean;
  /** Show an explicit disabled action when own-photo previews need live API access. */
  previewUnavailable?: boolean;
  /** Keep the paid live queue to one request at a time. */
  renderBusy?: boolean;
  onRender?: () => void;
  selected: boolean;
  onToggleCompare: () => void;
  onRetry: () => void;
  /** The match card toggle, wigs only. */
  matchOpen?: boolean;
  onToggleMatch?: () => void;
  match?: ReactNode;
  /** See ImageProps.deferImage. */
  deferImage?: boolean;
  /** Lets the results screen see when this card comes near the viewport (lib/client/visibility.ts). */
  cardRef?: (el: HTMLElement | null) => void;
}

export default function ResultCard(props: Props) {
  const { ranked, state, view, subject, deferImage, quotaMessage, label, whose, onDemand, previewUnavailable, renderBusy, onRender, selected, onToggleCompare, onRetry, matchOpen, onToggleMatch, match, cardRef } = props;
  const { item } = ranked;
  const errored = state.phase === "error";
  const [perspective, setPerspective] = useState<"you" | "model">("you");
  const canComparePerspectives = state.phase === "done" && Boolean(view.src);

  return (
    <article
      ref={cardRef}
      className={styles.card}
      data-selected={selected}
      data-style-id={item.id}
      data-result-style-id={state.phase === "checking" || state.phase === "done" || state.phase === "error" ? state.result.itemId : undefined}
      aria-labelledby={`n-${item.id}`}
    >
      <RenderImage ranked={ranked} state={state} view={view} subject={subject} deferImage={deferImage} quotaMessage={quotaMessage} perspective={perspective} />
      <div className={styles.body}>
        {label && (
          <p className={label === "close" || label === "colour" ? styles.chip : label === "new" ? styles.chipNew : styles.chipNeutral}>
            {matchLabelText(label, whose)}
          </p>
        )}
        <h2 id={`n-${item.id}`} className="h3">{item.name}</h2>
        <p className={styles.styleSku}>Style SKU <span>{referenceSku(item)}</span></p>
        {canComparePerspectives && (
          <div className={styles.perspectiveSwitch} role="group" aria-label={`Choose image for ${item.name}`}>
            <button type="button" aria-pressed={perspective === "you"} onClick={() => setPerspective("you")}>{subject.isSample ? "On sample" : "On you"}</button>
            <button type="button" aria-pressed={perspective === "model"} onClick={() => setPerspective("model")}>Model reference</button>
          </div>
        )}
        {(onDemand || previewUnavailable) && state.phase === "idle" && (
          <button type="button" className={`btn btn-primary ${styles.renderBtn}`} onClick={onRender} disabled={Boolean(previewUnavailable || renderBusy)}>
            {previewUnavailable ? "Live preview unavailable" : "See this look on me"}
          </button>
        )}
        {errored && (
          <div className="notice" role="alert">
            <p>{state.result.message}</p>
            {canRetry(state) && (
              <button type="button" className={`btn btn-quiet ${styles.retry}`} onClick={onRetry} disabled={renderBusy}>Retry this style</button>
            )}
          </div>
        )}
        <div className={styles.integritySlot}>
          {view.browsNote && <p className="note" role="status">{view.browsNote}</p>}
          {view.checking && <p className="note" role="status">Checking {whose === "her" ? "her" : "your"} skin tone</p>}
          {!view.checking && view.report && <IntegrityLine report={view.report} whose={whose} />}
        </div>
        <p className={`note ${styles.disclaimer}`}>{PREVIEW_DISCLAIMER}</p>
        {match && matchOpen && match}
        <div className={styles.cardActions}>
          {onToggleMatch && (
            <button type="button" className={`btn btn-quiet ${styles.compareBtn}`} aria-expanded={Boolean(matchOpen)} onClick={onToggleMatch}>
              {matchOpen ? "Hide the colour match" : "See the colour match"}
            </button>
          )}
          <button type="button" className={`btn btn-quiet ${styles.compareBtn}`} aria-pressed={selected} onClick={onToggleCompare}>
            {selected ? "Remove from fitting bag" : "Save to fitting bag"}
          </button>
        </div>
      </div>
    </article>
  );
}
