// A small Markdown reader for docs/api-truth-table.md (the honesty page): headings, paragraphs, bullet lists,
// pipe tables, and inline **bold** and `code`. Nothing else, and never raw HTML: everything renders as text.

export type Inline = { kind: "text" | "bold" | "code"; text: string };

export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "para"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] };

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l: string) => /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(l);

export function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cur = "", code = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "\\" && inner[i + 1] === "|") { cur += "|"; i++; continue; }
    if (ch === "`") code = !code;
    if (ch === "|" && !code) { cells.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { out.push({ type: "heading", level: h[1].length, text: h[2].trim() }); i++; continue; }
    if (isRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isRow(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      out.push({ type: "table", header, rows });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "").trim()); i++; }
      out.push({ type: "list", items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,6}\s/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !isRow(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    out.push({ type: "para", text: para.join(" ") });
  }
  return out;
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    out.push(m[2] !== undefined ? { kind: "bold", text: m[2] } : { kind: "code", text: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}
