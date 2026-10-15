// Claude writes fix suggestions for sections Jev marked weak or missing. It never scores.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const MODEL = process.env.SUGGEST_MODEL ?? "claude-opus-5-5";

const Suggestions = z.object({
  suggestions: z.array(
    z.object({
      section_id: z.string(),
      advice: z.string(),
      example: z.string(),
    }),
  ),
});

const SYSTEM = `You help developers improve GitHub pull request descriptions.
Another model has already scored each rubric section; treat its verdicts as final and do not re-score.
For each section you are given, write one short, concrete piece of advice (max 2 sentences) and an
example snippet in markdown the author could paste into the description.
Only use facts that appear in the PR title or description. Where you need a fact you don't have,
use a clear placeholder like <which tests you ran> instead of inventing it.`;

let client;
const claude = () => (client ??= new Anthropic());

export async function suggestFixes({ title = "", body = "" }, sections, judgement) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const targets = judgement.sections.filter((r) => ["missing", "weak", "ok"].includes(r.status));
  if (!targets.length && judgement.title.ok) return { suggestions: [], titleSuggestion: null };

  const sectionList = targets
    .map((r) => {
      const s = byId.get(r.id);
      return `- id: ${r.id}\n  section: ${s.name}\n  what good looks like: ${s.description}\n  best level: ${s.levels.at(-1)}\n  verdict: ${r.status} (currently "${r.levelText}")`;
    })
    .join("\n");

  const titleNote = judgement.title.ok
    ? ""
    : `\nThe title was judged too generic. Add an entry with section_id "title" whose example is a better title.`;

  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Suggestions) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `<pr_title>${title}</pr_title>\n<pr_description>\n${body}\n</pr_description>\n\nSections to improve:\n${sectionList}${titleNote}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Suggestion model declined (${response.stop_details?.category ?? "unknown"})`);
  }
  const parsed = response.parsed_output ?? { suggestions: [] };
  return {
    suggestions: parsed.suggestions.filter((s) => s.section_id !== "title"),
    titleSuggestion: parsed.suggestions.find((s) => s.section_id === "title") ?? null,
    model: response.model,
  };
}
