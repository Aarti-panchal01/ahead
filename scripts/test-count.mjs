// Runs the unit tests with vitest's JSON reporter and prints the passing count (for the CI job summary and the
// README badge). Exits non-zero if any test failed, so it can stand in for `npm test`.
//
//   node scripts/test-count.mjs            -> "532"
//   node scripts/test-count.mjs --badge    -> "tests-532%20passing-2F6F5E" (shields.io static badge path)
//   node scripts/test-count.mjs --summary  -> a Markdown line for $GITHUB_STEP_SUMMARY
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vitestBin = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ahead-tests-")), "report.json");

const r = spawnSync(process.execPath, [vitestBin, "run", "--reporter=json", `--outputFile=${out}`], { stdio: ["ignore", "ignore", "inherit"] });
if (!fs.existsSync(out)) {
  console.error("vitest produced no JSON report");
  process.exit(r.status || 1);
}
const j = JSON.parse(fs.readFileSync(out, "utf8"));
const passed = j.numPassedTests;
const failed = j.numFailedTests;
const total = j.numTotalTests;

const arg = process.argv[2];
if (arg === "--badge") console.log(`tests-${passed}%20passing-2F6F5E`);
else if (arg === "--summary") console.log(`**Unit tests:** ${passed} passing${failed ? `, ${failed} failing` : ""} (of ${total}, ${j.numTotalTestSuites ?? "?"} suites)`);
else console.log(String(passed));
process.exit(failed ? 1 : 0);
