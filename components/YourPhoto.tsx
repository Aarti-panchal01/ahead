"use client";
// The person's own photo, the hero of every screen after capture. Sample people go through AiImage.
import AiImage from "./AiImage";
import type { ChosenPhoto } from "./SessionProvider";
import { getSample, heroImage } from "@/lib/client/personas";
import type { HairLossStage } from "@/lib/types";
import styles from "./YourPhoto.module.css";

interface Props {
  photo: ChosenPhoto;
  stage?: HairLossStage;
  compact?: boolean;
  /** Sample person with hair gone: show her brows photo (brows drawn at her own brow colour, skin unchanged). */
  brows?: boolean;
}

export default function YourPhoto({ photo, stage = "not_yet", compact, brows }: Props) {
  const cls = `${styles.photo} ${compact ? styles.compact : ""}`;
  if (photo.kind === "sample") {
    const p = getSample(photo.id);
    const now = stage === "gone" ? `${p?.label ?? "Sample person"} with her hair gone${brows ? ", with brows drawn on" : ""}` : `${p?.label ?? "Sample person"}, ${p?.description ?? ""}`;
    return <AiImage src={heroImage(photo.id, stage, brows)} alt={now} width={821} height={1024} className={cls} />;
  }
  return (
    <figure className={cls}>
      {/* eslint-disable-next-line @next/next/no-img-element -- in-memory object URL, never uploaded in mock mode */}
      <img src={photo.url} alt="Your photo" className={styles.img} />
    </figure>
  );
}
