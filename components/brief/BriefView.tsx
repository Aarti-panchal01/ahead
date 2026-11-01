"use client";
// /brief/[id]: what a stylist sees. Items with their catalogue photos, the colours, notes, and when the link stops
// working. No photos of the person are stored or shown. No accounts.
import Link from "next/link";
import { useEffect, useState } from "react";
import AiImage from "@/components/AiImage";
import { getItem, referenceSku } from "@/lib/catalogue";
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
  const [copied, setCopied] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
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

  const copyLink = async () => {
    setShareMessage("");
    try {
      const url = window.location.href;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = document.createElement("textarea");
        field.value = url;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const success = document.execCommand("copy");
        field.remove();
        if (!success) throw new Error("Copy unavailable");
      }
      setCopied(true);
    } catch {
      setShareMessage("Copy this page address to share your fitting brief.");
    }
  };

  const shareBrief = async () => {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title: "Ahead fitting shortlist", text: "Here are the styles I would like to discuss at my fitting.", url: window.location.href });
      setShareMessage("Your fitting brief is ready to share.");
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") setShareMessage("You can copy the brief link or print it for your fitting.");
    }
  };

  return (
    <main className={`stack-lg ${styles.brief}`}>
      <section className="stack">
        <p className={styles.eyebrow}>Ahead · your fitting shortlist</p>
        <h1>Bring the looks you like.</h1>
        <p className="lede">A simple starting point for a more useful fitting conversation.</p>
        <p className={styles.expiry}>{expiryLine(brief.expiresAt)} This link includes your selected style references and notes, never your photo.</p>
        <div className={styles.actions} aria-label="Share or print this fitting shortlist">
          <button type="button" className="btn btn-primary" onClick={shareBrief}>Share shortlist</button>
          <button type="button" className="btn btn-quiet" onClick={copyLink}>{copied ? "Link copied" : "Copy link"}</button>
          <button type="button" className="btn btn-quiet" onClick={() => window.print()}>Print / save as PDF</button>
        </div>
        <p className={styles.printHint}>Choose “Save as PDF” in your browser’s print window for a downloadable copy.</p>
        {shareMessage && <p className="note" role="status">{shareMessage}</p>}
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
        <h2 id="items-h" className="h3">Style directions <span className={styles.count}>{items.length} looks</span></h2>
        <p className={styles.catalogueNote}>These references help describe the look you have in mind. The Ahead style SKU is an internal matching code, not a retailer SKU. Confirm the real product, price and stock with your retailer or specialist.</p>
        <ul className={styles.items}>
          {items.map((it) => (
            <li key={it.id} className={styles.item}>
              <div className={styles.referenceWrap}>
                <AiImage src={it.image} alt={`Style reference for ${it.name.toLowerCase()}`} width={821} height={1024} className={styles.itemPhoto} sizes="(max-width: 34rem) 36vw, 12rem" />
                <span className={styles.referenceLabel}>Style direction · {it.id}</span>
              </div>
              <div className={styles.itemBody}>
                <p className={styles.itemName}>{it.name}</p>
                <p className={styles.itemSku}>Ahead style SKU <strong>{referenceSku(it)}</strong></p>
                <p className={styles.itemMeta}>{it.kind === "wig" ? `Wig · ${it.length} · ${it.texture}` : `Headwear · ${it.texture}`}</p>
                <Swatch hex={it.colour} label={it.kind === "wig" ? "Wig colour" : "Fabric colour"} />
              </div>
            </li>
          ))}
        </ul>
        <p className="note">{PREVIEW_DISCLAIMER}</p>
      </section>

      <section className={styles.checklist} aria-labelledby="fitting-checks-h">
        <p className={styles.eyebrow}>At your fitting</p>
        <h2 id="fitting-checks-h" className="h3">What to confirm with the specialist</h2>
        <ul>
          <li><span aria-hidden="true">□</span><span>Which in-stock style is closest to each direction?</span></li>
          <li><span aria-hidden="true">□</span><span>Can I try the actual cap construction and size?</span></li>
          <li><span aria-hidden="true">□</span><span>What are the price, care needs and return terms?</span></li>
          <li><span aria-hidden="true">□</span><span>Can I compare the colour in natural light?</span></li>
        </ul>
      </section>

      {brief.notes && (
        <section className="stack" aria-labelledby="notes-h">
          <h2 id="notes-h" className="h3">Notes</h2>
          <p className={styles.notes}>{brief.notes}</p>
        </section>
      )}

    </main>
  );
}
