"use client";
// The colour match card for one chosen wig: the person's real hair next to the wig's colour, both hex values,
// and the honest part (CLAUDE.md, skin-tone-analysis; truth table row 9): photo colour is approximate, so bring a
// lock of hair to the stylist.
import { useEffect, useState } from "react";
import AiImage from "@/components/AiImage";
import { SCREEN_COLOUR_NOTE, lockLine, type Whose } from "@/lib/client/copy";
import { hairCrop } from "@/lib/client/image";
import { PERSONA_SIZE, beforeImage, getSample, type SampleId } from "@/lib/client/personas";
import type { CatalogueItem } from "@/lib/types";
import styles from "./results.module.css";

export type HairSource = { kind: "sample"; id: SampleId } | { kind: "own"; url: string };

interface Props {
  item: CatalogueItem;
  hair: string;
  source: HairSource;
  whose: Whose;
}

function OwnHair({ url }: { url: string }) {
  const [crop, setCrop] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    hairCrop(url).then((c) => live && setCrop(c ?? null));
    return () => { live = false; };
  }, [url]);
  if (crop === undefined) return <div className={styles.matchSquare} role="status"><span className="note">Finding your hair</span></div>;
  if (crop === null) return <div className={styles.matchSquare}><span className="note">Not enough hair in the photo to show</span></div>;
  // eslint-disable-next-line @next/next/no-img-element -- a crop of the user's own photo, made on this device
  return <img src={crop} alt="A close-up of your hair from your photo" className={styles.matchSquare} />;
}

export default function MatchCard({ item, hair, source, whose }: Props) {
  const sample = source.kind === "sample" ? getSample(source.id) : undefined;
  return (
    <section className={styles.match} aria-label={`Colour match for the ${item.name.toLowerCase()}`}>
      <div className={styles.matchPair}>
        <div className={styles.matchCol}>
          {sample ? (
            <AiImage
              src={beforeImage(sample.id)}
              alt={`A close-up of ${sample.label.toLowerCase()}'s hair from her photo before`}
              className={styles.matchSquare}
              crop={{ x: sample.hairCrop[0], y: sample.hairCrop[1], size: sample.hairCrop[2], naturalWidth: PERSONA_SIZE.width }}
            />
          ) : (
            <OwnHair url={(source as { url: string }).url} />
          )}
          <p className={styles.matchName}>{whose === "her" ? "Her hair" : "Your hair"}</p>
          <p className={styles.hex}>{hair.toUpperCase()} <span className="note">(read from the photo)</span></p>
        </div>
        <div className={styles.matchCol}>
          <div className={styles.matchSquare} style={{ background: item.colour }} role="img" aria-label={`Wig colour swatch, ${item.colour}`} />
          <p className={styles.matchName}>This wig</p>
          <p className={styles.hex}>{item.colour.toUpperCase()}</p>
        </div>
      </div>
      <p><strong>{lockLine(whose)}</strong></p>
      <p className="note">{SCREEN_COLOUR_NOTE}</p>
    </section>
  );
}
