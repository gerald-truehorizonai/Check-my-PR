export const DEFAULT_API_ENDPOINT = 'http://localhost:8787/check';

const CHECKS = [
  ['clarity', 'PR clarity'],
  ['documentation', 'Documentation'],
  ['tests', 'Tests & evidence'],
  ['risk', 'Change risk'],
  ['secrets', 'Secrets & credentials'],
];
const STATUSES = new Set(['pass', 'warn', 'fail', 'unknown', 'not_applicable']);
const VERDICTS = new Set(['ready', 'needs_attention', 'blocked', 'insufficient_evidence']);
const RISKS = new Set(['low', 'medium', 'high', 'critical', 'unknown']);
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);

export class ReviewError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'ReviewError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, fallback = '') => typeof value === 'string' ? value.trim() : fallback;
const range = (value, max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;

function safeLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function validateEndpoint(value = DEFAULT_API_ENDPOINT) {
  let url;
  try { url = new URL(value); } catch {
    throw new ReviewError('Enter a complete backend URL, such as http://localhost:8787/check.', 'INVALID_ENDPOINT');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.hash) {
    throw new ReviewError('Use HTTPS for the backend, or HTTP on localhost. Do not put credentials in its URL.', 'INVALID_ENDPOINT');
  }
  return url.href;
}

function parsePullRequest(value) {
  let url;
  try { url = new URL(value); } catch {
    throw new ReviewError('Enter a GitHub pull request URL.', 'INVALID_PR');
  }
  const match = url.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)(?:\/(?:files|commits|checks))?\/?$/);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || !match || !Number.isSafeInteger(Number(match[3]))) {
    throw new ReviewError('Use a URL like https://github.com/owner/repo/pull/123.', 'INVALID_PR');
  }
  return { url: `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`, owner: match[1], repo: match[2], number: Number(match[3]) };
}

function normalizeFinding(finding, index, checkId) {
  if (!isObject(finding) || !text(finding.title)) {
    throw new ReviewError('The backend returned an invalid finding. Each finding needs a title.', 'INVALID_RESPONSE');
  }
  return {
    id: text(finding.id, `${checkId}-${index + 1}`),
    severity: SEVERITIES.has(finding.severity) ? finding.severity : 'medium',
    title: text(finding.title),
    description: text(finding.description),
    ...(text(finding.file) ? { file: text(finding.file) } : {}),
    ...(count(finding.line) && finding.line > 0 ? { line: finding.line } : {}),
    ...(text(finding.suggestion) ? { suggestion: text(finding.suggestion) } : {}),
    ...(safeLink(finding.url) ? { url: safeLink(finding.url) } : {}),
  };
}

/** Normalize optional fields, while retaining uncertainty and refusing empty assessments. */
export function normalizeReview(raw) {
  const data = isObject(raw?.review) ? raw.review : raw;
  if (!isObject(data) || !Array.isArray(data.checks) || data.checks.length === 0) {
    throw new ReviewError('The backend returned no review checks. Expected the Check My PR response format.', 'INVALID_RESPONSE');
  }
  const seen = new Set();
  const checks = data.checks.map(check => {
    if (!isObject(check) || !text(check.id) || seen.has(text(check.id)) || !STATUSES.has(check.status) || !text(check.summary)) {
      throw new ReviewError('The backend returned an invalid check. Checks need a unique id, status, and evidence summary.', 'INVALID_RESPONSE');
    }
    const id = text(check.id);
    seen.add(id);
    if (check.findings != null && !Array.isArray(check.findings)) {
      throw new ReviewError('The backend returned invalid findings; expected an array.', 'INVALID_RESPONSE');
    }
    const findings = (check.findings ?? []).map((finding, index) => normalizeFinding(finding, index, id));
    // An adverse finding must never be hidden behind a green check supplied by the server.
    const hasAdverseFinding = findings.some(finding => finding.severity !== 'info');
    const status = hasAdverseFinding && ['pass', 'not_applicable'].includes(check.status) ? 'warn' : check.status;
    return {
      id,
      label: text(check.label) || CHECKS.find(([key]) => key === id)?.[1] || id,
      status,
      summary: text(check.summary),
      confidence: range(check.confidence, 1),
      findings,
    };
  });
  for (const [id, label] of CHECKS) {
    if (!seen.has(id)) checks.push({ id, label, status: 'unknown', summary: 'The backend did not assess this category.', confidence: null, findings: [] });
  }

  const coverageData = isObject(data.coverage) ? data.coverage : {};
  const filesAnalyzed = count(coverageData.filesAnalyzed);
  const totalFiles = count(coverageData.totalFiles);
  const truncated = coverageData.truncated === true;
  const partial = truncated || (filesAnalyzed !== undefined && totalFiles !== undefined && filesAnalyzed < totalFiles);
  let verdict = VERDICTS.has(data.verdict) ? data.verdict : 'insufficient_evidence';
  const criticalFinding = checks.some(check => check.findings.some(finding => finding.severity === 'critical'));
  const secretBlocker = checks.some(check => check.id === 'secrets' && (check.status === 'fail' || check.findings.some(finding => ['critical', 'high'].includes(finding.severity))));
  if (criticalFinding || secretBlocker) verdict = 'blocked';
  else if (verdict !== 'blocked' && checks.some(check => ['fail', 'warn'].includes(check.status))) verdict = 'needs_attention';
  else if (verdict === 'ready' && (partial || checks.some(check => check.status === 'unknown'))) verdict = 'insufficient_evidence';

  const pr = isObject(data.pr) ? data.pr : {};
  const metrics = isObject(data.metrics) ? data.metrics : {};
  return {
    reviewId: text(data.reviewId),
    pr: {
      url: safeLink(pr.url) || '', title: text(pr.title), author: text(pr.author),
      base: text(pr.base), head: text(pr.head),
      filesChanged: count(pr.filesChanged), additions: count(pr.additions), deletions: count(pr.deletions),
    },
    verdict,
    score: range(data.score, 100),
    risk: criticalFinding || secretBlocker ? 'critical' : RISKS.has(data.risk) ? data.risk : 'unknown',
    summary: text(data.summary) || 'Review completed. Inspect the checks and their evidence below.',
    checks,
    metrics: {
      ...(range(metrics.durationMs, Number.MAX_SAFE_INTEGER) !== null ? { durationMs: metrics.durationMs } : {}),
      ...(text(metrics.model) ? { model: text(metrics.model) } : {}),
      ...(count(metrics.questions) !== undefined ? { questions: metrics.questions } : {}),
      ...(range(metrics.costUsd, Number.MAX_SAFE_INTEGER) !== null ? { costUsd: metrics.costUsd } : {}),
    },
    coverage: {
      ...(filesAnalyzed !== undefined ? { filesAnalyzed } : {}),
      ...(totalFiles !== undefined ? { totalFiles } : {}),
      ...(typeof coverageData.truncated === 'boolean' ? { truncated } : {}),
    },
  };
}

const SECTION_STATUS = { missing: 'fail', weak: 'fail', ok: 'warn', good: 'pass', 'n/a': 'not_applicable' };

/** Adapt Gerald's actual Jev title/description judgement, without claiming code inspection. */
export function normalizeJudgement(raw, { context = {}, prUrl = '' } = {}) {
  if (!isObject(raw) || !Array.isArray(raw.sections) || raw.sections.length === 0) {
    throw new ReviewError('The backend returned no rubric sections.', 'INVALID_RESPONSE');
  }
  const seen = new Set();
  const checks = raw.sections.map(section => {
    if (!isObject(section) || !text(section.id) || seen.has(text(section.id)) || !Object.hasOwn(SECTION_STATUS, section.status) || !text(section.levelText)) {
      throw new ReviewError('The backend returned an invalid rubric section.', 'INVALID_RESPONSE');
    }
    const id = text(section.id);
    seen.add(id);
    const label = text(section.name) || id;
    const unsure = section.unsure === true;
    let status = SECTION_STATUS[section.status];
    if (unsure) status = ['pass', 'not_applicable'].includes(status) ? 'unknown' : 'warn';
    const summary = (unsure ? 'Jev is uncertain. ' : '') + 'Description rubric level: ' + text(section.levelText);
    const needsWork = ['fail', 'warn', 'unknown'].includes(status);
    return {
      id, label, status, summary, confidence: range(section.confidence, 1),
      score: range(section.score, 100), rubricStatus: section.status, unsure,
      presentProbability: range(section.present, 1),
      weight: range(section.weight, Number.MAX_SAFE_INTEGER),
      level: count(section.level), levelText: text(section.levelText),
      findings: needsWork ? [{
        id: id + '-description',
        severity: status === 'unknown' ? 'info' : 'medium',
        title: unsure ? 'Verify description coverage: ' + label : 'Improve description: ' + label,
        description: summary,
        suggestion: unsure
          ? 'Check the description against this rubric section and supply missing evidence before treating this as a confirmed gap.'
          : 'Add concrete, truthful information covering this section of the PR description. Do not invent tests, scans, or code changes.',
      }] : [],
    };
  });
  // Title specificity is a Noul probability, not a Choice/Score confidence.
  let titleId = 'pr_title';
  while (seen.has(titleId)) titleId += '_specificity';
  if (typeof raw.title?.ok !== 'boolean') {
    checks.unshift({
      id: titleId, label: 'Title specificity', status: 'unknown',
      summary: 'The backend did not return a title-specificity judgement.',
      confidence: null, findings: [],
    });
  } else if (!raw.title.ok) {
    checks.unshift({
      id: titleId, label: 'Title specificity', status: 'warn',
      summary: 'Jev judged the title too generic to explain the change.',
      confidence: null, presentProbability: range(raw.title.specific, 1),
      findings: [{
        id: 'title-specificity', severity: 'medium', title: 'Make the PR title specific',
        description: 'The title should name the area and what changed.',
        suggestion: 'Rewrite the title using facts already present in the PR description.',
      }],
    });
  }
  const hasAttention = checks.some(check => ['warn', 'fail'].includes(check.status));
  const hasUnknown = checks.some(check => check.status === 'unknown');
  const verdict = hasAttention ? 'needs_attention' : hasUnknown ? 'insufficient_evidence' : 'ready';
  const pr = isObject(context) ? context : {};
  return {
    reviewId: '', assessmentScope: 'description', scoreLabel: 'Description quality',
    pr: {
      url: safeLink(prUrl) || '', title: text(pr.title), author: text(pr.author),
      base: text(pr.base), head: text(pr.head),
      filesChanged: count(pr.filesChanged), additions: count(pr.additions), deletions: count(pr.deletions),
    },
    verdict, score: range(raw.overall, 100), risk: 'unknown',
    summary: 'Jev assessed the PR title and description against ' + raw.sections.length + ' rubric sections. ' +
      (hasAttention ? 'Some description sections need attention.' : hasUnknown ? 'Some judgements need confirmation.' : 'The assessed description sections meet the rubric.') +
      ' Repository files, test runs, and credentials were not inspected.',
    checks,
    metrics: {
      ...(range(raw.ms, Number.MAX_SAFE_INTEGER) !== null ? { durationMs: raw.ms } : {}),
      ...(text(raw.model) ? { model: text(raw.model) } : {}),
    },
    coverage: {},
    prType: isObject(raw.prType) ? raw.prType : {},
    judgement: raw,
  };
}

const HTTP_MESSAGES = {
  400: 'The backend rejected the request. A custom rubric needs ## section headings and at least two bullet levels per section.',
  401: 'The backend needs authentication. Ask its owner to check the server configuration.',
  403: 'The backend or model service denied access. Check its server-side credentials and permissions.',
  404: 'The review endpoint was not found. Use the backend URL ending in /check.',
  413: 'This pull request is too large for the backend. Try a smaller PR.',
  422: 'The backend rejected the review request. Check that it supports the documented API contract.',
  429: 'The backend is rate limited. Wait a moment before trying again.',
  500: 'The backend could not complete the request. Check its logs and server-side model credentials.',
  502: 'The backend could not reach an upstream model service. Check its connection.',
  503: 'The backend is temporarily unavailable. Try again shortly.',
  504: 'The backend timed out while reviewing the PR. Try again.',
};

function reviewInput(context, guidelines) {
  if (!isObject(context) || typeof context.title !== 'string' || typeof context.body !== 'string') {
    throw new ReviewError('Load the PR title and description before checking it. An empty description can be assessed, but missing page context cannot.', 'MISSING_PR_CONTEXT');
  }
  if (typeof guidelines !== 'string' || guidelines.length > 16_000) {
    throw new ReviewError('Review standards must be text, up to 16,000 characters.', 'INVALID_GUIDELINES');
  }
  return { title: context.title, body: context.body, ...(guidelines.trim() ? { rubric: guidelines.trim() } : {}) };
}

async function postJson(target, input, { signal, timeoutMs = 90_000 } = {}) {
  if (signal?.aborted) throw new ReviewError('Review cancelled.', 'ABORTED');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'omit', cache: 'no-store', redirect: 'error',
      signal: controller.signal,
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new ReviewError(HTTP_MESSAGES[response.status] || 'The backend returned HTTP ' + response.status + '. Check its logs and try again.', 'HTTP_ERROR', response.status);
    }
    try { return await response.json(); } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new ReviewError('The backend did not return valid JSON. Check the configured API endpoint.', 'INVALID_RESPONSE');
    }
  } catch (error) {
    if (timedOut) throw new ReviewError('The review took too long. Check the backend connection and try again.', 'TIMEOUT');
    if (signal?.aborted || controller.signal.aborted) throw new ReviewError('Review cancelled.', 'ABORTED');
    if (error instanceof ReviewError) throw error;
    throw new ReviewError('Could not reach the backend. Check that it is running and allows this extension to connect.', 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Live mode: send the already-loaded PR title/body to Gerald's /check route. */
export async function reviewPullRequest({ endpoint = DEFAULT_API_ENDPOINT, prUrl, guidelines = '', context = {}, signal, timeoutMs = 90_000 } = {}) {
  const target = validateEndpoint(endpoint);
  const pr = parsePullRequest(prUrl);
  const input = reviewInput(context, guidelines);
  const raw = await postJson(target, input, { signal, timeoutMs });
  const review = Array.isArray(raw?.sections)
    ? normalizeJudgement(raw, { context, prUrl: pr.url })
    : normalizeReview(raw);
  if (review.pr.url && review.pr.url !== pr.url) {
    let received;
    try { received = parsePullRequest(review.pr.url); } catch {
      throw new ReviewError('The backend returned an invalid pull request reference.', 'INVALID_RESPONSE');
    }
    if (received.url !== pr.url) throw new ReviewError('The backend returned a review for a different pull request.', 'INVALID_RESPONSE');
  }
  review.pr.url = pr.url;
  if (!review.pr.title) review.pr.title = text(context.title) || pr.owner + '/' + pr.repo + ' #' + pr.number;
  return review;
}

/** Optional paid suggestion step. Invoke it only for a user-requested suggestion. */
export async function suggestImprovements({ endpoint = DEFAULT_API_ENDPOINT, context = {}, guidelines = '', judgement, signal, timeoutMs = 90_000 } = {}) {
  const target = new URL(validateEndpoint(endpoint));
  target.pathname = target.pathname.replace(/\/[^/]*\/?$/, '/suggest');
  const input = reviewInput(context, guidelines);
  if (judgement !== undefined) {
    normalizeJudgement(judgement, { context });
    input.judgement = judgement;
  }
  const raw = await postJson(target.href, input, { signal, timeoutMs });
  const validSuggestion = item => isObject(item) && text(item.section_id) && typeof item.advice === 'string' && typeof item.example === 'string';
  if (!isObject(raw) || !Array.isArray(raw.suggestions) || !raw.suggestions.every(validSuggestion) ||
      (raw.titleSuggestion != null && !validSuggestion(raw.titleSuggestion))) {
    throw new ReviewError('The backend returned invalid improvement suggestions.', 'INVALID_RESPONSE');
  }
  return raw;
}
