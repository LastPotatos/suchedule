(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const termInput = document.getElementById("term");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const form = document.getElementById("loginForm");
  const button = document.getElementById("submitBtn");
  const status = document.getElementById("status");

  termInput.value = params.get("term") || "";

  function setStatus(message, kind = "") {
    status.textContent = message;
    status.className = `status${kind ? " " + kind : ""}`;
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (button.disabled) return;

    const term = termInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!/^\d{6}$/.test(term)) {
      setStatus("Enter a six-digit Banner term code.", "error");
      return;
    }

    button.disabled = true;
    setStatus("Sending one login attempt to Bannerweb…");

    chrome.runtime.sendMessage(
      { action: "login", username, password, term },
      response => {
        passwordInput.value = "";
        button.disabled = false;

        const error = chrome.runtime.lastError;
        if (error) {
          setStatus(error.message, "error");
          return;
        }

        if (response?.ok) {
          chrome.storage.local.set({ bannerTerm: term });
          setStatus("Login successful. Return to the schedule website.", "ok");
          setTimeout(() => window.close(), 1200);
          return;
        }

        setStatus(response?.msg || "Login failed.", "error");
      }
    );
  });

  usernameInput.focus();
})();
