"use strict";

let cachedSettings = null;
let toastContainer = null;
let contextRecoveryTriggered = false;
const PROJECT_PICKER_RENDER_LIMIT = 100;
const CUSTOM_FIELD_KEYS_PER_PAGE = 26;
const CUSTOM_FIELD_SHORTCUT_KEYS = "abcdefghijklmnopqrstuvwxyz".split("");
const ACTIVITY_FEED_LIMIT = 150;

function isContextInvalidatedError(message) {
  return /Extension context invalidated/i.test(String(message || ""));
}

function triggerContextRecovery(message) {
  if (contextRecoveryTriggered) {
    return;
  }
  contextRecoveryTriggered = true;
  showToast("Extension was updated. Reloading this LinkedIn tab...", true);
  setTimeout(() => {
    window.location.reload();
  }, 800);
  logEvent({
    source: "extension.content",
    level: "warn",
    event: "context.invalidated",
    message: message || "Extension context invalidated.",
    link: window.location.href
  });
}

function generateRunId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isLinkedInProfilePage() {
  return /^https:\/\/www\.linkedin\.com\/in\/[^/]+\/?/.test(window.location.href);
}

function normalizeLinkedInUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch (_error) {
    return url;
  }
}

function getLinkedInHandle(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/in\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch (_error) {
    return "";
  }
}

function getProfileName() {
  const heading = document.querySelector("h1");
  return heading ? heading.textContent.trim() : "";
}

function getProfileContext() {
  const linkedinUrl = normalizeLinkedInUrl(window.location.href);
  return {
    linkedinUrl,
    linkedInHandle: getLinkedInHandle(linkedinUrl),
    profileName: getProfileName()
  };
}

function ensureToastContainer() {
  if (toastContainer) {
    return toastContainer;
  }
  const container = document.createElement("div");
  container.id = "gem-shortcuts-toast-container";
  container.style.position = "fixed";
  container.style.right = "20px";
  container.style.bottom = "20px";
  container.style.zIndex = "2147483647";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "8px";
  document.documentElement.appendChild(container);
  toastContainer = container;
  return container;
}

function showToast(text, isError = false) {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.textContent = text;
  toast.style.background = isError ? "#a61d24" : "#196c2e";
  toast.style.color = "#fff";
  toast.style.padding = "10px 12px";
  toast.style.borderRadius = "6px";
  toast.style.fontSize = "13px";
  toast.style.fontFamily = "-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
  toast.style.maxWidth = "320px";
  toast.style.wordBreak = "break-word";
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2800);
}

function getSettings() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || "Runtime message failed.";
        if (isContextInvalidatedError(msg)) {
          triggerContextRecovery(msg);
          reject(new Error("Extension updated. Reloading page."));
          return;
        }
        reject(new Error(msg));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.message || "Could not load settings"));
        return;
      }
      resolve(response.settings);
    });
  });
}

function runAction(actionId, context) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "RUN_ACTION",
        actionId,
        context,
        meta: {
          source: context.source || "unknown",
          runId: context.runId || ""
        }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "Runtime message failed.";
          if (isContextInvalidatedError(msg)) {
            triggerContextRecovery(msg);
            reject(new Error("Extension updated. Reloading page."));
            return;
          }
          reject(new Error(msg));
          return;
        }
        resolve(response);
      }
    );
  });
}

function listProjects(query, runId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "LIST_PROJECTS",
        query: String(query || ""),
        limit: 0,
        runId: runId || ""
      },
      (response) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "Runtime message failed.";
          if (isContextInvalidatedError(msg)) {
            triggerContextRecovery(msg);
            reject(new Error("Extension updated. Reloading page."));
            return;
          }
          reject(new Error(msg));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.message || "Could not load projects"));
          return;
        }
        resolve(Array.isArray(response.projects) ? response.projects : []);
      }
    );
  });
}

function listCustomFieldsForContext(context, runId, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "LIST_CUSTOM_FIELDS_FOR_CONTEXT",
        context,
        runId: runId || "",
        preferCache: Boolean(options.preferCache),
        refreshInBackground: options.refreshInBackground !== false,
        forceRefresh: Boolean(options.forceRefresh)
      },
      (response) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "Runtime message failed.";
          if (isContextInvalidatedError(msg)) {
            triggerContextRecovery(msg);
            reject(new Error("Extension updated. Reloading page."));
            return;
          }
          reject(new Error(msg));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.message || "Could not load custom fields"));
          return;
        }
        resolve({
          candidateId: response.candidateId || "",
          customFields: Array.isArray(response.customFields) ? response.customFields : [],
          fromCache: Boolean(response.fromCache),
          stale: Boolean(response.stale)
        });
      }
    );
  });
}

function listActivityFeedForContext(context, runId, limit = ACTIVITY_FEED_LIMIT) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "LIST_ACTIVITY_FEED_FOR_CONTEXT",
        context,
        runId: runId || "",
        limit
      },
      (response) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "Runtime message failed.";
          if (isContextInvalidatedError(msg)) {
            triggerContextRecovery(msg);
            reject(new Error("Extension updated. Reloading page."));
            return;
          }
          reject(new Error(msg));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.message || "Could not load activity feed"));
          return;
        }
        resolve({
          candidate: response.candidate && typeof response.candidate === "object" ? response.candidate : {},
          activities: Array.isArray(response.activities) ? response.activities : []
        });
      }
    );
  });
}

function logEvent(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "LOG_EVENT", payload }, () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || "";
        if (isContextInvalidatedError(msg)) {
          triggerContextRecovery(msg);
        }
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

async function refreshSettings() {
  cachedSettings = await getSettings();
  return cachedSettings;
}

function findActionByShortcut(shortcut) {
  if (!cachedSettings) {
    return "";
  }
  const mapping = cachedSettings.shortcuts || {};
  return Object.keys(mapping).find((actionId) => normalizeShortcut(mapping[actionId]) === shortcut) || "";
}

function filterProjectsByQuery(projects, query) {
  const normalized = Array.isArray(projects) ? projects : [];
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return normalized.slice(0, PROJECT_PICKER_RENDER_LIMIT);
  }
  return normalized
    .filter((project) => String(project?.name || "").toLowerCase().includes(normalizedQuery))
    .slice(0, PROJECT_PICKER_RENDER_LIMIT);
}

function prefetchProjects(runId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "PREFETCH_PROJECTS",
        runId: runId || "",
        limit: 0
      },
      () => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "";
          if (isContextInvalidatedError(msg)) {
            triggerContextRecovery(msg);
          }
        }
        resolve();
      }
    );
  });
}

function prefetchCustomFields(context, runId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "PREFETCH_CUSTOM_FIELDS_FOR_CONTEXT",
        context,
        runId: runId || ""
      },
      () => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "";
          if (isContextInvalidatedError(msg)) {
            triggerContextRecovery(msg);
          }
        }
        resolve();
      }
    );
  });
}

function createProjectPickerStyles() {
  if (document.getElementById("gem-project-picker-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "gem-project-picker-style";
  style.textContent = `
    #gem-project-picker-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #gem-project-picker-modal {
      width: min(680px, 100%);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: #1f2328;
    }
    #gem-project-picker-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    #gem-project-picker-subtitle {
      font-size: 13px;
      color: #4f5358;
      margin-bottom: 12px;
    }
    #gem-project-picker-input {
      width: 100%;
      border: 1px solid #b6beca;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      margin-bottom: 10px;
    }
    #gem-project-picker-results {
      border: 1px solid #d4dae3;
      border-radius: 8px;
      max-height: 280px;
      overflow: auto;
      background: #fff;
    }
    .gem-project-picker-item {
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid #eff2f7;
      font-size: 14px;
      line-height: 1.3;
    }
    .gem-project-picker-item:last-child {
      border-bottom: none;
    }
    .gem-project-picker-item.active {
      background: #eaf2fe;
    }
    .gem-project-picker-hint {
      margin-top: 10px;
      font-size: 12px;
      color: #5b6168;
    }
    .gem-project-picker-empty {
      padding: 12px;
      font-size: 13px;
      color: #5b6168;
    }
  `;
  document.documentElement.appendChild(style);
}

function createCustomFieldPickerStyles() {
  if (document.getElementById("gem-custom-field-picker-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "gem-custom-field-picker-style";
  style.textContent = `
    #gem-custom-field-picker-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #gem-custom-field-picker-modal {
      width: min(760px, 100%);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: #1f2328;
    }
    #gem-custom-field-picker-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    #gem-custom-field-picker-subtitle {
      font-size: 13px;
      color: #4f5358;
      margin-bottom: 12px;
    }
    #gem-custom-field-picker-results {
      border: 1px solid #d4dae3;
      border-radius: 8px;
      max-height: 340px;
      overflow: auto;
      background: #fff;
    }
    .gem-custom-field-picker-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid #eff2f7;
      font-size: 14px;
      line-height: 1.3;
    }
    .gem-custom-field-picker-item:last-child {
      border-bottom: none;
    }
    .gem-custom-field-picker-item.active {
      background: #eaf2fe;
    }
    .gem-custom-field-picker-hotkey {
      min-width: 28px;
      height: 24px;
      border: 1px solid #b9c3d3;
      border-radius: 6px;
      text-align: center;
      line-height: 22px;
      font-weight: 600;
      color: #2f3a4b;
      background: #f5f8fc;
      font-size: 12px;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .gem-custom-field-picker-value {
      color: #1f2328;
      font-weight: 500;
    }
    .gem-custom-field-picker-meta {
      font-size: 12px;
      color: #5b6168;
      margin-left: auto;
      text-transform: capitalize;
      flex-shrink: 0;
    }
    .gem-custom-field-picker-hint {
      margin-top: 10px;
      font-size: 12px;
      color: #5b6168;
    }
    .gem-custom-field-picker-empty {
      padding: 12px;
      font-size: 13px;
      color: #5b6168;
    }
    #gem-custom-field-picker-page {
      margin-top: 8px;
      font-size: 12px;
      color: #5b6168;
    }
  `;
  document.documentElement.appendChild(style);
}

function createActivityFeedStyles() {
  if (document.getElementById("gem-activity-feed-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "gem-activity-feed-style";
  style.textContent = `
    #gem-activity-feed-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #gem-activity-feed-modal {
      width: min(920px, 100%);
      max-height: min(82vh, 920px);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: #1f2328;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    #gem-activity-feed-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    #gem-activity-feed-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    #gem-activity-feed-subtitle {
      font-size: 13px;
      color: #4f5358;
      margin-bottom: 4px;
    }
    #gem-activity-feed-candidate {
      font-size: 13px;
      color: #2f3a4b;
    }
    #gem-activity-feed-open {
      border: 1px solid #1e69d2;
      border-radius: 8px;
      background: #fff;
      color: #1e69d2;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 10px;
      cursor: pointer;
      white-space: nowrap;
    }
    #gem-activity-feed-open[disabled] {
      opacity: 0.5;
      cursor: default;
    }
    #gem-activity-feed-list {
      border: 1px solid #d4dae3;
      border-radius: 8px;
      background: #fff;
      overflow: auto;
      padding: 8px;
      min-height: 120px;
      flex: 1;
    }
    .gem-activity-feed-item {
      border: 1px solid #e7ebf2;
      border-radius: 8px;
      background: #fbfcff;
      padding: 10px 12px;
      margin-bottom: 8px;
    }
    .gem-activity-feed-item:last-child {
      margin-bottom: 0;
    }
    .gem-activity-feed-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
      margin-bottom: 4px;
    }
    .gem-activity-feed-item-title {
      font-size: 14px;
      font-weight: 600;
      color: #1f2328;
    }
    .gem-activity-feed-item-time {
      font-size: 12px;
      color: #5b6168;
      white-space: nowrap;
    }
    .gem-activity-feed-item-subtitle {
      font-size: 12px;
      color: #4f5358;
      margin-bottom: 6px;
    }
    .gem-activity-feed-item-content {
      font-size: 13px;
      color: #1f2328;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .gem-activity-feed-empty {
      padding: 12px;
      font-size: 13px;
      color: #5b6168;
    }
    #gem-activity-feed-hint {
      font-size: 12px;
      color: #5b6168;
    }
  `;
  document.documentElement.appendChild(style);
}

async function showCustomFieldPicker(runId, context) {
  createCustomFieldPickerStyles();
  const linkedinUrl = context.linkedinUrl || window.location.href;
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-custom-field-picker-overlay";

    const modal = document.createElement("div");
    modal.id = "gem-custom-field-picker-modal";

    const title = document.createElement("div");
    title.id = "gem-custom-field-picker-title";
    title.textContent = "Set Custom Field";

    const subtitle = document.createElement("div");
    subtitle.id = "gem-custom-field-picker-subtitle";
    subtitle.textContent = "Press a letter to pick a field, then press a number to set the value.";

    const results = document.createElement("div");
    results.id = "gem-custom-field-picker-results";

    const pageInfo = document.createElement("div");
    pageInfo.id = "gem-custom-field-picker-page";

    const hint = document.createElement("div");
    hint.className = "gem-custom-field-picker-hint";
    hint.textContent = "Esc to cancel. Arrow keys + Enter also work.";

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(results);
    modal.appendChild(pageInfo);
    modal.appendChild(hint);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    let loading = true;
    let loadError = "";
    let step = "fields";
    let selectedIndex = 0;
    let currentPage = 0;
    let valueNumberBuffer = "";
    let valueBufferTimer = null;
    let allFields = [];
    let fieldsForPage = [];
    let selectedField = null;
    let valueChoices = [];
    let pickerActive = true;
    const startedAt = Date.now();

    function clearValueBuffer() {
      valueNumberBuffer = "";
      if (valueBufferTimer) {
        clearTimeout(valueBufferTimer);
        valueBufferTimer = null;
      }
    }

    function cleanup() {
      pickerActive = false;
      clearValueBuffer();
      overlay.remove();
    }

    function finish(selection) {
      cleanup();
      resolve(selection || null);
    }

    function updatePageFields() {
      const start = currentPage * CUSTOM_FIELD_KEYS_PER_PAGE;
      fieldsForPage = allFields.slice(start, start + CUSTOM_FIELD_KEYS_PER_PAGE);
      if (selectedIndex >= fieldsForPage.length) {
        selectedIndex = Math.max(0, fieldsForPage.length - 1);
      }
      if (selectedIndex < 0) {
        selectedIndex = 0;
      }
    }

    function renderFields() {
      updatePageFields();
      results.innerHTML = "";
      if (loading) {
        const loadingNode = document.createElement("div");
        loadingNode.className = "gem-custom-field-picker-empty";
        loadingNode.textContent = "Loading custom fields...";
        results.appendChild(loadingNode);
        pageInfo.textContent = "";
        return;
      }
      if (loadError) {
        const errorNode = document.createElement("div");
        errorNode.className = "gem-custom-field-picker-empty";
        errorNode.textContent = `Could not load custom fields: ${loadError}`;
        results.appendChild(errorNode);
        pageInfo.textContent = "";
        return;
      }
      if (allFields.length === 0) {
        const empty = document.createElement("div");
        empty.className = "gem-custom-field-picker-empty";
        empty.textContent = "No custom fields available for this candidate.";
        results.appendChild(empty);
        pageInfo.textContent = "";
        return;
      }

      fieldsForPage.forEach((field, index) => {
        const item = document.createElement("div");
        item.className = `gem-custom-field-picker-item${index === selectedIndex ? " active" : ""}`;

        const hotkey = document.createElement("div");
        hotkey.className = "gem-custom-field-picker-hotkey";
        hotkey.textContent = CUSTOM_FIELD_SHORTCUT_KEYS[index] || "";

        const value = document.createElement("div");
        value.className = "gem-custom-field-picker-value";
        value.textContent = field.name || field.id;

        const meta = document.createElement("div");
        meta.className = "gem-custom-field-picker-meta";
        meta.textContent = field.valueType || "";

        item.appendChild(hotkey);
        item.appendChild(value);
        item.appendChild(meta);
        item.addEventListener("mouseenter", () => {
          selectedIndex = index;
          renderFields();
        });
        item.addEventListener("click", () => {
          selectedField = field;
          openValuesForField(field);
        });
        results.appendChild(item);
      });

      const totalPages = Math.max(1, Math.ceil(allFields.length / CUSTOM_FIELD_KEYS_PER_PAGE));
      if (totalPages > 1) {
        pageInfo.textContent = `Page ${currentPage + 1}/${totalPages}. Press [ / ] to change page.`;
      } else {
        pageInfo.textContent = "";
      }
    }

    function normalizeCustomFields(data) {
      return (Array.isArray(data?.customFields) ? data.customFields : [])
        .map((field) => ({
          id: String(field.id || ""),
          name: String(field.name || ""),
          scope: String(field.scope || ""),
          valueType: String(field.valueType || ""),
          options: Array.isArray(field.options)
            ? field.options.map((option) => ({
                id: String(option.id || ""),
                value: String(option.value || "")
              }))
            : []
        }))
        .filter((field) => field.id && field.name);
    }

    function applyLoadedCustomFields(data) {
      if (!pickerActive) {
        return;
      }
      loading = false;
      loadError = "";
      allFields = normalizeCustomFields(data);
      currentPage = 0;
      selectedIndex = 0;
      renderFields();
    }

    function openValuesForField(field) {
      step = "values";
      selectedField = field;
      selectedIndex = 0;
      clearValueBuffer();
      valueChoices = Array.isArray(field?.options) ? field.options.slice() : [];
      if (valueChoices.length === 0) {
        valueChoices = [{ id: "__manual__", value: "Type a custom value..." }];
      }
      title.textContent = `Set ${field.name}`;
      subtitle.textContent = "Press a number to choose a value.";
      renderValues();
      logEvent({
        source: "extension.content",
        event: "custom_field_picker.field_selected",
        actionId: ACTIONS.SET_CUSTOM_FIELD,
        runId,
        message: `Selected custom field ${field.name || field.id}.`,
        link: linkedinUrl,
        details: {
          customFieldId: field.id,
          customFieldName: field.name || ""
        }
      });
    }

    function chooseValue(option) {
      if (!selectedField) {
        return;
      }
      if (option.id === "__manual__") {
        const typed = (window.prompt(`Enter value for "${selectedField.name}":`) || "").trim();
        if (!typed) {
          return;
        }
        finish({
          customFieldId: selectedField.id,
          customFieldName: selectedField.name || "",
          customFieldValue: typed,
          customFieldOptionId: "",
          customFieldValueType: selectedField.valueType || "text"
        });
        return;
      }
      finish({
        customFieldId: selectedField.id,
        customFieldName: selectedField.name || "",
        customFieldValue: option.value || "",
        customFieldOptionId: option.id || "",
        customFieldValueType: selectedField.valueType || ""
      });
    }

    function renderValues() {
      results.innerHTML = "";
      if (valueChoices.length === 0) {
        const empty = document.createElement("div");
        empty.className = "gem-custom-field-picker-empty";
        empty.textContent = "No values available for this field.";
        results.appendChild(empty);
        return;
      }
      valueChoices.forEach((option, index) => {
        const item = document.createElement("div");
        item.className = `gem-custom-field-picker-item${index === selectedIndex ? " active" : ""}`;

        const hotkey = document.createElement("div");
        hotkey.className = "gem-custom-field-picker-hotkey";
        hotkey.textContent = String(index + 1);

        const value = document.createElement("div");
        value.className = "gem-custom-field-picker-value";
        value.textContent = option.value || option.id || "";

        item.appendChild(hotkey);
        item.appendChild(value);
        item.addEventListener("mouseenter", () => {
          selectedIndex = index;
          renderValues();
        });
        item.addEventListener("click", () => chooseValue(option));
        results.appendChild(item);
      });
      pageInfo.textContent = "";
    }

    function goBackToFields() {
      step = "fields";
      selectedField = null;
      selectedIndex = 0;
      title.textContent = "Set Custom Field";
      subtitle.textContent = "Press a letter to pick a field, then press a number to set the value.";
      renderFields();
    }

    function handleFieldsKey(event) {
      const totalPages = Math.max(1, Math.ceil(allFields.length / CUSTOM_FIELD_KEYS_PER_PAGE));
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (fieldsForPage.length > 0) {
          selectedIndex = (selectedIndex + 1) % fieldsForPage.length;
          renderFields();
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (fieldsForPage.length > 0) {
          selectedIndex = (selectedIndex - 1 + fieldsForPage.length) % fieldsForPage.length;
          renderFields();
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (fieldsForPage.length > 0) {
          openValuesForField(fieldsForPage[selectedIndex]);
        }
        return;
      }
      if (event.key === "]" && totalPages > 1) {
        event.preventDefault();
        currentPage = (currentPage + 1) % totalPages;
        selectedIndex = 0;
        renderFields();
        return;
      }
      if (event.key === "[" && totalPages > 1) {
        event.preventDefault();
        currentPage = (currentPage - 1 + totalPages) % totalPages;
        selectedIndex = 0;
        renderFields();
        return;
      }
      const lower = String(event.key || "").toLowerCase();
      const idx = CUSTOM_FIELD_SHORTCUT_KEYS.indexOf(lower);
      if (idx >= 0 && idx < fieldsForPage.length) {
        event.preventDefault();
        openValuesForField(fieldsForPage[idx]);
      }
    }

    function handleValuesNumberKey(key) {
      if (!/^[0-9]$/.test(key)) {
        return false;
      }
      valueNumberBuffer += key;
      if (valueBufferTimer) {
        clearTimeout(valueBufferTimer);
      }
      valueBufferTimer = setTimeout(() => {
        const exactIndex = Number(valueNumberBuffer);
        if (
          valueNumberBuffer &&
          Number.isFinite(exactIndex) &&
          String(exactIndex) === valueNumberBuffer &&
          exactIndex >= 1 &&
          exactIndex <= valueChoices.length
        ) {
          const option = valueChoices[exactIndex - 1];
          clearValueBuffer();
          chooseValue(option);
          return;
        }
        clearValueBuffer();
      }, 800);

      const matches = [];
      for (let i = 1; i <= valueChoices.length; i += 1) {
        const token = String(i);
        if (token.startsWith(valueNumberBuffer)) {
          matches.push(i);
        }
      }
      if (matches.length === 0) {
        clearValueBuffer();
        return true;
      }

      const exact = Number(valueNumberBuffer);
      const hasExact =
        Number.isFinite(exact) &&
        String(exact) === valueNumberBuffer &&
        exact >= 1 &&
        exact <= valueChoices.length;
      const hasLongerPrefix = matches.some((index) => String(index) !== valueNumberBuffer);
      if (hasExact && !hasLongerPrefix) {
        clearValueBuffer();
        chooseValue(valueChoices[exact - 1]);
        return true;
      }
      return true;
    }

    function handleValuesKey(event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (valueChoices.length > 0) {
          selectedIndex = (selectedIndex + 1) % valueChoices.length;
          renderValues();
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (valueChoices.length > 0) {
          selectedIndex = (selectedIndex - 1 + valueChoices.length) % valueChoices.length;
          renderValues();
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (valueChoices.length > 0) {
          chooseValue(valueChoices[selectedIndex]);
        }
        return;
      }
      if (handleValuesNumberKey(event.key)) {
        event.preventDefault();
      }
    }

    overlay.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (step === "values") {
            goBackToFields();
            return;
          }
          logEvent({
            source: "extension.content",
            level: "warn",
            event: "custom_field_picker.cancelled",
            actionId: ACTIONS.SET_CUSTOM_FIELD,
            runId,
            message: "Custom field picker cancelled.",
            link: linkedinUrl
          });
          finish(null);
          return;
        }

        if (step === "fields") {
          handleFieldsKey(event);
          return;
        }
        handleValuesKey(event);
      },
      true
    );

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        logEvent({
          source: "extension.content",
          level: "warn",
          event: "custom_field_picker.cancelled",
          actionId: ACTIONS.SET_CUSTOM_FIELD,
          runId,
          message: "Custom field picker cancelled by outside click.",
          link: linkedinUrl
        });
        finish(null);
      }
    });

    renderFields();
    modal.tabIndex = -1;
    modal.focus();

    logEvent({
      source: "extension.content",
      event: "custom_field_picker.opened",
      actionId: ACTIONS.SET_CUSTOM_FIELD,
      runId,
      message: "Custom field picker opened.",
      link: linkedinUrl
    });

    listCustomFieldsForContext(context, runId, {
      preferCache: true,
      refreshInBackground: true
    })
      .then(async (data) => {
        applyLoadedCustomFields(data);
        await logEvent({
          source: "extension.content",
          event: "custom_field_picker.loaded",
          actionId: ACTIONS.SET_CUSTOM_FIELD,
          runId,
          message: `Loaded ${allFields.length} custom fields for candidate${data.fromCache ? " (cache)." : "."}`,
          link: linkedinUrl,
          details: {
            candidateId: data.candidateId || "",
            fromCache: Boolean(data.fromCache),
            stale: Boolean(data.stale),
            durationMs: Date.now() - startedAt
          }
        });

        if (data.fromCache && data.stale) {
          try {
            const refreshed = await listCustomFieldsForContext(context, runId, { forceRefresh: true });
            applyLoadedCustomFields(refreshed);
            await logEvent({
              source: "extension.content",
              event: "custom_field_picker.revalidated",
              actionId: ACTIONS.SET_CUSTOM_FIELD,
              runId,
              message: `Refreshed custom fields from backend (${allFields.length}).`,
              link: linkedinUrl,
              details: {
                candidateId: refreshed.candidateId || "",
                durationMs: Date.now() - startedAt
              }
            });
          } catch (refreshError) {
            await logEvent({
              source: "extension.content",
              level: "warn",
              event: "custom_field_picker.revalidate_failed",
              actionId: ACTIONS.SET_CUSTOM_FIELD,
              runId,
              message: refreshError?.message || "Custom field cache refresh failed.",
              link: linkedinUrl
            });
          }
        }
      })
      .catch(async (error) => {
        if (!pickerActive) {
          return;
        }
        loading = false;
        loadError = error.message || "Failed to load custom fields.";
        renderFields();
        showToast(loadError, true);
        await logEvent({
          source: "extension.content",
          level: "error",
          event: "custom_field_picker.load_failed",
          actionId: ACTIONS.SET_CUSTOM_FIELD,
          runId,
          message: loadError,
          link: linkedinUrl
        });
      });
  });
}

function formatActivityTimestamp(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

async function showActivityFeed(runId, context) {
  createActivityFeedStyles();
  const linkedinUrl = context.linkedinUrl || window.location.href;

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-activity-feed-overlay";

    const modal = document.createElement("div");
    modal.id = "gem-activity-feed-modal";

    const header = document.createElement("div");
    header.id = "gem-activity-feed-header";

    const titleWrap = document.createElement("div");
    const title = document.createElement("div");
    title.id = "gem-activity-feed-title";
    title.textContent = "Activity Feed";
    const subtitle = document.createElement("div");
    subtitle.id = "gem-activity-feed-subtitle";
    subtitle.textContent = "Loading Gem activity for this profile...";
    const candidateLabel = document.createElement("div");
    candidateLabel.id = "gem-activity-feed-candidate";
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    titleWrap.appendChild(candidateLabel);

    const openInGemBtn = document.createElement("button");
    openInGemBtn.id = "gem-activity-feed-open";
    openInGemBtn.type = "button";
    openInGemBtn.textContent = "Open Profile in Gem";
    openInGemBtn.disabled = true;

    header.appendChild(titleWrap);
    header.appendChild(openInGemBtn);

    const list = document.createElement("div");
    list.id = "gem-activity-feed-list";

    const hint = document.createElement("div");
    hint.id = "gem-activity-feed-hint";
    hint.textContent = "Esc to close.";

    modal.appendChild(header);
    modal.appendChild(list);
    modal.appendChild(hint);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    let active = true;
    let profileLink = "";

    function close() {
      if (!active) {
        return;
      }
      active = false;
      overlay.remove();
      resolve();
    }

    function renderLoading() {
      list.innerHTML = "";
      const row = document.createElement("div");
      row.className = "gem-activity-feed-empty";
      row.textContent = "Loading activity feed...";
      list.appendChild(row);
    }

    function renderError(message) {
      list.innerHTML = "";
      const row = document.createElement("div");
      row.className = "gem-activity-feed-empty";
      row.textContent = `Could not load activity feed: ${message}`;
      list.appendChild(row);
    }

    function renderActivities(candidate, activities) {
      list.innerHTML = "";
      const safeCandidate = candidate && typeof candidate === "object" ? candidate : {};
      const safeActivities = Array.isArray(activities) ? activities : [];

      const candidateName = String(safeCandidate.name || "").trim();
      const headline = [safeCandidate.title || "", safeCandidate.company || ""].filter(Boolean).join(" at ");
      candidateLabel.textContent = [candidateName || "Candidate", headline || "", safeCandidate.location || ""]
        .filter(Boolean)
        .join(" · ");

      profileLink = String(safeCandidate.weblink || "");
      openInGemBtn.disabled = !profileLink;

      if (safeActivities.length === 0) {
        const row = document.createElement("div");
        row.className = "gem-activity-feed-empty";
        row.textContent = "No activity found yet for this candidate.";
        list.appendChild(row);
        return;
      }

      for (const activity of safeActivities) {
        const item = document.createElement("div");
        item.className = "gem-activity-feed-item";

        const head = document.createElement("div");
        head.className = "gem-activity-feed-head";

        const itemTitle = document.createElement("div");
        itemTitle.className = "gem-activity-feed-item-title";
        itemTitle.textContent = activity.title || "Activity";

        const itemTime = document.createElement("div");
        itemTime.className = "gem-activity-feed-item-time";
        itemTime.textContent = formatActivityTimestamp(activity.timestamp);

        head.appendChild(itemTitle);
        head.appendChild(itemTime);
        item.appendChild(head);

        if (activity.subtitle) {
          const sub = document.createElement("div");
          sub.className = "gem-activity-feed-item-subtitle";
          sub.textContent = activity.subtitle;
          item.appendChild(sub);
        }

        if (activity.content) {
          const content = document.createElement("div");
          content.className = "gem-activity-feed-item-content";
          content.textContent = activity.content;
          item.appendChild(content);
        }

        list.appendChild(item);
      }
    }

    renderLoading();
    modal.tabIndex = -1;
    modal.focus();

    openInGemBtn.addEventListener("click", () => {
      if (!profileLink) {
        return;
      }
      window.open(profileLink, "_blank", "noopener,noreferrer");
      logEvent({
        source: "extension.content",
        event: "activity_feed.open_profile_clicked",
        actionId: ACTIONS.VIEW_ACTIVITY_FEED,
        runId,
        message: "Clicked Open Profile in Gem from activity feed.",
        link: profileLink
      });
    });

    overlay.addEventListener("click", (event) => {
      if (event.target !== overlay) {
        return;
      }
      logEvent({
        source: "extension.content",
        event: "activity_feed.closed",
        actionId: ACTIONS.VIEW_ACTIVITY_FEED,
        runId,
        message: "Activity feed closed by outside click.",
        link: linkedinUrl
      });
      close();
    });

    overlay.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") {
          return;
        }
        event.preventDefault();
        logEvent({
          source: "extension.content",
          event: "activity_feed.closed",
          actionId: ACTIONS.VIEW_ACTIVITY_FEED,
          runId,
          message: "Activity feed closed by Escape key.",
          link: linkedinUrl
        });
        close();
      },
      true
    );

    logEvent({
      source: "extension.content",
      event: "activity_feed.opened",
      actionId: ACTIONS.VIEW_ACTIVITY_FEED,
      runId,
      message: "Activity feed view opened.",
      link: linkedinUrl
    });

    listActivityFeedForContext(context, runId, ACTIVITY_FEED_LIMIT)
      .then(async (data) => {
        if (!active) {
          return;
        }
        subtitle.textContent = "Gem activity for this person (latest first).";
        renderActivities(data.candidate, data.activities);
        await logEvent({
          source: "extension.content",
          event: "activity_feed.loaded",
          actionId: ACTIONS.VIEW_ACTIVITY_FEED,
          runId,
          message: `Loaded ${(data.activities || []).length} activity entries.`,
          link: data?.candidate?.weblink || linkedinUrl,
          details: {
            candidateId: data?.candidate?.id || ""
          }
        });
      })
      .catch(async (error) => {
        if (!active) {
          return;
        }
        subtitle.textContent = "Gem activity for this person.";
        renderError(error.message || "Failed to load activity feed.");
        showToast(error.message || "Failed to load activity feed.", true);
        await logEvent({
          source: "extension.content",
          level: "error",
          event: "activity_feed.load_failed",
          actionId: ACTIONS.VIEW_ACTIVITY_FEED,
          runId,
          message: error.message || "Failed to load activity feed.",
          link: linkedinUrl
        });
      });
  });
}

async function showProjectPicker(runId, linkedinUrl) {
  createProjectPickerStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-project-picker-overlay";

    const modal = document.createElement("div");
    modal.id = "gem-project-picker-modal";

    const title = document.createElement("div");
    title.id = "gem-project-picker-title";
    title.textContent = "Add Candidate to Project";

    const subtitle = document.createElement("div");
    subtitle.id = "gem-project-picker-subtitle";
    subtitle.textContent = "Type project name, use arrow keys to choose, press Enter to confirm.";

    const input = document.createElement("input");
    input.id = "gem-project-picker-input";
    input.type = "text";
    input.placeholder = "Search projects by name...";
    input.autocomplete = "off";

    const results = document.createElement("div");
    results.id = "gem-project-picker-results";

    const hint = document.createElement("div");
    hint.className = "gem-project-picker-hint";
    hint.textContent = "Esc to cancel.";

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(input);
    modal.appendChild(results);
    modal.appendChild(hint);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    let selectedIndex = 0;
    let filteredProjects = [];
    let allProjects = [];
    let loading = true;
    let loadError = "";
    const startedAt = Date.now();

    function cleanup() {
      overlay.remove();
    }

    function finish(selected) {
      cleanup();
      resolve(selected || null);
    }

    function renderList() {
      filteredProjects = filterProjectsByQuery(allProjects, input.value || "");
      if (selectedIndex >= filteredProjects.length) {
        selectedIndex = Math.max(0, filteredProjects.length - 1);
      }
      if (selectedIndex < 0) {
        selectedIndex = 0;
      }

      results.innerHTML = "";
      if (loading) {
        const loadingNode = document.createElement("div");
        loadingNode.className = "gem-project-picker-empty";
        loadingNode.textContent = "Loading projects...";
        results.appendChild(loadingNode);
        return;
      }
      if (loadError) {
        const errorNode = document.createElement("div");
        errorNode.className = "gem-project-picker-empty";
        errorNode.textContent = `Could not load projects: ${loadError}`;
        results.appendChild(errorNode);
        return;
      }
      if (filteredProjects.length === 0) {
        const empty = document.createElement("div");
        empty.className = "gem-project-picker-empty";
        empty.textContent = "No matching projects.";
        results.appendChild(empty);
        return;
      }

      filteredProjects.forEach((project, index) => {
        const item = document.createElement("div");
        item.className = `gem-project-picker-item${index === selectedIndex ? " active" : ""}`;
        item.textContent = project.name || project.id;
        item.addEventListener("mouseenter", () => {
          selectedIndex = index;
          renderList();
        });
        item.addEventListener("click", () => {
          logEvent({
            source: "extension.content",
            event: "project_picker.selected",
            actionId: ACTIONS.ADD_TO_PROJECT,
            runId,
            message: `Selected project ${project.name || project.id}.`,
            link: linkedinUrl,
            details: {
              projectId: project.id,
              projectName: project.name || ""
            }
          });
          finish({
            id: project.id,
            name: project.name || ""
          });
        });
        results.appendChild(item);
      });
    }

    input.addEventListener("input", () => {
      selectedIndex = 0;
      renderList();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!loading && filteredProjects.length > 0) {
          selectedIndex = (selectedIndex + 1) % filteredProjects.length;
          renderList();
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!loading && filteredProjects.length > 0) {
          selectedIndex = (selectedIndex - 1 + filteredProjects.length) % filteredProjects.length;
          renderList();
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (!loading && filteredProjects.length > 0) {
          const project = filteredProjects[selectedIndex];
          logEvent({
            source: "extension.content",
            event: "project_picker.selected",
            actionId: ACTIONS.ADD_TO_PROJECT,
            runId,
            message: `Selected project ${project.name || project.id}.`,
            link: linkedinUrl,
            details: {
              projectId: project.id,
              projectName: project.name || ""
            }
          });
          finish({
            id: project.id,
            name: project.name || ""
          });
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        logEvent({
          source: "extension.content",
          level: "warn",
          event: "project_picker.cancelled",
          actionId: ACTIONS.ADD_TO_PROJECT,
          runId,
          message: "Project picker cancelled.",
          link: linkedinUrl
        });
        finish(null);
      }
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        logEvent({
          source: "extension.content",
          level: "warn",
          event: "project_picker.cancelled",
          actionId: ACTIONS.ADD_TO_PROJECT,
          runId,
          message: "Project picker cancelled by outside click.",
          link: linkedinUrl
        });
        finish(null);
      }
    });

    renderList();
    input.focus();

    logEvent({
      source: "extension.content",
      event: "project_picker.opened",
      actionId: ACTIONS.ADD_TO_PROJECT,
      runId,
      message: "Project picker opened.",
      link: linkedinUrl
    });

    listProjects("", runId)
      .then(async (projects) => {
        allProjects = projects.filter((project) => !project.archived);
        loading = false;
        loadError = "";
        renderList();
        await logEvent({
          source: "extension.content",
          event: "project_picker.loaded",
          actionId: ACTIONS.ADD_TO_PROJECT,
          runId,
          message: `Project picker loaded ${allProjects.length} projects.`,
          link: linkedinUrl,
          details: {
            durationMs: Date.now() - startedAt
          }
        });
      })
      .catch(async (error) => {
        loading = false;
        loadError = error.message || "Failed to load project list.";
        renderList();
        showToast(loadError, true);
        await logEvent({
          source: "extension.content",
          level: "error",
          event: "project_picker.load_failed",
          actionId: ACTIONS.ADD_TO_PROJECT,
          runId,
          message: loadError,
          link: linkedinUrl,
          details: {
            durationMs: Date.now() - startedAt
          }
        });
      });
  });
}

async function getRuntimeContext(actionId, settings, runId) {
  const context = getProfileContext();

  if (actionId === ACTIONS.ADD_TO_PROJECT) {
    const project = await showProjectPicker(runId, context.linkedinUrl);
    if (!project) {
      return null;
    }
    context.projectId = String(project.id || "").trim();
    context.projectName = String(project.name || "").trim();
  }

  if (actionId === ACTIONS.SET_CUSTOM_FIELD) {
    const selection = await showCustomFieldPicker(runId, context);
    if (!selection) {
      return null;
    }
    context.customFieldId = selection.customFieldId || "";
    context.customFieldValue = selection.customFieldValue || "";
    context.customFieldOptionId = selection.customFieldOptionId || "";
    context.customFieldValueType = selection.customFieldValueType || "";
    context.customFieldName = selection.customFieldName || "";
  }

  if (actionId === ACTIONS.SEND_SEQUENCE && !settings.defaultSequenceId) {
    const sequenceId = window.prompt("Gem sequence ID:");
    if (!sequenceId) {
      return null;
    }
    context.sequenceId = sequenceId.trim();
  }

  return context;
}

async function handleAction(actionId, source = "keyboard", runId = "") {
  const effectiveRunId = runId || generateRunId();
  const initialContext = getProfileContext();
  try {
    const settings = cachedSettings || (await refreshSettings());
    if (!settings.enabled) {
      showToast("Gem shortcuts are disabled in extension settings.", true);
      logEvent({
        source: "extension.content",
        level: "warn",
        event: "action.blocked",
        actionId,
        runId: effectiveRunId,
        message: "Action blocked because extension is disabled.",
        link: initialContext.linkedinUrl
      });
      return;
    }
    if (!isLinkedInProfilePage()) {
      showToast("Open a LinkedIn profile page to run this action.", true);
      logEvent({
        source: "extension.content",
        level: "warn",
        event: "action.blocked",
        actionId,
        runId: effectiveRunId,
        message: "Action blocked because current page is not a LinkedIn profile.",
        link: window.location.href
      });
      return;
    }

    if (actionId === ACTIONS.VIEW_ACTIVITY_FEED) {
      await showActivityFeed(effectiveRunId, initialContext);
      return;
    }

    const context = await getRuntimeContext(actionId, settings, effectiveRunId);
    if (!context) {
      showToast("Action cancelled.", true);
      logEvent({
        source: "extension.content",
        level: "warn",
        event: "action.cancelled",
        actionId,
        runId: effectiveRunId,
        message: "Action cancelled by user input.",
        link: initialContext.linkedinUrl
      });
      return;
    }
    context.source = source;
    context.runId = effectiveRunId;
    await logEvent({
      source: "extension.content",
      event: "action.dispatched",
      actionId,
      runId: effectiveRunId,
      message: `Dispatching action from ${source}.`,
      link: context.linkedinUrl,
      details: {
        linkedInHandle: context.linkedInHandle,
        profileName: context.profileName
      }
    });
    const result = await runAction(actionId, context);
    if (result?.ok) {
      showToast(result.message || "Action completed.");
      await logEvent({
        source: "extension.content",
        event: "action.result.success",
        actionId,
        runId: result.runId || effectiveRunId,
        message: result.message || "Action completed.",
        link: result.link || context.linkedinUrl
      });
      return;
    }
    showToast(result?.message || "Action failed.", true);
    await logEvent({
      source: "extension.content",
      level: "error",
      event: "action.result.failed",
      actionId,
      runId: result?.runId || effectiveRunId,
      message: result?.message || "Action failed.",
      link: context.linkedinUrl
    });
  } catch (error) {
    showToast(error.message || "Action failed.", true);
    logEvent({
      source: "extension.content",
      level: "error",
      event: "action.exception",
      actionId,
      runId: effectiveRunId,
      message: error.message || "Action failed.",
      link: initialContext.linkedinUrl
    });
  }
}

function onKeyDown(event) {
  if (!cachedSettings || !isLinkedInProfilePage()) {
    return;
  }
  if (isEditableElement(event.target)) {
    return;
  }

  const shortcut = keyboardEventToShortcut(event);
  if (!shortcut) {
    return;
  }
  const actionId = findActionByShortcut(shortcut);
  if (!actionId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const runId = generateRunId();
  logEvent({
    source: "extension.content",
    event: "shortcut.triggered",
    actionId,
    runId,
    message: `Shortcut triggered: ${formatShortcutForMac(shortcut) || shortcut}`,
    link: window.location.href,
    details: {
      shortcut: formatShortcutForMac(shortcut) || shortcut
    }
  });
  handleAction(actionId, "keyboard", runId);
}

async function init() {
  try {
    await refreshSettings();
  } catch (error) {
    if (isContextInvalidatedError(error?.message || "")) {
      triggerContextRecovery(error.message);
    }
    return;
  }

  if (cachedSettings?.enabled && isLinkedInProfilePage()) {
    const profileContext = getProfileContext();
    prefetchProjects(generateRunId()).catch(() => {});
    prefetchCustomFields(profileContext, generateRunId()).catch(() => {});
  }

  window.addEventListener("keydown", onKeyDown, true);
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "sync" && changes.settings) {
      cachedSettings = deepMerge(DEFAULT_SETTINGS, changes.settings.newValue || {});
      if (cachedSettings?.enabled && isLinkedInProfilePage()) {
        const profileContext = getProfileContext();
        prefetchProjects(generateRunId()).catch(() => {});
        prefetchCustomFields(profileContext, generateRunId()).catch(() => {});
      }
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SETTINGS_UPDATED") {
    cachedSettings = deepMerge(DEFAULT_SETTINGS, message.settings || {});
    if (cachedSettings?.enabled && isLinkedInProfilePage()) {
      const profileContext = getProfileContext();
      prefetchProjects(generateRunId()).catch(() => {});
      prefetchCustomFields(profileContext, generateRunId()).catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "TRIGGER_ACTION") {
    const runId = message.runId || generateRunId();
    handleAction(message.actionId, message.source || "popup", runId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  return false;
});

init();
