// Auto Reject Cookies - Background Service Worker
// Tracks rejection stats across all tabs

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "COOKIE_REJECTED") {
    updateStats(message.hostname);
  } else if (message.type === "COOKIE_FAILED") {
    trackFailure(message.hostname);
  }
});

async function updateStats(hostname) {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

  const result = await chrome.storage.local.get(["totalCount", "todayCount", "todayKey", "lastSite", "recentSites"]);

  let totalCount = result.totalCount || 0;
  let todayCount = result.todayCount || 0;
  let storedTodayKey = result.todayKey || "";
  let recentSites = result.recentSites || [];

  // Reset today's count if it's a new day
  if (storedTodayKey !== todayKey) {
    todayCount = 0;
  }

  totalCount += 1;
  todayCount += 1;

  // Track recent sites (up to 5)
  const siteEntry = { hostname, timestamp: Date.now() };
  recentSites = [siteEntry, ...recentSites.filter(s => s.hostname !== hostname)].slice(0, 5);

  await chrome.storage.local.set({
    totalCount,
    todayCount,
    todayKey,
    lastSite: hostname,
    recentSites,
  });

  // Update badge (respects enabled state)
  refreshBadge();
}

// ─── Badge helper ──────────────────────────────────────────────────────────
async function refreshBadge() {
  const result = await chrome.storage.local.get(["totalCount", "enabled"]);
  const enabled = result.enabled !== false;
  const count = result.totalCount || 0;

  if (!enabled) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#666" });
  } else {
    chrome.action.setBadgeText({ text: count > 0 ? (count > 999 ? "999+" : String(count)) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
  }
}

// React to toggle changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) {
    refreshBadge();
  }
});

// Initialize badge on install/startup
chrome.runtime.onInstalled.addListener(async () => {
  // Default to enabled on fresh install
  const result = await chrome.storage.local.get("enabled");
  if (result.enabled === undefined) {
    await chrome.storage.local.set({ enabled: true });
  }
  refreshBadge();
});

chrome.runtime.onStartup.addListener(() => {
  refreshBadge();
});

async function trackFailure(hostname) {
  const result = await chrome.storage.local.get(["failedSites"]);
  let failedSites = result.failedSites || [];

  const entry = { hostname, timestamp: Date.now() };
  failedSites = [entry, ...failedSites.filter(s => s.hostname !== hostname)].slice(0, 5);

  await chrome.storage.local.set({ failedSites });
}
