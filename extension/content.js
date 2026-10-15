(() => {
  const PR_PATH = /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)(?:\/(?:files|commits|checks)(?:\/[^?#]*)?)?\/?$/;
  const BUTTON_ID = 'check-my-pr-open-panel';
  let lastSignature = '';
  let timer;

  function readPullRequest() {
    if (location.origin !== 'https://github.com') return null;
    const match = location.pathname.match(PR_PATH);
    if (!match || !Number.isSafeInteger(Number(match[3]))) return null;
    const [, owner, repo, rawNumber] = match;
    const first = selectors => selectors.map(selector => document.querySelector(selector)).find(Boolean);
    const textOf = (el, limit) => (el ? String('value' in el ? el.value : el.innerText ?? el.textContent ?? '').trim().slice(0, limit) : undefined);
    const titleElement = first(['[data-testid="issue-title"]', 'bdi.js-issue-title', '.js-issue-title', 'input[name="pull_request[title]"]', '#pull_request_title']);
    const title = textOf(titleElement, 500);
    // Raw markdown preserves headings/checklists used by the rubric. Scope all
    // rendered fallbacks to the opening description, never subsequent comments.
    const bodyElement = first(['textarea[name="pull_request[body]"]', '#pull_request_body',
      '[data-testid="issue-body"] .markdown-body', '[data-testid="issue-body"]',
      '[data-testid="issue-viewer-description-markdown"]', '[id^="issue-"] .comment-body',
      '[id^="pullrequest-"] .comment-body', '.js-discussion > .js-comment-container .comment-body',
      '.timeline-comment .comment-body']);
    const renderedBody = textOf(bodyElement, 65536);
    const body = bodyElement && !('value' in bodyElement) && renderedBody === 'No description provided.' ? '' : renderedBody;
    return {
      url: `https://github.com/${owner}/${repo}/pull/${Number(rawNumber)}`,
      owner, repo, number: Number(rawNumber), source: 'github',
      ...(title ? { title } : {}), ...(bodyElement ? { body } : {}),
      ...(title && bodyElement ? { contextCaptured: true } : {}),
    };
  }

  function update() {
    const pullRequest = readPullRequest();
    const signature = JSON.stringify(pullRequest);
    if (signature !== lastSignature) {
      lastSignature = signature;
      chrome.runtime.sendMessage({ type: 'CHECK_MY_PR_CONTEXT_CHANGED' }).catch(() => {});
    }
    if (!pullRequest) {
      document.getElementById(BUTTON_ID)?.remove();
      return;
    }
    if (document.getElementById(BUTTON_ID)) return;
    const actions = document.querySelector('.gh-header-actions, [data-testid="issue-header-actions"]');
    if (!actions) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'btn btn-sm';
    button.textContent = 'Check my PR';
    button.title = 'Open the Check My PR side panel';
    button.style.marginLeft = '8px';
    button.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CHECK_MY_PR_OPEN_PANEL' }).catch(() => {});
    });
    actions.append(button);
  }

  function scheduleUpdate() {
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'CHECK_MY_PR_GET_CONTEXT') {
      sendResponse({ pullRequest: readPullRequest() });
    }
  });
  document.addEventListener('turbo:load', scheduleUpdate);
  document.addEventListener('pjax:end', scheduleUpdate);
  window.addEventListener('popstate', scheduleUpdate);
  new MutationObserver(scheduleUpdate).observe(document.documentElement, { childList: true, subtree: true });
  update();
})();
