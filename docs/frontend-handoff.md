# Frontend handoff for Gerald

The frontend integrates with **`POST http://localhost:8787/check`**. The endpoint is configurable in the UI. The request is `{ "title": "...", "body": "...", "rubric": "..." }`; `rubric` is editable markdown. Gerald's backend evaluates this text with Jev and returns its judgment. The title and body come from the PR page or user-entered text; the backend does not fetch GitHub metadata or diffs.

The [API contract](api-contract.md) covers the frontend adapter. The authoritative current backend implementation is [server.js](../backend/server.js), [judge.js](../backend/lib/judge.js), and [rubric.js](../backend/lib/rubric.js). `/health` returns service status. `/suggest` exists as an optional backend Claude integration; the frontend's **Fix this with ChatGPT** flow is a separate copied-prompt handoff and does not require that route.

The default rubric in [standards.js](../extension/lib/standards.js) uses five section headings, each with ordered bullet score levels:

| Heading | Parsed ID | What is assessed |
| --- | --- | --- |
| Clarity | `clarity` | Purpose and scope in the description |
| Documentation | `documentation` | Author's account of documentation updates |
| Tests | `tests` | Author's account of validation and its limits |
| Risk | `risk` | Impact and recovery notes |
| Secrets | `secrets` | Author's scoped credential-check notes |

The backend's response contains `overall`, `title`, `prType`, `sections`, `model`, `usage`, and `ms`. Section statuses are `good`, `ok`, `weak`, `missing`, or `n/a`, with score, level text, confidence, and `unsure`. No file findings or scan results are returned. In particular, weak or missing Secrets notes are a documentation gap, not evidence of a leak.

Keep Jev credentials in backend-local configuration. The extension sends no model key. For the local demo, start the backend on port 8787, configure the extension endpoint, open a PR, confirm its detected title/body, and run a live check. Compare the visible section results with the actual server response. Stop the backend and confirm a visible connection error; live failures must not substitute sample results.

For a finding, the ChatGPT handoff copies a repair prompt for the user to paste into ChatGPT. It does not edit the repository or update the PR. The user should supply relevant context, verify any suggested changes and reported test results, then rerun the description check.

The [PR standards](pr-standards.md) explain the evidence limits and sources. [Scaling and ROI](scaling.md) distinguishes the implemented prototype from proposed production work. This handoff changes no backend code.
