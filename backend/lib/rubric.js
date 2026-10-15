// Parses a markdown rubric into sections Jev can score.
//
//   ## Testing (weight 2, applies feature/bugfix)
//   Describes how the change was verified.
//   - No testing information.            <- level 0 (worst)
//   - Vague ("tested locally").
//   - Specific, repeatable steps.         <- level N (best)
//
// Options in brackets are optional: weight defaults to 1, applies defaults to every PR type
// (feature, bugfix, refactor, docs, chore).

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "section";

export function parseRubric(markdown) {
  const sections = [];
  let current = null;

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^##\s+(.+?)\s*(?:\((.*)\))?\s*$/);
    if (heading) {
      current = { name: heading[1], description: "", levels: [], weight: 1, applies: null };
      for (const opt of (heading[2] ?? "").split(",").map((o) => o.trim())) {
        const [key, ...rest] = opt.split(/\s+/);
        const value = rest.join(" ");
        if (key === "weight" && Number(value) > 0) current.weight = Number(value);
        if (key === "applies" && value) current.applies = value.split("/").map((v) => v.trim());
      }
      sections.push(current);
      continue;
    }
    if (!current || !line || line.startsWith("#")) continue;

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) current.levels.push(bullet[1]);
    else current.description += (current.description ? " " : "") + line;
  }

  const seen = new Map();
  for (const s of sections) {
    let id = slug(s.name);
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n) id = `${id}_${n + 1}`;
    s.id = id;
    if (s.levels.length < 2) {
      throw new Error(`Rubric section "${s.name}" needs at least 2 bullet levels (worst to best).`);
    }
  }
  if (!sections.length) throw new Error("Rubric has no '## Section' headings.");
  return sections;
}
