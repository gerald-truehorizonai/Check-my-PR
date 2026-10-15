# Scaling and measuring value

## What the prototype implements

Check My PR has a buildless Chrome extension and a stateless Node backend. The extension supplies a PR title, description, and editable markdown rubric to `POST /check`. The backend asks Jev bounded questions, combines their answers with weights in code, and returns structured scores. It does not persist review history, fetch repository files, or run tests and scanners.

The **Fix this with ChatGPT** action creates a copied-prompt handoff. The user supplies context, reviews the suggestion, makes changes, and reruns the check. This is a human-directed workflow, not an automated code-repair loop.

## Production next steps

| Area | Next step and reason |
| --- | --- |
| Hosted service access | Add authentication, authorization, HTTPS, and explicit allowed origins before accepting public traffic. The current demo server is not an authenticated multi-tenant service. |
| Private GitHub data | Add a GitHub App or OAuth flow with scoped permissions and server-side token storage before fetching private repository evidence. Treat title/body text from a private PR as private data too. |
| Abuse and availability | Add per-user quotas, request-size limits, bounded concurrency, upstream timeouts, rate-limit handling, and cancellation. Measure Jev limits instead of assuming unlimited concurrency. |
| Privacy | Define retention and logging policies; redact credentials and avoid logging full PR content by default. Make data sent to each service clear. |
| Caching | Key on repository/PR identity, head commit, title/body content hash, rubric hash, and model/scoring-policy version. The description can change without a new commit. Invalidate on any relevant input change. |
| Larger workloads | A stateless handler can support multiple service instances, but shared quotas, cache consistency, and upstream capacity still need design and load testing. |
| Verified evidence | Add authoritative GitHub fetches, diff limits, pinned head revisions, and observed test status before making claims about code or execution. |
| Secret scanning | Add a dedicated scanner and carefully scoped findings. Today's Secrets criterion checks the author's notes; it does not detect leaked keys in a repository. |
| Evaluation | Use labeled PR descriptions, report false positives and missed gaps, and tune thresholds separately for each criterion. A higher description score is not proof of fewer bugs. |

These are proposed next steps, not implemented features.

## ROI measurement plan

Run a pilot over comparable PRs with and without the checker. Include author and reviewer time, not only time to produce a score. Track clarification rounds, actionable gaps caught, false alarms, API cost, and end-to-end latency. Record the number and type of PRs so results are interpretable.

Let `B` be baseline author-plus-reviewer minutes per PR, and `A` be the corresponding minutes with Check My PR, including reading findings and making corrections. Let `N` be reviewed PRs per month, `R` the blended hourly engineering cost, `C` the measured per-PR service cost, and `F` fixed monthly hosting and maintenance cost.

```text
Minutes saved per PR = B - A
Monthly gross time value = N × (B - A) × R / 60
Monthly net value = monthly gross time value - N × C - F
Break-even minutes saved per PR = 60 × (C + F / N) / R
```

These are planning formulas. No measured savings, latency advantage, or positive ROI is claimed. If `A` exceeds `B`, the measured time effect is negative. Report that outcome and inspect false alarms, rubric burden, and handoff friction before expanding the workflow.
