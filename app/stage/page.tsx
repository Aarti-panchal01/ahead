"use client";
// Screen 4: "Has your hair loss started?" We ask because the length detector reports a bald head as
// "above the ears" (docs/api-truth-table.md row 10).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import NeedPhoto from "@/components/NeedPhoto";
import { useSampleFromRoute, useSession } from "@/components/SessionProvider";
import YourPhoto from "@/components/YourPhoto";
import { STAGES, WHY_WE_ASK } from "@/lib/client/copy";
import { resultsHref } from "@/lib/client/routes";
import type { HairLossStage } from "@/lib/types";
import styles from "./stage.module.css";

export default function Stage() {
  useSampleFromRoute();
  const { photo, stage, setStage } = useSession();
  const router = useRouter();
  const [choice, setChoice] = useState<HairLossStage | undefined>(stage);

  useEffect(() => setChoice(stage), [stage]);

  if (!photo) return <NeedPhoto />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!choice) return;
    setStage(choice);
    router.push(resultsHref(photo.kind, choice, photo.kind === "sample" ? photo.id : undefined));
  };

  return (
    <main className={styles.stage}>
      <Link href="/capture" className="back">Choose a different photo</Link>
      <div className={styles.layout}>
        <aside className={styles.photoPanel} aria-label="Your selected photo">
          <YourPhoto photo={photo} priority sizes="(max-width: 700px) 86vw, 28rem" />
          <p>{photo.kind === "own" ? "Your photo is ready in this browser." : "A sample portrait for this preview."}</p>
        </aside>
        <form onSubmit={submit} className={styles.form}>
            <p className={styles.eyebrow}>Your hair, in your words</p>
          <fieldset className={styles.set}>
            <legend className={styles.legend}>
              <h1>Where are you in your hair-loss experience?</h1>
            </legend>
            <p className={styles.help}>{WHY_WE_ASK}</p>
            <div className={styles.options}>
              {STAGES.map((s) => (
                <label key={s.value} className={styles.option}>
                  <input
                    type="radio"
                    name="stage"
                    value={s.value}
                    checked={choice === s.value}
                    onChange={() => setChoice(s.value)}
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="btn btn-primary" disabled={!choice}>Show my matches</button>
        </form>
      </div>
    </main>
  );
}
