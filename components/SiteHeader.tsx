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
          {photo && <span className={styles.dot} aria-hidden="true" />}
          Ahead
        </Link>
      </div>
    </header>
  );
}
