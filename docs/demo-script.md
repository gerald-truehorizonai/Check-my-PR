# Check My PR — eight-minute demonstration

Deepankar presents the Chrome extension and UI. Gerald explains the backend and Jev integration. The current product checks **PR titles and descriptions**, using the team's editable rubric. It does not inspect code or run security scans.

## 0:00–0:45 — The problem

“Reviewers often have to ask what changed, how it was tested, or how to recover if something goes wrong. Check My PR helps the author provide that context before requesting a human review.”

Show the extension on a GitHub PR. Explain the five criteria: clarity, documentation notes, testing notes, risk, and credential-check notes.

## 0:45–1:30 — Define good for this team

Open the editable rubric. Show one markdown section and its worst-to-best bullet levels. The backend turns each section into narrow Jev questions and computes the weighted score in code. Point out that a README edit is only relevant when the change calls for it, and that “tested locally” gives a reviewer little to reproduce.

## 1:30–3:15 — Run the check

Use `http://localhost:8787/check` and show the detected or entered title and description. Run the live check and inspect the actual section results. State that the API receives only that text and the rubric.

If the service is unavailable, explicitly choose sample mode and say: “These are authored sample results that demonstrate the interface. The score and timing are illustrative.” Never present the sample as a live Jev call.

For **Add workspace invitations**, show three description gaps:

1. A mention of `INVITE_TOKEN_TTL` does not identify its documentation or explain the documented units and default.
2. “Tested the owner flow locally” does not give a command, result, or account of denied-role and cross-workspace checks. The app has not inspected the tests.
3. The sample leaves rollout and recovery as TBD despite describing a workspace-access change.

The credential-check section assesses the author's notes. The extension does not establish that code is free of credentials.

## 3:15–4:30 — Fix this with ChatGPT

Open a finding's repair action. Show the generated prompt and copy it. Open ChatGPT, paste the prompt, and provide the relevant PR context. The user reviews the suggestion and makes any necessary documentation, code, or test changes. Never invent a test result just to improve the description's score.

If a real description update and rerun are ready, demonstrate them. Otherwise clearly label the supplied after-state as authored. The sample score improves from 68 to 94 because the notes become more specific, not because the extension has proven the code correct.

## 4:30–5:30 — Why Jev fits

Gerald walks through the implemented request: one PR-type Choice, one title-specificity Noul, and a presence Noul plus quality Score for each rubric section. With five sections, that is 12 questions. The backend batches them, applies explicit weights and thresholds, and returns structured results. Describe the actual response's model and timing; use no sample timing as a performance benchmark.

Show how uncertain results remain visible. Jev provides typed judgments; application code handles scoring and display text. The optional Claude `/suggest` route is separate from the frontend ChatGPT handoff.

## 5:30–6:30 — ROI

“Our hypothesis is fewer clarification rounds and less time reconstructing missing PR context.” Show real measurements only if collected. The pilot should compare total author-plus-reviewer time, clarification rounds, useful gaps caught, false alarms, latency, and API cost across comparable PRs.

The ROI calculation is in [Scaling and ROI](scaling.md). A positive result must include the time spent acting on the checker. We have no measured savings claim from the sample.

## 6:30–7:30 — Scale

The frontend is a buildless extension. The backend evaluates independent title/body requests without storing review state. This creates a small starting point for additional clients or a hosted service.

Production work includes service authentication, per-user rate limits, input and timeout controls, an explicit data-retention policy, and optional GitHub authorization for private-repository access. Verified diff analysis and secret scanning are future capabilities. If caching is added, it must include the description, rubric, model version, and reviewed revision so an edited PR is not shown a stale result.

## 7:30–8:00 — Close

“Check My PR helps authors give reviewers the context they need. Teams define good, Jev assesses the description, and the author gets clear next steps.”

Leave the findings screen visible. The demo should make the working scope and next user action obvious.

## Before presenting

- Start the backend with its local Jev configuration; keep credentials out of browser inputs.
- Load the unpacked extension and confirm `http://localhost:8787/check`.
- Rehearse the actual title/body and real backend response.
- Confirm copied repair prompts contain no credentials or private content you did not intend to share.
- Keep the labeled sample ready if a live service is unavailable.
- Confirm the final allotted demo time; this script targets eight minutes.
