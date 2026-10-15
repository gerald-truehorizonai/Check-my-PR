// Run sample PRs through the judge without the server or extension.
//   node --env-file=.env scripts/try.js samples/bad.json [--suggest] [--rubric rubrics/x.md]
import { readFileSync } from "node:fs";
import { parseRubric } from "../lib/rubric.js";
import { judgePr } from "../lib/judge.js";
import { suggestFixes } from "../lib/suggest.js";

const args = process.argv.slice(2);
const rubricIdx = args.indexOf("--rubric");
const rubricPath = rubricIdx >= 0 ? args[rubricIdx + 1] : new URL("../rubrics/default.md", import.meta.url);
const files = args.filter((a, i) => !a.startsWith("--") && (rubricIdx < 0 || i !== rubricIdx + 1));
const sections = parseRubric(readFileSync(rubricPath, "utf8"));

for (const file of files) {
  const pr = JSON.parse(readFileSync(file, "utf8"));
  const j = await judgePr(pr, sections);
  console.log(`\n=== ${file}  overall ${j.overall}/100  (${j.ms} ms, ${j.usage.input_tokens} in-tok, ${j.model})`);
  console.log(`type: ${j.prType.value} (${j.prType.confidence.toFixed(2)})   title specific: ${j.title.specific.toFixed(2)}`);
  for (const s of j.sections) {
    console.log(
      `  ${s.status.padEnd(7)} ${String(s.score).padStart(3)}  ${s.name.padEnd(18)} present=${s.present.toFixed(2)} conf=${s.confidence.toFixed(2)}${s.unsure ? "  (unsure)" : ""}`,
    );
  }
  if (args.includes("--suggest")) {
    const out = await suggestFixes(pr, sections, j);
    for (const s of out.suggestions) console.log(`\n  [${s.section_id}] ${s.advice}\n${s.example.replace(/^/gm, "    ")}`);
    if (out.titleSuggestion) console.log(`\n  [title] ${out.titleSuggestion.example}`);
  }
}
