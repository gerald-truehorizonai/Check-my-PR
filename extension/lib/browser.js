const SETTINGS_KEY = 'checkMyPrSettings';
const PR_PATH = /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)(?:\/(?:files|commits|checks)(?:\/[^?#]*)?)?\/?$/;

/** Only accept real GitHub PR URLs, and strip view paths, queries and fragments. */
export function parsePullRequestUrl(input) {
  if (typeof input !== 'string') return null;
  try {
    const url = new URL(input.trim());
    if (url.origin !== 'https://github.com' || url.username || url.password) return null;
    const match = url.pathname.match(PR_PATH);
    if (!match) return null;
    const [, owner, repo, rawNumber] = match;
    const number = Number(rawNumber);
    if (!Number.isSafeInteger(number)) return null;
    return { url: `https://github.com/${owner}/${repo}/pull/${number}`, owner, repo, number, source: 'github' };
  } catch {
    return null;
  }
}

function boundedText(value, maxLength) {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return text ? text.slice(0, maxLength) : undefined;
}

/** Discard stale page responses and ignore everything except PR title/body. */
export function sanitizePullRequestMetadata(metadata, expectedUrl) {
  const base = parsePullRequestUrl(expectedUrl);
  if (!base) return null;
  const received = parsePullRequestUrl(metadata?.url);
  if (!received || received.url.toLowerCase() !== base.url.toLowerCase()) return base;
  const title = boundedText(metadata.title, 500);
  const hasBody = typeof metadata.body === 'string';
  const body = hasBody ? boundedText(metadata.body, 65536) || '' : undefined;
  const details = {};
  for (const field of ['author', 'base', 'head']) {
    const value = boundedText(metadata[field], 500);
    if (value) details[field] = value;
  }
  for (const field of ['filesChanged', 'additions', 'deletions']) {
    if (Number.isSafeInteger(metadata[field]) && metadata[field] >= 0) details[field] = metadata[field];
  }
  return { ...base, ...details, ...(title ? { title } : {}), ...(hasBody ? { body } : {}),
    ...(title && hasBody ? { contextCaptured: true } : {}) };
}

function contextError(message, code) {
  return Object.assign(new Error(message), { name: 'PullRequestContextError', code });
}

/** Read just the requested PR, preferring the user's authenticated GitHub page. */
export async function getPullRequestContext(prUrl, { signal } = {}) {
  const base = parsePullRequestUrl(prUrl);
  if (!base) throw contextError('Enter a valid GitHub pull request URL.', 'INVALID_PR');
  const checkAbort = () => { if (signal?.aborted) throw contextError('Review cancelled.', 'ABORTED'); };
  checkAbort();
  if (globalThis.chrome?.tabs?.query) {
    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: 'https://github.com/*' }); } catch {}
    checkAbort();
    for (const tab of tabs) {
      if (parsePullRequestUrl(tab.url)?.url.toLowerCase() !== base.url.toLowerCase()) continue;
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_MY_PR_GET_CONTEXT' });
        checkAbort();
        const context = sanitizePullRequestMetadata(response?.pullRequest, base.url);
        if (context?.contextCaptured) return context;
      } catch { checkAbort(); }
    }
  }
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  try {
    checkAbort();
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(base.owner)}/${encodeURIComponent(base.repo)}/pulls/${base.number}`, {
      headers: { Accept: 'application/vnd.github+json' },
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
    });
    if (response.status === 404) throw contextError('GitHub could not find this public PR. For a private PR, open or reload its GitHub tab, or paste the title and description below.', 'GITHUB_NOT_FOUND');
    if (response.status === 403 || response.status === 429) throw contextError('GitHub denied the public lookup or its API rate limit was reached. Open or reload the PR in GitHub, or paste its title and description below.', 'GITHUB_FORBIDDEN');
    if (!response.ok) throw contextError(`GitHub returned HTTP ${response.status}. Open the PR in GitHub or paste its title and description below.`, 'GITHUB_ERROR');
    const data = await response.json();
    if (parsePullRequestUrl(data?.html_url)?.url.toLowerCase() !== base.url.toLowerCase() ||
      !boundedText(data?.title, 500) || !(typeof data.body === 'string' || data.body === null)) {
      throw contextError('GitHub did not return a readable PR title and description. Paste them below.', 'INVALID_CONTEXT');
    }
    return sanitizePullRequestMetadata({ url: base.url, title: data.title, body: data.body ?? '',
      author: data.user?.login, base: data.base?.ref, head: data.head?.ref,
      filesChanged: data.changed_files, additions: data.additions, deletions: data.deletions }, base.url);
  } catch (error) {
    checkAbort();
    if (timedOut) throw contextError('GitHub took too long to respond. Open the PR in GitHub or paste its title and description below.', 'GITHUB_TIMEOUT');
    if (error.name === 'PullRequestContextError') throw error;
    throw contextError('Could not load this PR from GitHub. Open or reload its GitHub tab, or paste the title and description below.', 'GITHUB_NETWORK');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function getActivePullRequest() {
  if (!globalThis.chrome?.tabs?.query) return null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const base = parsePullRequestUrl(tab?.url);
    if (!base) return null;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_MY_PR_GET_CONTEXT' });
      return sanitizePullRequestMetadata(response?.pullRequest, base.url);
    } catch {
      // A GitHub tab opened before installation may not yet have our content script.
      return base;
    }
  } catch {
    return null;
  }
}

export async function readSettings() {
  try {
    const settings = globalThis.chrome?.storage?.local
      ? (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]
      : JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) || '{}');
    return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  } catch {
    return {};
  }
}

export async function saveSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new TypeError('Settings must be an object.');
  }
  const next = { ...await readSettings(), ...settings };
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  } else if (globalThis.localStorage) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }
  return next;
}

/** Chrome host match patterns grant an origin across ports; never a URL path. */
export function backendPermissionOrigin(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch { throw new TypeError('Enter a valid backend URL.'); }
  if (url.username || url.password) throw new TypeError('Backend URLs must not contain credentials.');
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new TypeError('Use HTTPS, or HTTP on localhost for local development.');
  }
  return `${url.protocol}//${url.hostname}/*`;
}

/** Invoke directly from a user click, before awaiting other work. */
export async function requestBackendPermission(endpoint) {
  const origin = backendPermissionOrigin(endpoint);
  if (!globalThis.chrome?.runtime?.id || !globalThis.chrome?.permissions?.request) return true;
  try {
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

/** Follow tab switches and GitHub's SPA navigation. Does not perform a review. */
export function onActivePullRequestChange(callback) {
  if (!globalThis.chrome?.tabs) return () => {};
  let disposed = false;
  let generation = 0;
  const refresh = async () => {
    const current = ++generation;
    const pullRequest = await getActivePullRequest();
    if (!disposed && current === generation) callback(pullRequest);
  };
  const updated = (_tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) void refresh();
  };
  const message = (data, sender) => {
    if (sender.id === chrome.runtime.id && data?.type === 'CHECK_MY_PR_CONTEXT_CHANGED') void refresh();
  };
  chrome.tabs.onActivated?.addListener(refresh);
  chrome.tabs.onUpdated?.addListener(updated);
  chrome.runtime.onMessage?.addListener(message);
  return () => {
    disposed = true;
    chrome.tabs.onActivated?.removeListener(refresh);
    chrome.tabs.onUpdated?.removeListener(updated);
    chrome.runtime.onMessage?.removeListener(message);
  };
}
