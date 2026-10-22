"use client";
// Screen 5: matches for this person. 3 wigs closest to their hair + 1 something new, a Wraps tab, compare two side
// by side, a colour match card, and a stylist brief. Every render is polled to the end (CLAUDE.md: poll every task)
// and then checked for skin tone drift.
//
// Units: sample people replay recordings (0 units), so every card renders by itself. An own photo renders live
// only when /api/status says live and not serving recordings, and then only the #1 wig by itself; every other card
// waits for a tap on "Show me in this one".
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NeedPhoto from "@/components/NeedPhoto";
import { hairOf, useSession, type ChosenPhoto } from "@/components/SessionProvider";
import YourPhoto from "@/components/YourPhoto";
import { CATALOGUE } from "@/lib/catalogue";
import { browsAvailable, browsToggleLabel, cardView, type BrowsLayer } from "@/lib/client/brows";
import type { Whose } from "@/lib/client/copy";
import { applyBrows, integrityCheck } from "@/lib/client/image";
import { demoNote, fetchMode, ownPhotoCanRender } from "@/lib/client/mode";
import { browsImage, getSample, goneImage, tryOnFace, type SamplePerson } from "@/lib/client/personas";
import { downscaleForUpload } from "@/lib/client/photo";
import { IDLE, nextRender, type RenderEvent, type RenderState } from "@/lib/client/renderState";
import { parseStage } from "@/lib/client/routes";
import { endSession, resetSessionId, sessionHeaders } from "@/lib/client/session";
import { NearViewport, afterImagePainted } from "@/lib/client/visibility";
import { forgetCode, needsTesterCode, storedCode, testerHeaders, type StatusWithTester } from "@/lib/client/tester";
import { renderSrc, runTryOn } from "@/lib/client/tryon";
import { matchLabel, rankCatalogue } from "@/lib/rank";
import type { HairLossStage, RankedItem, UnitStatus } from "@/lib/types";
import BriefMaker from "./BriefMaker";
import CompareView from "./CompareView";
import MatchCard from "./MatchCard";
import ResultCard, { type Subject } from "./ResultCard";
import TesterCode from "./TesterCode";
import styles from "./results.module.css";

type Tab = "wigs" | "wraps";

function hairLine(photo: ChosenPhoto, stage: HairLossStage, hair?: string): string {
  if (!hair) {
    return "With no hair to read in your photo, here is a spread of colours. An older photo of your hair, or a saved lock, will help your stylist match it.";
  }
  if (photo.kind === "sample") {
    return stage === "gone"
      ? "Matched to her hair texture, length and colour, read from her photo from before, among the styles she has tried on."
      : "Matched to her hair texture, length and colour, read from her photo, among the styles she has tried on.";
  }
  return "Matched on colour only, read from your photo: a photo can't tell us your length or texture. Colour from a photo is approximate, so bring a lock of your hair to your stylist.";
}

export default function ResultsView() {
  const params = useSearchParams();
  const router = useRouter();
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

  const [status, setStatus] = useState<UnitStatus>();
  const [hasCode, setHasCode] = useState(false);
  useEffect(() => {
    setHasCode(Boolean(storedCode()));
  }, []);
  useEffect(() => {
    fetchMode().then(setStatus);
  }, []);

  const [tab, setTab] = useState<Tab>("wigs");
  const [states, setStates] = useState<Record<string, RenderState>>({});
  const [layers, setLayers] = useState<Record<string, BrowsLayer>>({});
  const [browsOn, setBrowsOn] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [matchOpen, setMatchOpen] = useState<string>();
  const [comparing, setComparing] = useState(false);
  const started = useRef(new Set<string>());
  const [near] = useState(() => new NearViewport("200px"));
  useEffect(() => () => near.disconnect(), [near]);
  // Cards that have come within 200 px of the viewport show their image; the top card always does.
  const [nearKeys, setNearKeys] = useState<ReadonlySet<string>>(new Set());
  const upload = useRef<{ url: string; blob: Promise<Blob> }>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const sample: SamplePerson | undefined = photo?.kind === "sample" ? getSample(photo.id) : undefined;
  // Sample people keep their measured hair colour in every stage (read from the before photo). An own photo with
  // hair gone has no hair to read.
  const hair = photo ? (photo.kind === "own" && stage === "gone" ? undefined : hairOf(photo)) : undefined;
  const ranking = useMemo(
    () =>
      rankCatalogue(
        CATALOGUE,
        sample
          ? { hair, length: sample.length, texture: sample.texture, pool: { wigs: sample.recordedWigs, wraps: sample.recordedWraps } }
          : { hair },
      ),
    [hair, sample],
  );
  const whose: Whose = sample ? "her" : "your";
  // Production may ask for a tester code before live try-ons on your own photo (lib/client/tester.ts).
  const liveAllowed = photo?.kind === "own" && status !== undefined && ownPhotoCanRender(status);
  const needCode = liveAllowed && needsTesterCode(status as StatusWithTester) && !hasCode;
  const ownLive = liveAllowed && !needCode;
  const canRender = photo?.kind === "sample" || ownLive;
  const withBrows = Boolean(photo && browsAvailable(photo.kind, stage));
  const faceKey = photo ? (photo.kind === "sample" ? tryOnFace(photo.id) : photo.url) : "";

  const dispatch = useCallback((key: string, e: RenderEvent) => {
    if (!alive.current) return;
    setStates((all) => ({ ...all, [key]: nextRender(all[key] ?? IDLE, e) }));
  }, []);
  const setLayer = useCallback((key: string, l: BrowsLayer) => {
    if (alive.current) setLayers((all) => ({ ...all, [key]: l }));
  }, []);

  /** The user's photo, downscaled once per photo for upload (Vercel's 4.5 MB body limit). */
  const ownUpload = useCallback((url: string) => {
    if (upload.current?.url !== url) upload.current = { url, blob: downscaleForUpload(url) };
    return upload.current.blob;
  }, []);

  const start = useCallback(
    async (r: RankedItem) => {
      if (!photo) return;
      const key = `${faceKey}:${r.item.id}`;
      started.current.add(key);
      dispatch(key, { type: "start" });
      let face: string | Blob;
      try {
        face = photo.kind === "sample" ? tryOnFace(photo.id) : await ownUpload(photo.url);
      } catch {
        dispatch(key, { type: "result", result: { id: "", status: "error", errorCode: "no_photo", message: "We couldn't prepare your photo. Take it again, or try another one." } });
        return;
      }
      const headers = { ...sessionHeaders(), ...(photo.kind === "own" ? testerHeaders() : {}) };
      const raw = await runTryOn(r.item.id, face, { headers, onRunning: (ms) => dispatch(key, { type: "tick", elapsedMs: ms }) });
      if (raw.errorCode === "tester_code") {
        // The stored code stopped working: ask again, and let this card start over once a new code is in.
        forgetCode();
        started.current.delete(key);
        if (alive.current) setHasCode(false);
      }
      const src = renderSrc(raw);
      const result = src ? { ...raw, resultUrl: src } : raw;
      dispatch(key, { type: "result", result });
      if (result.status !== "success" || !src) return;

      // The heavy on-device work waits for the first paint, and (except for the top card) until the card is
      // near the viewport. The render itself is already showing. Same checks, same order, just later.
      await afterImagePainted(() => near.element(key)?.querySelector("img"));
      const top = r === ranking.wigs[0] || r === ranking.wraps[0];
      if (!top) await near.whenNear(key);

      const original = photo.kind === "sample" ? goneImage(photo.id) : photo.url;
      dispatch(key, { type: "checked", report: await integrityCheck(original, src) });

      // Brows on top, checked against the brows photo (the brows were added on purpose). 0 units.
      if (photo.kind === "sample" && browsAvailable("sample", stage)) {
        const browsUrl = browsImage(photo.id);
        setLayer(key, { status: "adding" });
        const browed = await applyBrows(src, browsUrl);
        if (browed === src) return setLayer(key, { status: "failed" });
        setLayer(key, { status: "checking", image: browed });
        setLayer(key, { status: "done", image: browed, report: await integrityCheck(browsUrl, browed) });
      }
    },
    [photo, faceKey, stage, dispatch, setLayer, ownUpload, ranking, near],
  );

  const visible = tab === "wigs" ? ranking.wigs : ranking.wraps;

  useEffect(() => {
    let live = true;
    for (const r of visible) {
      const key = `${faceKey}:${r.item.id}`;
      void near.whenNear(key).then(() => {
        if (live) setNearKeys((s) => (s.has(key) ? s : new Set(s).add(key)));
      });
    }
    return () => { live = false; };
  }, [visible, faceKey, near]);

  // Start renders by themselves once per face, never again on a re-render or a tab switch (units).
  // Sample people: every visible card. Own photo, live: only the #1 wig.
  useEffect(() => {
    if (!photo || !canRender) return;
    const auto = photo.kind === "sample" ? visible : ranking.wigs.slice(0, 1);
    for (const r of auto) {
      const key = `${faceKey}:${r.item.id}`;
      if (started.current.has(key)) continue;
      void start(r);
    }
  }, [photo, canRender, visible, ranking.wigs, faceKey, start]);

  if (!photo) return <NeedPhoto />;

  const stateOf = (id: string) => states[`${faceKey}:${id}`] ?? IDLE;
  const viewOf = (id: string) => cardView(stateOf(id), layers[`${faceKey}:${id}`], withBrows && browsOn);
  const subject: Subject = sample ? { isSample: true, name: sample.label } : { isSample: false, name: "You" };
  const allRanked = [...ranking.wigs, ...ranking.wraps];
  const note = photo.kind === "own" && status ? demoNote(status) : undefined;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)));

  const startOver = () => {
    void endSession();
    resetSessionId();
    setPhoto(undefined);
    setStage(undefined);
    router.push("/");
  };

  if (comparing && selected.length === 2) {
    const pair = selected.map((id) => allRanked.find((r) => r.item.id === id)!) as [RankedItem, RankedItem];
    return (
      <main>
        <CompareView
          pair={pair}
          states={Object.fromEntries(pair.map((r) => [r.item.id, stateOf(r.item.id)]))}
          views={Object.fromEntries(pair.map((r) => [r.item.id, viewOf(r.item.id)]))}
          subject={subject}
          onClose={() => setComparing(false)}
        />
      </main>
    );
  }

  const briefItems = selected.length ? selected : ranking.wigs.map((r) => r.item.id);

  return (
    <main className={`stack-lg ${selected.length ? styles.withBar : ""}`}>
      <Link href="/stage" className="back">Change my answer</Link>

      <section className={styles.header}>
        <div className={styles.headerPhoto}><YourPhoto photo={photo} stage={stage} brows={withBrows && browsOn} priority sizes="(max-width: 34rem) 32vw, 11rem" /></div>
        <div className="stack">
          <h1>{sample ? `Matches for ${sample.label.toLowerCase()}` : "Your matches"}</h1>
          <p className={styles.swatchRow}>
            {hair && <span className={styles.swatch} aria-hidden="true" />}
            <span className="note">{hairLine(photo, stage, hair)}</span>
          </p>
        </div>
      </section>

      {withBrows && (
        <div className={styles.browsRow}>
          <button type="button" className={`btn btn-quiet ${styles.browsBtn}`} onClick={() => setBrowsOn((v) => !v)}>
            {browsToggleLabel(browsOn)}
          </button>
          <p className="note">
            {browsOn
              ? "Brows are on: drawn at her own brow colour, with her skin left as it was."
              : "Brows are off: this is how she looks without them."}
          </p>
        </div>
      )}

      {note && (
        <div className="notice stack">
          <p>{note}</p>
          <Link href="/capture#samples" className="btn btn-quiet">Try with a sample person</Link>
        </div>
      )}
      {needCode && <TesterCode onAccepted={() => setHasCode(true)} />}
      {ownLive && (
        <p className="note">
          Your closest match is going on your photo now. To see any other one on you, tap &ldquo;Show me in this one&rdquo;.
        </p>
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
        {visible.map((r, i) => {
          const isWig = r.item.kind === "wig";
          const id = r.item.id;
          return (
            <ResultCard
              key={`${faceKey}:${id}`}
              cardRef={near.ref(`${faceKey}:${id}`)}
              deferImage={i > 0 && !nearKeys.has(`${faceKey}:${id}`)}
              ranked={r}
              state={stateOf(id)}
              view={viewOf(id)}
              subject={subject}
              whose={whose}
              label={isWig ? matchLabel(r, { hair, texture: sample?.texture }) : undefined}
              onDemand={ownLive}
              onRender={() => void start(r)}
              selected={selected.includes(id)}
              onToggleCompare={() => toggle(id)}
              onRetry={() => void start(r)}
              matchOpen={matchOpen === id}
              onToggleMatch={isWig && hair ? () => setMatchOpen((m) => (m === id ? undefined : id)) : undefined}
              match={
                isWig && hair ? (
                  <MatchCard item={r.item} hair={hair} whose={whose} source={photo.kind === "sample" ? { kind: "sample", id: photo.id } : { kind: "own", url: photo.url }} />
                ) : undefined
              }
            />
          );
        })}
      </div>

      <BriefMaker items={briefItems} chosen={selected.length > 0} hairColour={hair} browColour={sample?.brows} whose={whose} />

      <section className={`stack ${styles.panel}`} aria-labelledby="next-h">
        <h2 id="next-h" className={styles.panelHead}>What next</h2>
        <Link href="/plan" className="btn btn-quiet">Plan around the treatment dates</Link>
        <button type="button" className="btn btn-quiet" onClick={startOver}>Start over</button>
        <p className="note">Start over ends this session: your photo is cleared and your try-ons are deleted from YouCam.</p>
      </section>

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
