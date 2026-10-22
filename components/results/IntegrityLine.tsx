import type { IntegrityReport } from "@/lib/types";
import styles from "./results.module.css";

/** The check result every card shows (CLAUDE.md, Core rule). Green when unchanged or corrected, amber when it failed. */
export default function IntegrityLine({ report }: { report: IntegrityReport }) {
  const tone = report.status === "failed" ? styles.warn : styles.ok;
  return (
    <p className={`${styles.integrity} ${tone}`}>
      <span className={styles.integrityDot} aria-hidden="true" />
      {report.plainText}
    </p>
  );
}
