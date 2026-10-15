// Rudimentary debug panel: shows which elements we picked up as the PR title and body,
// outlines them on the page, and sends them to the backend. Styling is a placeholder.

// First match wins. Edit these if GitHub's markup doesn't match.
const SELECTORS = {
  title: [
    'input[name="pull_request[title]"]', // compose page + edit-title form
    "#pull_request_title",
    '[data-testid="issue-title"]', // PR view (React UI)
    "bdi.js-issue-title",
    ".js-issue-title",
  ],
  body: [
    'textarea[name="pull_request[body]"]', // compose page, or hidden edit form on PR view (raw markdown)
    "#pull_request_body",
    '[data-testid="issue-body"] .markdown-body', // PR view (React UI), rendered text
    ".timeline-comment .comment-body", // PR view (classic), rendered text
    ".js-comment-body",
  ],
};

const pageKind = () =>
  /\/compare\//.test(location.pathname) ? "compose" : /\/pull\/\d+/.test(location.pathname) ? "pr view" : null;

function find(kind) {
  for (const sel of SELECTORS[kind]) {
    const el = document.querySelector(sel);
    if (el) return { el, sel };
  }
  return { el: null, sel: null };
}

const textOf = (el) => (el ? ("value" in el ? el.value : el.innerText) : "").trim();
const visible = (el) => !!el && el.getClientRects().length > 0;

function readPr() {
  const t = find("title");
  const b = find("body");
  return { t, b, title: textOf(t.el), body: textOf(b.el) };
}

// ---------- panel ----------
let host, root, outlined = [];

function mount() {
  if (host) return;
  host = document.createElement("div");
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647";
  root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      .p{width:380px;max-height:70vh;overflow:auto;font:13px/1.4 system-ui,sans-serif;background:#fff;color:#111;
         border:2px solid #8250df;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.2);padding:10px}
      h3{margin:0 0 6px;font-size:14px} .row{margin:6px 0} code{font-size:11px;background:#f3f3f3;padding:1px 3px}
      pre{white-space:pre-wrap;background:#f6f8fa;padding:6px;max-height:90px;overflow:auto;font-size:11px;margin:2px 0}
      button{margin-right:6px;padding:4px 10px;cursor:pointer} .bad{color:#c00} .muted{color:#666}
      table{width:100%;border-collapse:collapse;margin-top:6px} td{padding:2px 4px;border-top:1px solid #eee}
      .good{color:#1a7f37} .ok{color:#9a6700} .weak,.missing{color:#c00}
    </style>
    <div class="p">
      <h3>Check my PR (dev) <span class="muted" id="kind"></span></h3>
      <div id="detect"></div>
      <div class="row">
        <button id="rescan">Rescan</button><button id="check">Check</button><button id="suggest">Suggest</button>
      </div>
      <div id="out"></div>
    </div>`;
  document.body.appendChild(host);
  root.getElementById("rescan").onclick = render;
  root.getElementById("check").onclick = () => call("/check");
  root.getElementById("suggest").onclick = () => call("/suggest");
  render();
}

function unmount() {
  clearOutlines();
  host?.remove();
  host = root = null;
}

function clearOutlines() {
  for (const el of outlined) el.style.outline = "";
  outlined = [];
}

function describe(label, hit, text) {
  if (!hit.el) return `<div class="row bad"><b>${label}:</b> not found</div>`;
  const vis = visible(hit.el) ? "" : ' <span class="bad">(hidden element)</span>';
  return `<div class="row"><b>${label}:</b> <code>${hit.sel}</code>${vis} <span class="muted">${text.length} chars</span>
    <pre>${escape(text.slice(0, 400)) || '<span class="muted">(empty)</span>'}</pre></div>`;
}

function render() {
  clearOutlines();
  const { t, b, title, body } = readPr();
  for (const [hit, colour] of [[t, "#8250df"], [b, "#e16f24"]]) {
    if (hit.el && visible(hit.el)) {
      hit.el.style.outline = `3px dashed ${colour}`;
      outlined.push(hit.el);
    }
  }
  root.getElementById("kind").textContent = `· ${pageKind()}`;
  root.getElementById("detect").innerHTML =
    describe("Title (purple)", t, title) + describe("Body (orange)", b, body);
}

async function call(path) {
  const out = root.getElementById("out");
  const { title, body } = readPr();
  out.innerHTML = `<div class="muted">Calling ${path}…</div>`;
  const started = performance.now();
  const res = await chrome.runtime.sendMessage({ path, payload: { title, body } });
  const ms = Math.round(performance.now() - started);
  if (!res?.ok) {
    out.innerHTML = `<div class="bad">Error: ${escape(res?.data?.error ?? "no response")}</div>`;
    return;
  }
  const j = res.data.judgement ?? res.data;
  const rows = j.sections
    .map((s) => `<tr><td>${s.name}</td><td class="${s.status}">${s.status}${s.unsure ? " ?" : ""}</td><td>${s.score}</td></tr>`)
    .join("");
  const tips = (res.data.suggestions ?? [])
    .map((s) => `<div class="row"><b>${s.section_id}</b>: ${escape(s.advice)}<pre>${escape(s.example)}</pre></div>`)
    .join("");
  const titleTip = res.data.titleSuggestion
    ? `<div class="row"><b>title</b>: <code>${escape(res.data.titleSuggestion.example)}</code></div>`
    : "";
  out.innerHTML = `
    <div class="row"><b>Overall ${j.overall}/100</b> · ${j.prType.value} · title ${j.title.ok ? "ok" : '<span class="bad">vague</span>'}
      <span class="muted">(${ms} ms round trip)</span></div>
    <table>${rows}</table>${titleTip}${tips}`;
}

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// GitHub navigates without full page loads, so watch the URL.
let lastUrl = "";
setInterval(() => {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  pageKind() ? (unmount(), mount()) : unmount();
}, 800);
