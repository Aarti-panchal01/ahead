"use client";
// Screen 2: consent, before the camera.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { CONSENT_LINES } from "@/lib/client/copy";
import styles from "./consent.module.css";


export default function Consent() {
  const { setConsented } = useSession();
  const router = useRouter();
  return (
    <main className={`${styles.consent} stack-lg`}>
      <Link href="/" className="back">Back to the start</Link>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>A personal try-on during treatment-related hair loss</p>
        <h1>Before you use your photo</h1>
        <p>Here is what happens to your photo, in plain terms.</p>
      </header>
      <ul className={styles.lines}>
        {CONSENT_LINES.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <div className={styles.action}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { setConsented(true); router.push("/capture"); }}
        >
          I agree, continue to my photo
        </button>
      </div>
    </main>
  );
}
