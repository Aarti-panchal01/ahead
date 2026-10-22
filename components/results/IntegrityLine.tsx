import type { IntegrityRegion, IntegrityReport } from "@/lib/types";
import styles from "./results.module.css";

const CHEEKS: IntegrityRegion[] = ["cheek_left", "cheek_right"];

/** Plain words for regions the check left out, e.g. a cheek in the shadow of a new bob. Empty when none. */
export function skippedClause(skipped: IntegrityRegion[] | undefined): string {
  const s = [...new Set(skipped ?? [])];
  if (!s.length) return "";
  const cheeks = s.filter((r) => CHEEKS.includes(r)).length;
  const names: string[] = [];
  if (cheeks) names.push(cheeks === 2 ? "both cheeks" : "one cheek");
  if (s.includes("nose_bridge")) names.push("the nose bridge");
  if (s.includes("chin")) names.push("the chin");
  const plural = names.length > 1 || cheeks === 2;
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return `${list[0].toUpperCase()}${list.slice(1)} ${plural ? "are" : "is"} in the shadow of the new hair, so we left ${plural ? "them" : "it"} out of the check.`;
}

/** The lab words its results for the user ("your skin"); on a sample person's photo we say "her skin". */
export function forWhom(text: string, whose: "her" | "your"): string {
  return whose === "her" ? text.replace(/\byour\b/g, "her").replace(/\bYour\b/g, "Her") : text;
}

/** The check result every card shows (CLAUDE.md, Core rule). Green when unchanged or corrected, amber when it failed. */
export default function IntegrityLine({ report, whose = "your" }: { report: IntegrityReport; whose?: "her" | "your" }) {
  const tone = report.status === "failed" ? styles.warn : styles.ok;
  const clause = skippedClause(report.skippedRegions);
  // The lab may already say it in plainText; don't say it twice.
  const already = /out of the check/i.test(report.plainText);
  return (
    <div className={`${styles.integrity} ${tone}`}>
      <span className={styles.integrityDot} aria-hidden="true" />
      <p className={styles.integrityText}>
        {forWhom(report.plainText, whose)}
        {clause && !already && <span className={styles.integrityMore}>{clause}</span>}
      </p>
    </div>
  );
}
