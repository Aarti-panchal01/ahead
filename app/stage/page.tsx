"use client";
// Screen 4: "Has your hair loss started?" We ask because the length detector reports a bald head as
// "above the ears" (docs/api-truth-table.md row 10).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import NeedPhoto from "@/components/NeedPhoto";
import { useSession } from "@/components/SessionProvider";
import YourPhoto from "@/components/YourPhoto";
import { STAGES, WHY_WE_ASK } from "@/lib/client/copy";
import { resultsHref } from "@/lib/client/routes";
import type { HairLossStage } from "@/lib/types";
import styles from "./stage.module.css";

export default function Stage() {
  const { photo, stage, setStage } = useSession();
  const router = useRouter();
  const [choice, setChoice] = useState<HairLossStage | undefined>(stage);

  if (!photo) return <NeedPhoto />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!choice) return;
    setStage(choice);
    router.push(resultsHref(photo.kind, choice, photo.kind === "sample" ? photo.id : undefined));
  };

  return (
    <main className="stack-lg">
      <Link href="/capture" className="back">Choose a different photo</Link>
      <YourPhoto photo={photo} compact priority />
      <form onSubmit={submit} className="stack-lg">
        <fieldset className={styles.set}>
          <legend className={styles.legend}>
            <h1>Has your hair loss started?</h1>
          </legend>
          <p className="note">{WHY_WE_ASK}</p>
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
    </main>
  );
}
