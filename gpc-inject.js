(function () {
  try {
    Object.defineProperty(navigator, "globalPrivacyControl", {
      get: () => true,
      configurable: false,
    });
  } catch (_) {}
})();
