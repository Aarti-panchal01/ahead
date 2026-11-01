"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession, type ChosenPhoto } from "@/components/SessionProvider";
import { demoNote, fetchMode } from "@/lib/client/mode";
import { photoFromFile, photoFromVideo, type LocalPhoto } from "@/lib/client/photo";
import styles from "./capture.module.css";

const GUIDANCE = ["Face the camera, chin level.", "Find even light, with no bright window behind you.", "Step back so your shoulders show."];
type CamState = "off" | "starting" | "live";

export default function Capture() {
  const { consented, photo, setPhoto } = useSession();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState<CamState>("off");
  const [shot, setShot] = useState<LocalPhoto>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const activePhoto = useRef<ChosenPhoto | undefined>(photo);
  useEffect(() => { activePhoto.current = photo; }, [photo]);

  const applyLateHair = (local: LocalPhoto) => {
    void local.hairPromise?.then((hair) => {
      if (!hair) return;
      setShot((current) => current?.url === local.url ? { url: local.url, hair } : current);
      const current = activePhoto.current;
      if (current?.kind === "own" && current.url === local.url) {
        const updated = { ...current, hair };
        activePhoto.current = updated;
        setPhoto(updated);
      }
    });
  };

  useEffect(() => { fetchMode().then((s) => setNote(demoNote(s))); }, []);
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCam("off");
  };
  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const openCamera = async () => {
    setError(undefined);
    setCam("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      setCam("live");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCam("off");
      setError("Camera access is unavailable. Allow it in your browser settings, or choose a photo instead.");
    }
  };

  const takePhoto = async () => {
    if (!videoRef.current) return;
    setBusy(true);
    try {
      const next = await photoFromVideo(videoRef.current);
      setShot(next);
      applyLateHair(next);
      stopCamera();
    } catch {
      setError("That photo did not save. Check the camera and try again.");
    } finally { setBusy(false); }
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!consented) {
      setError("Review the photo privacy details before choosing a personal photo.");
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const next = await photoFromFile(file);
      if (shot) URL.revokeObjectURL(shot.url);
      setShot(next);
      applyLateHair(next);
      stopCamera();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unreadable";
      setError(reason === "too-large"
        ? "That photo is over 25 MB. Choose a smaller image."
        : reason === "unsupported"
          ? "Choose a photo file in JPG, PNG, WebP, AVIF or HEIC format."
          : "We could not read that photo. Try a JPG or PNG image from your camera roll.");
    } finally { setBusy(false); }
  };

  const useShot = () => {
    if (!shot) return;
    const chosen = { kind: "own" as const, url: shot.url, hair: shot.hair };
    activePhoto.current = chosen;
    setPhoto(chosen);
    applyLateHair(shot);
    router.push("/stage");
  };
  return (
    <main className={styles.capture}>
      <Link href="/" className="back">Back to the start</Link>
      <header className={styles.intro}>
        <p className={styles.eyebrow}><span aria-hidden="true" /> For hair changes during cancer treatment</p>
        <h1>Start with a photo of you.</h1>
        <p className={styles.lede}>Preview wigs and wraps on your own face, explore every style in a horizontal lookbook, and save favourites for your fitting.</p>
      </header>

      <div className={styles.columns}>
        <section className={styles.photoPanel} aria-labelledby="photo-heading">
          {shot ? (
            <>
              <div className={styles.panelHeading}>
                <div><p className={styles.eyebrow}>Your photo</p><h2 id="photo-heading">Ready when you are.</h2></div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- in-memory object URL */}
              <img src={shot.url} alt="Your selected photo" className={styles.preview} />
              {note && <p className="notice">{note}</p>}
              <div className={styles.actions}>
                <button type="button" className="btn btn-primary" onClick={useShot}>Continue with this photo</button>
                <button type="button" className="btn btn-quiet" onClick={() => fileRef.current?.click()}>Choose a different photo</button>
              </div>
            </>
          ) : !consented ? (
            <div className={styles.consentCard}>
              <div className={styles.panelHeading}>
                <div><p className={styles.eyebrow}>Use your own photo</p><h2 id="photo-heading">You stay in control.</h2></div>
                <span className={styles.lock} aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4.5" y="10" width="15" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>
              </div>
              <p>Before opening your camera or selecting a photo, we’ll explain how it is handled. You stay in control of when a live preview is made.</p>
              <Link href="/start" className="btn btn-primary">Review privacy & continue</Link>
            </div>
          ) : (
            <>
              <div className={styles.panelHeading}>
                <div><p className={styles.eyebrow}>Use your own photo</p><h2 id="photo-heading">Choose how to begin.</h2></div>
                <span className={styles.lock} aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4.5" y="10" width="15" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>
              </div>
              <div className={styles.viewer} data-live={cam === "live"}>
                {cam === "off" ? (
                  <div className={styles.cameraPrompt}>
                    <span className={styles.cameraIcon} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7.5h3l1.5-2h7l1.5 2h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-16A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1-1.5Z" /><circle cx="12" cy="13" r="3.5" /></svg></span>
                    <strong>A clear, front-facing photo works best.</strong>
                    <span>Face a window or soft light. Keep your shoulders in frame.</span>
                  </div>
                ) : (
                  <>
                    <video ref={videoRef} className={styles.video} playsInline muted aria-label="Camera preview" />
                    <div className={styles.oval} aria-hidden="true" />
                  </>
                )}
              </div>
              {cam === "live" && <p className={styles.privacyHint}>{GUIDANCE.join(" ")}</p>}
              {error && <p className="notice" role="alert">{error}</p>}
              {note && cam === "off" && <p className="note">{note}</p>}
              <div className={styles.actions}>
                {cam === "live" ? (
                  <>
                    <button type="button" className="btn btn-primary" onClick={takePhoto} disabled={busy}>{busy ? "Preparing your photo…" : "Take this photo"}</button>
                    <button type="button" className="btn btn-quiet" onClick={stopCamera}>Close camera</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "Preparing your photo…" : "Upload a photo"}</button>
                    <button type="button" className="btn btn-quiet" onClick={openCamera} disabled={cam === "starting"}>{cam === "starting" ? "Opening camera…" : "Use the camera"}</button>
                  </>
                )}
              </div>
              <p className={styles.privacyHint}>JPG, PNG, WebP, AVIF or HEIC · up to 25 MB</p>
            </>
          )}
          <input ref={fileRef} id="photo-upload" type="file" accept="image/*" className="sr-only" onChange={onFile} aria-label="Choose a photo to upload" disabled={!consented} />
        </section>

        <aside className={styles.samplePanel} aria-labelledby="preview-heading">
          <div className={styles.panelHeading}>
            <div><p className={styles.eyebrow}>Your fitting, at your pace</p><h2 id="preview-heading">A lookbook made for your decision.</h2></div>
            <span className={styles.sampleCount}>Wigs + wraps</span>
          </div>
          <p className={styles.sampleIntro}>Ask for your matches once; the available wig and headwear looks then load on your photo together.</p>
          <ol className={styles.previewSteps}>
            <li><span>01</span><div><strong>See it on you</strong><p>Try a style using your own photo.</p></div></li>
            <li><span>02</span><div><strong>Move through every look</strong><p>Swipe across wigs and head wraps.</p></div></li>
            <li><span>03</span><div><strong>Bring your shortlist</strong><p>Ask your wig specialist about real products and availability.</p></div></li>
          </ol>
          <p className={styles.sampleFoot}>The current style references are illustrative, not a retailer’s live stock.</p>
        </aside>
      </div>
    </main>
  );
}
