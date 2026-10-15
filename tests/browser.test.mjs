import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DEFAULT_API_ENDPOINT } from '../extension/lib/api.js';
import {
  parsePullRequestUrl, sanitizePullRequestMetadata, backendPermissionOrigin,
  getActivePullRequest, getPullRequestContext, readSettings, saveSettings, requestBackendPermission,
} from '../extension/lib/browser.js';

test('GitHub PR subpages normalize to one canonical URL', () => {
  for (const suffix of ['', '/', '/files', '/commits/abc123', '/checks', '?tab=files#diff-123']) {
    assert.deepEqual(parsePullRequestUrl(`https://github.com/gerald/check-my-PR/pull/12${suffix}`), {
      url: 'https://github.com/gerald/check-my-PR/pull/12', owner: 'gerald', repo: 'check-my-PR', number: 12, source: 'github',
    });
  }
});

test('rejects unrelated pages, deceptive domains, credentials, and invalid PR numbers', () => {
  for (const input of [null, '', 'https://github.com/a/b/issues/1', 'https://github.com.evil.test/a/b/pull/1',
    'https://github.com@evil.test/a/b/pull/1', 'https://user:pass@github.com/a/b/pull/1',
    'http://github.com/a/b/pull/1', 'https://github.com/a/b/pull/0', 'https://github.com/a/b/pull/99999999999999999',
    'https://github.com/a/b/pull/1/nonsense', 'https://github.com/a/b/pull/1%2Ffiles']) {
    assert.equal(parsePullRequestUrl(input), null, String(input));
  }
});

test('stale responses cannot attach metadata from another PR', () => {
  const url = 'https://github.com/a/b/pull/1';
  assert.deepEqual(sanitizePullRequestMetadata({ url: 'https://github.com/a/b/pull/2', title: 'Wrong PR' }, url), parsePullRequestUrl(url));
  assert.equal(sanitizePullRequestMetadata({ title: 'Injected' }, 'https://example.com'), null);
});

test('metadata is bounded plain text with no copied unrecognized properties', () => {
  const url = 'https://github.com/a/b/pull/1';
  const result = sanitizePullRequestMetadata({ url, title: ' Fix\u0000 bug ', body: 'x'.repeat(70000), cookies: 'secret', token: 'secret' }, url);
  assert.equal(result.title, 'Fix bug');
  assert.equal(result.body.length, 65536);
  assert.equal(result.cookies, undefined);
  assert.equal(result.token, undefined);
  assert.equal(sanitizePullRequestMetadata({ url, title: {} }, url).title, undefined);
});

test('matching GitHub tab supplies a captured empty description without network access', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Must not call public API'); };
  globalThis.chrome = { tabs: {
    query: async () => [{ id: 9, url: 'https://github.com/a/b/pull/1/files' }],
    sendMessage: async () => ({ pullRequest: { url: 'https://github.com/a/b/pull/1', title: 'Fix bug', body: '', contextCaptured: true } }),
  } };
  try {
    const context = await getPullRequestContext('https://github.com/a/b/pull/1');
    assert.equal(context.body, '');
    assert.equal(context.contextCaptured, true);
  } finally { globalThis.fetch = originalFetch; delete globalThis.chrome; }
});

test('public lookup uses only the requested GitHub API resource without credentials or redirects', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/a/b/pulls/1');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, undefined);
    return { ok: true, status: 200, json: async () => ({ html_url: 'https://github.com/a/b/pull/1', title: 'Fix bug', body: null, user: { login: 'a' }, base: { ref: 'main' }, head: { ref: 'fix' }, changed_files: 2, additions: 4, deletions: 1 }) };
  };
  try {
    const context = await getPullRequestContext('https://github.com/a/b/pull/1');
    assert.equal(context.contextCaptured, true);
    assert.equal(context.body, '');
    assert.equal(context.filesChanged, 2);
    assert.equal(context.author, 'a');
  } finally { globalThis.fetch = originalFetch; }
});

test('private or unavailable PR lookup gives recovery instructions without copying remote errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({ message: 'SECRET' }) });
  try {
    await assert.rejects(getPullRequestContext('https://github.com/a/private/pull/1'), error => error.code === 'GITHUB_NOT_FOUND' && error.message.includes('private PR') && !error.message.includes('SECRET'));
  } finally { globalThis.fetch = originalFetch; }
});

test('cancelled context lookup never makes a network request', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Must not fetch'); };
  const controller = new AbortController();
  controller.abort();
  try { await assert.rejects(getPullRequestContext('https://github.com/a/b/pull/1', { signal: controller.signal }), error => error.code === 'ABORTED'); }
  finally { globalThis.fetch = originalFetch; }
});

test('backend permissions use exact hosts and allow HTTP only for local development', () => {
  assert.equal(backendPermissionOrigin('https://api.example.com:8443/api/review'), 'https://api.example.com/*');
  assert.equal(backendPermissionOrigin('http://localhost:3000/api/review'), 'http://localhost/*');
  assert.equal(backendPermissionOrigin('http://127.0.0.1:8000/api/review'), 'http://127.0.0.1/*');
  assert.equal(backendPermissionOrigin('http://[::1]:8000/api/review'), 'http://[::1]/*');
  for (const endpoint of ['http://public.example.com', 'http://localhost.evil.test', 'file:///tmp/x', 'https://user:secret@example.com']) {
    assert.throws(() => backendPermissionOrigin(endpoint), TypeError);
  }
});

test('manifest grants the configured local backend and includes correctly sized PNG icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.ok(manifest.optional_host_permissions.includes(backendPermissionOrigin(DEFAULT_API_ENDPOINT)));
  assert.ok(manifest.optional_host_permissions.includes(backendPermissionOrigin('http://[::1]:8000/api/review')));
  assert.ok(!manifest.optional_host_permissions.includes('http://*/*'));
  for (const size of [16, 32, 48, 128]) {
    const icon = await readFile(new URL(`../extension/${manifest.icons[size]}`, import.meta.url));
    assert.equal(icon.subarray(1, 4).toString(), 'PNG');
    assert.equal(icon.readUInt32BE(16), size);
    assert.equal(icon.readUInt32BE(20), size);
    assert.equal(manifest.action.default_icon[size], manifest.icons[size]);
  }
});

test('settings merge in web preview and recover from corrupt storage', async () => {
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  try {
    assert.deepEqual(await readSettings(), {});
    await saveSettings({ endpoint: 'http://localhost:8000' });
    await saveSettings({ rubric: 'document changes' });
    assert.deepEqual(await readSettings(), { endpoint: 'http://localhost:8000', rubric: 'document changes' });
    values.set('checkMyPrSettings', '{invalid');
    assert.deepEqual(await readSettings(), {});
  } finally { delete globalThis.localStorage; }
});

test('active tab fallback supports tabs opened before extension installation', async () => {
  globalThis.chrome = { tabs: {
    query: async () => [{ id: 7, url: 'https://github.com/a/b/pull/1/files' }],
    sendMessage: async () => { throw new Error('No receiving end'); },
  } };
  try { assert.equal((await getActivePullRequest()).url, 'https://github.com/a/b/pull/1'); }
  finally { delete globalThis.chrome; }
});

test('backend permission is requested synchronously within the caller gesture', async () => {
  let requested;
  globalThis.chrome = { runtime: { id: 'test' }, permissions: {
    request: (details) => { requested = details; return Promise.resolve(true); },
  } };
  try {
    const result = requestBackendPermission('http://localhost:8000/api/review');
    assert.deepEqual(requested, { origins: ['http://localhost/*'] });
    assert.equal(await result, true);
  } finally { delete globalThis.chrome; }
});

test('content script does not read unrelated GitHub pages', async () => {
  const source = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
  let listener;
  let queries = 0;
  const context = {
    location: { origin: 'https://github.com', pathname: '/settings/profile' },
    document: {
      documentElement: {}, addEventListener() {}, getElementById() { return null; },
      querySelector() { queries += 1; throw new Error('Must not inspect unrelated pages'); },
    },
    window: { addEventListener() {} },
    chrome: { runtime: { sendMessage: () => Promise.resolve(), onMessage: { addListener: (fn) => { listener = fn; } } } },
    MutationObserver: class { observe() {} },
    setTimeout, clearTimeout,
  };
  vm.runInNewContext(source, context);
  let response;
  listener({ type: 'CHECK_MY_PR_GET_CONTEXT' }, {}, (value) => { response = value; });
  assert.equal(response.pullRequest, null);
  assert.equal(queries, 0);
});

test('content script preserves raw markdown and recognizes a captured empty PR body', async () => {
  const source = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
  for (const body of ['', '## Summary\n- [x] Tests pass']) {
    let listener;
    const context = {
      location: { origin: 'https://github.com', pathname: '/a/b/pull/1' },
      document: {
        documentElement: {}, addEventListener() {}, getElementById() { return {}; },
        querySelector(selector) {
          if (selector === '.js-issue-title') return { textContent: 'Fix bug' };
          if (selector === 'textarea[name="pull_request[body]"]') return { value: body };
          if (selector === '.timeline-comment .comment-body') return { textContent: 'Rendered fallback' };
          return null;
        },
      },
      window: { addEventListener() {} },
      chrome: { runtime: { sendMessage: () => Promise.resolve(), onMessage: { addListener: fn => { listener = fn; } } } },
      MutationObserver: class { observe() {} }, setTimeout, clearTimeout,
    };
    vm.runInNewContext(source, context);
    let response;
    listener({ type: 'CHECK_MY_PR_GET_CONTEXT' }, {}, value => { response = value; });
    assert.equal(response.pullRequest.title, 'Fix bug');
    assert.equal(response.pullRequest.body, body);
    assert.equal(response.pullRequest.contextCaptured, true);
  }
});
