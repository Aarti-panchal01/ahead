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
    <main className="stack-lg">
      <Link href="/" className="back">Back to the start</Link>
      <h1>Before you take a photo</h1>
      <ul className={styles.lines}>
        {CONSENT_LINES.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => { setConsented(true); router.push("/capture"); }}
      >
        I agree, continue to my photo
      </button>
    </main>
  );
}
