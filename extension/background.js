// Relays calls to the local backend. Going through the service worker avoids the page's
// CORS and Chrome's block on public sites talking to localhost.
const BACKEND = "http://localhost:8787";

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  fetch(`${BACKEND}${msg.path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(msg.payload),
  })
    .then(async (r) => reply({ ok: r.ok, data: await r.json() }))
    .catch((err) => reply({ ok: false, data: { error: `Backend unreachable: ${err.message}` } }));
  return true; // keep the channel open for the async reply
});
