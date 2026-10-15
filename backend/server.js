// PR Judge backend. Keeps API keys off the extension.
//
//   GET  /health
//   POST /check    { title, body, rubric? }                -> Jev scores
//   POST /suggest  { title, body, rubric?, judgement? }    -> Claude suggestions (runs /check first if no judgement)
//
// rubric is optional markdown; defaults to rubrics/default.md.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { parseRubric } from "./lib/rubric.js";
import { judgePr } from "./lib/judge.js";
import { suggestFixes } from "./lib/suggest.js";

const PORT = Number(process.env.PORT ?? 8787);
const DEFAULT_RUBRIC = readFileSync(new URL("./rubrics/default.md", import.meta.url), "utf8");

const send = (res, status, data) => {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(data));
};

const readJson = async (req) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
};

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
  if (req.method !== "POST" || !["/check", "/suggest"].includes(req.url)) {
    return send(res, 404, { error: "not found" });
  }

  try {
    const input = await readJson(req);
    const pr = { title: input.title ?? "", body: input.body ?? "" };
    const sections = parseRubric(input.rubric || DEFAULT_RUBRIC);

    if (req.url === "/check") return send(res, 200, await judgePr(pr, sections));

    const judgement = input.judgement ?? (await judgePr(pr, sections));
    return send(res, 200, { judgement, ...(await suggestFixes(pr, sections, judgement)) });
  } catch (err) {
    console.error(err);
    const status = err instanceof SyntaxError || /Rubric/.test(err.message) ? 400 : err.status ?? 500;
    return send(res, status, { error: err.message });
  }
}).listen(PORT, () => console.log(`PR Judge backend on http://localhost:${PORT}`));
