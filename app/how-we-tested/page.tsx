// The honesty page: our own measurements of the YouCam API (docs/api-truth-table.md), read at build time and
// rendered as plain text (no raw HTML from the file). Each table row becomes a card so it reads at 390 px.
import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { DELETION_LINE, PLANNER_PRIVACY_LINE, PLANNER_UNITS_LINE, SMOOTHING_LINE } from "@/lib/client/copy";
import { parseInline, parseMarkdown, type Block } from "@/lib/client/markdown";
import styles from "./honesty.module.css";

export const metadata: Metadata = { title: "How we tested · Ahead" };
export const dynamic = "force-static";

function Text({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((t, i) =>
        t.kind === "bold" ? <strong key={i}>{t.text}</strong> : t.kind === "code" ? <code key={i}>{t.text}</code> : <span key={i}>{t.text}</span>,
      )}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return block.level <= 2 ? <h2 className={styles.h}><Text text={block.text} /></h2> : <h3><Text text={block.text} /></h3>;
    case "para":
      return <p><Text text={block.text} /></p>;
    case "list":
      return <ul className={styles.list}>{block.items.map((it, i) => <li key={i}><Text text={it} /></li>)}</ul>;
    case "table":
      return (
        <ol className={styles.rows}>
          {block.rows.map((row, i) => (
            <li key={i} className={styles.row}>
              <dl>
                {block.header.map((h, j) =>
                  h === "#" ? null : (
                    <div key={j} className={j === 1 ? styles.rowHead : undefined}>
                      <dt>{h}</dt>
                      <dd><Text text={row[j] ?? ""} /></dd>
                    </div>
                  ),
                )}
              </dl>
            </li>
          ))}
        </ol>
      );
  }
}

function readTruthTable(): Block[] {
  const md = fs.readFileSync(path.join(process.cwd(), "docs", "api-truth-table.md"), "utf8");
  return parseMarkdown(md);
}

export default function HowWeTested() {
  const blocks = readTruthTable();
  // Lead with the table itself; the kill-test log follows as the evidence behind it.
  const at = blocks.findIndex((b) => b.type === "heading" && /truth table/i.test(b.text));
  const ordered = at > 0 ? [...blocks.slice(at), ...blocks.slice(0, at)] : blocks;
  return (
    <main className="stack-lg">
      <Link href="/" className="back">Back to the start</Link>
      <section className="stack">
        <h2>How we tested this</h2>
        <p className="lede">
          Before building Ahead we tested the YouCam API ourselves on AI-generated faces and wigs. This is what it
          actually did, including what failed and what we changed because of it.
        </p>
        <p>{SMOOTHING_LINE}</p>
        <p className="notice">{DELETION_LINE}</p>
        <p>{PLANNER_PRIVACY_LINE}</p>
        <p>{PLANNER_UNITS_LINE}</p>
      </section>
      <div className={`stack ${styles.doc}`}>
        {ordered.map((b, i) => <BlockView key={i} block={b} />)}
      </div>
    </main>
  );
}
