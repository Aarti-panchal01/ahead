// Claim linter: every piece of agent text passes through here before it leaves the server.
// Ahead is cosmetic only (CLAUDE.md, Product rules). Sentences with medical wording are dropped and
// replaced, once per text, by a safe line. qa reuses findClaims() in CI.

export interface ClaimRule {
  id: string;
  pattern: RegExp;
}

/** Medical and over-promising wording. Word boundaries keep "treatment", "secure" and "curly" allowed. */
export const CLAIM_RULES: ClaimRule[] = [
  { id: "cure", pattern: /\bcur(?:e|es|ed|ing)\b/i },
  { id: "treat", pattern: /\btreat(?:s|ed|ing)?\b/i },
  { id: "heal", pattern: /\bheal(?:s|ed|ing)?\b/i },
  { id: "prevent_hair_loss", pattern: /\b(?:prevent\w*|stop(?:s|ping)?|reverse\w*|reduc\w*|slow\w*|avoid\w*)\s+(?:your\s+|the\s+|any\s+)?hair\s*loss\b/i },
  { id: "regrowth_promise", pattern: /\b(?:stimulat\w*|promot\w*|boost\w*|speed\w*\s+up)\s+(?:your\s+)?(?:hair\s+)?(?:re)?growth\b/i },
  { id: "regrow", pattern: /\bregrow(?:s|ing)?\s+(?:your\s+)?hair\b/i },
  { id: "diagnose", pattern: /\bdiagnos\w*/i },
  { id: "dosage", pattern: /\b(?:dosage|doses?|dosing)\b|\b\d+(?:\.\d+)?\s?mg\b/i },
  { id: "guarantee", pattern: /\bguarantee\w*/i },
  { id: "proven", pattern: /\b(?:clinically|medically|scientifically)\s+(?:proven|tested|approved)\b/i },
  {
    id: "treatment_advice",
    pattern: /\b(?:skip|stop|delay|postpone|avoid|refuse|decline|pause|start|change)\s+(?:your\s+|the\s+)?(?:chemo\w*|radiation|radiotherapy|treatment|medication|medicine)\b/i,
  },
  { id: "treatment_advice", pattern: /\b(?:should(?:n't| not)?|must)\s+(?:have|take|get|start|stop|skip)\s+(?:your\s+)?(?:chemo\w*|radiation|radiotherapy|treatment)\b/i },
  { id: "scalp_cooling", pattern: /\b(?:scalp\s+cooling|cold\s+caps?|cooling\s+caps?)\b/i },
  { id: "medication", pattern: /\b(?:minoxidil|finasteride|biotin|supplements?|prescri\w+)\b/i },
  { id: "side_effect_promise", pattern: /\b(?:won't|will not|never)\s+lose\s+(?:your\s+)?hair\b/i },
];

/** Only say this when the session's tasks really were deleted (POST /s2s/v2.0/task/delete). */
export const DELETED_RULE: ClaimRule = { id: "deleted_from_youcam", pattern: /\bdeleted\s+from\s+youcam\b/i };

export const SAFE_LINE = "This is a cosmetic preview only. Check details with your care team.";

export interface LintOptions {
  /** True only after the session's YouCam tasks were deleted. */
  deletedFromYoucam?: boolean;
}

export interface ClaimHit {
  rule: string;
  sentence: string;
}

const rulesFor = (o: LintOptions) => (o.deletedFromYoucam ? CLAIM_RULES : [...CLAIM_RULES, DELETED_RULE]);

/** Splits one line into sentences, keeping the end punctuation. */
function sentences(line: string): string[] {
  return line.split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== "");
}

/** Every rule hit in the text, sentence by sentence (for CI and tests). */
export function findClaims(text: string, opts: LintOptions = {}): ClaimHit[] {
  const hits: ClaimHit[] = [];
  for (const line of text.split(/\r?\n/)) {
    for (const s of sentences(line)) {
      for (const r of rulesFor(opts)) if (r.pattern.test(s)) hits.push({ rule: r.id, sentence: s.trim() });
    }
  }
  return hits;
}

export interface LintResult {
  text: string;
  hits: ClaimHit[];
  clean: boolean;
}

/** Drops every sentence with a hit; adds SAFE_LINE once where the first one was. Line breaks are kept. */
export function lintText(text: string, opts: LintOptions = {}): LintResult {
  const rules = rulesFor(opts);
  const hits: ClaimHit[] = [];
  let safeAdded = false;
  const lines = text.split(/\r?\n/).map((line) => {
    const kept: string[] = [];
    let changed = false;
    for (const s of sentences(line)) {
      const bad = rules.filter((r) => r.pattern.test(s));
      if (bad.length) {
        changed = true;
        for (const r of bad) hits.push({ rule: r.id, sentence: s.trim() });
        if (!safeAdded) { kept.push(SAFE_LINE); safeAdded = true; }
      } else kept.push(s);
    }
    if (!changed) return line;
    const body = kept.join(" ").trim();
    return body || null;
  });
  return { text: lines.filter((l): l is string => l !== null).join("\n"), hits, clean: hits.length === 0 };
}

// ---------- privacy: what may reach a language model ----------
// Hard rule: no photos, treatment dates, hair-loss stage or any health detail ever goes to an LLM.
// The person's free-text notes pass through stripHealthDetails() first; sentences that mention health,
// hair loss or a date are removed whole.

export const HEALTH_RULES: ClaimRule[] = [
  {
    id: "health_word",
    pattern: /\b(?:chemo\w*|cancer\w*|treat\w*|radiation|radiotherapy|oncolog\w*|tumou?r\w*|diagnos\w*|hospital\w*|clinic\w*|doctor\w*|nurse\w*|medic\w*|drugs?|therap\w*|surger\w*|surgical|alopecia|illness|sick\w*|disease\w*|patients?|infusion\w*|cycles?|doses?|dosage|mg|scans?|biopsy|lymph\w*|leuka?emia|carcinoma|mastectomy|lumpectomy|steroids?|prescri\w*|symptoms?|side\s+effects?)\b/i,
  },
  { id: "hair_loss", pattern: /\b(?:hair\s*loss|los(?:e|ing|t)\s+(?:my\s+|all\s+my\s+)?hair|bald\w*|thinning|fall(?:s|ing)?\s+out|shed\w*|regrow\w*|grow(?:s|ing)?\s+back)\b/i },
  {
    id: "date",
    pattern: /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\b(?:next|this|last)\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:in|within|after)\s+\d+\s+(?:days?|weeks?|months?)\b|\b(?:today|tomorrow|yesterday)\b/i,
  },
];

/** True when the text holds a health detail, hair-loss detail or date. */
export const hasHealthDetail = (text: string) => HEALTH_RULES.some((r) => r.pattern.test(text));

/** Removes every sentence with a health detail, hair-loss detail or date. Safe to send to a model. */
export function stripHealthDetails(text: string | undefined): string {
  if (!text) return "";
  const kept: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    for (const s of sentences(line)) if (!hasHealthDetail(s)) kept.push(s.trim());
  }
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

/** Lints a list of short lines; drops empty results and repeats of the safe line. */
export function lintLines(lines: string[], opts: LintOptions = {}): { lines: string[]; hits: ClaimHit[] } {
  const out: string[] = [];
  const hits: ClaimHit[] = [];
  for (const l of lines) {
    const r = lintText(l, opts);
    hits.push(...r.hits);
    const t = r.text.trim();
    if (!t) continue;
    if (t === SAFE_LINE && out.includes(SAFE_LINE)) continue;
    out.push(t);
  }
  return { lines: out, hits };
}
