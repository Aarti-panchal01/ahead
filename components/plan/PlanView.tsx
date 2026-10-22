"use client";
// /plan: a cosmetic planning timeline around the first treatment date (optional), a shortlist, a brief draft and
// short messages, from POST /api/agent/plan. Nothing paid runs without an explicit "Yes, try it on" tap.
import Link from "next/link";
import { useId, useState } from "react";
import AiImage from "@/components/AiImage";
import NeedPhoto from "@/components/NeedPhoto";
import { hairOf, useSession, type ChosenPhoto } from "@/components/SessionProvider";
import IntegrityLine from "@/components/results/IntegrityLine";
import { getItem } from "@/lib/catalogue";
import { PREVIEW_DISCLAIMER } from "@/lib/client/copy";
import { integrityCheck } from "@/lib/client/image";
import { goneImage, tryOnFace } from "@/lib/client/personas";
import { downscaleForUpload } from "@/lib/client/photo";
import { CARE_TEAM_LINE, FALLBACK_LINE, planMessages, planSteps, requestPlan, todayIso } from "@/lib/client/planApi";
import { sessionHeaders } from "@/lib/client/session";
import { testerHeaders } from "@/lib/client/tester";
import { renderSrc, runTryOn } from "@/lib/client/tryon";
import type { IntegrityReport, PlanRequest, PlanResponse } from "@/lib/types";
import styles from "./plan.module.css";

/** "Thu 29 Oct" for a "YYYY-MM-DD" date, read as a calendar day (no time zone shift). */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

type Approval =
  | { phase: "running" }
  | { phase: "done"; src: string; report: IntegrityReport }
  | { phase: "error"; message: string };

function ApprovalStep({ itemId, units, photo, isSample }: { itemId: string; units: number; photo: ChosenPhoto; isSample: boolean }) {
  const item = getItem(itemId);
  const [a, setA] = useState<Approval>();
  if (!item) return null;

  const run = async () => {
    setA({ phase: "running" });
    try {
      const face = photo.kind === "sample" ? tryOnFace(photo.id) : await downscaleForUpload(photo.url);
      const r = await runTryOn(item.id, face, { headers: { ...sessionHeaders(), ...(photo.kind === "own" ? testerHeaders() : {}) } });
      const src = renderSrc(r);
      if (r.status !== "success" || !src) return setA({ phase: "error", message: r.message ?? "That didn't work. Try again in a minute." });
      const original = photo.kind === "sample" ? goneImage(photo.id) : photo.url;
      const report = await integrityCheck(original, src);
      setA({ phase: "done", src: report.correctedImage ?? src, report });
    } catch {
      setA({ phase: "error", message: "We couldn't prepare the photo. Try again." });
    }
  };

  return (
    <li className={styles.approval}>
      <p><strong>Try on the {item.name.toLowerCase()}</strong> on {isSample ? "her" : "your"} photo.</p>
      <p className="note">This uses {units} of this session&rsquo;s 30 try-on units. Nothing runs until you say yes.</p>
      {!a && <button type="button" className="btn btn-quiet" onClick={run}>Yes, try it on</button>}
      {a?.phase === "running" && <p className="note" role="status">Putting it on. This usually takes 9 to 30 seconds.</p>}
      {a?.phase === "error" && <p className="notice" role="alert">{a.message}</p>}
      {a?.phase === "done" && (
        <div className="stack">
          {isSample ? (
            <AiImage src={a.src} alt={`Wearing the ${item.name.toLowerCase()}`} width={821} height={1024} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- render of the user's own photo
            <img src={a.src} alt={`You wearing the ${item.name.toLowerCase()}`} className={styles.render} />
          )}
          <IntegrityLine report={a.report} whose={isSample ? "her" : "your"} />
          <p className="note">{PREVIEW_DISCLAIMER}</p>
        </div>
      )}
    </li>
  );
}

export default function PlanView() {
  const { photo, stage } = useSession();
  const dateId = useId();
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlanResponse>();

  if (!photo) return <NeedPhoto />;
  const isSample = photo.kind === "sample";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const req: PlanRequest = {
      stage: stage ?? "not_yet",
      firstTreatmentDate: date || undefined,
      personaId: photo.kind === "sample" ? photo.id : undefined,
      hairColour: photo.kind === "own" ? hairOf(photo) : undefined,
    };
    setPlan(await requestPlan(req, fetch, todayIso(), sessionHeaders()));
    setBusy(false);
  };

  // Each fixed line is shown once, in its own place: the simple-planner notice at the top, the care-team line
  // closing the timeline. The planner may also send them as messages or as an undated timeline step.
  const messages = plan ? planMessages(plan) : [];
  const steps = plan ? planSteps(plan) : [];

  return (
    <main className="stack-lg">
      <Link href="/results" className="back">Back to the matches</Link>
      <section className="stack">
        <h1>Plan around the treatment dates</h1>
        <p className="lede">A simple calendar for trying on and choosing. It is about looks only, not about treatment.</p>
      </section>

      <form onSubmit={submit} className="stack">
        <div className={styles.field}>
          <label htmlFor={dateId}>First treatment date (optional)</label>
          <input id={dateId} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-describedby={`${dateId}-hint`} />
          <p id={`${dateId}-hint`} className="note">Only used to place the steps on a calendar. It isn&rsquo;t stored.</p>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Making the plan" : "Make my plan"}</button>
      </form>

      {plan && (
        <div className="stack-lg" aria-live="polite">
          {plan.source === "fallback" && <p className="notice">{FALLBACK_LINE}</p>}
          {messages.length > 0 && (
            <section className="stack">
              {messages.map((m, i) => <p key={i}>{m}</p>)}
            </section>
          )}

          <section className="stack" aria-labelledby="tl-h">
            <h3 id="tl-h">Timeline</h3>
            <ol className={styles.timeline}>
              {steps.map((t, i) => (
                <li key={i} className={styles.step}>
                  {t.date ? <p className={styles.date}><time dateTime={t.date}>{shortDate(t.date)}</time></p> : <p className={styles.date}>Any time</p>}
                  <div>
                    <p className={styles.label}>{t.label}</p>
                    {t.note && <p className="note">{t.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
            <p className={styles.care}>{CARE_TEAM_LINE}</p>
          </section>

          {plan.shortlist.length > 0 && (
            <section className="stack" aria-labelledby="sl-h">
              <h3 id="sl-h">Shortlist</h3>
              <ul className={styles.shortlist}>
                {plan.shortlist.map((id) => {
                  const it = getItem(id);
                  return it ? (
                    <li key={id}>
                      <AiImage src={it.image} alt={`Our model wearing the ${it.name.toLowerCase()}`} width={821} height={1024} className={styles.thumb} sizes="(max-width: 34rem) 46vw, 16rem" />
                      <p className={styles.thumbName}>{it.name}</p>
                    </li>
                  ) : null;
                })}
              </ul>
            </section>
          )}

          {plan.pendingApproval && plan.pendingApproval.length > 0 && (
            <section className="stack" aria-labelledby="ap-h">
              <h3 id="ap-h">Try-ons waiting for your yes</h3>
              <ul className={styles.approvals}>
                {plan.pendingApproval.map((p) => (
                  <ApprovalStep key={p.itemId} itemId={p.itemId} units={p.units} photo={photo} isSample={isSample} />
                ))}
              </ul>
            </section>
          )}

          <section className="stack" aria-labelledby="bd-h">
            <h3 id="bd-h">Brief draft for {isSample ? "her" : "your"} stylist</h3>
            <p className={styles.brief}>{plan.brief}</p>
          </section>

        </div>
      )}
    </main>
  );
}
