// Authored sample data for the interface and presentation. Nothing in this file
// is evidence fetched from GitHub or a measured response from Jev.
// No remote URL is attached: the sample cannot be mistaken for a fetched PR.
export const DEMO_PR = {
  url: '',
  repository: 'acme/workspace',
  number: 42,
  title: 'Add workspace invitations',
  author: 'demo-developer',
  base: 'main',
  head: 'feat/workspace-invitations',
  body: 'Owners can invite teammates to their workspace so they can collaborate without administrator setup. Adds invitation creation and acceptance. Configuration: INVITE_TOKEN_TTL controls invitation expiry. Testing: tested the owner flow locally. Risk: this changes workspace access; rollout and recovery TBD. Credential check: author reports manually inspecting the newly added configuration values and PR description, finding only environment-variable names and placeholders; repository history was not checked.',
};

export const DEMO_REVIEW = {
  reviewId: 'sample-workspace-invitations-before',
  assessmentScope: 'description',
  scoreLabel: 'Description quality',
  pr: DEMO_PR,
  verdict: 'needs_attention',
  score: 68,
  risk: 'high',
  summary: 'The sample description needs clearer testing notes, token-expiry documentation references, and a rollout plan. Code and diffs have not been inspected.',
  checks: [
    {
      id: 'clarity',
      label: 'Purpose & clarity',
      status: 'pass',
      summary: 'The sample description explains who can invite teammates and why workspace invitations are needed.',
      confidence: null,
      findings: [],
    },
    {
      id: 'documentation',
      label: 'Documentation',
      status: 'warn',
      summary: 'The sample description names a token-lifetime setting but does not identify its documentation.',
      confidence: null,
      findings: [
        {
          id: 'sample-token-ttl-docs',
          severity: 'medium',
          title: 'Identify the invitation-expiry documentation',
          description: 'The sample description mentions INVITE_TOKEN_TTL without saying where its units, default, or valid range are documented. The documentation files have not been fetched.',
          suggestion: 'Check the relevant guide, update it if needed, and add a PR note linking to the setting documentation. Use the actual units, default, allowed values, and expiry behavior.',
        },
      ],
    },
    {
      id: 'tests',
      label: 'Test evidence',
      status: 'warn',
      summary: 'The sample description says the owner flow was tested locally but does not report repeatable checks or denied-role cases.',
      confidence: null,
      findings: [
        {
          id: 'sample-permission-tests',
          severity: 'medium',
          title: 'Describe permission-boundary validation',
          description: 'The sample testing note does not say whether members or users from another workspace were denied. Test code and run results have not been inspected.',
          suggestion: 'Run the relevant permission checks and record the command, actual results, allowed-role and denied-role cases, and any untested behavior in the description.',
        },
      ],
    },
    {
      id: 'risk',
      label: 'Risk assessment',
      status: 'warn',
      summary: 'This change grants workspace access, and the sample PR has no rollout or recovery note.',
      confidence: null,
      findings: [
        {
          id: 'sample-rollout-risk',
          severity: 'medium',
          title: 'Explain rollout and recovery',
          description: 'The sample description says workspace access changes but leaves rollout and recovery as TBD. It does not explain how to disable invitations or handle outstanding invitations if a problem appears.',
          suggestion: 'Describe the authorization checks, staged rollout, and recovery steps for issued invitations. Ask an owner of the permission model to review this path.',
        },
      ],
    },
    {
      id: 'secrets',
      label: 'Credential-check notes',
      status: 'pass',
      summary: 'The sample author describes a scoped manual check and its limits. The extension has not scanned code or verified that report.',
      confidence: null,
      findings: [],
    },
  ],
  metrics: { durationMs: 640, model: 'Jev · sample', questions: 12 },
};

// An optional authored after-state for a narrated before/after presentation.
// This is not an automated repair, rerun, or benchmark result.
export const CLEAN_DEMO_REVIEW = {
  ...DEMO_REVIEW,
  reviewId: 'sample-workspace-invitations-after',
  assessmentScope: 'description',
  scoreLabel: 'Description quality',
  pr: {
    ...DEMO_PR,
    body: 'Owners can invite teammates to their workspace so they can collaborate without administrator setup. Adds invitation creation and acceptance. Documentation: the configuration guide describes INVITE_TOKEN_TTL, including its unit, configured default, permitted range, and expiry behavior. Testing: the authored example reports npm test -- invitations passing owner-allowed, member-denied, and cross-workspace-denied cases; delivery-provider failure was not exercised. Risk: changes workspace access. Roll out to an internal workspace first; disable creation and invalidate outstanding invitations if permission checks fail. Credential check: the sample author reports manually reviewing newly added configuration values and the description, finding only variable names and placeholders; repository history was not inspected.',
  },
  verdict: 'ready',
  score: 94,
  risk: 'high',
  summary: 'The authored after-state has specific documentation, testing, and recovery notes. This assesses the description; implementation and reported checks still need verification.',
  checks: DEMO_REVIEW.checks.map((check) => ({
    ...check,
    status: 'pass',
    findings: [],
    summary: {
      clarity: 'Purpose, scope, and expected behavior are clear in the sample description.',
      documentation: 'The sample description now identifies the guide and says what it documents about token expiry; those files have not been verified.',
      tests: 'The authored after-state describes commands, reported outcomes, and allowed-role, denied-role, and cross-workspace cases; those runs have not been verified.',
      risk: 'The sample PR now describes authorization impact, staged rollout, and how to disable and invalidate invitations.',
      secrets: 'The sample description reports a scoped credential check and its limits; the extension has not scanned for secrets.',
    }[check.id],
  })),
};
