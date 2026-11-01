"use client";
// Screen 5: matches for this person. 3 wigs closest to their hair + 1 something new, a Wraps tab, compare two side
// by side, a colour match card, and a stylist brief. Every render is polled to the end (CLAUDE.md: poll every task)
// and then checked for skin tone drift.
//
// Units: sample people replay recordings (0 units). In live mode, own-photo results queue the affordable lookbook
// automatically, one at a time; heavier browser-side image checks wait until their card is near view.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NeedPhoto from "@/components/NeedPhoto";
import { hairOf, useSession, type ChosenPhoto } from "@/components/SessionProvider";
import YourPhoto from "@/components/YourPhoto";
import { CATALOGUE } from "@/lib/catalogue";
import { browsAvailable, browsToggleLabel, cardView, type BrowsLayer } from "@/lib/client/brows";
import type { Whose } from "@/lib/client/copy";
import { RESULTS_INTRO, WRAPS_INTRO } from "@/lib/client/copy";
import { applyBrows, integrityCheck, protectFaceAndCheck } from "@/lib/client/image";
import { fetchMode, ownPhotoCanRender } from "@/lib/client/mode";
import { browsImage, getSample, goneImage, tryOnFace, type SamplePerson } from "@/lib/client/personas";
import { downscaleForUpload } from "@/lib/client/photo";
import { IDLE, nextRender, type RenderEvent, type RenderState } from "@/lib/client/renderState";
import { parseStage, planHref, stageHref } from "@/lib/client/routes";
import { endSession, resetSessionId, sessionHeaders } from "@/lib/client/session";
import { NearViewport } from "@/lib/client/visibility";
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
  const imageOwners = useRef(new Map<string, string>());
  const autoQueueRunning = useRef(false);
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
  const allRanked = useMemo(() => [...ranking.wigs, ...ranking.wraps], [ranking.wigs, ranking.wraps]);
  // Private deployments may ask for a tester code before live try-ons (lib/client/tester.ts).
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

  const refreshStatus = useCallback(() => {
    void fetchMode().then((next) => setStatus((current) =>
      current && current.mode === next.mode && current.servingRecordings === next.servingRecordings &&
      current.remainingToday === next.remainingToday && current.reason === next.reason && current.testerRequired === next.testerRequired
        ? current
        : next,
    ));
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
      if (["daily_cap", "reserve", "unavailable"].includes(raw.errorCode ?? "")) {
        refreshStatus();
      }
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

      void (async () => {
        const original = photo.kind === "sample" ? goneImage(photo.id) : photo.url;
        try {
          const protectedResult = photo.kind === "own" ? await protectFaceAndCheck(original, src) : undefined;
          const protectedFace = protectedResult?.image ?? src;
          const report = protectedResult?.report ?? await integrityCheck(original, protectedFace);
          if (report.status === "failed") {
            dispatch(key, { type: "qualityFailed", result: { ...result, status: "error", errorCode: "quality_check", message: report.plainText || "We couldn't verify this preview. Retry this style." } });
            return;
          }
          const fingerprint = protectedResult?.fingerprint ?? result.resultUrl ?? result.id;
          const fingerprintKey = `${faceKey}:${fingerprint}`;
          const existingOwner = imageOwners.current.get(fingerprintKey);
          if (existingOwner && existingOwner !== key) {
            dispatch(key, { type: "qualityFailed", result: { ...result, status: "error", errorCode: "duplicate_result", message: "This image matches another style, so it wasn't shown. Retry this style." } });
            return;
          }
          imageOwners.current.set(fingerprintKey, key);
          const displayUrl = report.correctedImage ?? protectedFace;
          dispatch(key, { type: "checked", report, displayUrl, fingerprint });

          // Brows on top, checked against the brows photo (the brows were added on purpose). 0 units.
          if (photo.kind === "sample" && browsAvailable("sample", stage)) {
            const browsUrl = browsImage(photo.id);
            setLayer(key, { status: "adding" });
            const browed = await applyBrows(displayUrl, browsUrl);
            if (browed === displayUrl) return setLayer(key, { status: "failed" });
            setLayer(key, { status: "checking", image: browed });
            const browsReport = await integrityCheck(browsUrl, browed);
            if (browsReport.status === "failed") return setLayer(key, { status: "failed" });
            setLayer(key, { status: "done", image: browed, report: browsReport });
          }
        } catch (error) {
          dispatch(key, {
            type: "qualityFailed",
            result: {
              ...result,
              status: "error",
              errorCode: "quality_check",
              message: error instanceof Error ? error.message : "We couldn't verify this preview. Retry this style.",
            },
          });
        }
      })();
    },
    [photo, faceKey, stage, dispatch, setLayer, ownUpload, refreshStatus],
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

  // Saved sample previews are free. For an own photo, start every affordable look once.
  // A status refresh with an empty queue must not loop or retry paid work.
  useEffect(() => {
    if (!photo || !canRender) return;
    if (photo.kind === "sample") {
      for (const r of visible) {
        const key = `${faceKey}:${r.item.id}`;
        if (!started.current.has(key)) void start(r);
      }
      return;
    }
    if (status?.mode !== "live" || autoQueueRunning.current) return;
    const budget = Math.floor((status.remainingToday ?? 0) / 2);
    const queue = allRanked.slice(0, budget);
    const pending = queue.filter((r) => !started.current.has(`${faceKey}:${r.item.id}`));
    if (!pending.length) return;
    autoQueueRunning.current = true;
    void (async () => {
      // Keep paid calls sequential. A 16-call burst can hit API or per-IP limits
      // and leave otherwise valid styles failed while daily units remain.
      for (const r of pending) {
        if (!alive.current) break;
        await start(r);
      }
    })().finally(() => {
      autoQueueRunning.current = false;
      refreshStatus();
    });
  }, [photo, canRender, visible, allRanked, faceKey, start, status, refreshStatus]);

  if (!photo) return <NeedPhoto />;

  const stateOf = (id: string) => states[`${faceKey}:${id}`] ?? IDLE;
  const viewOf = (id: string) => cardView(stateOf(id), layers[`${faceKey}:${id}`], withBrows && browsOn, photo.kind === "sample");
  const renderBusy = photo.kind === "own" && Object.values(states).some((s) => s.phase === "running");
  const subject: Subject = sample ? { isSample: true, name: sample.label } : { isSample: false, name: "You" };
  const liveBudget = photo.kind === "own" && status?.mode === "live" && !needCode
    ? Math.min(allRanked.length, Math.floor((status.remainingToday ?? 0) / 2))
    : 0;
  const settledCount = allRanked.filter((r) => ["done", "error"].includes(stateOf(r.item.id).phase)).length;
  const readyFingerprints = allRanked.flatMap((r) => {
    const s = stateOf(r.item.id);
    return s.phase === "done" ? [s.fingerprint ?? s.result.resultUrl ?? s.result.id] : [];
  });
  const readyCount = new Set(readyFingerprints).size;
  const budgetIds = new Set(allRanked.slice(0, liveBudget).map((r) => r.item.id));
  const ownPhotoNote = photo.kind === "own" && status
    ? needCode
      ? "Your photo is ready. Enter the demo code to see each style on you."
      : !ownLive
        ? status.reason === "daily_cap"
          ? "Live previews have reached today's limit. Your photo stays on this device; try again tomorrow."
          : status.reason === "reserve"
            ? "Live previews are paused while API units are reserved. Your photo stays on this device."
          : status.mode === "mock"
              ? "Live previews are off in this local build. Your photo stays on this device; connect the YouCam API to see styles on yourself."
              : "Live previews are temporarily unavailable. Your photo stays on this device."
        : liveBudget < allRanked.length
          ? `Today's allowance can render ${liveBudget} of ${allRanked.length} looks. The remaining styles are marked below until the allowance resets.`
          : settledCount === allRanked.length
            ? readyCount === allRanked.length
              ? `All ${readyCount} previews are ready on your photo.`
              : `${readyCount} distinct previews are ready for ${allRanked.length} styles. Retry the styles marked below.`
          : settledCount === 0
            ? `Preparing all ${liveBudget} previews on your photo.`
            : `${readyCount} distinct previews ready; ${liveBudget - settledCount} still rendering.`
    : undefined;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-8)));

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
          onContinueToBrief={() => {
            setComparing(false);
            window.setTimeout(() => document.getElementById("fitting-brief")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
          }}
        />
      </main>
    );
  }

  const briefItems = selected.length ? selected : allRanked.slice(0, 4).map((r) => r.item.id);

  return (
    <main className={`${styles.resultsMain} stack-lg ${styles.withBar}`}>
      <Link href={stageHref(photo.kind, stage, photo.kind === "sample" ? photo.id : undefined)} className="back">Change my answer</Link>

      <section className={styles.header}>
        <div className={styles.headerPhoto}><YourPhoto photo={photo} stage={stage} brows={withBrows && browsOn} priority sizes="(max-width: 34rem) 32vw, 11rem" /></div>
        <div className="stack">
          <h1>{sample ? `Matches for ${sample.label.toLowerCase()}` : "Your fitting options"}</h1>
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

      {ownPhotoNote && (
        <div className="notice stack">
          <p>{ownPhotoNote}</p>
          {status?.mode === "mock" && (
            <div className={styles.liveOptions}>
              <a className="btn btn-primary" href="https://try-ahead.vercel.app/start">Open the live fitting room</a>
              <Link href="/how-we-tested" className="btn btn-quiet">See how previews work</Link>
            </div>
          )}
        </div>
      )}
      {needCode && <TesterCode onAccepted={() => setHasCode(true)} />}

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
            {t === "wigs" ? "Wigs" : "Wraps & caps"}
          </button>
        ))}
      </div>

      <div className={styles.railHeading}>
        <div>
          <h2>{tab === "wigs" ? "Explore all 12 wig styles" : "Explore wraps, turbans & caps"}</h2>
          <p className={styles.carouselIntro}>{tab === "wigs" ? RESULTS_INTRO : WRAPS_INTRO}</p>
        </div>
      </div>
      <p className={styles.catalogueNote}>Illustrative styles, not live retailer stock. Ask your wig specialist about product availability.</p>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.cards}>
        {visible.map((r, i) => {
          const isWig = r.item.kind === "wig";
          const id = r.item.id;
          const key = `${faceKey}:${id}`;
          const quotaMessage = photo.kind === "own" && status?.mode === "live" && !needCode && !started.current.has(key) && (
            status.reason === "daily_cap" || status.reason === "reserve" || (ownLive && !budgetIds.has(id))
          )
            ? status.reason === "reserve"
              ? "Preview paused to protect the remaining API reserve."
              : "Daily preview limit reached. Try this style when it resets."
            : undefined;
          return (
            <ResultCard
              key={`${faceKey}:${id}`}
              cardRef={near.ref(key)}
              deferImage={i > 0 && !nearKeys.has(key)}
              quotaMessage={quotaMessage}
              ranked={r}
              state={stateOf(id)}
              view={viewOf(id)}
              subject={subject}
              whose={whose}
              label={isWig ? matchLabel(r, { hair, texture: sample?.texture }) : undefined}
              onDemand={false}
              previewUnavailable={false}
              renderBusy={renderBusy}
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
        <div>
          <h2 id="next-h" className={styles.panelHead}>Take your shortlist to a fitting.</h2>
          <p className="note">The styles are illustrative. Your wig specialist can help confirm fit, comfort, and what is available.</p>
        </div>
        <Link href={planHref(photo.kind, stage, photo.kind === "sample" ? photo.id : undefined)} className="btn btn-quiet">Plan around the treatment dates</Link>
        <button type="button" className="btn btn-quiet" onClick={startOver}>Start a new lookbook</button>
        <p className="note">Starting over clears your photo and deletes your try-ons from YouCam.</p>
      </section>

      <div className={styles.compareBar} role="region" aria-label="Fitting bag">
        <div className={styles.bagDock}>
          <div className={styles.bagSummary}>
            <span className={styles.bagCount}>{selected.length}</span>
            <div>
              <strong>{selected.length === 0 ? "Your fitting bag" : selected.length === 1 ? "1 look saved for your fitting" : `${selected.length} looks saved for your fitting`}</strong>
              <p>{selected.length === 0 ? "Save looks here to compare and take to a specialist." : "Style ideas only · availability confirmed with your specialist"}</p>
            </div>
          </div>
          <div className={styles.bagActions}>
            <button type="button" className="btn btn-quiet" disabled={selected.length < 2} onClick={() => { setComparing(true); window.scrollTo(0, 0); }}>
              {selected.length < 2 ? "Save two to compare" : "Compare two looks"}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => document.getElementById("fitting-brief")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              Go to fitting brief
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
