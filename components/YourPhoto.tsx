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
}

export default function YourPhoto({ photo, stage = "not_yet", compact }: Props) {
  const cls = `${styles.photo} ${compact ? styles.compact : ""}`;
  if (photo.kind === "sample") {
    const p = getSample(photo.id);
    return <AiImage src={heroImage(photo.id, stage)} alt={`${p?.label ?? "Sample person"}, ${p?.description ?? ""}`} width={821} height={1024} className={cls} />;
  }
  return (
    <figure className={cls}>
      {/* eslint-disable-next-line @next/next/no-img-element -- in-memory object URL, never uploaded in mock mode */}
      <img src={photo.url} alt="Your photo" className={styles.img} />
    </figure>
  );
}
