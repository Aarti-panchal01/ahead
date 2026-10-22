"use client";
// Flow state for one visit. Kept in memory only: nothing is stored after the session
// (no localStorage, no cookies). A refresh starts over, which is the privacy promise.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { accentFor, applyAccent } from "@/lib/client/accent";
import { getSample, type SampleId } from "@/lib/client/personas";
import { endSession, resetSessionId } from "@/lib/client/session";
import type { AccentColour, HairLossStage } from "@/lib/types";

export type ChosenPhoto =
  | { kind: "sample"; id: SampleId }
  /** url is an object URL of the user's own photo; it never leaves the browser in mock mode. */
  | { kind: "own"; url: string; hair?: string };

interface Session {
  consented: boolean;
  setConsented: (v: boolean) => void;
  photo?: ChosenPhoto;
  setPhoto: (p?: ChosenPhoto) => void;
  stage?: HairLossStage;
  setStage: (s?: HairLossStage) => void;
  accent: AccentColour;
}

const Ctx = createContext<Session | null>(null);

/** The hair colour that drives the accent: a sample person's precomputed colour or the user's sampled one. */
export function hairOf(photo?: ChosenPhoto): string | undefined {
  if (!photo) return undefined;
  return photo.kind === "sample" ? getSample(photo.id)?.hair : photo.hair;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [consented, setConsented] = useState(false);
  const [photo, setPhotoState] = useState<ChosenPhoto>();
  const [stage, setStage] = useState<HairLossStage>();

  const setPhoto = useCallback((p?: ChosenPhoto) => {
    setPhotoState((old) => {
      if (old?.kind === "own" && old.url !== (p?.kind === "own" ? p.url : undefined)) URL.revokeObjectURL(old.url);
      return p;
    });
  }, []);

  const hair = hairOf(photo);
  const accent = useMemo(() => accentFor(hair), [hair]);

  useEffect(() => {
    applyAccent(document.documentElement.style, accent);
  }, [accent]);

  // Leaving the page ends the session: its YouCam try-ons are deleted (POST /api/session/end, keepalive).
  useEffect(() => {
    // If the page comes back from the back/forward cache, later try-ons start a fresh session id.
    const onHide = () => {
      void endSession();
      resetSessionId();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const value = useMemo(
    () => ({ consented, setConsented, photo, setPhoto, stage, setStage, accent }),
    [consented, photo, setPhoto, stage, accent],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession must be used inside SessionProvider");
  return s;
}
