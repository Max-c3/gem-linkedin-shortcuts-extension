"use strict";

const form = document.getElementById("settings-form");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("reset-btn");
const shortcutEditors = Array.from(document.querySelectorAll(".shortcut-edit"));
const refreshLogsBtn = document.getElementById("refresh-logs");
const exportLogsBtn = document.getElementById("export-logs");
const clearLocalLogsBtn = document.getElementById("clear-local-logs");
const logsMetaEl = document.getElementById("logs-meta");
const logsListEl = document.getElementById("logs-list");

let activeShortcutEditor = null;
let latestRenderedLogs = [];

const SHORTCUT_LABELS = {
  addProspect: "Add Prospect",
  addToProject: "Add to Project",
  uploadToAshby: "Upload to Ashby",
  openAshbyProfile: "Open Profile in Ashby",
  openActivity: "Open Profile in Gem",
  setCustomField: "Set Custom Field",
  addNoteToCandidate: "Add Note to Candidate",
  setReminder: "Set Reminder",
  sendSequence: "Open Sequence",
  editSequence: "Edit Sequence"
  // Retired for now:
  // viewActivityFeed: "View Activity Feed"
};

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#a61d24" : "#196c2e";
}

function getShortcutInput(shortcutId) {
  return document.getElementById(`shortcut-${shortcutId}`);
}

function setShortcutValue(shortcutId, shortcut) {
  const input = getShortcutInput(shortcutId);
  const normalized = normalizeShortcut(shortcut);
  input.dataset.shortcut = normalized;
  input.value = formatShortcutForMac(normalized);
}

function getShortcutValue(shortcutId) {
  const input = getShortcutInput(shortcutId);
  return normalizeShortcut(input.dataset.shortcut || input.value || "");
}

function readInputs() {
  return {
    enabled: document.getElementById("enabled").checked,
    backendBaseUrl: document.getElementById("backendBaseUrl").value.trim(),
    backendSharedToken: document.getElementById("backendSharedToken").value.trim(),
    createdByUserId: document.getElementById("createdByUserId").value.trim(),
    defaultProjectId: document.getElementById("defaultProjectId").value.trim(),
    defaultSequenceId: document.getElementById("defaultSequenceId").value.trim(),
    customFieldId: document.getElementById("customFieldId").value.trim(),
    customFieldValue: document.getElementById("customFieldValue").value.trim(),
    activityUrlTemplate: document.getElementById("activityUrlTemplate").value.trim(),
    sequenceComposeUrlTemplate: document.getElementById("sequenceComposeUrlTemplate").value.trim(),
    shortcuts: {
      addProspect: getShortcutValue("addProspect"),
      addToProject: getShortcutValue("addToProject"),
      uploadToAshby: getShortcutValue("uploadToAshby"),
      openAshbyProfile: getShortcutValue("openAshbyProfile"),
      openActivity: getShortcutValue("openActivity"),
      setCustomField: getShortcutValue("setCustomField"),
      addNoteToCandidate: getShortcutValue("addNoteToCandidate"),
      setReminder: getShortcutValue("setReminder"),
      sendSequence: getShortcutValue("sendSequence"),
      editSequence: getShortcutValue("editSequence")
      // Retired for now:
      // viewActivityFeed: getShortcutValue("viewActivityFeed")
    }
  };
}

function writeInputs(settings) {
  document.getElementById("enabled").checked = !!settings.enabled;
  document.getElementById("backendBaseUrl").value = settings.backendBaseUrl || "";
  document.getElementById("backendSharedToken").value = settings.backendSharedToken || "";
  document.getElementById("createdByUserId").value = settings.createdByUserId || "";
  document.getElementById("defaultProjectId").value = settings.defaultProjectId || "";
  document.getElementById("defaultSequenceId").value = settings.defaultSequenceId || "";
  document.getElementById("customFieldId").value = settings.customFieldId || "";
  document.getElementById("customFieldValue").value = settings.customFieldValue || "";
  document.getElementById("activityUrlTemplate").value = settings.activityUrlTemplate || "";
  document.getElementById("sequenceComposeUrlTemplate").value = settings.sequenceComposeUrlTemplate || "";

  setShortcutValue("addProspect", settings.shortcuts.addProspect || "");
  setShortcutValue("addToProject", settings.shortcuts.addToProject || "");
  setShortcutValue("uploadToAshby", settings.shortcuts.uploadToAshby || "");
  setShortcutValue("openAshbyProfile", settings.shortcuts.openAshbyProfile || "");
  setShortcutValue("openActivity", settings.shortcuts.openActivity || "");
  setShortcutValue("setCustomField", settings.shortcuts.setCustomField || "");
  setShortcutValue("addNoteToCandidate", settings.shortcuts.addNoteToCandidate || "");
  setShortcutValue("setReminder", settings.shortcuts.setReminder || "");
  setShortcutValue("sendSequence", settings.shortcuts.sendSequence || "");
  setShortcutValue("editSequence", settings.shortcuts.editSequence || "");
  // Retired for now:
  // setShortcutValue("viewActivityFeed", settings.shortcuts.viewActivityFeed || "");
}

function validateSettings(settings) {
  if (!settings.backendBaseUrl) {
    return "Backend base URL is required.";
  }

  const seen = new Set();
  for (const [action, shortcut] of Object.entries(settings.shortcuts)) {
    if (!shortcut) {
      return `Shortcut missing for ${action}.`;
    }
    if (!shortcutHasModifier(shortcut)) {
      return `Shortcut for ${action} must include a modifier key (Cmd, Option, Shift, or Control).`;
    }
    if (seen.has(shortcut)) {
      return `Duplicate shortcut: ${formatShortcutForMac(shortcut)}`;
    }
    seen.add(shortcut);
  }
  return "";
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

function formatTimestamp(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function renderLogs(logs, backendError = "") {
  latestRenderedLogs = logs;
  logsListEl.innerHTML = "";

  if (backendError) {
    const warn = document.createElement("div");
    warn.className = "log-row warn";
    warn.textContent = `Backend logs unavailable: ${backendError}`;
    logsListEl.appendChild(warn);
  }

  if (!logs.length) {
    const empty = document.createElement("div");
    empty.className = "log-row";
    empty.textContent = "No logs found yet.";
    logsListEl.appendChild(empty);
    logsMetaEl.textContent = backendError ? "Showing local logs only." : "No events yet.";
    return;
  }

  logsMetaEl.textContent = `Showing ${logs.length} events${backendError ? " (backend partially unavailable)" : ""}.`;

  for (const log of logs) {
    const row = document.createElement("div");
    row.className = `log-row ${log.level === "error" ? "error" : log.level === "warn" ? "warn" : ""}`;

    const head = document.createElement("div");
    head.className = "log-head";
    head.textContent = `[${formatTimestamp(log.timestamp)}] ${log.source || "unknown"} · ${log.event || ""}`;

    const body = document.createElement("div");
    body.className = "log-body";
    body.textContent = log.message || "(no message)";

    row.appendChild(head);
    row.appendChild(body);

    if (log.actionId || log.runId) {
      const ids = document.createElement("div");
      ids.className = "log-subtle";
      ids.textContent = `action=${log.actionId || "-"} run=${log.runId || "-"}`;
      row.appendChild(ids);
    }

    if (log.link) {
      const linkWrap = document.createElement("div");
      const link = document.createElement("a");
      link.href = log.link;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.textContent = log.link;
      linkWrap.appendChild(link);
      row.appendChild(linkWrap);
    }

    if (log.details && Object.keys(log.details).length > 0) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Details";
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(log.details, null, 2);
      details.appendChild(summary);
      details.appendChild(pre);
      row.appendChild(details);
    }

    logsListEl.appendChild(row);
  }
}

async function refreshLogs() {
  const response = await sendRuntimeMessage({ type: "GET_OBSERVABILITY_LOGS", limit: 300 });
  if (!response?.ok) {
    throw new Error(response?.message || "Could not load logs.");
  }

  const localLogs = Array.isArray(response.localLogs) ? response.localLogs : [];
  const backendLogs = Array.isArray(response.backendLogs) ? response.backendLogs : [];
  const merged = [...backendLogs, ...localLogs]
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
    .slice(0, 500);
  renderLogs(merged, response.backendError || "");
}

function exportLogs() {
  const blob = new Blob([JSON.stringify(latestRenderedLogs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gem-extension-logs-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function clearLogs() {
  const response = await sendRuntimeMessage({ type: "CLEAR_LOCAL_LOGS" });
  if (!response?.ok) {
    throw new Error(response?.message || "Could not clear local logs.");
  }
  await refreshLogs();
}

async function loadSettings() {
  const response = await sendRuntimeMessage({ type: "GET_SETTINGS" });
  if (!response?.ok) {
    throw new Error(response?.message || "Could not load settings");
  }
  writeInputs(deepMerge(DEFAULT_SETTINGS, response.settings || {}));
}

async function saveSettings(event) {
  event.preventDefault();
  const updates = deepMerge(DEFAULT_SETTINGS, readInputs());
  const error = validateSettings(updates);
  if (error) {
    setStatus(error, true);
    return;
  }

  const response = await sendRuntimeMessage({ type: "SAVE_SETTINGS", settings: updates });
  if (!response?.ok) {
    setStatus(response?.message || "Save failed.", true);
    return;
  }
  setStatus("Saved.");
}

function resetDefaults() {
  stopShortcutRecording();
  writeInputs(DEFAULT_SETTINGS);
  setStatus("Loaded defaults. Save to apply.");
}

function stopShortcutRecording() {
  if (!activeShortcutEditor) {
    return;
  }
  activeShortcutEditor.button.classList.remove("recording");
  activeShortcutEditor.button.textContent = "Edit";
  activeShortcutEditor = null;
}

function startShortcutRecording(shortcutId, button) {
  if (activeShortcutEditor?.shortcutId === shortcutId) {
    stopShortcutRecording();
    setStatus("Shortcut recording cancelled.");
    return;
  }

  stopShortcutRecording();
  activeShortcutEditor = { shortcutId, button };
  button.classList.add("recording");
  button.textContent = "Recording...";
  setStatus(`Press new keys for "${SHORTCUT_LABELS[shortcutId]}". Press Escape to cancel.`);
}

async function saveShortcutImmediately(shortcutId, shortcut) {
  const response = await sendRuntimeMessage({
    type: "UPDATE_SHORTCUT",
    shortcutId,
    shortcut
  });
  if (!response?.ok) {
    throw new Error(response?.message || "Could not save shortcut.");
  }
}

async function handleShortcutRecord(event) {
  if (!activeShortcutEditor) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (event.key === "Escape") {
    stopShortcutRecording();
    setStatus("Shortcut recording cancelled.");
    return;
  }

  const shortcut = keyboardEventToShortcut(event);
  if (!shortcut) {
    return;
  }
  if (!shortcutHasModifier(shortcut)) {
    setStatus("Shortcut must include Cmd, Option, Shift, or Control.", true);
    return;
  }

  const shortcutId = activeShortcutEditor.shortcutId;
  const oldShortcut = getShortcutValue(shortcutId);
  const label = SHORTCUT_LABELS[shortcutId];
  setShortcutValue(shortcutId, shortcut);
  stopShortcutRecording();
  setStatus(`Saving "${label}"...`);
  try {
    await saveShortcutImmediately(shortcutId, shortcut);
    setStatus(`Updated "${label}" to ${formatShortcutForMac(shortcut)}.`);
  } catch (error) {
    setShortcutValue(shortcutId, oldShortcut);
    setStatus(error.message || "Could not save shortcut.", true);
  }
}

shortcutEditors.forEach((button) => {
  button.addEventListener("click", () => {
    const shortcutId = button.dataset.shortcutId;
    startShortcutRecording(shortcutId, button);
  });
});

refreshLogsBtn.addEventListener("click", () => {
  refreshLogs().catch((error) => setStatus(error.message, true));
});

exportLogsBtn.addEventListener("click", exportLogs);

clearLocalLogsBtn.addEventListener("click", () => {
  clearLogs().catch((error) => setStatus(error.message, true));
});

document.addEventListener("keydown", handleShortcutRecord, true);

form.addEventListener("submit", (event) => {
  saveSettings(event).catch((error) => setStatus(error.message, true));
});
resetBtn.addEventListener("click", resetDefaults);

Promise.all([loadSettings(), refreshLogs()])
  .then(() => {})
  .catch((error) => setStatus(error.message, true));
