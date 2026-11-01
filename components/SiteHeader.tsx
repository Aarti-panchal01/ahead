"use client";
import Link from "next/link";
import { useSession } from "./SessionProvider";
import styles from "./SiteHeader.module.css";

export default function SiteHeader() {
  const { photo } = useSession();
  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link href="/" className={styles.mark}>
          <svg className={styles.mirror} viewBox="0 0 28 32" aria-hidden="true" focusable="false">
            <path d="M5 13a9 9 0 0 1 18 0v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
            <path d="M14 24v4m-5 0h10" />
            <circle cx="14" cy="12" r="2.5" />
          </svg>
          <span>ahead</span>
          {photo && <span className={styles.dot} aria-hidden="true" />}
        </Link>
        <nav className={styles.nav} aria-label="Main navigation">
          <Link href="/how-we-tested" className={styles.how}>How it works</Link>
          <Link href="/start" className={styles.start}>Use your photo</Link>
        </nav>
      </div>
    </header>
  );
}
