"use client";
// /brief/[id]: what a stylist sees. Items with their catalogue photos, the colours, notes, and when the link stops
// working. No photos of the person are stored or shown. No accounts.
import Link from "next/link";
import { useEffect, useState } from "react";
import AiImage from "@/components/AiImage";
import { getItem } from "@/lib/catalogue";
import { expiryLine, getBrief, type GetResult } from "@/lib/client/briefApi";
import { PREVIEW_DISCLAIMER, SCREEN_COLOUR_NOTE } from "@/lib/client/copy";
import styles from "./brief.module.css";

function Swatch({ hex, label }: { hex: string; label: string }) {
  return (
    <div className={styles.swatchRow}>
      <span className={styles.swatch} style={{ background: hex }} role="img" aria-label={`${label} swatch, ${hex}`} />
      <div>
        <p className={styles.swatchLabel}>{label}</p>
        <p className={styles.hex}>{hex.toUpperCase()}</p>
      </div>
    </div>
  );
}

export default function BriefView({ id }: { id: string }) {
  const [res, setRes] = useState<GetResult>();
  useEffect(() => {
    let live = true;
    getBrief(id).then((r) => live && setRes(r));
    return () => { live = false; };
  }, [id]);

  if (!res) return <main className="stack"><h1>Stylist brief</h1><p className="note" role="status">Loading the brief</p></main>;
  if (res.status !== "ok") {
    return (
      <main className="stack-lg">
        <h1>{res.status === "expired" ? "This brief has expired" : "Brief not found"}</h1>
        <p className="lede">{res.message}</p>
        <Link href="/" className="btn btn-quiet">Go to Ahead</Link>
      </main>
    );
  }

  const { brief } = res;
  const items = brief.items.map((x) => getItem(x)).filter((x) => x !== undefined);
  return (
    <main className={`stack-lg ${styles.brief}`}>
      <section className="stack">
        <h1>Stylist brief</h1>
        <p className="lede">Wigs and wraps chosen with Ahead, with the colours to match.</p>
        <p className="note">{expiryLine(brief.expiresAt)}</p>
      </section>

      {(brief.hairColour || brief.browColour) && (
        <section className="stack" aria-labelledby="colours-h">
          <h2 id="colours-h" className="h3">Colours</h2>
          {brief.hairColour && <Swatch hex={brief.hairColour} label="Hair colour, read from a photo" />}
          {brief.browColour && <Swatch hex={brief.browColour} label="Brow colour, read from a photo" />}
          <p className="note">{SCREEN_COLOUR_NOTE} Match against a lock of hair, not this screen.</p>
        </section>
      )}

      <section className="stack" aria-labelledby="items-h">
        <h2 id="items-h" className="h3">Chosen styles</h2>
        <ul className={styles.items}>
          {items.map((it) => (
            <li key={it.id} className={styles.item}>
              <AiImage src={it.image} alt={`Our model wearing the ${it.name.toLowerCase()}`} width={821} height={1024} className={styles.itemPhoto} sizes="(max-width: 34rem) 36vw, 12rem" />
              <div className={styles.itemBody}>
                <p className={styles.itemName}>{it.name}</p>
                <p className="note">{it.kind === "wig" ? `Wig, ${it.length}, ${it.texture}` : `Wrap, ${it.texture}`}</p>
                <Swatch hex={it.colour} label={it.kind === "wig" ? "Wig colour" : "Fabric colour"} />
              </div>
            </li>
          ))}
        </ul>
        <p className="note">{PREVIEW_DISCLAIMER}</p>
      </section>

      {brief.notes && (
        <section className="stack" aria-labelledby="notes-h">
          <h2 id="notes-h" className="h3">Notes</h2>
          <p className={styles.notes}>{brief.notes}</p>
        </section>
      )}

      <button type="button" className="btn btn-quiet" onClick={() => window.print()}>Print this brief</button>
    </main>
  );
}
