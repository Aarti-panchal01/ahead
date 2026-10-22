// Claim linter for CI: scans the words people actually read (UI copy and agent fixtures) with findClaims() from
// lib/agent/claims.ts and exits non-zero on medical or over-promising wording (CLAUDE.md, Product rules).
//
//   npm run lint:claims
//
// What is scanned: string literals and JSX text in app/**, components/**, lib/client/** (comments and code are not
// text), every string value in test/agent/fixtures/**/*.json and catalogue/*.json (item names reach the UI).
// UI copy may say "deleted from YouCam" (it is true: POST /s2s/v2.0/task/delete, truth table row 17); agent
// fixtures may not, because model text is never allowed to claim it.
//
// Deliberate exceptions live in scripts/lint-claims.allow.json, each with a reason. An entry that no longer matches
// anything is reported so the list cannot rot.
import fs from "node:fs";
import path from "node:path";
import { findClaims } from "../lib/agent/claims";

export interface Piece {
  text: string;
  line: number;
}

export interface AllowEntry {
  file: string;
  rule: string;
  /** A fragment of the sentence that is allowed. */
  contains: string;
  reason: string;
}

export interface Finding {
  file: string;
  line: number;
  rule: string;
  sentence: string;
}

const lineAt = (src: string, index: number) => src.slice(0, index).split("\n").length;

/** String literals and JSX text of a .ts/.tsx file. Comments are skipped. Good enough for copy, not a parser. */
export function extractCopy(src: string): Piece[] {
  const pieces: Piece[] = [];
  const code: string[] = []; // the source with comments and string contents blanked, same offsets
  let i = 0;
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      code.push(blank(src.slice(i, stop)));
      i = stop;
    } else if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      code.push(blank(src.slice(i, stop)));
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let text = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") { text += src[j + 1] ?? ""; j += 2; continue; }
        if (c !== "`" && src[j] === "\n") break; // an apostrophe in JSX text, not a string
        if (c === "`" && src[j] === "$" && src[j + 1] === "{") {
          let depth = 1;
          j += 2;
          while (j < src.length && depth > 0) { if (src[j] === "{") depth++; else if (src[j] === "}") depth--; j++; }
          text += "X";
          continue;
        }
        text += src[j];
        j++;
      }
      if (src[j] === c) {
        if (/[A-Za-z]/.test(text)) pieces.push({ text, line: lineAt(src, i) });
        code.push(blank(src.slice(i, j + 1)));
        i = j + 1;
      } else {
        code.push(c);
        i++;
      }
    } else {
      code.push(c);
      i++;
    }
  }
  // JSX text: between a tag's ">" and the next "<", with no code characters in it.
  const stripped = code.join("");
  const ch = String.raw`(?:&#?\w+;|[^<>{}()=;&]|&(?!#?\w+;))`; // an entity such as &rsquo; is text, a bare ";" is code
  const jsx = new RegExp(String.raw`(?<![=-])>(${ch}*[A-Za-z]${ch}*)<`, "g");
  for (const m of stripped.matchAll(jsx)) {
    // The original text (string contents were blanked in `stripped`, so read the same span from the source).
    const start = (m.index ?? 0) + 1;
    const raw = src.slice(start, start + m[1].length);
    const text = raw.replace(/&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (/[A-Za-z]{2}/.test(text)) pieces.push({ text, line: lineAt(src, start) });
  }
  return pieces;
}

/** Every string value in a JSON document. */
export function jsonStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) jsonStrings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) jsonStrings(v, out);
  return out;
}

export function scanPieces(file: string, pieces: Piece[], deletedFromYoucam: boolean): Finding[] {
  const found: Finding[] = [];
  for (const p of pieces) {
    for (const h of findClaims(p.text, { deletedFromYoucam })) found.push({ file, line: p.line, rule: h.rule, sentence: h.sentence });
  }
  return found;
}

export function applyAllowList(findings: Finding[], allow: AllowEntry[]): { blocked: Finding[]; unused: AllowEntry[] } {
  const used = new Set<AllowEntry>();
  const blocked = findings.filter((f) => {
    const a = allow.find((e) => e.file === f.file && e.rule === f.rule && f.sentence.includes(e.contains));
    if (a) used.add(a);
    return !a;
  });
  return { blocked, unused: allow.filter((a) => !used.has(a)) };
}

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(p, exts, out); }
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

export function run(root: string): { findings: Finding[]; blocked: Finding[]; unused: AllowEntry[]; files: number } {
  const rel = (p: string) => path.relative(root, p).split(path.sep).join("/");
  const findings: Finding[] = [];
  let files = 0;
  for (const dir of ["app", "components", "lib/client"]) {
    for (const f of walk(path.join(root, dir), [".ts", ".tsx"])) {
      files++;
      findings.push(...scanPieces(rel(f), extractCopy(fs.readFileSync(f, "utf8")), true));
    }
  }
  const jsonFiles = [...walk(path.join(root, "test/agent/fixtures"), [".json"]), ...walk(path.join(root, "catalogue"), [".json"])];
  for (const f of jsonFiles) {
    files++;
    const strings = jsonStrings(JSON.parse(fs.readFileSync(f, "utf8")));
    const isFixture = rel(f).startsWith("test/agent/fixtures/");
    findings.push(...scanPieces(rel(f), strings.map((text) => ({ text, line: 0 })), !isFixture));
  }
  const allowPath = path.join(root, "scripts/lint-claims.allow.json");
  const allow: AllowEntry[] = fs.existsSync(allowPath) ? JSON.parse(fs.readFileSync(allowPath, "utf8")) : [];
  return { findings, ...applyAllowList(findings, allow), files };
}

// Run as a script (tsx scripts/lint-claims.ts), not when imported by the unit test.
if (process.argv[1] && /lint-claims\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) {
  const { blocked, unused, files, findings } = run(process.cwd());
  for (const a of unused) console.warn(`warning: allow-list entry matches nothing any more: ${a.file} [${a.rule}] "${a.contains}"`);
  if (blocked.length) {
    console.error(`Claim linter: ${blocked.length} medical or over-promising wording hit(s):`);
    for (const f of blocked) console.error(`  ${f.file}${f.line ? `:${f.line}` : ""}  [${f.rule}]  ${f.sentence}`);
    process.exit(1);
  }
  console.log(`Claim linter: ${files} files scanned, 0 hits (${findings.length - blocked.length} allowed with a reason).`);
}
