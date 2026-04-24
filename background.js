// Auto Reject Cookies - Background Service Worker
// Tracks rejection stats across all tabs

const GH_OWNER = "akintola4";
const GH_REPO = "auto-reject-cookies";
const RULES_URL = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/main/rules.json`;
const RULES_FETCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

// With content scripts running in all frames, a single banner rejection can
// fire COOKIE_REJECTED from multiple frames on the same tab. Collapse
// duplicates within a short window keyed by tabId + hostname.
const REJECT_DEDUP_WINDOW_MS = 2000;
const recentRejects = new Map(); // `${tabId}|${hostname}` → timestamp

function shouldAcceptReject(tabId, hostname) {
  const key = `${tabId == null ? "-" : tabId}|${hostname}`;
  const now = Date.now();
  const last = recentRejects.get(key) || 0;
  if (now - last < REJECT_DEDUP_WINDOW_MS) return false;
  recentRejects.set(key, now);
  // Prune stale entries opportunistically.
  if (recentRejects.size > 500) {
    for (const [k, t] of recentRejects) {
      if (now - t > REJECT_DEDUP_WINDOW_MS * 10) recentRejects.delete(k);
    }
  }
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "COOKIE_REJECTED") {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    if (!shouldAcceptReject(tabId, message.hostname)) return;
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

  // Opportunistic community-rules refresh.
  maybeFetchCommunityRules();
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

// ─── Keyboard shortcut ─────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-enabled") return;
  const { enabled } = await chrome.storage.local.get("enabled");
  await chrome.storage.local.set({ enabled: enabled === false });
});

// ─── Community rules fetch ─────────────────────────────────────────────────
function isSafeSelector(s) {
  if (typeof s !== "string") return false;
  const trimmed = s.trim();
  if (!trimmed || trimmed.length > 256) return false;
  const lower = trimmed.toLowerCase();
  if (lower === "*" || lower === "body" || lower === "html") return false;
  if (lower.includes(":has(") || lower.includes("iframe")) return false;
  return true;
}

function validateRules(raw) {
  if (!raw || typeof raw !== "object") return null;
  const pick = (arr, cap, test) =>
    Array.isArray(arr) ? arr.filter(test).slice(0, cap) : [];
  return {
    version: typeof raw.version === "number" ? raw.version : 0,
    bannerSelectors: pick(raw.bannerSelectors, 200, isSafeSelector),
    rejectButtonSelectors: pick(raw.rejectButtonSelectors, 200, isSafeSelector),
    rejectTexts: pick(
      raw.rejectTexts,
      100,
      (t) => typeof t === "string" && t.length > 0 && t.length <= 64
    ),
  };
}

async function fetchCommunityRules() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`${RULES_URL}?t=${Date.now()}`, {
      cache: "no-cache",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return;
    const json = await res.json();
    const validated = validateRules(json);
    if (!validated) return;
    await chrome.storage.local.set({
      communityRules: validated,
      communityRulesFetchedAt: Date.now(),
    });
  } catch (_) {
    // Silent fail; bundled defaults continue to work.
  }
}

async function maybeFetchCommunityRules() {
  const { communityRulesFetchedAt } = await chrome.storage.local.get(
    "communityRulesFetchedAt"
  );
  const last = communityRulesFetchedAt || 0;
  if (Date.now() - last > RULES_FETCH_INTERVAL_MS) {
    fetchCommunityRules();
  }
}

// ─── GPC page-world injection (sets navigator.globalPrivacyControl = true) ──
async function registerGpcInjection() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ["gpc-main"] });
  } catch (_) {}
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: "gpc-main",
        matches: ["<all_urls>"],
        js: ["gpc-inject.js"],
        runAt: "document_start",
        world: "MAIN",
        allFrames: true,
      },
    ]);
  } catch (_) {}
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  // Default to enabled on fresh install.
  const result = await chrome.storage.local.get("enabled");
  if (result.enabled === undefined) {
    await chrome.storage.local.set({ enabled: true });
  }
  refreshBadge();
  registerGpcInjection();
  fetchCommunityRules();
});

chrome.runtime.onStartup.addListener(() => {
  refreshBadge();
  registerGpcInjection();
  maybeFetchCommunityRules();
});

async function trackFailure(hostname) {
  const result = await chrome.storage.local.get(["failedSites"]);
  let failedSites = result.failedSites || [];

  const entry = { hostname, timestamp: Date.now() };
  failedSites = [entry, ...failedSites.filter(s => s.hostname !== hostname)].slice(0, 5);

  await chrome.storage.local.set({ failedSites });
}
