// Auto Reject Cookies - Popup Script

const GH_OWNER = "akintola4";
const GH_REPO = "auto-reject-cookies";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}


async function loadStats() {
  const result = await chrome.storage.local.get([
    "totalCount",
    "todayCount",
    "todayKey",
    "recentSites",
    "failedSites",
  ]);

  const totalCount = result.totalCount || 0;
  const recentSites = result.recentSites || [];

  // Check if today's count is still valid
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const todayCount =
    result.todayKey === todayKey ? result.todayCount || 0 : 0;

  // Unique sites
  const uniqueSites = new Set(recentSites.map((s) => s.hostname)).size;

  document.getElementById("totalCount").textContent = totalCount.toLocaleString();
  document.getElementById("todayCount").textContent = todayCount.toLocaleString();
  document.getElementById("siteCount").textContent = uniqueSites;

  const siteList = document.getElementById("siteList");

  if (recentSites.length === 0) {
    siteList.innerHTML = `
      <div class="empty">No banners rejected yet.<br>Browse the web to get started.</div>`;
  } else {
    siteList.innerHTML = recentSites
      .map(
        (site) => `
      <div class="site-item">
        <span class="site-name">${escapeHtml(site.hostname)}</span>
        <span class="site-time">${timeAgo(site.timestamp)}</span>
        <span class="check-icon">✓</span>
      </div>`
      )
      .join("");
  }

  // Failed sites
  const failedSites = result.failedSites || [];
  const failedSection = document.getElementById("failedSection");
  const failedList = document.getElementById("failedList");

  if (failedSites.length === 0) {
    failedSection.style.display = "none";
  } else {
    failedSection.style.display = "block";
    failedList.innerHTML = failedSites
      .map(
        (site) => `
      <div class="site-item failed">
        <span class="site-name">${escapeHtml(site.hostname)}</span>
        <span class="site-time">${timeAgo(site.timestamp)}</span>
        <a class="report-link" href="#" data-host="${escapeHtml(site.hostname)}">Report</a>
        <span class="fail-icon">✕</span>
      </div>`
      )
      .join("");
  }
}

// ─── Report a failed site to GitHub Issues ─────────────────────────────────
function openReportIssue(hostname) {
  const version = chrome.runtime.getManifest().version;
  const title = `Failed site: ${hostname}`;
  const body = [
    `**Hostname:** ${hostname}`,
    `**Extension version:** ${version}`,
    `**User agent:** ${navigator.userAgent}`,
    `**Reported at:** ${new Date().toISOString()}`,
    ``,
    `<!-- This report was generated from the Cookie Cutter popup. No data other than what is shown above was included. -->`,
  ].join("\n");
  const url =
    `https://github.com/${GH_OWNER}/${GH_REPO}/issues/new` +
    `?title=${encodeURIComponent(title)}` +
    `&body=${encodeURIComponent(body)}` +
    `&labels=${encodeURIComponent("failed-site")}`;
  chrome.tabs.create({ url });
}

document.getElementById("failedList").addEventListener("click", (e) => {
  const a = e.target.closest(".report-link");
  if (!a) return;
  e.preventDefault();
  openReportIssue(a.dataset.host);
});

// ─── Per-site pause/resume control ─────────────────────────────────────────
async function getActiveHostname() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return null;
    const u = new URL(tab.url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.hostname.toLowerCase();
  } catch (_) {
    return null;
  }
}

async function renderSiteControl() {
  const el = document.getElementById("siteControl");
  const txt = document.getElementById("siteControlText");
  const btn = document.getElementById("siteControlBtn");
  const host = await getActiveHostname();
  if (!host) {
    el.hidden = true;
    return;
  }
  const { blocklist = [] } = await chrome.storage.local.get("blocklist");
  const paused = blocklist.includes(host);
  el.hidden = false;
  txt.textContent = paused ? `Paused on ${host}` : host;
  btn.textContent = paused ? "Resume" : "Pause here";
  btn.onclick = async () => {
    const { blocklist: current = [] } = await chrome.storage.local.get("blocklist");
    const set = new Set(current);
    if (paused) set.delete(host);
    else set.add(host);
    await chrome.storage.local.set({ blocklist: Array.from(set) });
    renderSiteControl();
  };
}

// ─── Hide-uncloseable-banners toggle ───────────────────────────────────────
const hideFallbackToggle = document.getElementById("hideFallbackToggle");
chrome.storage.local.get("hideFallback", (result) => {
  hideFallbackToggle.checked = result.hideFallback !== false;
});
hideFallbackToggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ hideFallback: hideFallbackToggle.checked });
});

// ─── Export stats ──────────────────────────────────────────────────────────
function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function buildExportPayload() {
  const result = await chrome.storage.local.get([
    "totalCount",
    "todayCount",
    "todayKey",
    "recentSites",
    "failedSites",
    "blocklist",
  ]);
  return {
    exportedAt: new Date().toISOString(),
    version: chrome.runtime.getManifest().version,
    totalCount: result.totalCount || 0,
    todayCount: result.todayCount || 0,
    todayKey: result.todayKey || "",
    recentSites: result.recentSites || [],
    failedSites: result.failedSites || [],
    blocklist: result.blocklist || [],
  };
}

function downloadBlob(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

async function exportJson() {
  const payload = await buildExportPayload();
  downloadBlob(
    `cookie-cutter-stats-${dateStamp()}.json`,
    "application/json",
    JSON.stringify(payload, null, 2)
  );
}

async function exportCsv() {
  const payload = await buildExportPayload();
  const headerMeta =
    `# totalCount=${payload.totalCount}, todayCount=${payload.todayCount},` +
    ` exportedAt=${payload.exportedAt}, version=${payload.version}`;
  const rows = [
    headerMeta,
    "status,hostname,timestamp_iso",
    ...payload.recentSites.map(
      (s) => `success,${csvEscape(s.hostname)},${new Date(s.timestamp).toISOString()}`
    ),
    ...payload.failedSites.map(
      (s) => `failed,${csvEscape(s.hostname)},${new Date(s.timestamp).toISOString()}`
    ),
  ];
  downloadBlob(`cookie-cutter-stats-${dateStamp()}.csv`, "text/csv", rows.join("\n"));
}

const exportBtn = document.getElementById("exportBtn");
const exportMenu = document.getElementById("exportMenu");

exportBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const show = exportMenu.hasAttribute("hidden");
  if (show) exportMenu.removeAttribute("hidden");
  else exportMenu.setAttribute("hidden", "");
  exportBtn.setAttribute("aria-expanded", show ? "true" : "false");
});

document.addEventListener("click", () => {
  exportMenu.setAttribute("hidden", "");
  exportBtn.setAttribute("aria-expanded", "false");
});

exportMenu.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-fmt]");
  if (!btn) return;
  if (btn.dataset.fmt === "json") exportJson();
  else if (btn.dataset.fmt === "csv") exportCsv();
  exportMenu.setAttribute("hidden", "");
  exportBtn.setAttribute("aria-expanded", "false");
});

// Reset button
document.getElementById("resetBtn").addEventListener("click", async () => {
  const confirmed = confirm("Reset all stats?");
  if (!confirmed) return;

  await chrome.storage.local.set({
    totalCount: 0,
    todayCount: 0,
    recentSites: [],
    failedSites: [],
    lastSite: null,
  });

  chrome.action.setBadgeText({ text: "" });
  loadStats();
});

// Toggle switch
const toggleSwitch = document.getElementById("toggleSwitch");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

function updateToggleUI(enabled) {
  toggleSwitch.checked = enabled;
  statusText.textContent = enabled ? "Active" : "Off";
  statusDot.classList.toggle("off", !enabled);
}

// Load initial state
chrome.storage.local.get("enabled", (result) => {
  const enabled = result.enabled !== false; // default to true
  updateToggleUI(enabled);
});

toggleSwitch.addEventListener("change", async () => {
  const enabled = toggleSwitch.checked;
  await chrome.storage.local.set({ enabled });
  updateToggleUI(enabled);
});

// Load on open
loadStats();
renderSiteControl();
