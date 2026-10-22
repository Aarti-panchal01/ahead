"use client";
// Screen 5: matches for this person. 3 wigs closest to their hair + 1 something new, a Wraps tab,
// and compare two side by side. Every render is polled to the end (CLAUDE.md: poll every task) and
// then checked for skin tone drift.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NeedPhoto from "@/components/NeedPhoto";
import { hairOf, useSession, type ChosenPhoto } from "@/components/SessionProvider";
import { CATALOGUE } from "@/lib/catalogue";
import { MOCK_PHOTO_NOTE } from "@/lib/client/copy";
import { fetchMode } from "@/lib/client/mode";
import { getSample, goneImage, tryOnFace } from "@/lib/client/personas";
import { IDLE, nextRender, type RenderEvent, type RenderState } from "@/lib/client/renderState";
import { parseStage } from "@/lib/client/routes";
import { integrityCheck } from "@/lib/client/stubs";
import { runTryOn } from "@/lib/client/tryon";
import { rankCatalogue } from "@/lib/rank";
import type { HairLossStage, RankedItem } from "@/lib/types";
import CompareView from "./CompareView";
import ResultCard, { type Subject } from "./ResultCard";
import YourPhoto from "@/components/YourPhoto";
import styles from "./results.module.css";

type Tab = "wigs" | "wraps";

function hairLine(photo: ChosenPhoto, stage: HairLossStage, hair?: string): string {
  if (!hair) return "With no hair to read in the photo, here is a spread of colours. An older photo of your hair, or a saved lock, will help your stylist match it.";
  if (photo.kind === "sample") {
    return stage === "gone"
      ? "Matched to the hair colour in this person's photo from before."
      : "Matched to this person's hair colour, read from the photo.";
  }
  return "Matched to your hair colour, read from your photo. Photos read colour approximately, so bring a lock of your hair to your stylist.";
}

export default function ResultsView() {
  const params = useSearchParams();
  const session = useSession();
  const { setPhoto, setStage } = session;
  const urlPerson = getSample(params.get("person"));
  const urlStage = parseStage(params.get("stage"));

  // A sample person in the URL wins, so a demo link works on its own.
  const urlId = urlPerson?.id;
  const photo = useMemo<ChosenPhoto | undefined>(() => (urlId ? { kind: "sample", id: urlId } : session.photo), [urlId, session.photo]);
  const stage: HairLossStage = urlStage ?? session.stage ?? "not_yet";

  useEffect(() => {
    if (urlPerson && !(session.photo?.kind === "sample" && session.photo.id === urlPerson.id)) setPhoto({ kind: "sample", id: urlPerson.id });
    if (urlStage && urlStage !== session.stage) setStage(urlStage);
  }, [urlPerson, urlStage, session.photo, session.stage, setPhoto, setStage]);

  const [mock, setMock] = useState(true);
  useEffect(() => {
    fetchMode().then((s) => setMock(s.mode === "mock"));
  }, []);

  const [tab, setTab] = useState<Tab>("wigs");
  const [states, setStates] = useState<Record<string, RenderState>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const started = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const hair = photo ? (photo.kind === "own" && stage === "gone" ? undefined : hairOf(photo)) : undefined;
  const sample = photo?.kind === "sample" ? getSample(photo.id) : undefined;
  const ranking = useMemo(
    () => rankCatalogue(CATALOGUE, { hair, length: sample?.length, curatedFor: sample?.id }),
    [hair, sample],
  );
  const canRender = photo?.kind === "sample" || !mock;
  const faceKey = photo ? (photo.kind === "sample" ? tryOnFace(photo.id) : photo.url) : "";

  const dispatch = useCallback((key: string, e: RenderEvent) => {
    if (!alive.current) return;
    setStates((all) => ({ ...all, [key]: nextRender(all[key] ?? IDLE, e) }));
  }, []);

  const start = useCallback(
    async (r: RankedItem) => {
      if (!photo) return;
      const key = `${faceKey}:${r.item.id}`;
      dispatch(key, { type: "start" });
      const face = photo.kind === "sample" ? tryOnFace(photo.id) : await fetch(photo.url).then((x) => x.blob());
      const result = await runTryOn(r.item.id, face, { onRunning: (ms) => dispatch(key, { type: "tick", elapsedMs: ms }) });
      dispatch(key, { type: "result", result });
      if (result.status === "success" && result.resultUrl) {
        const original = photo.kind === "sample" ? goneImage(photo.id) : photo.url;
        dispatch(key, { type: "checked", report: await integrityCheck(original, result.resultUrl) });
      }
    },
    [photo, faceKey, dispatch],
  );

  const visible = tab === "wigs" ? ranking.wigs : ranking.wraps;

  // Start each visible render once per face. Never restarted by a re-render or a tab switch (units).
  useEffect(() => {
    if (!photo || !canRender) return;
    for (const r of visible) {
      const key = `${faceKey}:${r.item.id}`;
      if (started.current.has(key)) continue;
      started.current.add(key);
      void start(r);
    }
  }, [photo, canRender, visible, faceKey, start]);

  if (!photo) return <NeedPhoto />;

  const stateOf = (id: string) => states[`${faceKey}:${id}`] ?? IDLE;
  const subject: Subject = sample ? { isSample: true, name: sample.label } : { isSample: false, name: "You" };
  const allRanked = [...ranking.wigs, ...ranking.wraps];

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)));

  if (comparing && selected.length === 2) {
    const pair = selected.map((id) => allRanked.find((r) => r.item.id === id)!) as [RankedItem, RankedItem];
    const pairStates = Object.fromEntries(pair.map((r) => [r.item.id, stateOf(r.item.id)]));
    return (
      <main>
        <CompareView pair={pair} states={pairStates} subject={subject} canRender={canRender} onClose={() => setComparing(false)} />
      </main>
    );
  }

  return (
    <main className={`stack-lg ${selected.length ? styles.withBar : ""}`}>
      <Link href="/stage" className="back">Change my answer</Link>

      <section className={styles.header}>
        <div className={styles.headerPhoto}><YourPhoto photo={photo} stage={stage} /></div>
        <div className="stack">
          <h2>{sample ? `${sample.label}: matches` : "Your matches"}</h2>
          <p className={styles.swatchRow}>
            {hair && <span className={styles.swatch} aria-hidden="true" />}
            <span className="note">{hairLine(photo, stage, hair)}</span>
          </p>
        </div>
      </section>

      {!canRender && (
        <div className="notice stack">
          <p>{MOCK_PHOTO_NOTE}</p>
          <Link href="/capture#samples" className="btn btn-quiet">Try with a sample person</Link>
        </div>
      )}

      <div role="tablist" aria-label="What to try on" className={styles.tabs}>
        {(["wigs", "wraps"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            className={styles.tab}
            onClick={() => setTab(t)}
          >
            {t === "wigs" ? "Wigs" : "Wraps"}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.cards}>
        {visible.map((r) => (
          <ResultCard
            key={`${faceKey}:${r.item.id}`}
            ranked={r}
            state={stateOf(r.item.id)}
            subject={subject}
            canRender={canRender}
            selected={selected.includes(r.item.id)}
            onToggleCompare={() => toggle(r.item.id)}
            onRetry={() => void start(r)}
          />
        ))}
      </div>

      {selected.length > 0 && (
        <div className={styles.compareBar} role="region" aria-label="Compare">
          {selected.length === 1 ? (
            <p>1 chosen. Add one more to compare.</p>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => { setComparing(true); window.scrollTo(0, 0); }}>
              Compare these two
            </button>
          )}
        </div>
      )}
    </main>
  );
}
