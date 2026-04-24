// Auto Reject Cookies - Content Script
// Runs on every page to detect and reject cookie consent banners

(function () {
  "use strict";

  // ─── Reject button text patterns (case-insensitive) ───────────────────────
  const REJECT_TEXTS = [
    "reject all",
    "decline all",
    "deny all",
    "refuse all",
    "reject cookies",
    "decline cookies",
    "i decline",
    "no thanks",
    "no, thanks",
    "don't accept",
    "do not accept",
    "only necessary",
    "only essential",
    "necessary only",
    "essential only",
    "use necessary",
    "reject",
    "decline",
  ];

  // ─── Common CMP container selectors ───────────────────────────────────────
  const BANNER_SELECTORS = [
    // Generic
    "#cookie-banner",
    "#cookie-consent",
    "#cookie-notice",
    "#cookie-popup",
    "#cookie-modal",
    "#cookieBanner",
    "#cookieConsent",
    "#cookieNotice",
    ".cookie-banner",
    ".cookie-consent",
    ".cookie-notice",
    ".cookie-popup",
    ".cookie-bar",
    ".cookie-modal",
    ".cookies-banner",
    ".cookies-consent",
    // OneTrust
    "#onetrust-banner-sdk",
    "#onetrust-consent-sdk",
    ".onetrust-pc-dark-filter",
    // Cookiebot
    "#CybotCookiebotDialog",
    "#cookiebotDialogBody",
    // TrustArc
    ".truste_overlay",
    ".truste_box_overlay",
    "#truste-consent-track",
    // Quantcast
    ".qc-cmp2-container",
    "#qc-cmp2-ui",
    // Didomi
    "#didomi-host",
    ".didomi-popup-container",
    // Iubenda
    "#iubenda-cs-banner",
    ".iubenda-cs-container",
    // Osano
    ".osano-cm-window",
    ".osano-cm-dialog",
    // Civic Cookie Control
    "#ccc",
    ".ccc-module",
    // GDPR Legal Cookie
    "#gdpr-cookie-notice",
    ".gdpr-cookie-notice",
    // Cookie Consent by Insites / Complianz
    ".cc-window",
    ".cc-banner",
    "#cmplz-cookiebanner-container",
    ".cmplz-cookiebanner",
    // WP Cookie Notice
    ".cn-notice-container",
    // Borlabs Cookie
    "#BorlabsCookieBox",
    ".BorlabsCookie",
    // General GDPR/consent wrappers
    "[class*='gdpr']",
    "[id*='gdpr']",
    "[class*='consent']",
    "[id*='consent']",
    "[class*='cookie-law']",
    "[id*='cookie-law']",
    "[aria-label*='cookie']",
    "[aria-label*='Cookie']",
    "[role='dialog'][aria-label*='cookie']",
    "[role='dialog'][aria-label*='privacy']",
  ];

  // ─── Specific reject button selectors from known CMPs ─────────────────────
  const REJECT_BUTTON_SELECTORS = [
    // OneTrust
    "#onetrust-reject-all-handler",
    ".onetrust-close-btn-handler",
    // Cookiebot
    "#CybotCookiebotDialogBodyButtonDecline",
    // TrustArc
    ".pdynamicbutton .call",
    "#truste-consent-required",
    // Quantcast
    ".qc-cmp2-summary-buttons button:first-child",
    // Didomi
    "#didomi-notice-disagree-button",
    // Iubenda
    ".iubenda-cs-reject-btn",
    // Osano
    ".osano-cm-denyAll",
    ".osano-cm-decline",
    // Complianz
    ".cmplz-deny",
    "#cmplz-btn-deny",
    // Borlabs
    ".borlabs-cookie-refuse",
    // WP GDPR
    ".wpgdprc-consent-bar__decline",
    // Cookie Information
    "#declineButton",
    // General patterns
    "[data-testid*='reject']",
    "[data-testid*='decline']",
    "[data-action='reject']",
    "[data-action='decline']",
    "[class*='reject-all']",
    "[class*='decline-all']",
    "[id*='reject-all']",
    "[id*='decline-all']",
  ];

  // ─── Overlay/backdrop selectors to hide alongside the banner ─────────────
  const OVERLAY_SELECTORS = [
    ".onetrust-pc-dark-filter",
    ".didomi-popup-backdrop",
    ".qc-cmp2-container",
    ".truste_overlay",
    ".truste_box_overlay",
    "[class*='cookie'][class*='overlay']",
    "[class*='consent'][class*='backdrop']",
  ];

  // ─── Shadow DOM traversal limits ──────────────────────────────────────────
  const MAX_SHADOW_DEPTH = 8;
  const MAX_SHADOW_NODES = 5000;

  // Active merged rule sets (populated in start() from bundled + community).
  let mergedBannerSelectors = BANNER_SELECTORS;
  let mergedRejectButtonSelectors = REJECT_BUTTON_SELECTORS;
  let mergedRejectTexts = REJECT_TEXTS;

  let handled = false;
  let bannerDetected = false;
  let lastDetectedBanner = null;
  let hideFallbackEnabled = true;

  // ─── Deep DOM walkers (descend into open shadow roots) ────────────────────
  function collectShadowRoots(root, out, depth, budget) {
    if (!root || depth > MAX_SHADOW_DEPTH || budget.n <= 0) return out;
    out.push(root);
    const all = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (const el of all) {
      if (--budget.n <= 0) return out;
      if (el.shadowRoot) collectShadowRoots(el.shadowRoot, out, depth + 1, budget);
    }
    return out;
  }

  function deepQuerySelectorAll(root, selector) {
    const roots = collectShadowRoots(root, [], 0, { n: MAX_SHADOW_NODES });
    const results = [];
    for (const r of roots) {
      try {
        const nodes = r.querySelectorAll(selector);
        for (const n of nodes) results.push(n);
      } catch (_) {}
    }
    return results;
  }

  function deepQuerySelector(root, selector) {
    const roots = collectShadowRoots(root, [], 0, { n: MAX_SHADOW_NODES });
    for (const r of roots) {
      try {
        const hit = r.querySelector(selector);
        if (hit) return hit;
      } catch (_) {}
    }
    return null;
  }

  // ─── Check if element is actually visible on page ─────────────────────────
  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  // ─── Check if text matches a reject pattern ───────────────────────────────
  function isRejectText(text) {
    if (!text) return false;
    const normalized = text.trim().toLowerCase();
    return mergedRejectTexts.some((pattern) => normalized.includes(pattern));
  }

  // ─── Find reject button by text content ───────────────────────────────────
  function findRejectButtonByText(container) {
    const buttons = deepQuerySelectorAll(
      container,
      "button, [role='button'], a, input[type='button'], input[type='submit']"
    );
    for (const btn of buttons) {
      const text = btn.innerText || btn.value || btn.getAttribute("aria-label") || "";
      if (isRejectText(text)) {
        return btn;
      }
    }
    return null;
  }

  // ─── Find reject button by known selectors ────────────────────────────────
  function findRejectButtonBySelector(container) {
    for (const sel of mergedRejectButtonSelectors) {
      try {
        const btn = deepQuerySelector(container, sel) || deepQuerySelector(document, sel);
        if (btn) return btn;
      } catch (_) {}
    }
    return null;
  }

  // ─── Attempt to click a reject button ────────────────────────────────────
  function clickRejectButton(btn) {
    if (!btn || btn.disabled) return false;
    try {
      btn.click();
      return true;
    } catch (_) {
      return false;
    }
  }

  // ─── Try to handle a single banner element ───────────────────────────────
  function tryHandleBanner(banner) {
    if (!banner || !document.body.contains(banner)) return false;

    // 1. Try known selector first (most reliable)
    let btn = findRejectButtonBySelector(banner);

    // 2. Fallback: search by text
    if (!btn) btn = findRejectButtonByText(banner);

    // 3. Fallback: search the whole document by text
    if (!btn) btn = findRejectButtonByText(document.body);

    if (btn) {
      const success = clickRejectButton(btn);
      if (success) {
        notifyBackground();
        return true;
      }
    }
    return false;
  }

  // ─── Scan for banners and attempt rejection ───────────────────────────────
  function scanAndReject() {
    if (handled) return;

    for (const sel of mergedBannerSelectors) {
      try {
        const banners = deepQuerySelectorAll(document, sel);
        for (const banner of banners) {
          if (banner && document.body.contains(banner) && isVisible(banner)) {
            bannerDetected = true;
            lastDetectedBanner = banner;
          }
          if (tryHandleBanner(banner)) {
            handled = true;
            return;
          }
        }
      } catch (_) {}
    }

    // Last resort: scan all visible dialog/modal elements
    const dialogs = deepQuerySelectorAll(document, "[role='dialog'], [role='alertdialog']");
    for (const dialog of dialogs) {
      const text = (dialog.innerText || "").toLowerCase();
      if (
        text.includes("cookie") ||
        text.includes("privacy") ||
        text.includes("consent") ||
        text.includes("gdpr")
      ) {
        bannerDetected = true;
        if (isVisible(dialog)) lastDetectedBanner = dialog;
        if (tryHandleBanner(dialog)) {
          handled = true;
          return;
        }
      }
    }
  }

  // Some CMPs trap scroll via inline overflow:hidden on <body>/<html>; restore
  // that too so the page is readable when we hide the banner.
  function hideDetectedBanner() {
    if (!lastDetectedBanner || !document.body.contains(lastDetectedBanner)) return;
    try {
      lastDetectedBanner.style.setProperty("display", "none", "important");
      document.documentElement.style.setProperty("overflow", "auto", "important");
      document.body.style.setProperty("overflow", "auto", "important");
      for (const sel of OVERLAY_SELECTORS) {
        const overlays = deepQuerySelectorAll(document, sel);
        for (const o of overlays) o.style.setProperty("display", "none", "important");
      }
    } catch (_) {}
  }

  // ─── Notify background to increment stats ────────────────────────────────
  function notifyBackground() {
    try {
      chrome.runtime.sendMessage({
        type: "COOKIE_REJECTED",
        hostname: window.location.hostname,
        timestamp: Date.now(),
      });
    } catch (_) {}
  }

  function notifyBackgroundFailed() {
    try {
      chrome.runtime.sendMessage({
        type: "COOKIE_FAILED",
        hostname: window.location.hostname,
        timestamp: Date.now(),
      });
    } catch (_) {}
  }

  // ─── MutationObserver to catch late-loading banners ──────────────────────
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (handled) {
      observer.disconnect();
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      scanAndReject();
    }, 300);
  });

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    // Immediate scan
    scanAndReject();

    if (!handled) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: false,
      });

      // Stop observing after 15s to save resources
      setTimeout(() => {
        observer.disconnect();
        // Flush any pending debounced scan before reporting failure
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          scanAndReject();
        }
        if (!handled && bannerDetected) {
          notifyBackgroundFailed();
          if (hideFallbackEnabled) hideDetectedBanner();
        }
      }, 15000);
    }
  }

  // Reject wildly broad or iframe-scoped selectors from community rules.
  function isSafeSelector(s) {
    if (typeof s !== "string") return false;
    const trimmed = s.trim();
    if (!trimmed || trimmed.length > 256) return false;
    const lower = trimmed.toLowerCase();
    if (lower === "*" || lower === "body" || lower === "html") return false;
    if (lower.includes(":has(") || lower.includes("iframe")) return false;
    return true;
  }

  function mergeCommunityRules(community) {
    if (!community || typeof community !== "object") return;
    const pickSelectors = (arr, cap) =>
      Array.isArray(arr) ? arr.filter(isSafeSelector).slice(0, cap) : [];
    const bs = pickSelectors(community.bannerSelectors, 200);
    const rs = pickSelectors(community.rejectButtonSelectors, 200);
    const rt = Array.isArray(community.rejectTexts)
      ? community.rejectTexts
          .filter((t) => typeof t === "string" && t.length > 0 && t.length <= 64)
          .slice(0, 100)
      : [];
    if (bs.length) mergedBannerSelectors = Array.from(new Set([...BANNER_SELECTORS, ...bs]));
    if (rs.length)
      mergedRejectButtonSelectors = Array.from(new Set([...REJECT_BUTTON_SELECTORS, ...rs]));
    if (rt.length) mergedRejectTexts = Array.from(new Set([...REJECT_TEXTS, ...rt]));
  }

  // ─── Check enabled + blocklist state before running ──────────────────────
  function start() {
    chrome.storage.local.get(
      ["enabled", "blocklist", "hideFallback", "communityRules"],
      (result) => {
        if (result.enabled === false) return; // disabled globally
        const host = (window.location.hostname || "").toLowerCase();
        const blocklist = Array.isArray(result.blocklist) ? result.blocklist : [];
        if (host && blocklist.includes(host)) return; // paused on this site

        hideFallbackEnabled = result.hideFallback !== false;
        mergeCommunityRules(result.communityRules);
        init();
      }
    );
  }

  // Listen for toggle/blocklist/hideFallback changes to stop observer if disabled mid-page.
  // Intentionally does not re-enable on toggle-on: a page reload is required
  // because the content script's handled state, timers, and observer cannot be
  // cleanly restored mid-page.
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled && changes.enabled.newValue === false) {
      observer.disconnect();
      clearTimeout(debounceTimer);
      return;
    }
    if (changes.blocklist && Array.isArray(changes.blocklist.newValue)) {
      const host = (window.location.hostname || "").toLowerCase();
      if (changes.blocklist.newValue.includes(host)) {
        observer.disconnect();
        clearTimeout(debounceTimer);
      }
    }
    if (changes.hideFallback) {
      hideFallbackEnabled = changes.hideFallback.newValue !== false;
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
