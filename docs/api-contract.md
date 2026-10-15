# Check My PR: actual backend contract

This describes Gerald's backend in backend/server.js and backend/lib/judge.js. The extension assesses a PR's **title and description** against a Markdown rubric. The backend does not fetch GitHub, inspect a diff, run tests, scan credentials, or establish repository-wide risk.

The interface must label the numeric result **Description quality**. A good description score is not permission to merge and is not proof that the described tests or scans happened. Missing credential-check language is a description gap, not a detected secret.

## Check endpoint

POST http://localhost:8787/check

The extension sends the title and description already obtained from the GitHub tab, the public GitHub API, or the user's input. The PR URL is retained in the interface and copied handoff; Gerald's backend does not consume it.

    {
      "title": "Add filtered CSV exports",
      "body": "## Summary\nExport only visible rows.\n\n## Testing\nnpm test -- export",
      "rubric": "## Testing (weight 3)\nDescribes how the change was verified.\n- No testing information.\n- Vague testing information.\n- Specific steps or commands."
    }

Required frontend context: title and body must both be strings. An observed empty body is valid input and should receive a poor assessment. A missing body field means page context was not loaded and must not silently become an empty description.

The rubric field is optional. Empty guidelines are omitted so the server uses backend/rubrics/default.md. A nonempty rubric must have one or more level-two Markdown headings and at least two bullet levels under each, ordered from worst to best. Plain prose guidelines do not satisfy the parser.

For example:

    ## Testing (weight 3, applies feature/bugfix)
    Describes how the change was verified.
    - No testing information.
    - Vague, such as "tested locally".
    - Specific commands or test names another reviewer could repeat.

Weights default to 1. The optional applies list may contain feature, bugfix, refactor, docs, or chore, separated by slashes. The backend derives stable section IDs from their names. Custom rubrics can contain arbitrary section names; the frontend must preserve them.

## Actual Jev response

    {
      "overall": 62,
      "title": { "specific": 0.91, "ok": true },
      "prType": {
        "value": "bugfix",
        "confidence": 0.88,
        "probabilities": { "bugfix": 0.9, "feature": 0.1 }
      },
      "sections": [
        {
          "id": "testing",
          "name": "Testing",
          "weight": 3,
          "status": "weak",
          "score": 18,
          "present": 0.93,
          "level": 1,
          "levelText": "Vague testing information.",
          "confidence": 0.74,
          "unsure": false
        }
      ],
      "model": "jev-1.14.0",
      "usage": { "input_tokens": 500, "output_tokens": 10 },
      "ms": 420
    }

This fixture illustrates the shape; it is not a measured result. The backend sends Jev the title and body, one PR-type Choice, one title-specificity Noul, and presence/quality questions for every rubric section. It calculates the weighted overall description score in code. Level text is a rubric anchor selected from the supplied levels, not generated narrative evidence.

## Frontend normalization

The exported normalizeJudgement(raw, { context, prUrl }) function produces the same basic display shape as the sample-review interface, with additional fields describing its actual scope.

| Backend field | UI field or behavior |
| --- | --- |
| overall | score, 0–100; label Description quality |
| sections | checks, retaining the exact section IDs and names |
| section.score | checks[].score |
| section.levelText | Description rubric level in checks[].summary, also retained as levelText |
| section.confidence | checks[].confidence |
| section.present | checks[].presentProbability; probability the description covers this section |
| section.unsure | checks[].unsure, plus conservative status mapping |
| model / ms | metrics.model / metrics.durationMs |
| prType | prType retained for type display |
| Entire response | judgement retained for optional /suggest reuse |

Status mapping:

| Backend status | UI status |
| --- | --- |
| missing | fail |
| weak | fail |
| ok | warn |
| good | pass |
| n/a | not_applicable |

If unsure is true, good/n/a becomes unknown and missing/weak/ok becomes warn. A false title.ok adds a separate actionable title warning. A missing title judgement adds an unknown check. Title-specificity is a Noul probability, so it does not receive a fabricated confidence value.

There is no injection of the earlier fixed five categories into the actual section response. A custom section named Secrets is treated like any other description section: missing or weak coverage does not imply that a credential was detected.

The adapter returns assessmentScope "description", scoreLabel "Description quality", risk "unknown", and coverage {}. It copies known PR metadata from browser/API context, without presenting those metadata fields as inspected files. Summary text explains that repository files, test runs, and credentials were not inspected.

Warnings or failures yield needs_attention; otherwise unknown checks yield insufficient_evidence; otherwise the assessed description is ready. These verdicts concern the description rubric. Actual section-mode judgements never manufacture a blocked credential verdict.

The older normalizeReview helper remains available for explicitly selected sample data and compatible canonical responses. Its richer synthetic findings must not be presented as results from Gerald's title/body-only backend.

## Optional suggestion endpoint

POST http://localhost:8787/suggest

The request contains title, body, optional rubric, and optional judgement containing the complete previous /check response. Reusing the judgement avoids another Jev evaluation.

    {
      "title": "Add filtered CSV exports",
      "body": "...",
      "rubric": "...",
      "judgement": { "...": "complete /check response" }
    }

The response contains the same judgement plus:

    {
      "judgement": { "...": "complete /check response" },
      "suggestions": [
        {
          "section_id": "testing",
          "advice": "Name the actual command you ran.",
          "example": "Testing: <command you ran>"
        }
      ],
      "titleSuggestion": null,
      "model": "suggestion-model-name"
    }

A non-null titleSuggestion uses the same section_id/advice/example shape, with section_id "title". Gerald's suggestion implementation uses Claude and requires ANTHROPIC_API_KEY. It writes description improvements for missing, weak, or ok sections; it does not rescore Jev or patch repository files.

The frontend exports suggestImprovements({ endpoint, context, guidelines, judgement, signal }). It derives the sibling /suggest route from /check. Calling it is an explicit optional step with separate model usage. The clipboard handoff to the user's own ChatGPT is separate: it needs no backend suggestion call, OpenAI key, or OAuth integration.

## Transport, errors, and credentials

The default backend is local port 8787. GET /health returns {"ok":true}. Gerald's server accepts GET/POST/OPTIONS and currently returns wildcard CORS headers. The extension can point at an HTTPS deployment, with the selected origin permission granted. HTTP is allowed only for localhost/127.0.0.1/[::1]. Requests omit cookies and reject redirects.

The adapter supports cancellation and a 90-second timeout. Invalid JSON, empty/malformed sections, network errors, and HTTP errors remain errors; live review never substitutes sample data. Missing page context is reported before making a request. Backend error messages are not echoed verbatim into the UI.

Jev credentials remain in the backend environment as TYPESAFE_API_KEY. ANTHROPIC_API_KEY is needed only for the optional suggestion path. Neither key belongs in extension code, browser storage, copied prompts, or committed files. The backend receives PR text; avoid putting literal credentials in the title, description, or rubric.

## Integration check

1. Configure the backend environment and start it using backend/README.md.
2. Load a PR's title and description in the extension, choose a valid Markdown rubric, and run Check.
3. Confirm /check receives exactly title/body/rubric and the UI shows the actual section scores.
4. Try an empty description, a generic title, an uncertain good section, and a custom rubric section.
5. Confirm low description quality and missing Secrets statements never claim a detected code vulnerability.
6. Stop the backend and confirm a connection error is shown.
7. If testing /suggest, pass the original judgement and verify the extra model is explicitly requested.
