import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_API_ENDPOINT, normalizeReview, normalizeJudgement, reviewPullRequest, suggestImprovements, validateEndpoint } from '../extension/lib/api.js';

const prUrl = 'https://github.com/example/storefront/pull/42';
const prContext = { title: 'Add filtered export', body: 'Exports only the visible rows.' };
const requestReview = options => reviewPullRequest({ context: prContext, ...options });
function fixture() {
  return {
    verdict: 'ready', score: 91, risk: 'low', summary: 'All applicable criteria have supporting evidence.',
    pr: { url: prUrl, title: 'Add filtered exports' },
    checks: ['clarity', 'documentation', 'tests', 'risk', 'secrets'].map(id => ({
      id, status: 'pass', summary: 'Observed evidence supports ' + id + '.', confidence: 0.9, findings: [],
    })),
    coverage: { filesAnalyzed: 3, totalFiles: 3, truncated: false },
  };
}

function mockFetch(t, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  t.after(() => { globalThis.fetch = original; });
}

test('normalizes a supported assessment without inventing metrics', () => {
  const result = normalizeReview(fixture());
  assert.equal(result.verdict, 'ready');
  assert.equal(result.checks.length, 5);
  assert.equal(result.checks[0].label, 'PR clarity');
  assert.deepEqual(result.metrics, {});
  assert.equal(result.pr.filesChanged, undefined);
});

test('accepts the explicit review envelope', () => {
  assert.equal(normalizeReview({ review: fixture() }).score, 91);
});

test('rejects empty or malformed assessments', () => {
  for (const raw of [null, 'ready', {}, { score: 100 }, { checks: [] }, { checks: [{}] }]) {
    assert.throws(() => normalizeReview(raw), { code: 'INVALID_RESPONSE' });
  }
  const missingEvidence = fixture();
  missingEvidence.checks[0].summary = ' ';
  assert.throws(() => normalizeReview(missingEvidence), { code: 'INVALID_RESPONSE' });
  const badStatus = fixture();
  badStatus.checks[0].status = 'excellent';
  assert.throws(() => normalizeReview(badStatus), { code: 'INVALID_RESPONSE' });
});

test('rejects duplicate checks and malformed findings', () => {
  const duplicate = fixture();
  duplicate.checks.push(duplicate.checks[0]);
  assert.throws(() => normalizeReview(duplicate), { code: 'INVALID_RESPONSE' });
  for (const findings of [{}, [null], [{ description: 'Missing title' }]]) {
    const raw = fixture();
    raw.checks[0].findings = findings;
    assert.throws(() => normalizeReview(raw), { code: 'INVALID_RESPONSE' });
  }
});

test('missing categories remain unknown and cannot yield ready', () => {
  const raw = fixture();
  raw.checks = [raw.checks[0]];
  const result = normalizeReview(raw);
  assert.equal(result.verdict, 'insufficient_evidence');
  assert.equal(result.checks.find(check => check.id === 'secrets').status, 'unknown');
  assert.equal(result.checks.find(check => check.id === 'tests').confidence, null);
});

test('truncated and incomplete coverage cannot yield ready', () => {
  for (const coverage of [{ truncated: true }, { filesAnalyzed: 2, totalFiles: 4 }]) {
    const raw = fixture(); raw.coverage = coverage;
    assert.equal(normalizeReview(raw).verdict, 'insufficient_evidence');
  }
});

test('critical secrets block regardless of high aggregate score', () => {
  const raw = fixture();
  raw.score = 99;
  raw.checks[4].findings = [{ title: 'Possible credential (redacted)', severity: 'critical' }];
  const result = normalizeReview(raw);
  assert.equal(result.verdict, 'blocked');
  assert.equal(result.risk, 'critical');
  assert.equal(result.score, 99);
  assert.notEqual(result.checks[4].status, 'pass');
});

test('failed secrets and high severity secret findings also block', () => {
  const failed = fixture(); failed.checks[4].status = 'fail';
  assert.equal(normalizeReview(failed).verdict, 'blocked');
  const high = fixture(); high.checks[4].findings = [{ title: 'Exposed access token (redacted)', severity: 'high' }];
  assert.equal(normalizeReview(high).verdict, 'blocked');
});

test('adverse findings, failures, and warnings cannot be green', () => {
  const adverse = fixture();
  adverse.checks[0].findings = [{ title: 'Unexplained behavior change', severity: 'medium' }];
  assert.equal(normalizeReview(adverse).verdict, 'needs_attention');
  assert.equal(normalizeReview(adverse).checks[0].status, 'warn');
  const failure = fixture(); failure.checks[2].status = 'fail';
  assert.equal(normalizeReview(failure).verdict, 'needs_attention');
  failure.verdict = 'blocked';
  assert.equal(normalizeReview(failure).verdict, 'blocked');
});

test('not-applicable documentation is allowed with an evidence summary', () => {
  const raw = fixture();
  raw.checks[1].status = 'not_applicable';
  raw.checks[1].summary = 'Internal refactor; no public behavior or setup changed.';
  assert.equal(normalizeReview(raw).verdict, 'ready');
});

test('invalid scores and confidence stay unavailable; unsafe finding links are dropped', () => {
  const raw = fixture(); raw.score = '99';
  raw.checks[0].confidence = 99;
  raw.checks[0].findings = [{ title: 'Read more', severity: 'info', url: 'javascript:alert(1)', line: -1 }];
  raw.metrics = { durationMs: -1, costUsd: '0.01', questions: 2.5 };
  const result = normalizeReview(raw);
  assert.equal(result.score, null);
  assert.equal(result.checks[0].confidence, null);
  assert.equal(result.checks[0].findings[0].url, undefined);
  assert.equal(result.checks[0].findings[0].line, undefined);
  assert.deepEqual(result.metrics, {});
});

test('endpoint policy accepts HTTPS and local development only', () => {
  for (const endpoint of [DEFAULT_API_ENDPOINT, 'http://127.0.0.1:8000/api/review', 'http://[::1]:8000/api/review', 'https://review.example/api/review']) {
    assert.equal(validateEndpoint(endpoint), endpoint);
  }
  for (const endpoint of ['nope', 'javascript:alert(1)', 'http://review.example/api', 'https://user:secret@review.example/api', 'https://review.example/api#fragment']) {
    assert.throws(() => validateEndpoint(endpoint), { code: 'INVALID_ENDPOINT' });
  }
});

test('live adapter sends the canonical request and adds missing PR display context', async t => {
  let request;
  mockFetch(t, async (url, init) => {
    request = { url, init };
    const raw = fixture(); delete raw.pr;
    return new Response(JSON.stringify(raw), { status: 200 });
  });
  const result = await requestReview({
    prUrl: prUrl + '/files?diff=split', guidelines: '  Explain tests.  ',
    context: { owner: 'wrong', repo: 'wrong', number: 100, title: 'Observed title', body: '', token: 'must-not-send' },
  });
  assert.equal(request.url, DEFAULT_API_ENDPOINT);
  assert.deepEqual(JSON.parse(request.init.body), {
    title: 'Observed title', body: '', rubric: 'Explain tests.',
  });
  assert.equal(request.init.credentials, 'omit');
  assert.equal(request.init.redirect, 'error');
  assert.equal(result.pr.title, 'Observed title');
  assert.equal(result.pr.url, prUrl);
});

test('rejects unsupported PR URLs and invalid standards before making a request', async t => {
  let calls = 0;
  mockFetch(t, async () => { calls++; throw new Error('Unexpected fetch'); });
  for (const invalidUrl of ['https://example.com/owner/repo/pull/1', 'http://github.com/example/storefront/pull/42', 'https://github.com/example/storefront/issues/42']) {
    await assert.rejects(requestReview({ prUrl: invalidUrl }), { code: 'INVALID_PR' });
  }
  await assert.rejects(requestReview({ prUrl, guidelines: { key: 'value' } }), { code: 'INVALID_GUIDELINES' });
  await assert.rejects(requestReview({ prUrl, guidelines: 'x'.repeat(16_001) }), { code: 'INVALID_GUIDELINES' });
  assert.equal(calls, 0);
});

test('HTTP errors preserve status without echoing sensitive upstream response bodies', async t => {
  mockFetch(t, async () => new Response('{"message":"secret-token-from-upstream"}', { status: 403 }));
  await assert.rejects(requestReview({ prUrl }), error => {
    assert.equal(error.code, 'HTTP_ERROR');
    assert.equal(error.status, 403);
    assert.match(error.message, /denied access/);
    assert.doesNotMatch(error.message, /secret-token/);
    return true;
  });
});

test('invalid JSON and empty review responses do not fall back to demo data', async t => {
  let body = '<html>Backend homepage</html>';
  mockFetch(t, async () => new Response(body, { status: 200 }));
  await assert.rejects(requestReview({ prUrl }), { code: 'INVALID_RESPONSE' });
  body = '{}';
  await assert.rejects(requestReview({ prUrl }), { code: 'INVALID_RESPONSE' });
});

test('network failure is actionable and never yields an assessment', async t => {
  mockFetch(t, async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(requestReview({ prUrl }), { code: 'NETWORK_ERROR' });
});

test('rejects a review for a different PR', async t => {
  const raw = fixture(); raw.pr.url = 'https://github.com/example/storefront/pull/43';
  mockFetch(t, async () => new Response(JSON.stringify(raw), { status: 200 }));
  await assert.rejects(requestReview({ prUrl }), { code: 'INVALID_RESPONSE' });
});

test('cancellation and timeout are distinguished', async t => {
  mockFetch(t, async (_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
    else signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  await assert.rejects(requestReview({ prUrl, timeoutMs: 5 }), { code: 'TIMEOUT' });
  const controller = new AbortController();
  const request = requestReview({ prUrl, signal: controller.signal });
  controller.abort();
  await assert.rejects(request, { code: 'ABORTED' });
  await assert.rejects(requestReview({ prUrl, signal: controller.signal }), { code: 'ABORTED' });
});


function judgementFixture() {
  return {
    overall: 75, title: { specific: 0.93, ok: true },
    prType: { value: 'feature', confidence: 0.82, probabilities: { feature: 0.9, bugfix: 0.1 } },
    sections: [
      { id: 'custom_delivery', name: 'Delivery notes', weight: 2, status: 'good', score: 85, present: 0.95, level: 2, levelText: 'Specific release steps are described.', confidence: 0.84, unsure: false },
      { id: 'testing', name: 'Testing', weight: 3, status: 'ok', score: 52, present: 0.9, level: 1, levelText: 'Vague testing description.', confidence: 0.75, unsure: false },
    ],
    model: 'jev-1.14.0', usage: { input_tokens: 500, output_tokens: 10 }, ms: 420,
  };
}

test('actual backend sections preserve custom rubric IDs without injecting legacy categories', () => {
  const raw = judgementFixture();
  const result = normalizeJudgement(raw, { context: { ...prContext, author: 'example', filesChanged: 3, head: 'abc123' }, prUrl });
  assert.deepEqual(result.checks.map(check => check.id), ['custom_delivery', 'testing']);
  assert.equal(result.checks[0].score, 85);
  assert.equal(result.checks[0].status, 'pass');
  assert.equal(result.checks[1].status, 'warn');
  assert.equal(result.assessmentScope, 'description');
  assert.equal(result.scoreLabel, 'Description quality');
  assert.equal(result.risk, 'unknown');
  assert.deepEqual(result.coverage, {});
  assert.equal(result.judgement, raw);
  assert.equal(result.pr.author, 'example');
  assert.equal(result.pr.filesChanged, 3);
  assert.equal(result.pr.head, 'abc123');
  assert.match(result.summary, /credentials were not inspected/);
});

test('actual backend statuses map conservatively including uncertainty', () => {
  const expected = { missing: 'fail', weak: 'fail', ok: 'warn', good: 'pass', 'n/a': 'not_applicable' };
  for (const [rawStatus, normalized] of Object.entries(expected)) {
    const raw = judgementFixture();
    raw.sections = [{ ...raw.sections[0], status: rawStatus }];
    assert.equal(normalizeJudgement(raw).checks[0].status, normalized);
  }
  const uncertainGood = judgementFixture();
  uncertainGood.sections = [{ ...uncertainGood.sections[0], unsure: true }];
  assert.equal(normalizeJudgement(uncertainGood).checks[0].status, 'unknown');
  assert.equal(normalizeJudgement(uncertainGood).verdict, 'insufficient_evidence');
  const uncertainMissing = judgementFixture();
  uncertainMissing.sections = [{ ...uncertainMissing.sections[0], status: 'missing', unsure: true }];
  assert.equal(normalizeJudgement(uncertainMissing).checks[0].status, 'warn');
});

test('missing secrets description never means an exposed credential or risk blocker', () => {
  const raw = judgementFixture();
  raw.sections = [{ ...raw.sections[0], id: 'secrets', name: 'Secrets', status: 'missing', score: 0, levelText: 'No credential-check statement.' }];
  const result = normalizeJudgement(raw);
  assert.equal(result.checks[0].status, 'fail');
  assert.equal(result.verdict, 'needs_attention');
  assert.equal(result.risk, 'unknown');
  assert.equal(result.checks[0].findings[0].file, undefined);
  assert.match(result.checks[0].findings[0].suggestion, /Do not invent/);
});

test('generic title adds an actionable title warning with no fabricated confidence', () => {
  const raw = judgementFixture();
  raw.title = { specific: 0.1, ok: false };
  const result = normalizeJudgement(raw);
  const title = result.checks.find(check => check.id === 'pr_title');
  assert.equal(title.status, 'warn');
  assert.equal(title.confidence, null);
  assert.equal(title.presentProbability, 0.1);
  assert.equal(title.findings[0].title, 'Make the PR title specific');
});

test('missing title judgement cannot silently produce a ready description', () => {
  const raw = judgementFixture();
  raw.sections = [raw.sections[0]];
  delete raw.title;
  assert.equal(normalizeJudgement(raw).verdict, 'insufficient_evidence');
});

test('malformed actual backend section responses fail instead of becoming green', () => {
  for (const raw of [null, {}, { sections: [] }, { sections: [{}] }]) {
    assert.throws(() => normalizeJudgement(raw), { code: 'INVALID_RESPONSE' });
  }
  const raw = judgementFixture();
  raw.sections.push(raw.sections[0]);
  assert.throws(() => normalizeJudgement(raw), { code: 'INVALID_RESPONSE' });
});

test('actual check request matches Gerald server contract and preserves empty body', async t => {
  let sent;
  mockFetch(t, async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify(judgementFixture()), { status: 200 });
  });
  const rubric = '## Testing\nExplain testing.\n- Missing.\n- Specific steps.';
  const result = await requestReview({ prUrl, context: { title: 'Add filtered export', body: '' }, guidelines: rubric });
  assert.equal(sent.url, 'http://localhost:8787/check');
  assert.deepEqual(sent.body, { title: 'Add filtered export', body: '', rubric });
  assert.equal(result.pr.url, prUrl);
  assert.equal(result.score, 75);
  assert.equal(result.assessmentScope, 'description');
});

test('missing PR context is distinct from an observed empty description', async t => {
  let calls = 0;
  mockFetch(t, async () => { calls++; return new Response(JSON.stringify(judgementFixture()), { status: 200 }); });
  for (const context of [{}, { title: 'Known title' }, { body: '' }, { title: 'Known title', body: null }]) {
    await assert.rejects(reviewPullRequest({ prUrl, context }), { code: 'MISSING_PR_CONTEXT' });
  }
  assert.equal(calls, 0);
  await requestReview({ prUrl, context: { title: 'Known title', body: '' } });
  assert.equal(calls, 1);
});

test('blank custom rubric is omitted to allow the server default', async t => {
  let body;
  mockFetch(t, async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify(judgementFixture()), { status: 200 });
  });
  await requestReview({ prUrl, guidelines: '   ' });
  assert.deepEqual(body, prContext);
});

test('optional suggestions reuse raw judgement and select sibling /suggest route', async t => {
  let sent;
  const judgement = judgementFixture();
  const suggestions = [{ section_id: 'testing', advice: 'Name the test command.', example: 'Testing: <command you ran>' }];
  mockFetch(t, async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ judgement, suggestions, titleSuggestion: null, model: 'suggestion-model' }), { status: 200 });
  });
  const result = await suggestImprovements({ endpoint: 'https://example.com/api/check', context: prContext, judgement });
  assert.equal(sent.url, 'https://example.com/api/suggest');
  assert.deepEqual(sent.body, { ...prContext, judgement });
  assert.deepEqual(result.suggestions, suggestions);
});

test('malformed suggestion responses remain errors', async t => {
  mockFetch(t, async () => new Response(JSON.stringify({ suggestions: [{ example: 'Missing section/advice' }] }), { status: 200 }));
  await assert.rejects(suggestImprovements({ context: prContext }), { code: 'INVALID_RESPONSE' });
});
