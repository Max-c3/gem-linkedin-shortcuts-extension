"use strict";

const enabledCheckbox = document.getElementById("enabled");
const gemStatusDisplayModeSelect = document.getElementById("gemStatusDisplayMode");
const statusEl = document.getElementById("status");
const optionsBtn = document.getElementById("open-options");
const actionButtons = Array.from(document.querySelectorAll("button[data-action]"));
const LINKEDIN_BOOTSTRAP_FILES = ["src/shared.js", "src/content_bootstrap.js"];
const FULL_RUNTIME_FILES = ["src/shared.js", "src/content.js"];
const SUPPORTED_TAB_PATTERNS = [
  /^https:\/\/www\.linkedin\.com\/(?:in|pub)\//i,
  /^https:\/\/www\.linkedin\.com\/talent(?:\/[^/]+)?\/profile\//i,
  /^https:\/\/(?:www|app)\.gem\.com\/(?:candidate|projects)\//i,
  /^https:\/\/mail\.google\.com\/mail\//i,
  /^https:\/\/github\.com\//i
];

function generateRunId() {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#a61d24" : "#4f5358";
  statusEl.style.borderColor = isError ? "#e4b9bc" : "#d9dee5";
  statusEl.style.background = isError ? "#fff5f6" : "#f7f9fc";
}

function isRecoverableContentError(message) {
  return /context invalidated|Receiving end does not exist/i.test(String(message || ""));
}

function getUnsupportedTabMessage() {
  return "Open a LinkedIn, Gem candidate, Gem project, GitHub profile, or Gmail thread tab and retry. If that tab is already supported, refresh it after the extension update.";
}

function isSupportedTabUrl(url) {
  const value = String(url || "").trim();
  return SUPPORTED_TAB_PATTERNS.some((pattern) => pattern.test(value));
}

function isLinkedInTabUrl(url) {
  const value = String(url || "").trim();
  return (
    /^https:\/\/www\.linkedin\.com\/(?:in|pub)\//i.test(value) ||
    /^https:\/\/www\.linkedin\.com\/talent(?:\/[^/]+)?\/profile\//i.test(value)
  );
}

function isGmailTabUrl(url) {
  return /^https:\/\/mail\.google\.com\/mail\//i.test(String(url || "").trim());
}

function syncActionButtonLabels() {
  actionButtons.forEach((button) => {
    const actionId = String(button.getAttribute("data-action") || "").trim();
    const label = ACTION_LABELS[actionId];
    if (label) {
      button.textContent = label;
    }
  });
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

function sendTabMessage(tabId, payload) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function formatActionResultStatus(result) {
  if (!result || typeof result !== "object") {
    return {
      message: "The page helper did not return a result.",
      isError: true
    };
  }
  if (result.suppressed) {
    return {
      message: String(result.message || "").trim() || "Another Gem action is already open in this tab.",
      isError: false
    };
  }
  const message = String(result.message || "").trim() || (result.ok ? "Action completed." : "Action failed.");
  const debugSummary = String(result.debugSummary || "").trim();
  if (!debugSummary) {
    return { message, isError: result.ok === false };
  }
  if (message === debugSummary) {
    return { message, isError: result.ok === false };
  }
  return {
    message: result.ok === false ? `${message} ${debugSummary}` : message,
    isError: result.ok === false
  };
}

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] || null;
}

function pingContent(tabId) {
  return sendTabMessage(tabId, { type: "PING" });
}

function isCurrentRuntimeResponse(response) {
  return Boolean(response?.ok && response?.kind !== "bootstrap" && response?.version === CONTENT_RUNTIME_VERSION);
}

function isLinkedInBootstrapResponse(response) {
  return Boolean(response?.ok && response?.kind === "bootstrap" && response?.version === CONTENT_RUNTIME_VERSION);
}

function isAcceptableHelperResponse(response, tab = null) {
  if (isCurrentRuntimeResponse(response)) {
    return true;
  }
  if (isLinkedInTabUrl(tab?.url || "")) {
    return isLinkedInBootstrapResponse(response);
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let sawLoading = false;
    const timeoutId = window.setTimeout(() => {
      if (finished) {
        return;
      }
      finished = true;
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      reject(new Error("Timed out while reloading the tab helper."));
    }, timeoutMs);

    const cleanup = () => {
      if (finished) {
        return;
      }
      finished = true;
      window.clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
    };

    const handleUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId) {
        return;
      }
      if (changeInfo.status === "loading") {
        sawLoading = true;
        return;
      }
      if (changeInfo.status !== "complete" || !sawLoading) {
        return;
      }
      cleanup();
      resolve();
    };

    chrome.tabs.onUpdated.addListener(handleUpdated);
  });
}

function reloadTabAndWait(tabId, timeoutMs = 20000) {
  const waitPromise = waitForTabComplete(tabId, timeoutMs);
  chrome.tabs.reload(tabId);
  return waitPromise;
}

async function waitForCurrentRuntime(tabId, attempts = 30, delayMs = 150, tab = null) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await pingContent(tabId);
      if (isAcceptableHelperResponse(response, tab)) {
        return true;
      }
    } catch (_error) {
      // Keep retrying until the content runtime is ready.
    }
    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }
  return false;
}

function getContentScriptFilesForTab(tab) {
  if (isLinkedInTabUrl(tab?.url || "")) {
    return LINKEDIN_BOOTSTRAP_FILES;
  }
  return FULL_RUNTIME_FILES;
}

function injectContentScripts(tabId, tab) {
  return chrome.scripting.executeScript({
    target: { tabId },
    files: getContentScriptFilesForTab(tab)
  });
}

async function ensureContentScriptReady(tab) {
  const tabId = Number(tab?.id);
  if (!Number.isInteger(tabId) || tabId < 0) {
    throw new Error("No active tab found.");
  }
  const isLinkedInTab = isLinkedInTabUrl(tab?.url || "");

  try {
    const response = await pingContent(tabId);
    if (isAcceptableHelperResponse(response, tab)) {
      return;
    }
    if (!isLinkedInTab && response?.ok && response?.version !== CONTENT_RUNTIME_VERSION) {
      await reloadTabAndWait(tabId);
      if (await waitForCurrentRuntime(tabId, 30, 150, tab)) {
        return;
      }
    }
  } catch (error) {
    if (!isRecoverableContentError(error.message || "")) {
      throw error;
    }
  }

  const tabUrl = String(tab?.url || "").trim();
  if (tabUrl && !isSupportedTabUrl(tabUrl)) {
    throw new Error(getUnsupportedTabMessage());
  }

  try {
    await injectContentScripts(tabId, tab);
  } catch (_error) {
    throw new Error(getUnsupportedTabMessage());
  }

  if (await waitForCurrentRuntime(tabId, 12, 120, tab)) {
    return;
  }
  await reloadTabAndWait(tabId);
  if (!(await waitForCurrentRuntime(tabId, 30, 150, tab))) {
    throw new Error("Couldn't initialize the current page helper. Reload the tab and retry.");
  }
}

async function sendActionToContent(tabId, actionId) {
  const runId = generateRunId();
  let response = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    response = await sendTabMessage(tabId, { type: "TRIGGER_ACTION", actionId, source: "popup", runId });
    if (!response?.deferred) {
      return response;
    }
    await sleep(120);
  }
  return response;
}

async function getActionContextFromTab(tabId) {
  const response = await sendTabMessage(tabId, { type: "GET_ACTION_CONTEXT" });
  if (!response?.ok) {
    throw new Error(response?.message || "Could not read the current tab context.");
  }
  return response.context && typeof response.context === "object" ? response.context : {};
}

async function runActionDirect(actionId, context) {
  const response = await sendRuntimeMessage({
    type: "RUN_ACTION",
    actionId,
    context,
    meta: {
      source: "popup",
      runId: generateRunId()
    }
  });
  if (!response || typeof response !== "object") {
    return { ok: false, message: "The background action did not return a result." };
  }
  return response;
}

function shouldRunDirectGmailPopupAction(tab, actionId) {
  if (!isGmailTabUrl(tab?.url || "")) {
    return false;
  }
  return actionId === ACTIONS.OPEN_ACTIVITY || actionId === ACTIONS.OPEN_ASHBY_PROFILE;
}

async function loadActiveTabContextStatus() {
  const activeTab = await getCurrentTab();
  if (!activeTab || !isSupportedTabUrl(activeTab.url || "")) {
    setStatus(getUnsupportedTabMessage(), true);
    return;
  }
  await ensureContentScriptReady(activeTab);
  const response = await sendTabMessage(activeTab.id, { type: "GET_CONTEXT_DEBUG" });
  if (!response?.ok) {
    throw new Error(response?.message || "Could not inspect the current tab.");
  }
  setStatus(
    response.summary ||
      (response.hasIdentity
        ? "Supported page detected."
        : "Supported page detected, but no candidate identity is available yet."),
    !response.supported || !response.hasIdentity
  );
}

async function syncSettingsToActiveTab(settings) {
  const activeTab = await getCurrentTab();
  if (!activeTab || !isSupportedTabUrl(activeTab.url || "")) {
    return;
  }
  await ensureContentScriptReady(activeTab);
  await sendTabMessage(activeTab.id, { type: "SETTINGS_UPDATED", settings });
}

async function repairActiveTabIfSupported() {
  const activeTab = await getCurrentTab();
  if (!activeTab || !isSupportedTabUrl(activeTab.url || "")) {
    return false;
  }
  await ensureContentScriptReady(activeTab);
  return true;
}

async function loadState() {
  const response = await sendRuntimeMessage({ type: "GET_SETTINGS" });
  if (!response?.ok) {
    throw new Error(response?.message || "Could not load settings");
  }
  const settings = deepMerge(DEFAULT_SETTINGS, response.settings || {});
  enabledCheckbox.checked = !!settings.enabled;
  gemStatusDisplayModeSelect.value = getGemStatusDisplayModeFromSettings(settings, true);
}

async function updateSettingsPatch(patch, successMessage, successEvent, failureEvent) {
  try {
    const response = await sendRuntimeMessage({ type: "GET_SETTINGS" });
    if (!response?.ok) {
      throw new Error(response?.message || "Could not load settings");
    }
    const settings = deepMerge(DEFAULT_SETTINGS, response.settings || {});
    Object.assign(settings, patch || {});
    settings.gemStatusDisplayMode = getGemStatusDisplayModeFromSettings(settings, true);
    const saveResponse = await sendRuntimeMessage({ type: "SAVE_SETTINGS", settings });
    if (!saveResponse?.ok) {
      throw new Error(saveResponse?.message || "Could not save settings");
    }
    syncSettingsToActiveTab(settings).catch(() => {});
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
    { gemStatusDisplayMode: nextMode },
    `Gem status display: ${formatGemStatusDisplayModeLabel(nextMode)}.`,
    "popup.status_badge_toggled",
    "popup.status_badge_toggle_failed"
  );
});

actionButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const actionId = button.getAttribute("data-action");
    try {
      const activeTab = await getCurrentTab();
      setStatus("Running action...");
      await ensureContentScriptReady(activeTab);
      const tabId = Number(activeTab?.id);
      const response = shouldRunDirectGmailPopupAction(activeTab, actionId)
        ? await runActionDirect(actionId, {
            ...(await getActionContextFromTab(tabId)),
            source: "popup",
            runId: generateRunId()
          })
        : await sendActionToContent(tabId, actionId);
      const status = formatActionResultStatus(response);
      setStatus(status.message, status.isError);
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

syncActionButtonLabels();

loadState()
  .then(async () => {
    try {
      await loadActiveTabContextStatus();
    } catch (error) {
      const message = error.message || "Could not inspect the current tab.";
      if (isRecoverableContentError(message)) {
        setStatus(getUnsupportedTabMessage(), true);
      } else {
        setStatus(message, true);
      }
    }
  })
  .catch((error) => setStatus(error.message, true));
