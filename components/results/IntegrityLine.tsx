import type { IntegrityRegion, IntegrityReport } from "@/lib/types";
import styles from "./results.module.css";

const CHEEKS: IntegrityRegion[] = ["cheek_left", "cheek_right"];

export const ONE_CHEEK_NOTE = "One cheek was in shadow, so we checked the other.";
export const BOTH_CHEEKS_NOTE = "Both cheeks were in shadow, so we checked the nose and chin.";

const NAMES: Record<IntegrityRegion, string> = { cheek_left: "one cheek", cheek_right: "one cheek", nose_bridge: "the nose", chin: "the chin" };

/** Plain words for regions the check left out (a cheek shaded by a new bob, or covered by hair). Empty when none. */
export function skippedClause(skipped: IntegrityRegion[] | undefined): string {
  const s = [...new Set(skipped ?? [])];
  if (!s.length) return "";
  const cheeks = s.filter((r) => CHEEKS.includes(r)).length;
  const others = s.filter((r) => !CHEEKS.includes(r));
  if (!others.length) return cheeks === 2 ? BOTH_CHEEKS_NOTE : ONE_CHEEK_NOTE;
  // Rarer: the nose or chin was left out too. Say what was left out and what was checked.
  const out = [...(cheeks === 2 ? ["both cheeks"] : cheeks ? ["one cheek"] : []), ...others.map((r) => NAMES[r])];
  const kept = (["cheek_left", "cheek_right", "nose_bridge", "chin"] as IntegrityRegion[]).filter((r) => !s.includes(r));
  const keptNames = [...(kept.filter((r) => CHEEKS.includes(r)).length === 2 ? ["both cheeks"] : kept.some((r) => CHEEKS.includes(r)) ? ["the other cheek"] : []),
    ...kept.filter((r) => !CHEEKS.includes(r)).map((r) => NAMES[r])];
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0]);
  const plural = out.length > 1 || cheeks === 2;
  const first = list(out);
  const tail = keptNames.length ? `so we checked ${list(keptNames)}` : "so we couldn't check the skin";
  return `${first[0].toUpperCase()}${first.slice(1)} ${plural ? "were" : "was"} in shadow or covered, ${tail}.`;
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
  const already = /in shadow/i.test(report.plainText);
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
