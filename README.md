# Cookie Cutter

A Chrome extension that automatically finds and clicks "Reject All" / "Decline" buttons on cookie consent banners, so you never have to deal with them yourself.

## Screenshots

| Light | Dark |
|-------|------|
| ![Light - Empty](screenshots/light-empty.png) | ![Dark - Empty](screenshots/dark-empty.png) |
| ![Light - Active](screenshots/light-active.png) | ![Dark - Active](screenshots/dark-active.png) |

## How it works

1. A content script runs on every page and scans for known cookie banner patterns (OneTrust, Cookiebot, Didomi, Quantcast, and 40+ others)
2. When a banner is found, it locates the reject/decline button by CSS selector or text content and clicks it
3. If no reject button is found within 15 seconds, the site is logged as a failure so you know where manual action is needed
4. Stats are tracked per-site and shown in the popup

## Install

1. Clone or download this repo
2. Open Chrome and go to `chrome://extensions`
3. Toggle **Developer mode** ON (top-right)
4. Click **Load unpacked** and select this folder
5. The extension icon appears in your toolbar

## Features

- Rejects cookie banners automatically on page load
- Supports 40+ consent management platforms (CMPs)
- Tracks per-site rejection counts
- Shows failed rejections so you know which sites need manual action
- Light/dark theme follows your OS preference
- On/off toggle switch to enable or disable the extension
- Minimal, clean popup UI

## Changelog

### v1.1.0

**On/off toggle switch**

![Toggle Switch](screenshots/toggle-switch.png)

- Added on/off toggle switch in the popup header to enable or disable the extension
- Badge shows "OFF" when disabled
- Content script respects the toggle and stops scanning when disabled mid-page
- Extension defaults to enabled on fresh install

### v1.0.0

**Initial release**

- Core cookie banner detection and auto-rejection engine
- Support for OneTrust, Cookiebot, TrustArc, Quantcast, Didomi, Iubenda, Osano, Complianz, Borlabs, and generic cookie banner patterns
- MutationObserver-based detection for late-loading banners (15s window)
- Popup UI with total/today/sites stats and recent sites list
- Failed rejection tracking with separate "Failed" section in popup
- XSS-safe hostname rendering in popup
- Visibility checks to avoid false-positive banner detection
- Debounce flush before failure reporting to prevent race conditions
- Light/dark responsive theme (follows `prefers-color-scheme`)
- Geist Pixel Line font for stat numbers
- Minimal toolbar icon (circle + slash)

## License

MIT
