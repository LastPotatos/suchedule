(() => {
  "use strict";

  if (window.top !== window) return;
  if (!document.querySelector('meta[name="suchedule-banner-bridge"]')) return;
  if (document.documentElement.dataset.suBannerBridge === "ready") return;

  document.documentElement.dataset.suBannerBridge = "ready";

  const ALLOWED_ACTIONS = new Set([
    "openlogin",
    "checksession",
    "submitchanges",
    "logout",
    "opentermform",
    "openschedule",
    "checkcourse",
    "checkcrn"
  ]);

  function reply(message) {
    window.postMessage(
      { source: "SU_BANNER_EXTENSION", ...message },
      window.location.origin
    );
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== window.location.origin) return;

    const data = event.data;
    if (!data || data.source !== "SU_SCHEDULE_SITE") return;
    if (data.type !== "REQUEST" || !ALLOWED_ACTIONS.has(data.action)) return;

    chrome.runtime.sendMessage(
      { action: data.action, ...(data.payload || {}) },
      response => {
        const error = chrome.runtime.lastError;
        reply({
          type: "RESPONSE",
          requestId: data.requestId,
          response: error
            ? { ok: false, msg: error.message }
            : response || { ok: false, msg: "No extension response" }
        });
      }
    );
  });

  chrome.runtime.onMessage.addListener(message => {
    if (message?.action === "bannerSessionChanged") {
      reply({ type: "SESSION_CHANGED", term: message.term || "" });
    }
  });

  reply({ type: "READY" });
})();
