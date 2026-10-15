# PR Judge: Chrome extension that scores GitHub PRs with Jev

## Flow
1. A content script reads the PR title and body on GitHub.
2. It loads the rubric: a markdown file the team writes, describing what a good PR looks like.
3. Code turns each rubric section into Jev questions and sends them all in one request, so they run in parallel.
4. Jev returns a score per section, a check that each section is present, and a confidence for each answer. Code combines these into an overall weighted score.
5. Claude gets only the weak or missing sections, plus the rubric text, and writes short fix suggestions.
6. A panel on the page shows score bars, an "unsure" tag when confidence is low, and the suggestions.

Jev makes every judgement. The LLM never scores anything.

## Rubric format (plain markdown, parsed in code)
```markdown
# PR Rubric

## Summary (weight 3)
Explains what changed and why, in 1-3 sentences.
- Missing, or just repeats the title.
- Says what changed but not why.
- Clearly explains both what changed and why.

## Testing (weight 2)
Describes how the change was verified.
- No testing information.
- Vague ("tested locally").
- Specific steps, commands or test names a reviewer could repeat.
```
- Each `##` heading is a section. An optional weight goes in brackets after the name.
- The first paragraph is the section's description.
- The bullet list is the Score levels, from worst to best.

## Jev request (one call per check)
- state: `{ title, body }`. Optionally add `files_changed` later, as a list of file paths only, to keep the context small.
- For each rubric section `s`:
  - `s__present`: Noul, "Does `body` contain information about <section name>: <description>?"
  - `s__quality`: Score, "How well does `body` cover <name>: <description>?", with the rubric bullets as levels.
- Global questions:
  - `pr_type`: Choice (feature / bugfix / refactor / docs / chore). Used to skip sections that don't apply, such as screenshots on a backend-only PR.
  - Stretch: `matches_diff`, a Noul asking whether the description matches the changed files.
- Score the whole body against each section rather than splitting it by headings in code. Then it still works when the author didn't follow the template headings.
- Model `jev-preview` (1.14). No experimental headers needed for text.

## Architecture (Manifest V3, plain JS, no build step)
| File | Job |
|---|---|
| `manifest.json` | host permissions for github.com, api.typesafe.ai and api.anthropic.com |
| `content.js` | finds the PR page, reads title and body, mounts the panel (inside a shadow DOM so GitHub's CSS can't break it) |
| `background.js` | service worker that calls Jev and Claude. Host permissions let it make requests the page itself would be blocked from (CORS). |
| `options.html/js` | Jev and Anthropic API keys, plus the rubric (paste or upload), saved in `chrome.storage.local` |
| `engine.js` | rubric parser, Jev request builder, weighted scoring. Shared by the extension and a Node test script. |

Notes:
- Calling Claude straight from the browser needs the header `anthropic-dangerous-direct-browser-access: true`. That's fine for a demo, but the keys live in the extension, so it's not shippable as is.
- GitHub's page layout changes often, so keep the selectors for reading the PR in one place.

## Split and timeline (2h)
| When | Gerald + Claude | Deepankar |
|---|---|---|
| 0:00-0:15 | Jev key, sample rubric, 3 sample PRs (bad / ok / good) | extension skeleton loads in Chrome |
| 0:15-1:00 | `engine.js` + Node test script that runs the samples through Jev | content script reads the PR, panel UI with mock data |
| 1:00-1:30 | integrate: panel calls background, which calls Jev, which feeds the panel; add Claude suggestions | |
| 1:30-1:50 | polish, tune thresholds, demo PRs | |
| 1:50-2:00 | demo run-through | |

## Demo script
Open a weak PR and get a low score with red sections. Click "suggest" and Claude gives fixes. Paste the fixes in, re-check, and the scores go green.
Then swap in a stricter rubric to show the scoring is driven by the document, not hard-coded.
