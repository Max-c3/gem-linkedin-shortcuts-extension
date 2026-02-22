"use strict";

const enabledCheckbox = document.getElementById("enabled");
const statusEl = document.getElementById("status");
const optionsBtn = document.getElementById("open-options");

function generateRunId() {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#a61d24" : "#4f5358";
}

function isRecoverableContentError(message) {
  return /context invalidated|Receiving end does not exist/i.test(String(message || ""));
}

function sendRuntimeMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function getCurrentTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0]?.id;
}

function sendActionToContent(tabId, actionId) {
  const runId = generateRunId();
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "TRIGGER_ACTION", actionId, source: "popup", runId },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      }
    );
  });
}

async function loadState() {
  const response = await sendRuntimeMessage({ type: "GET_SETTINGS" });
  if (!response?.ok) {
    throw new Error(response?.message || "Could not load settings");
  }
  const settings = deepMerge(DEFAULT_SETTINGS, response.settings || {});
  enabledCheckbox.checked = !!settings.enabled;
}

enabledCheckbox.addEventListener("change", async () => {
  try {
    const response = await sendRuntimeMessage({ type: "GET_SETTINGS" });
    if (!response?.ok) {
      throw new Error(response?.message || "Could not load settings");
    }
    const settings = deepMerge(DEFAULT_SETTINGS, response.settings || {});
    settings.enabled = enabledCheckbox.checked;
    const saveResponse = await sendRuntimeMessage({ type: "SAVE_SETTINGS", settings });
    if (!saveResponse?.ok) {
      throw new Error(saveResponse?.message || "Could not save settings");
    }
    setStatus(enabledCheckbox.checked ? "Enabled" : "Disabled");
    sendRuntimeMessage({
      type: "LOG_EVENT",
      payload: {
        source: "extension.popup",
        event: "popup.enabled_toggled",
        message: enabledCheckbox.checked ? "Extension enabled from popup." : "Extension disabled from popup."
      }
    }).catch(() => {});
  } catch (error) {
    setStatus(error.message, true);
    sendRuntimeMessage({
      type: "LOG_EVENT",
      payload: {
        source: "extension.popup",
        level: "error",
        event: "popup.enabled_toggle_failed",
        message: error.message || "Failed to toggle extension."
      }
    }).catch(() => {});
  }
});

document.querySelectorAll("button[data-action]").forEach((button) => {
  button.addEventListener("click", async () => {
    const actionId = button.getAttribute("data-action");
    try {
      const tabId = await getCurrentTabId();
      if (!tabId) {
        throw new Error("No active tab found.");
      }
      await sendActionToContent(tabId, actionId);
      setStatus("Action sent.");
    } catch (error) {
      const message = error.message || "Failed to send action.";
      if (isRecoverableContentError(message)) {
        setStatus("Tab needs refresh after extension update. Refresh LinkedIn tab and retry.", true);
      } else {
        setStatus(message, true);
      }
      sendRuntimeMessage({
        type: "LOG_EVENT",
        payload: {
          source: "extension.popup",
          level: "error",
          event: "popup.action_send_failed",
          actionId,
          message
        }
      }).catch(() => {});
    }
  });
});

optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadState().catch((error) => setStatus(error.message, true));
