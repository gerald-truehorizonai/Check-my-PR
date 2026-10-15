import { parsePullRequestUrl } from './lib/browser.js';

// Opening from the toolbar preserves the page and leaves room for the review.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'CHECK_MY_PR_OPEN_PANEL') return;
  if (sender.id !== chrome.runtime.id || !Number.isInteger(sender.tab?.id) || !parsePullRequestUrl(sender.url)) {
    sendResponse({ opened: false });
    return;
  }

  // Call immediately: Chrome requires the content-script click's user gesture.
  chrome.sidePanel.open({ tabId: sender.tab.id }).then(
    () => sendResponse({ opened: true }),
    () => sendResponse({ opened: false }),
  );
  return true;
});
