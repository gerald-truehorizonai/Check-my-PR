# PR Judge backend

Jev scores the PR against a markdown rubric, and Claude writes fix suggestions for the weak sections.
The extension calls this server, so the API keys never ship inside the extension.

```bash
cp .env.example .env        # add TYPESAFE_API_KEY and ANTHROPIC_API_KEY
npm install
npm start                   # http://localhost:8787
npm run try -- samples/bad.json samples/ok.json samples/good.json            # Jev only
npm run try -- samples/bad.json --suggest                                   # plus Claude suggestions
npm run try -- samples/ok.json --rubric rubrics/other.md                    # try a different rubric
```

## API (for the UI)

`POST /check` with `{ "title": "...", "body": "...", "rubric": "<optional markdown>" }`

Response:
```jsonc
{
  "overall": 62,                         // 0-100, weighted across the sections that apply
  "title": { "specific": 0.91, "ok": true },
  "prType": { "value": "bugfix", "confidence": 0.88, "probabilities": { ... } },
  "sections": [
    {
      "id": "testing", "name": "Testing", "weight": 3,
      "status": "weak",                  // good | ok | weak | missing | n/a
      "score": 18,                       // 0-100, show this as the bar
      "present": 0.93,                   // Jev's probability (0-1) that the section is there at all
      "level": 1, "levelText": "Vague, like \"tested locally\"...",
      "confidence": 0.74, "unsure": false  // unsure = show a "?" badge
    }
  ],
  "model": "jev-1.14.0", "usage": { "input_tokens": 0, "output_tokens": 0 }, "ms": 420
}
```

`POST /suggest` takes the same body. Add `"judgement": <the /check response>` so it doesn't re-run Jev.
It returns `{ judgement, suggestions: [{ section_id, advice, example }], titleSuggestion }`.
Call `/check` first and show the scores straight away, then call `/suggest` in the background.

`GET /health` returns `{ "ok": true }`.

## Rubric format
See `rubrics/default.md`. Each `## Heading (weight N, applies feature/bugfix)` is one section.
The paragraph under the heading says what good looks like. The bullets are the levels, from worst to best (at least 2).

## How the judging works
Everything goes to Jev in one request. All the questions run in parallel against `{title, body}`:
- `pr_type`: a choice (feature / bugfix / refactor / docs / chore). A section with `applies` is skipped when it doesn't fit the PR type.
- `title_specific`: a yes/no question about whether the title says what changed.
- Two questions per rubric section:
  - `<id>__present`: a yes/no question, "is this section there at all?"
  - `<id>__quality`: a score against that section's rubric levels.

The thresholds are at the top of `lib/judge.js`.

Models: `JEV_MODEL` (default `jev-preview`, i.e. 1.14) and `SUGGEST_MODEL` (default `claude-opus-5-5`, low effort).
Claude requests turn on Anthropic's server-side refusal fallback (`fallbacks: "default"`). If the model declines a request, Anthropic automatically retries it on another Claude model.
