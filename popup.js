// Auto Reject Cookies - Popup Script

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
        <span class="fail-icon">✕</span>
      </div>`
      )
      .join("");
  }
}

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
