"use client";
// Screen 3: take a photo, upload one, or pick a sample person.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AiImage from "@/components/AiImage";
import { useSession } from "@/components/SessionProvider";
import { demoNote, fetchMode } from "@/lib/client/mode";
import { SAMPLE_PEOPLE, beforeImage, type SampleId } from "@/lib/client/personas";
import { photoFromFile, photoFromVideo, type LocalPhoto } from "@/lib/client/photo";
import styles from "./capture.module.css";

const GUIDANCE = ["Face the camera, chin level.", "Find even light, with no bright window behind you.", "Step back so your shoulders show."];

type CamState = "off" | "starting" | "live";

export default function Capture() {
  const { consented, setPhoto } = useSession();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState<CamState>("off");
  const [shot, setShot] = useState<LocalPhoto>();
  const [error, setError] = useState<string>();
  // Shown only when own photos can't get live try-ons right now (mock mode, daily cap or reserve), with the reason.
  const [note, setNote] = useState<string>();

  useEffect(() => {
    fetchMode().then((s) => setNote(demoNote(s)));
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCam("off");
  };
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

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
      setError("We can't open your camera. Allow camera access in your browser settings, or upload a photo instead.");
    }
  };

  const takePhoto = async () => {
    if (!videoRef.current) return;
    try {
      setShot(await photoFromVideo(videoRef.current));
      stopCamera();
    } catch {
      setError("That photo didn't save. Try taking it again.");
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(undefined);
    try {
      setShot(await photoFromFile(file));
      stopCamera();
    } catch {
      setError("We couldn't open that file. Choose a JPG or PNG photo.");
    }
  };

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(undefined);
  };

  const useShot = () => {
    if (!shot) return;
    setPhoto({ kind: "own", url: shot.url, hair: shot.hair });
    router.push("/stage");
  };

  const pickSample = (id: SampleId) => {
    stopCamera();
    setPhoto({ kind: "sample", id });
    router.push("/stage");
  };

  return (
    <main className="stack-lg">
      <Link href="/" className="back">Back to the start</Link>
      <h1>Take one photo</h1>

      {consented ? (
        <section className="stack" aria-label="Your photo">
          {shot ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- in-memory object URL */}
              <img src={shot.url} alt="Your photo" className={styles.hero} />
              {note && <p className="notice">{note}</p>}
              <div className="btn-row">
                <button type="button" className="btn btn-primary" onClick={useShot}>Use this photo</button>
                <button type="button" className="btn btn-quiet" onClick={retake}>Take it again</button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.viewer} data-live={cam === "live"}>
                {cam === "off" ? (
                  <>
                    <div className={styles.ovalIdle} aria-hidden="true" />
                    <ul className={styles.guide} aria-label="For a good photo">
                      {GUIDANCE.map((g) => <li key={g}>{g}</li>)}
                    </ul>
                  </>
                ) : (
                  <>
                    <video ref={videoRef} className={styles.video} playsInline muted aria-label="Camera preview" />
                    <div className={styles.oval} aria-hidden="true" />
                  </>
                )}
              </div>
              {cam === "live" && <p className="note">{GUIDANCE.join(" ")}</p>}
              {error && <p className="notice" role="alert">{error}</p>}
              {note && cam === "off" && <p className="note">{note}</p>}
              <div className="btn-row">
                {cam === "live" ? (
                  <button type="button" className="btn btn-primary" onClick={takePhoto}>Take the photo</button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={openCamera} disabled={cam === "starting"}>
                    {cam === "starting" ? "Opening the camera" : "Open the camera"}
                  </button>
                )}
                <label className="btn btn-quiet">
                  Upload a photo
                  <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
                </label>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="stack">
          <p className="lede">To use your own photo, first read how we handle it. It takes ten seconds.</p>
          <Link href="/start" className="btn btn-quiet">Use my own photo</Link>
        </section>
      )}

      <section id="samples" className="stack" aria-labelledby="samples-h">
        <h2 id="samples-h" className={styles.subhead}>Or try with a sample person</h2>
        <p className="note">Pick someone to see the whole flow without a photo of your own.</p>
        <ul className={styles.samples}>
          {SAMPLE_PEOPLE.map((p) => (
            <li key={p.id}>
              <button type="button" className={styles.sample} onClick={() => pickSample(p.id)} aria-label={`Choose ${p.label}, ${p.description} (AI-generated)`}>
                <AiImage src={beforeImage(p.id)} alt={`${p.label}, ${p.description}`} width={821} height={1024} sizes="(max-width: 34rem) 46vw, 16rem" />
                <span className={styles.sampleName}>{p.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
