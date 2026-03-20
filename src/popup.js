"use strict";

const enabledCheckbox = document.getElementById("enabled");
const gemStatusDisplayModeSelect = document.getElementById("gemStatusDisplayMode");
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

function getUnsupportedTabMessage() {
  return "Open a LinkedIn, Gem candidate, Gem project, or GitHub profile tab and retry. If that tab is already supported, refresh it after the extension update.";
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
  gemStatusDisplayModeSelect.value = normalizeGemStatusDisplayMode(
    settings.gemStatusDisplayMode,
    settings.showGemStatusBadge !== false
  );
}

async function updateSettingsPatch(patch, successMessage, successEvent, failureEvent) {
  try {
    const response = await sendRuntimeMessage({ type: "GET_SETTINGS" });
    if (!response?.ok) {
      throw new Error(response?.message || "Could not load settings");
    }
    const settings = deepMerge(DEFAULT_SETTINGS, response.settings || {});
    Object.assign(settings, patch || {});
    settings.gemStatusDisplayMode = normalizeGemStatusDisplayMode(
      settings.gemStatusDisplayMode,
      settings.showGemStatusBadge !== false
    );
    settings.showGemStatusBadge = isGemStatusDisplayEnabled(settings.gemStatusDisplayMode);
    const saveResponse = await sendRuntimeMessage({ type: "SAVE_SETTINGS", settings });
    if (!saveResponse?.ok) {
      throw new Error(saveResponse?.message || "Could not save settings");
    }
    setStatus(successMessage);
    sendRuntimeMessage({
      type: "LOG_EVENT",
      payload: {
        source: "extension.popup",
        event: successEvent,
        message: successMessage
      }
    }).catch(() => {});
  } catch (error) {
    setStatus(error.message, true);
    sendRuntimeMessage({
      type: "LOG_EVENT",
      payload: {
        source: "extension.popup",
        level: "error",
        event: failureEvent,
        message: error.message || "Failed to update popup setting."
      }
    }).catch(() => {});
  }
}

enabledCheckbox.addEventListener("change", async () => {
  await updateSettingsPatch(
    { enabled: enabledCheckbox.checked },
    enabledCheckbox.checked ? "Enabled" : "Disabled",
    "popup.enabled_toggled",
    "popup.enabled_toggle_failed"
  );
});

gemStatusDisplayModeSelect.addEventListener("change", async () => {
  const nextMode = normalizeGemStatusDisplayMode(gemStatusDisplayModeSelect.value, true);
  await updateSettingsPatch(
    {
      gemStatusDisplayMode: nextMode,
      showGemStatusBadge: isGemStatusDisplayEnabled(nextMode)
    },
    `Gem status display: ${formatGemStatusDisplayModeLabel(nextMode)}.`,
    "popup.status_badge_toggled",
    "popup.status_badge_toggle_failed"
  );
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
        setStatus(getUnsupportedTabMessage(), true);
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
