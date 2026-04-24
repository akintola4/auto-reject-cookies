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
    // CookieYes (modern)
    "#cky-consent",
    "#cky-consent-container",
    ".cky-consent-container",
    ".cky-consent-bar",
    "[data-cky-tag='notice']",
    // GDPR Cookie Consent / Cookie Law Info (CookieYes legacy WordPress plugin)
    "#cookie-law-info-bar",
    "#cookie-law-info-again",
    ".wt-cli-cookie-bar-container",
    // Google / YouTube consent
    "ytd-consent-bump-v2-lightbox",
    "tp-yt-paper-dialog",
    "form[action*='consent.google']",
    "form[action*='consent.youtube']",
    // PostHog cookie banner
    ".ph-cookie-banner",
    "[data-ph-feature='cookie-banner']",
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
    // CookieYes
    ".cky-btn-reject",
    "[data-cky-tag='reject-button']",
    "[data-cky-action='reject']",
    // Cookie Law Info / CookieYes legacy
    "#wt-cli-reject-btn",
    ".wt-cli-reject-btn",
    ".cli_action_button.wt-cli-reject-btn",
    // PostHog
    ".ph-cookie-banner-reject",
    "[data-ph-cookie-banner='reject']",
    "[data-ph-cookie-action='reject']",
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

  let handled = false;
  let bannerDetected = false;

  // ─── Check if element is actually visible on page ─────────────────────────
  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  // ─── Verify element is actually a cookie banner (not a false positive) ────
  // Broad selectors like [class*='consent'] can match non-cookie UI on sites
  // like GitHub. Require the element to either use a known CMP id/class or
  // mention cookies/GDPR in its text before treating it as a cookie banner.
  const CMP_KEYWORD_RE = /cookie|gdpr|cmplz|onetrust|cookiebot|didomi|iubenda|borlabs|osano|truste|qc-cmp|ccc-|cky-|wt-cli|ytd-consent|ph-cookie-banner/i;
  function looksLikeCookieBanner(el) {
    if (!el || !document.body.contains(el)) return false;
    const tagName = (el.tagName || "").toLowerCase();
    if (CMP_KEYWORD_RE.test(tagName)) return true;
    const id = el.id || "";
    const className = typeof el.className === "string" ? el.className : "";
    if (CMP_KEYWORD_RE.test(id) || CMP_KEYWORD_RE.test(className)) return true;
    const aria = el.getAttribute && (el.getAttribute("aria-label") || "");
    if (aria && /cookie|gdpr/i.test(aria)) return true;
    const text = (el.innerText || "").toLowerCase();
    if (!text || text.length > 3000) return false;
    return /\bcookies?\b/.test(text) || /\bgdpr\b/.test(text);
  }

  // ─── Check if text matches a reject pattern ───────────────────────────────
  function isRejectText(text) {
    if (!text) return false;
    const normalized = text.trim().toLowerCase();
    return REJECT_TEXTS.some((pattern) => normalized.includes(pattern));
  }

  // ─── Find reject button by text content ───────────────────────────────────
  function findRejectButtonByText(container) {
    const buttons = container.querySelectorAll(
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
    for (const sel of REJECT_BUTTON_SELECTORS) {
      try {
        const btn = container.querySelector(sel) || document.querySelector(sel);
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

    // 2. Fallback: search by text within the banner only.
    // Do NOT fall back to scanning document.body — single-word patterns like
    // "reject"/"decline" match legitimate buttons on many sites (e.g. GitHub's
    // "Decline invitation"), causing unwanted clicks and redirects.
    if (!btn) btn = findRejectButtonByText(banner);

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

    for (const sel of BANNER_SELECTORS) {
      try {
        const banners = document.querySelectorAll(sel);
        for (const banner of banners) {
          if (!banner || !document.body.contains(banner) || !isVisible(banner)) continue;
          if (!looksLikeCookieBanner(banner)) continue;
          bannerDetected = true;
          if (tryHandleBanner(banner)) {
            handled = true;
            return;
          }
        }
      } catch (_) {}
    }

    // Last resort: scan all visible dialog/modal elements.
    // Require an explicit cookie/GDPR mention — "privacy" or "consent" alone
    // are too broad and match unrelated dialogs.
    const dialogs = document.querySelectorAll("[role='dialog'], [role='alertdialog']");
    for (const dialog of dialogs) {
      if (!isVisible(dialog)) continue;
      if (!looksLikeCookieBanner(dialog)) continue;
      bannerDetected = true;
      if (tryHandleBanner(dialog)) {
        handled = true;
        return;
      }
    }
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
        }
      }, 15000);
    }
  }

  // ─── Check enabled state before running ──────────────────────────────────
  function start() {
    chrome.storage.local.get("enabled", (result) => {
      if (result.enabled === false) return; // disabled, do nothing
      init();
    });
  }

  // Listen for toggle changes to stop observer if disabled mid-page.
  // Intentionally does not re-enable on toggle-on: a page reload is required
  // because the content script's handled state, timers, and observer cannot be
  // cleanly restored mid-page.
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled && changes.enabled.newValue === false) {
      observer.disconnect();
      clearTimeout(debounceTimer);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
