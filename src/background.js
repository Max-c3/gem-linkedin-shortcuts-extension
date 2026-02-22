"use strict";

importScripts("shared.js");

const LOCAL_LOG_KEY = "observabilityLogs";
const LOCAL_LOG_LIMIT = 500;
const PROJECT_CACHE_KEY = "projectPickerCache";
const PROJECT_RECENT_USAGE_KEY = "projectRecentUsage";
const PROJECT_CACHE_TTL_MS = 5 * 60 * 1000;
const PROJECT_CACHE_LIMIT = 0;
const PROJECT_RECENT_USAGE_LIMIT = 300;
const PROJECT_QUERY_LIMIT_MAX = 20000;
const CUSTOM_FIELD_CACHE_KEY = "customFieldPickerCache";
const CUSTOM_FIELD_CACHE_TTL_MS = 10 * 60 * 1000;
const CUSTOM_FIELD_CACHE_LIMIT = 200;
let projectRefreshPromise = null;
const customFieldRefreshPromises = new Map();

function generateId() {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function redactForLog(value, depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }
  if (depth > 4) {
    return "[Truncated]";
  }
  if (typeof value === "string") {
    return value.length > 1000 ? `${value.slice(0, 1000)}...[truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => redactForLog(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/token|key|secret|authorization|password/i.test(key)) {
        out[key] = "[REDACTED]";
        continue;
      }
      out[key] = redactForLog(nested, depth + 1);
    }
    return out;
  }
  return String(value);
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("settings", (data) => {
      resolve(deepMerge(DEFAULT_SETTINGS, data.settings || {}));
    });
  });
}

function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ settings }, () => resolve());
  });
}

function normalizeSettings(input) {
  const merged = deepMerge(DEFAULT_SETTINGS, input || {});
  const normalizedShortcuts = {};
  const shortcutKeys = Object.keys(DEFAULT_SETTINGS.shortcuts || {});
  for (const key of shortcutKeys) {
    normalizedShortcuts[key] = normalizeShortcut(merged.shortcuts?.[key] || DEFAULT_SETTINGS.shortcuts[key]);
  }
  return {
    ...merged,
    shortcuts: normalizedShortcuts
  };
}

function validateShortcutMap(shortcuts) {
  const seen = new Set();
  for (const [actionId, raw] of Object.entries(shortcuts || {})) {
    const shortcut = normalizeShortcut(raw);
    if (!shortcut) {
      throw new Error(`Shortcut missing for ${actionId}.`);
    }
    if (!shortcutHasModifier(shortcut)) {
      throw new Error(`Shortcut for ${actionId} must include a modifier key.`);
    }
    if (seen.has(shortcut)) {
      throw new Error(`Duplicate shortcut: ${formatShortcutForMac(shortcut)}.`);
    }
    seen.add(shortcut);
  }
}

function broadcastSettingsToLinkedInTabs(settings) {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: ["https://www.linkedin.com/*"] }, (tabs) => {
      if (chrome.runtime.lastError || !Array.isArray(tabs) || tabs.length === 0) {
        resolve();
        return;
      }
      let remaining = tabs.length;
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: "SETTINGS_UPDATED", settings }, () => {
          remaining -= 1;
          if (remaining <= 0) {
            resolve();
          }
        });
      }
    });
  });
}

function getLocalLogs() {
  return new Promise((resolve) => {
    chrome.storage.local.get(LOCAL_LOG_KEY, (data) => {
      resolve(Array.isArray(data[LOCAL_LOG_KEY]) ? data[LOCAL_LOG_KEY] : []);
    });
  });
}

function setLocalLogs(logs) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_LOG_KEY]: logs }, () => resolve());
  });
}

async function appendLocalLog(entry) {
  const current = await getLocalLogs();
  current.push(entry);
  const trimmed = current.slice(-LOCAL_LOG_LIMIT);
  await setLocalLogs(trimmed);
}

async function clearLocalLogs() {
  await setLocalLogs([]);
}

function getFromLocalStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (data) => resolve(data[key]));
  });
}

function setInLocalStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

async function getProjectCache() {
  const cached = await getFromLocalStorage(PROJECT_CACHE_KEY);
  if (!cached || typeof cached !== "object") {
    return { fetchedAt: 0, projects: [], isComplete: false };
  }
  return {
    fetchedAt: Number(cached.fetchedAt) || 0,
    projects: Array.isArray(cached.projects) ? cached.projects : [],
    isComplete: Boolean(cached.isComplete)
  };
}

async function setProjectCache(projects, options = {}) {
  await setInLocalStorage(PROJECT_CACHE_KEY, {
    fetchedAt: Date.now(),
    projects,
    isComplete: Boolean(options.isComplete)
  });
}

function isProjectCacheFresh(cache) {
  if (!cache || !cache.fetchedAt) {
    return false;
  }
  return Date.now() - cache.fetchedAt <= PROJECT_CACHE_TTL_MS;
}

async function getProjectRecentUsage() {
  const usage = await getFromLocalStorage(PROJECT_RECENT_USAGE_KEY);
  if (!usage || typeof usage !== "object") {
    return {};
  }
  return usage;
}

async function setProjectRecentUsage(usage) {
  await setInLocalStorage(PROJECT_RECENT_USAGE_KEY, usage);
}

function getCustomFieldCacheKey(context) {
  const handle = String(context?.linkedInHandle || "").trim().toLowerCase();
  if (handle) {
    return `handle:${handle}`;
  }

  const rawUrl = String(context?.linkedinUrl || "").trim().toLowerCase();
  if (!rawUrl) {
    return "";
  }
  try {
    const parsed = new URL(rawUrl);
    parsed.search = "";
    parsed.hash = "";
    return `url:${parsed.toString().replace(/\/$/, "")}`;
  } catch (_error) {
    return `url:${rawUrl.replace(/[?#].*$/, "").replace(/\/$/, "")}`;
  }
}

function isCustomFieldCacheFresh(entry) {
  if (!entry || !entry.fetchedAt) {
    return false;
  }
  return Date.now() - Number(entry.fetchedAt) <= CUSTOM_FIELD_CACHE_TTL_MS;
}

function normalizeCustomFieldCacheEntry(entry) {
  return {
    fetchedAt: Number(entry?.fetchedAt) || 0,
    candidateId: String(entry?.candidateId || ""),
    customFields: Array.isArray(entry?.customFields) ? entry.customFields : []
  };
}

async function getCustomFieldCacheStore() {
  const data = await getFromLocalStorage(CUSTOM_FIELD_CACHE_KEY);
  if (!data || typeof data !== "object") {
    return {};
  }
  return data;
}

async function setCustomFieldCacheStore(store) {
  await setInLocalStorage(CUSTOM_FIELD_CACHE_KEY, store);
}

async function getCachedCustomFieldsForContext(context) {
  const key = getCustomFieldCacheKey(context);
  if (!key) {
    return { key: "", entry: null, isFresh: false };
  }
  const store = await getCustomFieldCacheStore();
  if (!store[key]) {
    return { key, entry: null, isFresh: false };
  }
  const entry = normalizeCustomFieldCacheEntry(store[key]);
  return {
    key,
    entry,
    isFresh: isCustomFieldCacheFresh(entry)
  };
}

async function setCachedCustomFieldsForContext(context, candidateId, customFields) {
  const key = getCustomFieldCacheKey(context);
  if (!key) {
    return;
  }
  const store = await getCustomFieldCacheStore();
  store[key] = {
    fetchedAt: Date.now(),
    candidateId: String(candidateId || ""),
    customFields: Array.isArray(customFields) ? customFields : []
  };

  const pruned = Object.entries(store)
    .sort((a, b) => (Number(b[1]?.fetchedAt) || 0) - (Number(a[1]?.fetchedAt) || 0))
    .slice(0, CUSTOM_FIELD_CACHE_LIMIT)
    .reduce((acc, [cacheKey, value]) => {
      acc[cacheKey] = value;
      return acc;
    }, {});

  await setCustomFieldCacheStore(pruned);
}

function normalizeProject(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const id = String(item.id || "").trim();
  if (!id) {
    return null;
  }
  return {
    id,
    name: String(item.name || "").trim(),
    archived: Boolean(item.archived),
    createdAt: String(item.createdAt || "").trim()
  };
}

function parseIsoDate(value) {
  if (!value) {
    return 0;
  }
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function sortProjectsForPicker(projects, usageMap, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const byId = new Map();

  for (const item of Array.isArray(projects) ? projects : []) {
    const project = normalizeProject(item);
    if (!project || project.archived) {
      continue;
    }
    if (normalizedQuery && !project.name.toLowerCase().includes(normalizedQuery)) {
      continue;
    }
    byId.set(project.id, project);
  }

  return Array.from(byId.values()).sort((a, b) => {
    const aRecent = Number(usageMap?.[a.id]?.lastAddedAtMs) || 0;
    const bRecent = Number(usageMap?.[b.id]?.lastAddedAtMs) || 0;
    if (aRecent !== bRecent) {
      return bRecent - aRecent;
    }

    const aCreatedAt = parseIsoDate(a.createdAt);
    const bCreatedAt = parseIsoDate(b.createdAt);
    if (aCreatedAt !== bCreatedAt) {
      return bCreatedAt - aCreatedAt;
    }

    return a.name.localeCompare(b.name);
  });
}

async function touchProjectRecentUsage(projectId, projectName = "") {
  const id = String(projectId || "").trim();
  if (!id) {
    return;
  }

  const usage = await getProjectRecentUsage();
  const now = Date.now();
  const previous = usage[id] || {};
  usage[id] = {
    lastAddedAtMs: now,
    lastAddedAt: new Date(now).toISOString(),
    count: (Number(previous.count) || 0) + 1,
    name: projectName || previous.name || ""
  };

  const pruned = Object.entries(usage)
    .sort((a, b) => (Number(b[1]?.lastAddedAtMs) || 0) - (Number(a[1]?.lastAddedAtMs) || 0))
    .slice(0, PROJECT_RECENT_USAGE_LIMIT)
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  await setProjectRecentUsage(pruned);
}

async function refreshProjectsFromBackend(settings, runId, limit = PROJECT_CACHE_LIMIT) {
  const actionId = ACTIONS.ADD_TO_PROJECT;
  const normalizedLimit = normalizeProjectLimit(limit);
  const data = await callBackend(
    "/api/projects/list",
    {
      query: "",
      limit: normalizedLimit
    },
    settings,
    { actionId, runId, step: "listProjects" }
  );
  const projects = Array.isArray(data?.projects) ? data.projects.map(normalizeProject).filter(Boolean) : [];
  await setProjectCache(projects, { isComplete: normalizedLimit === 0 });
  logEvent(settings, {
    event: "projects.cache.refreshed",
    actionId,
    runId,
    message: `Refreshed project cache with ${projects.length} projects.`,
    details: {
      limit: normalizedLimit
    }
  });
  return projects;
}

function ensureProjectRefresh(settings, runId, limit = PROJECT_CACHE_LIMIT) {
  if (!projectRefreshPromise) {
    projectRefreshPromise = refreshProjectsFromBackend(settings, runId, limit).finally(() => {
      projectRefreshPromise = null;
    });
  }
  return projectRefreshPromise;
}

function normalizeProjectLimit(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(raw, PROJECT_QUERY_LIMIT_MAX));
}

function normalizeLogEntry(event) {
  return {
    id: event.id || generateId(),
    timestamp: event.timestamp || new Date().toISOString(),
    level: event.level || "info",
    source: event.source || "extension.background",
    event: event.event || "event",
    actionId: event.actionId || "",
    runId: event.runId || "",
    message: event.message || "",
    link: event.link || "",
    durationMs: Number(event.durationMs) || 0,
    details: redactForLog(event.details || {})
  };
}

async function sendClientLogToBackend(settings, entry) {
  const base = (settings.backendBaseUrl || "").replace(/\/$/, "");
  if (!base) {
    return;
  }
  await fetch(`${base}/api/logs/client`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.backendSharedToken ? { "X-Backend-Token": settings.backendSharedToken } : {})
    },
    body: JSON.stringify(entry)
  });
}

function logEvent(settings, rawEvent) {
  const entry = normalizeLogEntry(rawEvent);
  appendLocalLog(entry).catch(() => {});
  if (settings?.backendBaseUrl) {
    sendClientLogToBackend(settings, entry).catch(() => {});
  }
  return entry;
}

async function fetchBackendLogs(settings, limit = 200) {
  const base = (settings.backendBaseUrl || "").replace(/\/$/, "");
  if (!base) {
    return { logs: [], error: "Missing backend URL." };
  }

  const response = await fetch(`${base}/api/logs/recent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.backendSharedToken ? { "X-Backend-Token": settings.backendSharedToken } : {})
    },
    body: JSON.stringify({ limit })
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = { ok: false, error: "Invalid backend response." };
  }

  if (!response.ok || !parsed?.ok) {
    return { logs: [], error: parsed?.error || "Could not load backend logs." };
  }

  return { logs: Array.isArray(parsed?.data?.logs) ? parsed.data.logs : [], error: "" };
}

function applyTemplate(template, vars) {
  if (!template || typeof template !== "string") {
    return "";
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = vars[key];
    if (value === undefined || value === null) {
      return "";
    }
    return String(value);
  });
}

async function callBackend(path, payload, settings, audit = {}) {
  const base = (settings.backendBaseUrl || "").replace(/\/$/, "");
  if (!base) {
    throw new Error("Missing backend base URL in extension settings.");
  }

  const startedAt = Date.now();
  logEvent(settings, {
    event: "backend.call.start",
    actionId: audit.actionId,
    runId: audit.runId,
    message: `Calling backend route ${path}`,
    link: `${base}${path}`,
    details: {
      step: audit.step || "",
      payload
    }
  });

  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(settings.backendSharedToken ? { "X-Backend-Token": settings.backendSharedToken } : {})
      },
      body: JSON.stringify({
        ...(payload || {}),
        runId: audit.runId || "",
        actionId: audit.actionId || ""
      })
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = `Could not reach backend (${base}). Start backend with: cd /Users/maximilian/coding/gem-linkedin-shortcuts-extension/backend && npm start`;
    logEvent(settings, {
      level: "error",
      event: "backend.call.error",
      actionId: audit.actionId,
      runId: audit.runId,
      message,
      link: `${base}${path}`,
      durationMs,
      details: {
        step: audit.step || "",
        error: error?.message || "Network request failed."
      }
    });
    throw new Error(message);
  }

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = { ok: false, error: text || "Invalid backend response" };
  }

  const durationMs = Date.now() - startedAt;
  if (!response.ok || !parsed?.ok) {
    logEvent(settings, {
      level: "error",
      event: "backend.call.error",
      actionId: audit.actionId,
      runId: audit.runId,
      message: parsed?.error || parsed?.message || "Backend request failed.",
      link: `${base}${path}`,
      durationMs,
      details: {
        step: audit.step || "",
        status: response.status,
        response: parsed
      }
    });
    throw new Error(parsed?.error || parsed?.message || "Backend request failed.");
  }

  logEvent(settings, {
    event: "backend.call.success",
    actionId: audit.actionId,
    runId: audit.runId,
    message: `Backend route succeeded: ${path}`,
    link: `${base}${path}`,
    durationMs,
    details: {
      step: audit.step || "",
      requestId: parsed.requestId || ""
    }
  });

  return parsed.data;
}

function splitProfileName(fullName) {
  const clean = (fullName || "").trim();
  if (!clean) {
    return { firstName: "", lastName: "" };
  }
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

async function ensureCandidate(settings, context, audit) {
  if (!context.linkedInHandle) {
    throw new Error("Could not determine LinkedIn handle from current profile.");
  }

  const found = await callBackend(
    "/api/candidates/find-by-linkedin",
    { linkedInHandle: context.linkedInHandle },
    settings,
    { ...audit, step: "findCandidate" }
  );
  if (found?.candidate?.id) {
    logEvent(settings, {
      event: "candidate.found",
      actionId: audit.actionId,
      runId: audit.runId,
      message: `Candidate already exists: ${found.candidate.id}`,
      link: context.linkedinUrl,
      details: {
        candidateId: found.candidate.id,
        linkedInHandle: context.linkedInHandle
      }
    });
    return found.candidate;
  }

  const names = splitProfileName(context.profileName);
  const created = await callBackend(
    "/api/candidates/create-from-linkedin",
    {
      linkedInHandle: context.linkedInHandle,
      profileUrl: context.linkedinUrl,
      firstName: names.firstName,
      lastName: names.lastName,
      createdByUserId: context.createdByUserId || settings.createdByUserId
    },
    settings,
    { ...audit, step: "createCandidate" }
  );

  if (!created?.candidate?.id) {
    throw new Error("Gem did not return a candidate id.");
  }

  logEvent(settings, {
    event: "candidate.created",
    actionId: audit.actionId,
    runId: audit.runId,
    message: `Created candidate ${created.candidate.id}`,
    link: context.linkedinUrl,
    details: {
      candidateId: created.candidate.id,
      linkedInHandle: context.linkedInHandle
    }
  });
  return created.candidate;
}

async function runAction(actionId, context, settings, meta = {}) {
  const runId = meta.runId || generateId();
  const source = meta.source || "unknown";
  const audit = { actionId, runId };

  logEvent(settings, {
    event: "action.requested",
    actionId,
    runId,
    source: `extension.${source}`,
    message: `Action requested: ${actionId}`,
    link: context.linkedinUrl || "",
    details: {
      source,
      linkedInHandle: context.linkedInHandle || "",
      profileName: context.profileName || ""
    }
  });

  if (!settings.enabled) {
    const message = "Extension is disabled in settings.";
    logEvent(settings, {
      level: "warn",
      event: "action.rejected",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: context.linkedinUrl || ""
    });
    return { ok: false, message, runId };
  }
  if (!settings.backendBaseUrl) {
    const message = "Missing backend base URL. Open extension options to set it.";
    logEvent(settings, {
      level: "warn",
      event: "action.rejected",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: context.linkedinUrl || ""
    });
    return { ok: false, message, runId };
  }
  if (!context.linkedinUrl) {
    const message = "No LinkedIn profile URL detected.";
    logEvent(settings, {
      level: "warn",
      event: "action.rejected",
      actionId,
      runId,
      source: `extension.${source}`,
      message
    });
    return { ok: false, message, runId };
  }

  if (actionId === ACTIONS.ADD_PROSPECT) {
    const candidate = await ensureCandidate(settings, context, audit);
    const message = `Candidate ready in Gem (${candidate.id}).`;
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: candidate.weblink || context.linkedinUrl,
      details: { candidateId: candidate.id }
    });
    return { ok: true, message, runId, link: candidate.weblink || "" };
  }

  const candidate = await ensureCandidate(settings, context, audit);

  if (actionId === ACTIONS.ADD_TO_PROJECT) {
    const projectId = context.projectId || settings.defaultProjectId;
    const userId = context.createdByUserId || settings.createdByUserId || "";
    if (!projectId) {
      const message = "Missing project ID. Set a default or enter one at runtime.";
      logEvent(settings, {
        level: "warn",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        link: context.linkedinUrl
      });
      return { ok: false, message, runId };
    }
    await callBackend(
      "/api/projects/add-candidate",
      {
        projectId,
        candidateId: candidate.id,
        userId
      },
      settings,
      { ...audit, step: "addToProject" }
    );
    await touchProjectRecentUsage(projectId, context.projectName || "");
    const message = `Candidate added to project ${projectId}.`;
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: candidate.weblink || context.linkedinUrl,
      details: {
        candidateId: candidate.id,
        projectId,
        userId
      }
    });
    return { ok: true, message, runId, link: candidate.weblink || "" };
  }

  if (actionId === ACTIONS.OPEN_ACTIVITY) {
    const details = await callBackend(
      "/api/candidates/get",
      { candidateId: candidate.id },
      settings,
      { ...audit, step: "getCandidate" }
    );
    const directLink = details?.candidate?.weblink || "";
    const fallback = applyTemplate(settings.activityUrlTemplate, { candidateId: candidate.id });
    const url = directLink || fallback;

    if (!url) {
      const message = "No activity link available. Set Activity URL template in options if needed.";
      logEvent(settings, {
        level: "warn",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        details: { candidateId: candidate.id }
      });
      return {
        ok: false,
        message,
        runId
      };
    }
    await chrome.tabs.create({ url });
    const message = "Opened profile in Gem.";
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: url,
      details: { candidateId: candidate.id }
    });
    return { ok: true, message, runId, link: url };
  }

  if (actionId === ACTIONS.SET_CUSTOM_FIELD) {
    const customFieldId = context.customFieldId || settings.customFieldId;
    const customFieldValue =
      context.customFieldValue !== undefined && context.customFieldValue !== null
        ? context.customFieldValue
        : settings.customFieldValue;
    const customFieldOptionId = context.customFieldOptionId || "";
    const customFieldValueType = context.customFieldValueType || "";
    if (!customFieldId) {
      const message = "Missing custom field ID.";
      logEvent(settings, {
        level: "warn",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        link: context.linkedinUrl
      });
      return { ok: false, message, runId };
    }

    await callBackend(
      "/api/candidates/set-custom-field",
      {
        candidateId: candidate.id,
        customFieldId,
        value: customFieldValue,
        customFieldOptionId,
        customFieldValueType
      },
      settings,
      { ...audit, step: "setCustomField" }
    );
    const message = "Custom field updated for candidate.";
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: candidate.weblink || context.linkedinUrl,
      details: {
        candidateId: candidate.id,
        customFieldId
      }
    });
    return { ok: true, message, runId, link: candidate.weblink || "" };
  }

  if (actionId === ACTIONS.SEND_SEQUENCE) {
    const sequenceId = context.sequenceId || settings.defaultSequenceId;
    if (!sequenceId) {
      const message = "Missing sequence ID. Set a default or enter one at runtime.";
      logEvent(settings, {
        level: "warn",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        link: context.linkedinUrl
      });
      return { ok: false, message, runId };
    }

    await callBackend("/api/sequences/get", { sequenceId }, settings, { ...audit, step: "getSequence" });

    const composeUrl = applyTemplate(settings.sequenceComposeUrlTemplate, {
      sequenceId,
      candidateId: candidate.id
    });
    if (composeUrl) {
      await chrome.tabs.create({ url: composeUrl });
    }
    const message = "Opened sequence in Gem. Complete send + activate in Gem UI.";
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: composeUrl || "",
      details: {
        candidateId: candidate.id,
        sequenceId
      }
    });
    return {
      ok: true,
      message,
      runId,
      link: composeUrl || ""
    };
  }

  const message = `Unknown action: ${actionId}`;
  logEvent(settings, {
    level: "error",
    event: "action.unknown",
    actionId,
    runId,
    source: `extension.${source}`,
    message,
    link: context.linkedinUrl || ""
  });
  return { ok: false, message, runId };
}

async function refreshCustomFieldsForContext(settings, context, runId) {
  const actionId = ACTIONS.SET_CUSTOM_FIELD;
  const audit = { actionId, runId };
  const candidate = await ensureCandidate(settings, context, audit);
  const data = await callBackend(
    "/api/custom-fields/list",
    {
      candidateId: candidate.id,
      limit: 0
    },
    settings,
    { actionId, runId, step: "listCustomFields" }
  );
  const customFields = Array.isArray(data?.customFields) ? data.customFields : [];
  await setCachedCustomFieldsForContext(context, candidate.id, customFields);
  logEvent(settings, {
    event: "custom_fields.cache.refreshed",
    actionId,
    runId,
    message: `Refreshed custom field cache with ${customFields.length} fields.`,
    details: {
      candidateId: candidate.id
    }
  });
  return {
    candidateId: candidate.id,
    customFields,
    fromCache: false,
    stale: false
  };
}

async function prefetchCustomFieldsForContext(settings, context, runId) {
  const actionId = ACTIONS.SET_CUSTOM_FIELD;
  const audit = { actionId, runId };
  const handle = String(context?.linkedInHandle || "").trim();
  let candidateId = "";

  if (handle) {
    const found = await callBackend(
      "/api/candidates/find-by-linkedin",
      { linkedInHandle: handle },
      settings,
      { ...audit, step: "findCandidateForPrefetch" }
    );
    candidateId = String(found?.candidate?.id || "");
  }

  const data = await callBackend(
    "/api/custom-fields/list",
    {
      candidateId,
      limit: 0
    },
    settings,
    { ...audit, step: "prefetchCustomFields" }
  );
  const customFields = Array.isArray(data?.customFields) ? data.customFields : [];
  await setCachedCustomFieldsForContext(context, candidateId, customFields);

  logEvent(settings, {
    event: "custom_fields.cache.prefetched",
    actionId,
    runId,
    message: `Prefetched ${customFields.length} custom fields.`,
    details: {
      candidateId
    }
  });

  return {
    candidateId,
    customFields
  };
}

function ensureCustomFieldRefresh(settings, context, runId) {
  const key = getCustomFieldCacheKey(context) || `fallback:${runId}`;
  const existing = customFieldRefreshPromises.get(key);
  if (existing) {
    return existing;
  }
  const promise = refreshCustomFieldsForContext(settings, context, runId).finally(() => {
    customFieldRefreshPromises.delete(key);
  });
  customFieldRefreshPromises.set(key, promise);
  return promise;
}

async function listCustomFieldsForContext(settings, context, runId, options = {}) {
  const preferCache = Boolean(options.preferCache);
  const refreshInBackground = Boolean(options.refreshInBackground);
  const forceRefresh = Boolean(options.forceRefresh);
  const actionId = ACTIONS.SET_CUSTOM_FIELD;

  const cached = await getCachedCustomFieldsForContext(context);
  if (!forceRefresh && cached.entry) {
    if (preferCache || cached.isFresh) {
      if (!cached.isFresh && refreshInBackground) {
        ensureCustomFieldRefresh(settings, context, runId).catch(() => {});
      }
      logEvent(settings, {
        event: "custom_fields.list.loaded",
        actionId,
        runId,
        message: `Loaded ${cached.entry.customFields.length} custom fields from cache.`,
        details: {
          candidateId: cached.entry.candidateId,
          stale: !cached.isFresh
        }
      });
      return {
        candidateId: cached.entry.candidateId,
        customFields: cached.entry.customFields,
        fromCache: true,
        stale: !cached.isFresh
      };
    }
  }

  const refreshed = await ensureCustomFieldRefresh(settings, context, runId);
  logEvent(settings, {
    event: "custom_fields.list.loaded",
    actionId,
    runId,
    message: `Loaded ${refreshed.customFields.length} custom fields from backend.`,
    details: {
      candidateId: refreshed.candidateId,
      stale: false
    }
  });
  return refreshed;
}

async function listActivityFeedForContext(settings, context, runId, limit = 120) {
  const actionId = ACTIONS.VIEW_ACTIVITY_FEED;
  const audit = { actionId, runId };
  const candidate = await ensureCandidate(settings, context, audit);
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 120, 500));
  const data = await callBackend(
    "/api/candidates/activity-feed",
    {
      candidateId: candidate.id,
      limit: normalizedLimit
    },
    settings,
    { ...audit, step: "listActivityFeed" }
  );

  const activities = Array.isArray(data?.activities) ? data.activities : [];
  const candidateData = data?.candidate && typeof data.candidate === "object" ? data.candidate : candidate;
  logEvent(settings, {
    event: "candidate.activity_feed.loaded",
    actionId,
    runId,
    message: `Loaded ${activities.length} activity items for candidate.`,
    details: {
      candidateId: candidate.id
    }
  });
  return {
    candidate: candidateData,
    activities
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "GET_SETTINGS") {
    getSettings().then((settings) => sendResponse({ ok: true, settings }));
    return true;
  }

  if (message.type === "SAVE_SETTINGS") {
    Promise.resolve()
      .then(async () => {
        const normalized = normalizeSettings(message.settings);
        validateShortcutMap(normalized.shortcuts);
        await saveSettings(normalized);
        return normalized;
      })
      .then(async () => {
        const settings = await getSettings();
        logEvent(settings, {
          event: "settings.saved",
          source: "extension.background",
          message: "Settings updated from extension UI."
        });
        await broadcastSettingsToLinkedInTabs(settings);
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "UPDATE_SHORTCUT") {
    getSettings()
      .then(async (settings) => {
        const shortcutId = String(message.shortcutId || "").trim();
        const validIds = Object.keys(DEFAULT_SETTINGS.shortcuts || {});
        if (!validIds.includes(shortcutId)) {
          throw new Error("Unknown shortcut action.");
        }

        const shortcut = normalizeShortcut(message.shortcut || "");
        if (!shortcut) {
          throw new Error("Shortcut is required.");
        }
        if (!shortcutHasModifier(shortcut)) {
          throw new Error("Shortcut must include a modifier key.");
        }

        const updated = normalizeSettings({
          ...settings,
          shortcuts: {
            ...(settings.shortcuts || {}),
            [shortcutId]: shortcut
          }
        });
        validateShortcutMap(updated.shortcuts);
        await saveSettings(updated);
        await broadcastSettingsToLinkedInTabs(updated);
        logEvent(updated, {
          event: "settings.shortcut.updated",
          source: "extension.background",
          actionId: shortcutId,
          message: `Shortcut updated for ${shortcutId}.`,
          details: {
            shortcut: formatShortcutForMac(shortcut)
          }
        });
        sendResponse({ ok: true, settings: updated });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "RUN_ACTION") {
    getSettings()
      .then(async (settings) => {
        try {
          return await runAction(message.actionId, message.context || {}, settings, message.meta || {});
        } catch (error) {
          logEvent(settings, {
            level: "error",
            event: "action.exception",
            actionId: message.actionId,
            runId: message?.meta?.runId || "",
            source: `extension.${message?.meta?.source || "unknown"}`,
            message: error.message || "Unexpected action error.",
            link: message?.context?.linkedinUrl || "",
            details: {
              stack: error.stack || ""
            }
          });
          return { ok: false, message: error.message || "Action failed.", runId: message?.meta?.runId || "" };
        }
      })
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "LIST_PROJECTS") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const actionId = ACTIONS.ADD_TO_PROJECT;
        const query = String(message.query || "").trim();
        const limit = normalizeProjectLimit(message.limit);
        const cache = await getProjectCache();
        let projects = Array.isArray(cache.projects) ? cache.projects : [];
        const hadCache = projects.length > 0;
        const cacheComplete = Boolean(cache.isComplete);
        const cacheFresh = isProjectCacheFresh(cache);

        if (projects.length === 0) {
          projects = await ensureProjectRefresh(settings, runId, limit);
        } else if (!cacheFresh || !cacheComplete) {
          ensureProjectRefresh(settings, runId, limit).catch(() => {});
        }

        const usageMap = await getProjectRecentUsage();
        let sorted = sortProjectsForPicker(projects, usageMap, query);

        if (query && (sorted.length === 0 || !cacheComplete)) {
          const refreshed = await ensureProjectRefresh(settings, runId, limit);
          sorted = sortProjectsForPicker(refreshed, usageMap, query);
        }
        const trimmed = limit > 0 ? sorted.slice(0, limit) : sorted;
        logEvent(settings, {
          event: "projects.list.loaded",
          actionId,
          runId,
          message: `Loaded ${trimmed.length} projects for picker.`,
          details: {
            query,
            limit,
            cacheCount: projects.length,
            fromCache: hadCache,
            cacheFresh,
            cacheComplete
          }
        });
        sendResponse({ ok: true, projects: trimmed, runId });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "LIST_CUSTOM_FIELDS_FOR_CONTEXT") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const context = message.context || {};
        const data = await listCustomFieldsForContext(settings, context, runId, {
          preferCache: Boolean(message.preferCache),
          refreshInBackground: message.refreshInBackground !== false,
          forceRefresh: Boolean(message.forceRefresh)
        });
        sendResponse({
          ok: true,
          runId,
          candidateId: data.candidateId,
          customFields: data.customFields,
          fromCache: Boolean(data.fromCache),
          stale: Boolean(data.stale)
        });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "LIST_ACTIVITY_FEED_FOR_CONTEXT") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const context = message.context || {};
        const data = await listActivityFeedForContext(settings, context, runId, message.limit);
        sendResponse({
          ok: true,
          runId,
          candidate: data.candidate,
          activities: data.activities
        });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "PREFETCH_CUSTOM_FIELDS_FOR_CONTEXT") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const context = message.context || {};
        if (!context.linkedinUrl && !context.linkedInHandle) {
          sendResponse({ ok: true, skipped: true, reason: "missing_context" });
          return;
        }

        const cached = await getCachedCustomFieldsForContext(context);
        if (cached.entry && cached.isFresh) {
          sendResponse({ ok: true, skipped: true, reason: "cache_fresh" });
          return;
        }

        await prefetchCustomFieldsForContext(settings, context, runId);
        sendResponse({ ok: true, skipped: false });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "PREFETCH_PROJECTS") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const limit = normalizeProjectLimit(message.limit);
        const cache = await getProjectCache();
        if (cache.projects.length > 0 && isProjectCacheFresh(cache) && cache.isComplete) {
          sendResponse({ ok: true, skipped: true, reason: "cache_fresh" });
          return;
        }
        await ensureProjectRefresh(settings, runId, limit);
        sendResponse({ ok: true, skipped: false });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "LOG_EVENT") {
    getSettings()
      .then((settings) => {
        const payload = message.payload || {};
        logEvent(settings, payload);
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "GET_OBSERVABILITY_LOGS") {
    getSettings()
      .then(async (settings) => {
        const [localLogs, backendResult] = await Promise.all([
          getLocalLogs(),
          fetchBackendLogs(settings, message.limit || 200)
        ]);
        sendResponse({
          ok: true,
          localLogs,
          backendLogs: backendResult.logs,
          backendError: backendResult.error || ""
        });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "CLEAR_LOCAL_LOGS") {
    clearLocalLogs()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  return false;
});
