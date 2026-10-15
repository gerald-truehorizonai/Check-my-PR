# What makes a review-ready PR description?

The current Check My PR backend evaluates a PR's **title and description** against an editable rubric. It does not fetch diffs, read repository files, run tests, verify linked CI results, or scan for secrets. Its result concerns the quality of the author's review notes. A strong description can still accompany incorrect code.

## Five criteria

| ID | What the description should provide | Scope limit |
| --- | --- | --- |
| `clarity` | The purpose, affected behavior, and intended result of a focused change. | No implementation correctness claim. |
| `documentation` | Relevant guide updates or a specific reason none are needed. | Documentation files and links are not verified. |
| `tests` | Repeatable checks, reported results, relevant edge cases, and untested areas. | Test assertions and execution are not inspected. |
| `risk` | Impact and proportionate rollout or recovery steps. | No security or operational safety certification. |
| `secrets` | The scope and reported outcome of the author's credential check. | No diff or repository secret scanning; absent notes do not imply a leak. |

GitHub recommends focused PRs with context and self-review, with special attention to sensitive changes such as permissions and authentication. These ideas inform our clarity and risk notes. [GitHub: Helping others review your changes](https://docs.github.com/en/pull-requests/concepts/helping-others-review-your-changes)

Documentation belongs where affected users and maintainers will find it. A README edit is not mandatory for every PR. Useful tests address actual changed behavior and meaningful assertions; a filename or green badge alone is not enough to establish coverage. Our current checker asks whether the description supplies a useful account of that work. [Google: What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)

## Rubric format and scoring

The frontend's [standards.js](../extension/lib/standards.js) exports `DEFAULT_GUIDELINES` as markdown compatible with [Gerald's rubric parser](../backend/lib/rubric.js):

```markdown
## Tests (weight 3)
Describes repeatable checks and reported results. Only the title and description are available.
- No validation information.
- Vague testing claims without repeatable steps or results.
- Specific checks, reported outcomes, and untested areas.
```

Each section must have a `##` heading and at least two bullet levels ordered from worst to best. Text beneath a heading becomes the section description. Top-level introductory text is not included in model questions, so evidence limits belong inside each section description. Optional `applies` values are `feature/bugfix/refactor/docs/chore`; the default five sections apply to every type and include conditional guidance for changes needing no special documentation or rollout.

The backend asks Jev for a PR type and title specificity, plus a presence probability and quality score per section. It calculates the overall weighted score in code. Current section weights are clarity 3, documentation 2, tests 3, risk 2, and secrets 1. The raw statuses are `good`, `ok`, `weak`, `missing`, and `n/a`; the frontend adapter translates them for display. Thresholds are prototype policy and require evaluation on real PRs. [TypeSafe: Composite scoring](https://docs.typesafe.ai/patterns/composite-scoring)

Choice and Score confidence describe how concentrated the answer distribution is. Noul supplies a yes probability without a separate confidence value. Neither is a probability that the full PR is correct. The backend exposes an `unsure` signal when its confidence or presence threshold requires caution. [TypeSafe: Confidence](https://docs.typesafe.ai/confidence)

## Credential-check notes

A public API URL, configuration name, or placeholder is not itself a credential leak. The rubric asks whether the author records a scoped credential check and its reported outcome. Missing notes need follow-up; they do not establish exposed credentials. Do not paste a credential into the description or a repair prompt.

An actual secret scanner is future work. GitHub secret scanning can inspect repository history and other surfaces beyond this prototype's inputs. [GitHub: Secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)

## Demo scope

[demo.js](../extension/lib/demo.js) contains authored description-review samples with an empty remote URL. The 68 and 94 scores, 640 ms duration, and 12 questions are illustrative fixtures, not measured Jev results. No sample finding claims a file was inspected, a test was executed, or a credential scan was performed by this app. The after-state is authored, not an automated repair. A live check must display the actual returned judgment and timing.
