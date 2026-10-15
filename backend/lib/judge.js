// Turns a rubric into Jev questions, sends one request, and scores the answers in code.
// Jev makes every judgement; this file only does arithmetic and thresholds.
import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";

const MODEL = process.env.JEV_MODEL ?? "jev-preview";

// Tune these on real PRs.
const PRESENT_MIN = 0.5; // noul below this = section missing
const GOOD_MIN = 0.7; // normalised quality at or above this = good
const OK_MIN = 0.4; // between OK_MIN and GOOD_MIN = needs work
const CONFIDENT_MIN = 0.6; // score/choice confidence below this = flagged unsure

const PR_TYPE_CRITERIA = {
  feature: "Adds new behaviour or capability.",
  bugfix: "Fixes incorrect behaviour.",
  refactor: "Restructures code without changing behaviour.",
  docs: "Only changes documentation.",
  chore: "Dependencies, build, CI, config or other maintenance.",
};

let client;
const jev = () => (client ??= new TypeSafeClient({ defaultModel: MODEL }));

export function buildQuestions(sections) {
  const questions = {
    pr_type: choice(
      "What kind of change does the pull request with title `title` and description `body` make?",
      PR_TYPE_CRITERIA,
    ),
    title_specific: noul(
      "Does `title` say specifically what the pull request changes?",
      {
        true: "Names the area and the change, e.g. 'Fix token refresh race in auth middleware'.",
        false: "Generic or empty, e.g. 'fix', 'updates', 'WIP', 'misc changes'.",
      },
    ),
  };

  for (const s of sections) {
    const what = `${s.name}: ${s.description}`.trim();
    questions[`${s.id}__present`] = noul(
      `Does the pull request description \`body\` contain information about ${what}`,
      {
        true: "The description has real content covering this, under any heading or none.",
        false: "Not covered at all, or only an empty template heading or placeholder text.",
      },
    );
    questions[`${s.id}__quality`] = score(
      `How well does the pull request description \`body\` cover ${what}`,
      s.levels,
    );
  }
  return questions;
}

export async function judgePr({ title = "", body = "" }, sections) {
  const started = Date.now();
  const res = await jev().systemOne({
    state: { title, body },
    questions: buildQuestions(sections),
  });
  const a = res.answers;

  const prType = {
    value: a.pr_type.choice,
    confidence: a.pr_type.confidence,
    probabilities: a.pr_type.probabilities,
  };

  let weighted = 0;
  let totalWeight = 0;
  const results = sections.map((s) => {
    const present = a[`${s.id}__present`].noul;
    const q = a[`${s.id}__quality`];
    const quality = q.score / (s.levels.length - 1); // 0..1
    const level = Math.round(q.score);

    // Skip sections that don't apply, but only when Jev is sure about the PR type.
    const applies =
      !s.applies || prType.confidence < CONFIDENT_MIN || s.applies.includes(prType.value);

    let status;
    if (!applies) status = "n/a";
    else if (present < PRESENT_MIN) status = "missing";
    else if (quality >= GOOD_MIN) status = "good";
    else if (quality >= OK_MIN) status = "ok";
    else status = "weak";

    const sectionScore = status === "missing" ? 0 : quality;
    if (applies) {
      weighted += s.weight * sectionScore;
      totalWeight += s.weight;
    }

    return {
      id: s.id,
      name: s.name,
      weight: s.weight,
      status,
      score: Math.round(sectionScore * 100), // 0-100, what the UI should show
      present,
      level,
      levelText: s.levels[level],
      confidence: q.confidence,
      unsure: q.confidence < CONFIDENT_MIN || Math.abs(present - 0.5) < 0.15,
    };
  });

  return {
    overall: totalWeight ? Math.round((100 * weighted) / totalWeight) : 0,
    title: { specific: a.title_specific.noul, ok: a.title_specific.noul >= PRESENT_MIN },
    prType,
    sections: results,
    model: res.model,
    usage: res.usage,
    ms: Date.now() - started,
  };
}
