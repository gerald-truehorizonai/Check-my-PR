# Check My PR

A Chrome extension that uses Jev to assess a pull request's **title and description** against your team's editable review rubric. It highlights missing context and offers a prompt you can take to ChatGPT to work through the findings.

The current backend evaluates description readiness: clarity, documentation notes, testing notes, risk, and credential-check notes. It does not inspect diffs, run tests, verify linked evidence, or scan repository secrets. Scores support human review; they do not establish code correctness or approve a merge.

## Run the frontend preview

The frontend has no dependencies or build step. From the repository root, with Node.js installed:

```sh
npm run dev
```

Open [the local preview](http://127.0.0.1:4173). Sample reviews work without a backend and are visibly labeled. Live checks require the backend below. Browser-only preview does not include Chrome's side-panel integration.

## Start the backend

Use a Node.js version supporting `--env-file-if-exists` (Node 24 or newer works). In another terminal:

```sh
cd backend
npm ci
cp .env.example .env
```

If `.env` already exists, keep it rather than overwriting it. Set `TYPESAFE_API_KEY` in that local file, then start the server:

```sh
npm start
```

The default endpoint is `http://localhost:8787/check`; [health status](http://localhost:8787/health) is available separately. Keep the Jev key in the backend. `ANTHROPIC_API_KEY` is only needed for the optional backend `/suggest` route; the extension's ChatGPT handoff does not use it.

## Load the Chrome extension

Requires **Chrome 116 or newer**.

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked** and choose this repository's `extension/` directory.
3. Pin **Check My PR**, open a GitHub pull request, and click its toolbar icon.
4. In **Settings**, use `http://localhost:8787/check`, save the connection, and allow backend access if Chrome prompts.
5. Confirm the PR title and description, adjust the rubric if needed, and run the check.

The backend receives `{ title, body, rubric }`. Its Jev judgments are displayed as section assessments. Live errors remain errors; they never silently switch to sample results.

## Continue with ChatGPT

Select **Fix this with ChatGPT** on a finding, or **Fix with ChatGPT** for the review. Review and copy the prepared prompt, select **Open ChatGPT**, paste it, and supply relevant context. Nothing is sent automatically. Verify suggested changes and test results before updating your PR, then run the check again.

## Validate and package

Run these from the repository root:

```sh
npm test
npm run check
npm run package
```

Packaging requires the `zip` command and creates `artifacts/check-my-pr-extension.zip`. You can load `extension/` directly without packaging.

## Project guide

- [Frontend/backend contract](docs/api-contract.md)
- [Handoff for Gerald](docs/frontend-handoff.md)
- [PR description standards](docs/pr-standards.md)
- [Eight-minute demo script](docs/demo-script.md)
- [Scaling and ROI measurement](docs/scaling.md)

Deepankar owns the extension and frontend; Gerald owns the backend and Jev integration.
