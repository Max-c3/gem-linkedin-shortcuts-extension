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
const SEQUENCE_CACHE_KEY = "sequencePickerCache";
const SEQUENCE_RECENT_USAGE_KEY = "sequenceRecentUsage";
const SEQUENCE_CACHE_TTL_MS = 5 * 60 * 1000;
const SEQUENCE_CACHE_LIMIT = 0;
const SEQUENCE_RECENT_USAGE_LIMIT = 300;
const SEQUENCE_QUERY_LIMIT_MAX = 20000;
const ASHBY_JOBS_QUERY_LIMIT_MAX = 5000;
const ASHBY_JOB_RECENT_USAGE_KEY = "ashbyJobRecentUsage";
const ASHBY_JOB_RECENT_USAGE_LIMIT = 300;
const CUSTOM_FIELD_CACHE_KEY = "customFieldPickerCache";
const CUSTOM_FIELD_CACHE_TTL_MS = 10 * 60 * 1000;
const CUSTOM_FIELD_CACHE_LIMIT = 200;
const CANDIDATE_EMAIL_CACHE_KEY = "candidateEmailPickerCache";
const CANDIDATE_EMAIL_CACHE_TTL_MS = 10 * 60 * 1000;
const CANDIDATE_EMAIL_CACHE_LIMIT = 200;
const BACKEND_REQUEST_TIMEOUT_MS = 25 * 1000;
const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1";
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_THREAD_SEARCH_MAX_RESULTS = 8;
const GMAIL_SYSTEM_EMAILS = new Set(["no-reply@gem.com", "noreply@gem.com"]);
const SHARED_RUNTIME_FILE = "src/shared.js";
const CONTENT_RUNTIME_FILES = Object.freeze(["src/content.js"]);
const CANDIDATE_RESOLUTION_TTL_MS = 2 * 60 * 1000;
const CANDIDATE_RESOLUTION_NEGATIVE_TTL_MS = 5 * 60 * 1000;
const CANDIDATE_RESOLUTION_CACHE_LIMIT = 300;
const ORG_DEFAULTS_PATH = "src/org-defaults.json";
const DO_NOT_CONTACT_PROJECT_URL = "https://www.gem.com/projects/DO-NOT-CONTACT--UHJvamVjdDoxMzc2Mjcw";
const DO_NOT_CONTACT_PROJECT_ID = (() => {
  try {
    const parsed = new URL(DO_NOT_CONTACT_PROJECT_URL);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] !== "projects") {
      return "";
    }
    const rawSegment = String(segments[1] || "").trim();
    if (!rawSegment) {
      return "";
    }
    const parts = rawSegment.split("--");
    return String(parts[parts.length - 1] || "").trim();
  } catch (_error) {
    return "";
  }
})();
const ORG_DEFAULT_SETTINGS_KEYS = [
  "backendBaseUrl",
  "backendSharedToken",
  "createdByUserId",
  "createdByUserEmail",
  "defaultProjectId",
  "defaultSequenceId",
  "customFieldId",
  "customFieldValue",
  "activityUrlTemplate",
  "sequenceComposeUrlTemplate"
];
let projectRefreshPromise = null;
let projectCacheGeneration = 0;
let sequenceRefreshPromise = null;
const customFieldRefreshPromises = new Map();
const candidateEmailRefreshPromises = new Map();
const candidateResolutionCache = new Map();
let orgDefaultsPromise = null;
let orgDefaultsBootstrapPromise = null;
let orgDefaultsBootstrapped = false;
let cachedSettingsValue = null;
let cachedSettingsPromise = null;
let localLogsCache = null;

function cloneSettingsForReturn(settings) {
  return normalizeSettings(settings || {});
}

function setSettingsCache(settings) {
  cachedSettingsValue = cloneSettingsForReturn(settings);
  cachedSettingsPromise = Promise.resolve(cachedSettingsValue);
}

function invalidateSettingsCache() {
  cachedSettingsValue = null;
  cachedSettingsPromise = null;
}

function persistSettingsWithoutValidation(settings) {
  const normalized = normalizeSettings(settings);
  setSettingsCache(normalized);
  return new Promise((resolve) => {
    chrome.storage.sync.set({ settings: normalized }, () => resolve(normalized));
  });
}

function getLegacyGemStatusDisplayModeFromSettings(settings = {}, fallbackEnabled = true) {
  const baseline = isPlainObject(settings) ? settings : {};
  const hasExplicitMode = Object.prototype.hasOwnProperty.call(baseline, "gemStatusDisplayMode");
  const rawMode = hasExplicitMode ? baseline.gemStatusDisplayMode : undefined;
  const rawValue = String(rawMode || "").trim();
  if (rawValue === GEM_STATUS_DISPLAY_MODES.STATUS_ONLY || rawValue === "frameAndStatus") {
    return GEM_STATUS_DISPLAY_MODES.STATUS_ONLY;
  }
  if (rawValue === GEM_STATUS_DISPLAY_MODES.OFF || rawMode === false) {
    return GEM_STATUS_DISPLAY_MODES.OFF;
  }
  if (Object.prototype.hasOwnProperty.call(baseline, "showGemStatusBadge")) {
    return baseline.showGemStatusBadge === false ? GEM_STATUS_DISPLAY_MODES.OFF : GEM_STATUS_DISPLAY_MODES.STATUS_ONLY;
  }
  return fallbackEnabled ? GEM_STATUS_DISPLAY_MODES.STATUS_ONLY : GEM_STATUS_DISPLAY_MODES.OFF;
}

function needsLegacyGemStatusSettingsMigration(settings) {
  if (!isPlainObject(settings)) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(settings, "showGemStatusBadge")) {
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(settings, "gemStatusDisplayMode")) {
    return false;
  }
  const rawMode = settings.gemStatusDisplayMode;
  return rawMode !== normalizeGemStatusDisplayMode(rawMode, true);
}

function migrateLegacyGemStatusSettings(settings) {
  const baseline = isPlainObject(settings) ? settings : {};
  if (!needsLegacyGemStatusSettingsMigration(baseline)) {
    return normalizeSettings(baseline);
  }
  const { showGemStatusBadge: _legacyShowGemStatusBadge, ...rest } = baseline;
  return normalizeSettings({
    ...rest,
    gemStatusDisplayMode: getLegacyGemStatusDisplayModeFromSettings(baseline, true)
  });
}

async function getCanonicalStoredSyncSettings() {
  const stored = await getStoredSyncSettings();
  const rawSettings = isPlainObject(stored) ? stored : {};
  if (!needsLegacyGemStatusSettingsMigration(rawSettings)) {
    return {
      rawSettings,
      settings: normalizeSettings(rawSettings),
      migrated: false
    };
  }

  const migratedSettings = migrateLegacyGemStatusSettings(rawSettings);
  await persistSettingsWithoutValidation(migratedSettings);
  return {
    rawSettings,
    settings: migratedSettings,
    migrated: true
  };
}

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

async function getSettings() {
  await ensureOrgDefaultsBootstrapped("getSettings");
  if (cachedSettingsValue) {
    return cloneSettingsForReturn(cachedSettingsValue);
  }
  if (!cachedSettingsPromise) {
    cachedSettingsPromise = getCanonicalStoredSyncSettings().then(({ settings }) => {
      cachedSettingsValue = settings;
      return settings;
    });
  }
  const settings = await cachedSettingsPromise;
  return cloneSettingsForReturn(settings);
}

function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  validateBackendBaseUrlOrThrow(normalized.backendBaseUrl);
  normalized.localDevelopmentMode = isLocalhostBackendUrl(normalized.backendBaseUrl);
  setSettingsCache(normalized);
  return new Promise((resolve) => {
    chrome.storage.sync.set({ settings: normalized }, () => resolve());
  });
}

function getStoredSyncSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("settings", (data) => resolve(data.settings || {}));
  });
}

function listLinkedInTabsForStatusSync() {
  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve(Array.isArray(tabs) ? tabs : []);
    });
  });
}

function notifyLinkedInStatusChanged(context = {}, runId = "") {
  listLinkedInTabsForStatusSync()
    .then((tabs) => {
      tabs.forEach((tab) => {
        const tabId = Number(tab?.id);
        if (!Number.isInteger(tabId) || tabId < 0) {
          return;
        }
        chrome.tabs.sendMessage(
          tabId,
          {
            type: "GEM_STATUS_MAY_HAVE_CHANGED",
            runId: runId || generateId(),
            context: context && typeof context === "object" ? context : {}
          },
          () => {
            if (chrome.runtime.lastError) {
              // Ignore tabs without active content scripts.
            }
          }
        );
      });
    })
    .catch(() => {});
}

function isLocalhostBackendUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return true;
  }
  try {
    const parsed = new URL(value);
    const host = String(parsed.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  } catch (_error) {
    return false;
  }
}

function normalizeOrgDefaults(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const normalized = {};
  for (const key of ORG_DEFAULT_SETTINGS_KEYS) {
    if (typeof raw[key] === "string") {
      normalized[key] = raw[key].trim();
    }
  }

  const inputShortcuts = raw.shortcuts && typeof raw.shortcuts === "object" ? raw.shortcuts : {};
  const normalizedShortcuts = {};
  for (const actionId of SHORTCUT_IDS) {
    const shortcut = normalizeShortcut(inputShortcuts[actionId] || "");
    if (shortcut) {
      normalizedShortcuts[actionId] = shortcut;
    }
  }
  if (Object.keys(normalizedShortcuts).length > 0) {
    normalized.shortcuts = normalizedShortcuts;
  }

  return normalized;
}

async function loadOrgDefaults() {
  if (orgDefaultsPromise) {
    return orgDefaultsPromise;
  }
  orgDefaultsPromise = (async () => {
    const url = chrome.runtime.getURL(ORG_DEFAULTS_PATH);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const raw = await response.json();
    return normalizeOrgDefaults(raw);
  })().catch(() => null);
  return orgDefaultsPromise;
}

function mergeSettingsWithOrgDefaults(settings, orgDefaults, storedSettings = {}) {
  const next = normalizeSettings(settings);
  if (!orgDefaults || typeof orgDefaults !== "object") {
    return { changed: false, settings: next };
  }

  let changed = false;
  const storedBackendBaseUrl = String(storedSettings.backendBaseUrl || "").trim();
  const hasStoredBackendBaseUrl =
    Object.prototype.hasOwnProperty.call(storedSettings, "backendBaseUrl") &&
    storedBackendBaseUrl !== "";
  const shouldReplaceStoredBackendBaseUrl =
    hasStoredBackendBaseUrl &&
    (!isAllowedBackendBaseUrl(storedBackendBaseUrl) ||
      (isLocalhostBackendUrl(storedBackendBaseUrl) && !Boolean(storedSettings.localDevelopmentMode)));
  const orgBackendBaseUrl = String(orgDefaults.backendBaseUrl || "").trim();
  if (
    orgBackendBaseUrl &&
    ((shouldReplaceStoredBackendBaseUrl && next.backendBaseUrl !== orgBackendBaseUrl) ||
      (!hasStoredBackendBaseUrl && isLocalhostBackendUrl(next.backendBaseUrl)))
  ) {
    next.backendBaseUrl = orgBackendBaseUrl;
    next.localDevelopmentMode = false;
    changed = true;
  }

  const hasStoredBackendToken = Object.prototype.hasOwnProperty.call(storedSettings, "backendSharedToken");
  const orgBackendToken = String(orgDefaults.backendSharedToken || "").trim();
  if (orgBackendToken && !hasStoredBackendToken && !String(next.backendSharedToken || "").trim()) {
    next.backendSharedToken = orgBackendToken;
    changed = true;
  }

  const fillIfMissingKeys = ORG_DEFAULT_SETTINGS_KEYS.filter(
    (key) => key !== "backendBaseUrl" && key !== "backendSharedToken"
  );
  for (const key of fillIfMissingKeys) {
    const currentValue = String(next[key] || "").trim();
    const orgValue = String(orgDefaults[key] || "").trim();
    if (!orgValue) {
      continue;
    }
    if (!currentValue) {
      next[key] = orgValue;
      changed = true;
    }
  }

  const orgShortcuts = orgDefaults.shortcuts && typeof orgDefaults.shortcuts === "object" ? orgDefaults.shortcuts : {};
  const mergedShortcuts = { ...(next.shortcuts || {}) };
  for (const actionId of SHORTCUT_IDS) {
    const orgShortcut = normalizeShortcut(orgShortcuts[actionId] || "");
    if (!orgShortcut) {
      continue;
    }
    const currentShortcut = normalizeShortcut(mergedShortcuts[actionId] || "");
    const defaultShortcut = normalizeShortcut(DEFAULT_SHORTCUTS[actionId] || "");
    if (!currentShortcut || currentShortcut === defaultShortcut) {
      if (currentShortcut !== orgShortcut) {
        mergedShortcuts[actionId] = orgShortcut;
        changed = true;
      }
    }
  }

  if (changed) {
    next.shortcuts = mergedShortcuts;
  }

  return { changed, settings: normalizeSettings(next) };
}

async function bootstrapOrgDefaults(reason = "runtime") {
  const orgDefaults = await loadOrgDefaults();
  if (!orgDefaults) {
    return { applied: false, reason: "missing_or_invalid_defaults_file" };
  }
  const { rawSettings: storedSettings, settings: current } = await getCanonicalStoredSyncSettings();
  const merged = mergeSettingsWithOrgDefaults(current, orgDefaults, storedSettings);
  if (!merged.changed) {
    return { applied: false, reason: "already_configured" };
  }
  await saveSettings(merged.settings);
  logEvent(merged.settings, {
    event: "settings.org_defaults.applied",
    source: "extension.background",
    message: "Applied org defaults for extension setup.",
    details: {
      reason,
      orgDefaultsPath: ORG_DEFAULTS_PATH,
      backendBaseUrl: merged.settings.backendBaseUrl || "",
      hasBackendSharedToken: Boolean(String(merged.settings.backendSharedToken || "").trim())
    }
  });
  return { applied: true, reason };
}

function ensureOrgDefaultsBootstrapped(reason = "runtime") {
  if (orgDefaultsBootstrapped) {
    return Promise.resolve();
  }
  if (orgDefaultsBootstrapPromise) {
    return orgDefaultsBootstrapPromise;
  }
  orgDefaultsBootstrapPromise = bootstrapOrgDefaults(reason)
    .catch((error) => {
      const fallback = normalizeSettings(DEFAULT_SETTINGS);
      logEvent(fallback, {
        level: "warn",
        event: "settings.org_defaults.failed",
        source: "extension.background",
        message: "Could not apply org defaults.",
        details: {
          reason,
          error: error?.message || String(error || "unknown")
        }
      });
    })
    .finally(() => {
      orgDefaultsBootstrapped = true;
      orgDefaultsBootstrapPromise = null;
    });
  return orgDefaultsBootstrapPromise;
}

function normalizeSettings(input) {
  const merged = deepMerge(DEFAULT_SETTINGS, input || {});
  const normalizedShortcuts = {};
  for (const key of SHORTCUT_IDS) {
    normalizedShortcuts[key] = normalizeShortcut(merged.shortcuts?.[key] || DEFAULT_SHORTCUTS[key]);
  }
  const { showGemStatusBadge: _legacyShowGemStatusBadge, ...rest } = merged;
  const normalizedGemStatusDisplayMode = getGemStatusDisplayModeFromSettings(merged, true);
  return {
    ...rest,
    gemStatusDisplayMode: normalizedGemStatusDisplayMode,
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
    if (!shortcutCanOmitModifier(actionId) && !shortcutHasModifier(shortcut)) {
      throw new Error(`Shortcut for ${actionId} must include a modifier key.`);
    }
    if (seen.has(shortcut)) {
      throw new Error(`Duplicate shortcut: ${formatShortcutForMac(shortcut)}.`);
    }
    seen.add(shortcut);
  }
}

function validateBackendBaseUrlOrThrow(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    throw new Error("Backend base URL is required.");
  }
  if (!isAllowedBackendBaseUrl(value)) {
    throw new Error(`Backend base URL must use one of: ${formatAllowedBackendOriginsForDisplay()}`);
  }
}

function getLocalLogs() {
  if (Array.isArray(localLogsCache)) {
    return Promise.resolve(localLogsCache.slice());
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(LOCAL_LOG_KEY, (data) => {
      localLogsCache = Array.isArray(data[LOCAL_LOG_KEY]) ? data[LOCAL_LOG_KEY] : [];
      resolve(localLogsCache.slice());
    });
  });
}

function setLocalLogs(logs) {
  localLogsCache = Array.isArray(logs) ? logs.slice() : [];
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_LOG_KEY]: localLogsCache }, () => resolve());
  });
}

async function appendLocalLog(entry) {
  const current = Array.isArray(localLogsCache) ? localLogsCache.slice() : await getLocalLogs();
  const trimmed = current.concat(entry).slice(-LOCAL_LOG_LIMIT);
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

function bumpProjectCacheGeneration() {
  projectCacheGeneration += 1;
  return projectCacheGeneration;
}

async function upsertProjectCache(project, options = {}) {
  const normalized = normalizeProject(project);
  if (!normalized) {
    return null;
  }

  const mutationGeneration = bumpProjectCacheGeneration();
  const cache = await getProjectCache();
  const byId = new Map();
  for (const item of Array.isArray(cache.projects) ? cache.projects : []) {
    const existing = normalizeProject(item);
    if (!existing) {
      continue;
    }
    byId.set(existing.id, existing);
  }

  const existing = byId.get(normalized.id) || null;
  byId.set(normalized.id, {
    ...existing,
    ...normalized,
    createdAt: normalized.createdAt || existing?.createdAt || String(options.createdAt || new Date().toISOString())
  });

  const nextIsComplete = Object.prototype.hasOwnProperty.call(options, "isComplete")
    ? Boolean(options.isComplete)
    : Boolean(cache.isComplete);
  const projects = Array.from(byId.values());
  await setProjectCache(projects, { isComplete: nextIsComplete, generation: mutationGeneration });
  return byId.get(normalized.id) || normalized;
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

async function getSequenceCache() {
  const cached = await getFromLocalStorage(SEQUENCE_CACHE_KEY);
  if (!cached || typeof cached !== "object") {
    return { fetchedAt: 0, sequences: [], isComplete: false };
  }
  return {
    fetchedAt: Number(cached.fetchedAt) || 0,
    sequences: Array.isArray(cached.sequences) ? cached.sequences : [],
    isComplete: Boolean(cached.isComplete)
  };
}

async function setSequenceCache(sequences, options = {}) {
  await setInLocalStorage(SEQUENCE_CACHE_KEY, {
    fetchedAt: Date.now(),
    sequences,
    isComplete: Boolean(options.isComplete)
  });
}

function isSequenceCacheFresh(cache) {
  if (!cache || !cache.fetchedAt) {
    return false;
  }
  return Date.now() - cache.fetchedAt <= SEQUENCE_CACHE_TTL_MS;
}

async function getSequenceRecentUsage() {
  const usage = await getFromLocalStorage(SEQUENCE_RECENT_USAGE_KEY);
  if (!usage || typeof usage !== "object") {
    return {};
  }
  return usage;
}

async function setSequenceRecentUsage(usage) {
  await setInLocalStorage(SEQUENCE_RECENT_USAGE_KEY, usage);
}

async function getAshbyJobRecentUsage() {
  const usage = await getFromLocalStorage(ASHBY_JOB_RECENT_USAGE_KEY);
  if (!usage || typeof usage !== "object") {
    return {};
  }
  return usage;
}

async function setAshbyJobRecentUsage(usage) {
  await setInLocalStorage(ASHBY_JOB_RECENT_USAGE_KEY, usage);
}

function getCustomFieldCacheKey(context) {
  return getCustomFieldCacheKeys(context)[0] || "";
}

function getCustomFieldCacheKeys(context = {}, candidateId = "") {
  const keys = [];
  const pushKey = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized || keys.includes(normalized)) {
      return;
    }
    keys.push(normalized);
  };

  const resolvedCandidateId = String(candidateId || context?.gemCandidateId || "").trim();
  if (resolvedCandidateId) {
    pushKey(`candidate:${resolvedCandidateId}`);
  }

  const handle = String(context?.linkedInHandle || "").trim().toLowerCase();
  if (handle) {
    pushKey(`handle:${handle}`);
  }

  const rawUrl = String(context?.linkedinUrl || "").trim().toLowerCase();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      parsed.search = "";
      parsed.hash = "";
      pushKey(`url:${parsed.toString().replace(/\/$/, "")}`);
    } catch (_error) {
      pushKey(`url:${rawUrl.replace(/[?#].*$/, "").replace(/\/$/, "")}`);
    }
  }

  const email = collectContextEmails(context)[0] || "";
  if (email) {
    pushKey(`email:${email}`);
  }

  const profileUrl = String(collectContextProfileUrls(context)[0] || "")
    .trim()
    .toLowerCase();
  if (!profileUrl) {
    return keys;
  }
  try {
    const parsed = new URL(profileUrl);
    parsed.search = "";
    parsed.hash = "";
    pushKey(`profile:${parsed.toString().replace(/\/$/, "")}`);
  } catch (_error) {
    pushKey(`profile:${profileUrl.replace(/[?#].*$/, "").replace(/\/$/, "")}`);
  }
  return keys;
}

function isCustomFieldCacheFresh(entry) {
  if (!entry || !entry.fetchedAt) {
    return false;
  }
  return Date.now() - Number(entry.fetchedAt) <= CUSTOM_FIELD_CACHE_TTL_MS;
}

function normalizeCandidateProjectIds(projectIds) {
  return Array.isArray(projectIds)
    ? Array.from(new Set(projectIds.map((projectId) => String(projectId || "").trim()).filter(Boolean)))
    : [];
}

function normalizeCustomFieldCacheEntry(entry) {
  const customFields = Array.isArray(entry?.customFields) ? entry.customFields : [];
  const explicitStatusLabels = normalizePassiveStatusLabels(entry?.statusLabels);
  return {
    fetchedAt: Number(entry?.fetchedAt) || 0,
    candidateId: String(entry?.candidateId || ""),
    customFields,
    statusLabels: explicitStatusLabels.length > 0 ? explicitStatusLabels : getPassiveGemStatusLabels(customFields),
    candidateProjectIds: normalizeCandidateProjectIds(entry?.candidateProjectIds)
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
  const keys = getCustomFieldCacheKeys(context);
  if (keys.length === 0) {
    return { key: "", entry: null, isFresh: false };
  }
  const store = await getCustomFieldCacheStore();
  for (const key of keys) {
    if (!store[key]) {
      continue;
    }
    const entry = normalizeCustomFieldCacheEntry(store[key]);
    return {
      key,
      entry,
      isFresh: isCustomFieldCacheFresh(entry)
    };
  }
  return { key: keys[0] || "", entry: null, isFresh: false };
}

async function setCachedCustomFieldsForContext(context, candidateId, customFields, options = {}) {
  const keys = getCustomFieldCacheKeys(context, candidateId);
  if (keys.length === 0) {
    return;
  }
  const normalizedCustomFields = Array.isArray(customFields) ? customFields : [];
  const explicitStatusLabels = normalizePassiveStatusLabels(options?.statusLabels);
  const candidateProjectIds = normalizeCandidateProjectIds(options?.candidateProjectIds);
  const store = await getCustomFieldCacheStore();
  const nextEntry = {
    fetchedAt: Date.now(),
    candidateId: String(candidateId || ""),
    customFields: normalizedCustomFields,
    statusLabels: explicitStatusLabels.length > 0 ? explicitStatusLabels : getPassiveGemStatusLabels(normalizedCustomFields),
    candidateProjectIds
  };
  keys.forEach((key) => {
    store[key] = nextEntry;
  });

  const pruned = Object.entries(store)
    .sort((a, b) => (Number(b[1]?.fetchedAt) || 0) - (Number(a[1]?.fetchedAt) || 0))
    .slice(0, CUSTOM_FIELD_CACHE_LIMIT)
    .reduce((acc, [cacheKey, value]) => {
      acc[cacheKey] = value;
      return acc;
    }, {});

  await setCustomFieldCacheStore(pruned);
}

function normalizePassiveStatusToken(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizePassiveStatusLabels(labels) {
  return Array.isArray(labels)
    ? labels.map((label) => String(label || "").trim()).filter(Boolean)
    : [];
}

function normalizePassiveCustomFields(fields) {
  return Array.isArray(fields)
    ? fields
        .map((field) => ({
          id: String(field?.id || "").trim(),
          name: String(field?.name || "").trim(),
          scope: String(field?.scope || "").trim(),
          currentValueLabels: Array.isArray(field?.currentValueLabels)
            ? field.currentValueLabels.map((label) => String(label || "").trim()).filter(Boolean)
            : []
        }))
        .filter((field) => field.id && field.name)
    : [];
}

function findPassiveGemStatusField(customFields) {
  const normalizedFields = normalizePassiveCustomFields(customFields);
  if (normalizedFields.length === 0) {
    return null;
  }
  const exactMatches = normalizedFields.filter((field) => normalizePassiveStatusToken(field.name) === "status");
  const fuzzyMatches = exactMatches.length > 0
    ? exactMatches
    : normalizedFields.filter((field) => normalizePassiveStatusToken(field.name).startsWith("status"));
  if (fuzzyMatches.length === 0) {
    return null;
  }
  return fuzzyMatches
    .slice()
    .sort((left, right) => {
      const leftScore = (left.currentValueLabels.length ? 4 : 0) + (left.scope === "team" ? 2 : 0) + (left.scope === "project" ? 1 : 0);
      const rightScore = (right.currentValueLabels.length ? 4 : 0) + (right.scope === "team" ? 2 : 0) + (right.scope === "project" ? 1 : 0);
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }
      return left.name.localeCompare(right.name);
    })[0];
}

function getPassiveGemStatusLabels(customFields) {
  const statusField = findPassiveGemStatusField(customFields);
  return normalizePassiveStatusLabels(statusField?.currentValueLabels);
}

function isCandidateInDoNotContactProject(candidateProjectIds) {
  if (!DO_NOT_CONTACT_PROJECT_ID) {
    return false;
  }
  return normalizeCandidateProjectIds(candidateProjectIds).includes(DO_NOT_CONTACT_PROJECT_ID);
}

function normalizeCustomFieldSelectionLabels(selection, field = null) {
  const explicitLabels = Array.isArray(selection?.customFieldValueLabels)
    ? selection.customFieldValueLabels.map((label) => String(label || "").trim()).filter(Boolean)
    : [];
  if (explicitLabels.length > 0) {
    return explicitLabels;
  }

  const optionIds = Array.isArray(selection?.customFieldOptionIds)
    ? selection.customFieldOptionIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (field && optionIds.length > 0) {
    const optionValueById = new Map(
      (Array.isArray(field.options) ? field.options : []).map((option) => [String(option.id || "").trim(), String(option.value || "").trim()])
    );
    const labelsFromOptions = optionIds.map((id) => optionValueById.get(id) || "").filter(Boolean);
    if (labelsFromOptions.length > 0) {
      return labelsFromOptions;
    }
  }

  const rawValue = selection?.customFieldValue;
  if (rawValue === undefined || rawValue === null) {
    return [];
  }
  const trimmedValue = String(rawValue || "").trim();
  return trimmedValue ? [trimmedValue] : [];
}

function applyCustomFieldSelectionToCachedFields(customFields, selection) {
  const normalizedFields = Array.isArray(customFields) ? customFields.slice() : [];
  const selectionFieldId = String(selection?.customFieldId || "").trim();
  if (!selectionFieldId) {
    return { matched: false, customFields: normalizedFields };
  }

  let matched = false;
  const nextFields = normalizedFields.map((field) => {
    if (String(field?.id || "").trim() !== selectionFieldId) {
      return field;
    }
    matched = true;
    const valueType = String(selection?.customFieldValueType || field?.valueType || "").trim().toLowerCase();
    const optionIds = Array.isArray(selection?.customFieldOptionIds)
      ? Array.from(
          new Set(selection.customFieldOptionIds.map((id) => String(id || "").trim()).filter(Boolean))
        )
      : [];
    const labels = normalizeCustomFieldSelectionLabels(selection, field);

    if (valueType === "multi_select") {
      return {
        ...field,
        currentOptionIds: optionIds,
        currentValueLabels: labels
      };
    }

    if (valueType === "single_select") {
      return {
        ...field,
        currentOptionIds: optionIds.slice(0, 1),
        currentValueLabels: labels.slice(0, 1)
      };
    }

    return {
      ...field,
      currentOptionIds: [],
      currentValueLabels: labels.slice(0, 1)
    };
  });

  return {
    matched,
    customFields: nextFields
  };
}

async function patchCachedCustomFieldSelectionForContext(context, candidateId, selection) {
  const cached = await getCachedCustomFieldsForContext(context);
  if (!cached.entry) {
    return false;
  }
  const patched = applyCustomFieldSelectionToCachedFields(cached.entry.customFields, selection);
  if (!patched.matched) {
    return false;
  }
  await setCachedCustomFieldsForContext(
    context,
    String(candidateId || cached.entry.candidateId || "").trim(),
    patched.customFields,
    {
      statusLabels: getPassiveGemStatusLabels(patched.customFields),
      candidateProjectIds: cached.entry.candidateProjectIds
    }
  );
  return true;
}

function isCandidateEmailCacheFresh(entry) {
  if (!entry || !entry.fetchedAt) {
    return false;
  }
  return Date.now() - Number(entry.fetchedAt) <= CANDIDATE_EMAIL_CACHE_TTL_MS;
}

function normalizeCandidateEmailCacheEntry(entry) {
  return {
    fetchedAt: Number(entry?.fetchedAt) || 0,
    candidateId: String(entry?.candidateId || ""),
    emails: normalizeCandidateEmailList(entry?.emails),
    primaryEmail: normalizeEmailAddress(entry?.primaryEmail || getPrimaryEmailFromList(entry?.emails))
  };
}

async function getCandidateEmailCacheStore() {
  const data = await getFromLocalStorage(CANDIDATE_EMAIL_CACHE_KEY);
  if (!data || typeof data !== "object") {
    return {};
  }
  return data;
}

async function setCandidateEmailCacheStore(store) {
  await setInLocalStorage(CANDIDATE_EMAIL_CACHE_KEY, store);
}

async function getCachedCandidateEmailsForContext(context) {
  const key = getCustomFieldCacheKey(context);
  if (!key) {
    return { key: "", entry: null, isFresh: false };
  }
  const store = await getCandidateEmailCacheStore();
  if (!store[key]) {
    return { key, entry: null, isFresh: false };
  }
  const entry = normalizeCandidateEmailCacheEntry(store[key]);
  return {
    key,
    entry,
    isFresh: isCandidateEmailCacheFresh(entry)
  };
}

async function setCachedCandidateEmailsForContext(context, candidateId, emails, primaryEmail) {
  const key = getCustomFieldCacheKey(context);
  if (!key) {
    return;
  }
  const normalizedEmails = normalizeCandidateEmailList(emails);
  const normalizedPrimaryEmail = normalizeEmailAddress(primaryEmail || getPrimaryEmailFromList(normalizedEmails));
  const store = await getCandidateEmailCacheStore();
  store[key] = {
    fetchedAt: Date.now(),
    candidateId: String(candidateId || ""),
    emails: normalizedEmails,
    primaryEmail: normalizedPrimaryEmail
  };

  const pruned = Object.entries(store)
    .sort((a, b) => (Number(b[1]?.fetchedAt) || 0) - (Number(a[1]?.fetchedAt) || 0))
    .slice(0, CANDIDATE_EMAIL_CACHE_LIMIT)
    .reduce((acc, [cacheKey, value]) => {
      acc[cacheKey] = value;
      return acc;
    }, {});

  await setCandidateEmailCacheStore(pruned);
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

function normalizeSequence(item) {
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
    userId: String(item.userId || item.user_id || "").trim(),
    createdAt: String(item.createdAt || "").trim()
  };
}

function normalizeEmailAddress(value) {
  return String(value || "").trim();
}

function normalizeCandidateEmailItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const emailAddress = normalizeEmailAddress(item.emailAddress || item.email_address || item.email || item.value);
  if (!emailAddress) {
    return null;
  }
  return {
    emailAddress,
    isPrimary: Boolean(item.isPrimary || item.is_primary)
  };
}

function normalizeCandidateEmailList(items) {
  const rows = Array.isArray(items) ? items : [];
  const deduped = [];
  const byLower = new Map();

  for (const row of rows) {
    const normalized = normalizeCandidateEmailItem(row);
    if (!normalized) {
      continue;
    }
    const lower = normalized.emailAddress.toLowerCase();
    const existingIndex = byLower.get(lower);
    if (existingIndex !== undefined) {
      if (normalized.isPrimary) {
        deduped[existingIndex].isPrimary = true;
      }
      continue;
    }
    byLower.set(lower, deduped.length);
    deduped.push(normalized);
  }

  let primaryIndex = deduped.findIndex((entry) => entry.isPrimary);
  if (primaryIndex < 0 && deduped.length > 0) {
    primaryIndex = 0;
  }
  return deduped.map((entry, index) => ({
    emailAddress: entry.emailAddress,
    isPrimary: index === primaryIndex
  }));
}

function getPrimaryEmailFromList(entries) {
  const normalized = normalizeCandidateEmailList(entries);
  const primary = normalized.find((entry) => entry.isPrimary);
  return primary ? primary.emailAddress : "";
}

function stripLikelySequenceVariantSuffix(name) {
  const raw = String(name || "").trim();
  if (!raw) {
    return "";
  }
  const stripped = raw.replace(
    /\s+\d{1,2}:\d{2}\s*(?:am|pm)\s+[A-Za-z]{3},\s+[A-Za-z]{3}\s+\d{1,2}(?:,\s*\d{4})?$/i,
    ""
  );
  return stripped.trim();
}

function choosePreferredSequenceRepresentative(group) {
  if (!Array.isArray(group) || group.length === 0) {
    return null;
  }
  const sortedNewestFirst = group
    .slice()
    .sort((a, b) => parseIsoDate(b.createdAt) - parseIsoDate(a.createdAt));
  const canonical = sortedNewestFirst.find((item) => {
    const base = stripLikelySequenceVariantSuffix(item.name);
    return base && base.toLowerCase() === String(item.name || "").trim().toLowerCase();
  });
  return canonical || sortedNewestFirst[0];
}

function collapseLikelySequenceVariants(sequences) {
  const normalized = (Array.isArray(sequences) ? sequences : []).map(normalizeSequence).filter(Boolean);
  const grouped = new Map();
  for (const sequence of normalized) {
    const base = stripLikelySequenceVariantSuffix(sequence.name) || sequence.name;
    const key = base.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, { items: [] });
    }
    grouped.get(key).items.push(sequence);
  }

  const out = [];
  for (const { items } of grouped.values()) {
    const hasVariant = items.some((item) => {
      const base = stripLikelySequenceVariantSuffix(item.name);
      return base && base.toLowerCase() !== String(item.name || "").trim().toLowerCase();
    });
    if (!hasVariant) {
      out.push(...items);
      continue;
    }
    const representative = choosePreferredSequenceRepresentative(items);
    if (representative) {
      out.push(representative);
    }
  }
  return out;
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

function sortSequencesForPicker(sequences, usageMap, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const byId = new Map();

  for (const item of Array.isArray(sequences) ? sequences : []) {
    const sequence = normalizeSequence(item);
    if (!sequence) {
      continue;
    }
    if (normalizedQuery && !sequence.name.toLowerCase().includes(normalizedQuery)) {
      continue;
    }
    byId.set(sequence.id, sequence);
  }

  return Array.from(byId.values()).sort((a, b) => {
    const aRecent = Number(usageMap?.[a.id]?.lastUsedAtMs) || 0;
    const bRecent = Number(usageMap?.[b.id]?.lastUsedAtMs) || 0;
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

function isOpenAshbyJob(item) {
  if (!item || typeof item !== "object") {
    return false;
  }
  if (typeof item.isOpen === "boolean") {
    return item.isOpen;
  }
  const status = String(item.status || "").trim().toLowerCase();
  if (status.includes("open")) {
    return true;
  }
  if (!status) {
    return !Boolean(item.isArchived);
  }
  if (status.includes("closed") || status.includes("archived") || status.includes("draft")) {
    return false;
  }
  return !Boolean(item.isArchived);
}

function sortAshbyJobsForPicker(jobs, usageMap, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const byId = new Map();

  for (const item of Array.isArray(jobs) ? jobs : []) {
    const job = normalizeAshbyJob(item);
    if (!job || !isOpenAshbyJob(job) || job.isArchived) {
      continue;
    }
    if (normalizedQuery && !job.name.toLowerCase().includes(normalizedQuery)) {
      continue;
    }
    byId.set(job.id, job);
  }

  return Array.from(byId.values()).sort((a, b) => {
    const aRecent = Number(usageMap?.[a.id]?.lastUsedAtMs) || 0;
    const bRecent = Number(usageMap?.[b.id]?.lastUsedAtMs) || 0;
    if (aRecent !== bRecent) {
      return bRecent - aRecent;
    }

    const aUpdated = parseIsoDate(a.updatedAt);
    const bUpdated = parseIsoDate(b.updatedAt);
    if (aUpdated !== bUpdated) {
      return bUpdated - aUpdated;
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

async function touchSequenceRecentUsage(sequenceId, sequenceName = "") {
  const id = String(sequenceId || "").trim();
  if (!id) {
    return;
  }

  const usage = await getSequenceRecentUsage();
  const now = Date.now();
  const previous = usage[id] || {};
  usage[id] = {
    lastUsedAtMs: now,
    lastUsedAt: new Date(now).toISOString(),
    count: (Number(previous.count) || 0) + 1,
    name: sequenceName || previous.name || ""
  };

  const pruned = Object.entries(usage)
    .sort((a, b) => (Number(b[1]?.lastUsedAtMs) || 0) - (Number(a[1]?.lastUsedAtMs) || 0))
    .slice(0, SEQUENCE_RECENT_USAGE_LIMIT)
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  await setSequenceRecentUsage(pruned);
}

async function touchAshbyJobRecentUsage(jobId, jobName = "") {
  const id = String(jobId || "").trim();
  if (!id) {
    return;
  }

  const usage = await getAshbyJobRecentUsage();
  const now = Date.now();
  const previous = usage[id] || {};
  usage[id] = {
    lastUsedAtMs: now,
    lastUsedAt: new Date(now).toISOString(),
    count: (Number(previous.count) || 0) + 1,
    name: jobName || previous.name || ""
  };

  const pruned = Object.entries(usage)
    .sort((a, b) => (Number(b[1]?.lastUsedAtMs) || 0) - (Number(a[1]?.lastUsedAtMs) || 0))
    .slice(0, ASHBY_JOB_RECENT_USAGE_LIMIT)
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  await setAshbyJobRecentUsage(pruned);
}

async function refreshProjectsFromBackend(settings, runId, limit = PROJECT_CACHE_LIMIT, options = {}) {
  const actionId = ACTIONS.ADD_TO_PROJECT;
  const normalizedLimit = normalizeProjectLimit(limit);
  const refreshGeneration = Number(options.generation) || bumpProjectCacheGeneration();
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
  const shouldWriteCache = refreshGeneration === projectCacheGeneration;
  if (shouldWriteCache) {
    await setProjectCache(projects, { isComplete: normalizedLimit === 0, generation: refreshGeneration });
  }
  logEvent(settings, {
    event: "projects.cache.refreshed",
    actionId,
    runId,
    message: `Refreshed project cache with ${projects.length} projects.`,
    details: {
      limit: normalizedLimit,
      refreshGeneration,
      wroteCache: shouldWriteCache
    }
  });
  return projects;
}

function ensureProjectRefresh(settings, runId, limit = PROJECT_CACHE_LIMIT, options = {}) {
  const forceNew = Boolean(options.forceNew);
  if (forceNew || !projectRefreshPromise) {
    const refreshGeneration = bumpProjectCacheGeneration();
    const refreshPromise = refreshProjectsFromBackend(settings, runId, limit, {
      generation: refreshGeneration
    }).finally(() => {
      if (projectRefreshPromise === refreshPromise) {
        projectRefreshPromise = null;
      }
    });
    projectRefreshPromise = refreshPromise;
  }
  return projectRefreshPromise;
}

function getCreatedByIdentity(settings = {}, context = {}) {
  const userId = String(context?.createdByUserId || settings?.createdByUserId || "").trim();
  const userEmail = String(context?.createdByUserEmail || settings?.createdByUserEmail || "")
    .trim()
    .toLowerCase();
  return { userId, userEmail };
}

function normalizeContextEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function collectContextEmails(context = {}) {
  const emails = [];
  const seen = new Set();
  const add = (value) => {
    const email = normalizeContextEmail(value);
    if (!email || seen.has(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return;
    }
    seen.add(email);
    emails.push(email);
  };
  add(context.contactEmail);
  add(context.email);
  if (Array.isArray(context.contactEmails)) {
    context.contactEmails.forEach((email) => add(email));
  }
  return emails;
}

function collectGmailAccountEmails(context = {}) {
  const emails = [];
  const seen = new Set();
  const add = (value) => {
    const email = normalizeContextEmail(value);
    if (!email || seen.has(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return;
    }
    seen.add(email);
    emails.push(email);
  };
  if (Array.isArray(context.gmailAccountEmails)) {
    context.gmailAccountEmails.forEach((email) => add(email));
  }
  add(context.gmailMailboxEmail);
  return emails;
}

function normalizeGmailSubjectForMatch(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^(?:(?:re|fw|fwd|aw)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

function escapeGmailSearchPhrase(value) {
  return String(value || "")
    .replace(/["\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getGmailOauthClientId() {
  return String(chrome.runtime.getManifest()?.oauth2?.client_id || "").trim();
}

function hasConfiguredGmailOauth() {
  return Boolean(getGmailOauthClientId());
}

function getGmailAuthToken(options = {}) {
  return new Promise((resolve, reject) => {
    if (!chrome.identity || typeof chrome.identity.getAuthToken !== "function") {
      reject(new Error("Chrome identity API is not available."));
      return;
    }
    if (!hasConfiguredGmailOauth()) {
      reject(new Error("Gmail OAuth is not configured in manifest.json."));
      return;
    }
    chrome.identity.getAuthToken(
      {
        interactive: Boolean(options.interactive),
        enableGranularPermissions: true,
        scopes: [GMAIL_READONLY_SCOPE]
      },
      (tokenOrResult, grantedScopes) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Could not authorize Gmail access."));
          return;
        }
        const token =
          typeof tokenOrResult === "string"
            ? tokenOrResult
            : String(tokenOrResult?.token || "").trim();
        const scopes = Array.isArray(grantedScopes)
          ? grantedScopes
          : Array.isArray(tokenOrResult?.grantedScopes)
            ? tokenOrResult.grantedScopes
            : [];
        if (!token) {
          reject(new Error("Google auth did not return an access token."));
          return;
        }
        resolve({ token, grantedScopes: scopes });
      }
    );
  });
}

function removeCachedGoogleAuthToken(token) {
  return new Promise((resolve, reject) => {
    if (!chrome.identity || typeof chrome.identity.removeCachedAuthToken !== "function") {
      resolve();
      return;
    }
    chrome.identity.removeCachedAuthToken({ token }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Could not clear cached Google token."));
        return;
      }
      resolve();
    });
  });
}

async function ensureGmailAuthToken() {
  try {
    return await getGmailAuthToken({ interactive: false });
  } catch (_error) {
    return getGmailAuthToken({ interactive: true });
  }
}

async function fetchGmailJson(path, token, options = {}) {
  const url = new URL(`${GMAIL_API_BASE_URL}${path}`);
  const query = options.query && typeof options.query === "object" ? options.query : {};
  Object.entries(query).forEach(([key, rawValue]) => {
    if (Array.isArray(rawValue)) {
      rawValue.forEach((value) => {
        const normalized = String(value || "").trim();
        if (normalized) {
          url.searchParams.append(key, normalized);
        }
      });
      return;
    }
    const normalized = String(rawValue || "").trim();
    if (normalized) {
      url.searchParams.set(key, normalized);
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401 && options.retryOnUnauthorized !== false) {
    await removeCachedGoogleAuthToken(token).catch(() => {});
    const refreshed = await getGmailAuthToken({ interactive: false }).catch(() => null);
    if (refreshed?.token) {
      return fetchGmailJson(path, refreshed.token, { ...options, retryOnUnauthorized: false });
    }
  }

  if (!response.ok) {
    throw new Error(`Gmail API request failed (${response.status}).`);
  }

  if (response.status === 204) {
    return {};
  }
  return response.json();
}

function parseHeaderEmailEntries(value) {
  const text = String(value || "");
  const entries = [];
  const seen = new Set();
  const add = (emailValue, displayNameValue = "") => {
    const email = normalizeContextEmail(emailValue);
    if (!email || seen.has(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return;
    }
    seen.add(email);
    const displayName = String(displayNameValue || "")
      .replace(/^["']+|["']+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    entries.push({
      email,
      displayName: displayName && !/@/.test(displayName) ? displayName : ""
    });
  };

  const anglePattern = /(?:"?([^"<]*)"?\s*)?<([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>/gi;
  let angleMatch = null;
  while ((angleMatch = anglePattern.exec(text))) {
    add(angleMatch[2], angleMatch[1] || "");
  }

  const barePattern = /(^|[\s,(;])([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})(?=$|[\s),;])/gi;
  let bareMatch = null;
  while ((bareMatch = barePattern.exec(text))) {
    add(bareMatch[2], "");
  }

  return entries;
}

function getGmailHeaderValues(headers, name) {
  const target = String(name || "").trim().toLowerCase();
  if (!target || !Array.isArray(headers)) {
    return [];
  }
  return headers
    .filter((header) => String(header?.name || "").trim().toLowerCase() === target)
    .map((header) => String(header?.value || "").trim())
    .filter(Boolean);
}

function getGmailThreadSubject(thread = {}) {
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  for (const message of messages) {
    const headers = Array.isArray(message?.payload?.headers) ? message.payload.headers : [];
    const subject = getGmailHeaderValues(headers, "Subject")[0] || "";
    if (subject) {
      return subject;
    }
  }
  return "";
}

function collectGmailThreadParticipants(thread = {}) {
  const participantMap = new Map();
  const add = (entry) => {
    if (!entry || typeof entry !== "object" || !entry.email) {
      return;
    }
    const email = normalizeContextEmail(entry.email);
    if (!email) {
      return;
    }
    const existing = participantMap.get(email) || {
      email,
      displayName: "",
      count: 0
    };
    existing.count += 1;
    if (!existing.displayName && String(entry.displayName || "").trim()) {
      existing.displayName = String(entry.displayName || "").trim();
    }
    participantMap.set(email, existing);
  };

  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  messages.forEach((message) => {
    const headers = Array.isArray(message?.payload?.headers) ? message.payload.headers : [];
    ["From", "To", "Cc", "Reply-To", "Delivered-To"].forEach((headerName) => {
      getGmailHeaderValues(headers, headerName).forEach((value) => {
        parseHeaderEmailEntries(value).forEach((entry) => add(entry));
      });
    });
  });

  return Array.from(participantMap.values()).sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }
    return left.email.localeCompare(right.email);
  });
}

function buildGmailThreadSearchQuery(context = {}) {
  const terms = [];
  const subject = escapeGmailSearchPhrase(context.gmailSubject);
  const emails = collectContextEmails(context).slice(0, 3);

  if (subject) {
    terms.push(`subject:"${subject}"`);
  }
  if (emails.length > 0) {
    terms.push(`(${emails.map((email) => `from:${email} OR to:${email} OR cc:${email}`).join(" OR ")})`);
  }

  return terms.join(" ").trim();
}

function scoreGmailThreadMatch(thread, context, mailboxEmail = "") {
  let score = 0;
  const wantedSubject = normalizeGmailSubjectForMatch(context.gmailSubject);
  const actualSubject = normalizeGmailSubjectForMatch(getGmailThreadSubject(thread));
  if (wantedSubject && actualSubject) {
    if (wantedSubject === actualSubject) {
      score += 6;
    } else if (actualSubject.includes(wantedSubject) || wantedSubject.includes(actualSubject)) {
      score += 3;
    }
  }

  const wantedEmails = new Set(collectContextEmails(context));
  collectGmailThreadParticipants(thread).forEach((entry) => {
    if (wantedEmails.has(entry.email)) {
      score += 4;
    }
    if (mailboxEmail && entry.email === normalizeContextEmail(mailboxEmail)) {
      score += 1;
    }
  });

  return score;
}

function collectFallbackGmailCandidateEmails(context = {}, settings = {}, mailboxEmail = "") {
  const ignored = new Set([
    ...collectGmailAccountEmails(context),
    normalizeContextEmail(mailboxEmail),
    normalizeContextEmail(settings?.createdByUserEmail || ""),
    ...GMAIL_SYSTEM_EMAILS
  ]);
  return collectContextEmails(context).filter((email) => !ignored.has(normalizeContextEmail(email)));
}

async function resolveGmailThreadParticipantsViaApi(context = {}) {
  if (!hasConfiguredGmailOauth()) {
    return null;
  }

  const { token } = await ensureGmailAuthToken();
  const profile = await fetchGmailJson("/users/me/profile", token);
  const mailboxEmail = normalizeContextEmail(profile?.emailAddress || "");
  const query = buildGmailThreadSearchQuery(context);
  if (!query) {
    return {
      mailboxEmail,
      emails: [],
      participantName: "",
      threadId: ""
    };
  }

  const list = await fetchGmailJson("/users/me/threads", token, {
    query: {
      q: query,
      maxResults: String(GMAIL_THREAD_SEARCH_MAX_RESULTS)
    }
  });
  const threadRefs = Array.isArray(list?.threads) ? list.threads.slice(0, GMAIL_THREAD_SEARCH_MAX_RESULTS) : [];
  if (threadRefs.length === 0) {
    return {
      mailboxEmail,
      emails: [],
      participantName: "",
      threadId: ""
    };
  }

  let bestThread = null;
  let bestScore = -1;
  for (const threadRef of threadRefs) {
    const threadId = String(threadRef?.id || "").trim();
    if (!threadId) {
      continue;
    }
    const thread = await fetchGmailJson(`/users/me/threads/${encodeURIComponent(threadId)}`, token, {
      query: {
        format: "metadata",
        metadataHeaders: ["Subject", "From", "To", "Cc", "Reply-To", "Delivered-To"]
      }
    });
    const score = scoreGmailThreadMatch(thread, context, mailboxEmail);
    if (score > bestScore) {
      bestScore = score;
      bestThread = thread;
    }
  }

  if (!bestThread) {
    return {
      mailboxEmail,
      emails: [],
      participantName: "",
      threadId: ""
    };
  }

  const ignored = new Set([
    ...collectGmailAccountEmails(context),
    mailboxEmail,
    ...GMAIL_SYSTEM_EMAILS
  ]);
  const externalParticipants = collectGmailThreadParticipants(bestThread).filter(
    (entry) => !ignored.has(normalizeContextEmail(entry.email))
  );

  return {
    mailboxEmail,
    emails: externalParticipants.map((entry) => entry.email),
    participantName: String(externalParticipants.find((entry) => entry.displayName)?.displayName || "").trim(),
    threadId: String(bestThread?.id || "").trim()
  };
}

async function enrichGmailContext(settings, context, audit) {
  if (String(context?.sourcePlatform || "").trim().toLowerCase() !== "gmail") {
    return context;
  }
  if (context && typeof context === "object" && context._gmailContextEnriched) {
    return context;
  }

  let resolved = null;
  try {
    resolved = await resolveGmailThreadParticipantsViaApi(context);
  } catch (error) {
    context.gmailResolutionError = error.message || "Gmail API lookup failed.";
  }

  const mergedEmails = [];
  const seen = new Set();
  const add = (value) => {
    const email = normalizeContextEmail(value);
    if (!email || seen.has(email)) {
      return;
    }
    seen.add(email);
    mergedEmails.push(email);
  };

  const fallbackWithMailboxFilter = collectFallbackGmailCandidateEmails(context, settings, resolved?.mailboxEmail || "");
  (Array.isArray(resolved?.emails) ? resolved.emails : []).forEach((email) => add(email));
  fallbackWithMailboxFilter.forEach((email) => add(email));

  context.contactEmails = mergedEmails;
  context.contactEmail = mergedEmails[0] || "";
  if (!String(context.profileName || "").trim() && String(resolved?.participantName || "").trim()) {
    context.profileName = String(resolved.participantName || "").trim();
  }
  if (String(resolved?.mailboxEmail || "").trim()) {
    context.gmailMailboxEmail = String(resolved.mailboxEmail || "").trim();
  }
  if (String(resolved?.threadId || "").trim()) {
    context.gmailApiThreadId = String(resolved.threadId || "").trim();
  }
  context.gmailResolutionMode = Array.isArray(resolved?.emails) && resolved.emails.length > 0 ? "gmailApi" : "visibleEmails";
  context._gmailContextEnriched = true;
  return context;
}

function normalizeProfileUrlForLookup(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch (_error) {
    return value.replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

function isLookupCandidateProfileUrl(url) {
  try {
    const parsed = new URL(url);
    const host = String(parsed.hostname || "").toLowerCase();
    if (!host) {
      return false;
    }
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (_error) {
    return false;
  }
}

function collectContextProfileUrls(context = {}) {
  const urls = [];
  const seen = new Set();
  const add = (value) => {
    const normalized = normalizeProfileUrlForLookup(value);
    if (!normalized || seen.has(normalized) || !isLookupCandidateProfileUrl(normalized)) {
      return;
    }
    seen.add(normalized);
    urls.push(normalized);
  };
  add(context.profileUrl);
  add(context.githubUrl);
  add(context.gemProfileUrl);
  add(context.linkedinUrl);
  if (Array.isArray(context.profileUrls)) {
    context.profileUrls.forEach((value) => add(value));
  }
  return urls;
}

function getContextLink(context = {}) {
  return (
    String(context.linkedinUrl || "").trim() ||
    String(context.profileUrl || "").trim() ||
    String(context.githubUrl || "").trim() ||
    String(context.gemProfileUrl || "").trim() ||
    String(context.gmailThreadUrl || "").trim() ||
    String(context.pageUrl || "").trim() ||
    ""
  );
}

function pruneCandidateResolutionCache() {
  while (candidateResolutionCache.size > CANDIDATE_RESOLUTION_CACHE_LIMIT) {
    const oldestKey = candidateResolutionCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    candidateResolutionCache.delete(oldestKey);
  }
}

function getCandidateResolutionCacheKey(context = {}) {
  return getCandidateResolutionCacheKeys(context)[0] || "";
}

function getCandidateResolutionCacheKeys(context = {}, candidate = null) {
  const candidateId = String(candidate?.id || context?.gemCandidateId || "").trim();
  return getCustomFieldCacheKeys(context, candidateId);
}

function getCachedCandidateResolution(context = {}) {
  const keys = getCandidateResolutionCacheKeys(context);
  if (keys.length === 0) {
    return { key: "", hasValue: false, candidate: null };
  }
  for (const key of keys) {
    const entry = candidateResolutionCache.get(key);
    if (!entry) {
      continue;
    }
    const ttlMs = entry.hasCandidate ? CANDIDATE_RESOLUTION_TTL_MS : CANDIDATE_RESOLUTION_NEGATIVE_TTL_MS;
    if (Date.now() - Number(entry.fetchedAt || 0) > ttlMs) {
      candidateResolutionCache.delete(key);
      continue;
    }
    candidateResolutionCache.delete(key);
    candidateResolutionCache.set(key, entry);
    return {
      key,
      hasValue: true,
      candidate: entry.hasCandidate ? entry.candidate : null
    };
  }
  return { key: keys[0] || "", hasValue: false, candidate: null };
}

function rememberCandidateResolution(context = {}, candidate = null) {
  const keys = getCandidateResolutionCacheKeys(context, candidate);
  if (keys.length === 0) {
    return;
  }
  const entry = {
    fetchedAt: Date.now(),
    hasCandidate: Boolean(candidate?.id),
    candidate: candidate?.id ? candidate : null
  };
  keys.forEach((key) => {
    candidateResolutionCache.delete(key);
    candidateResolutionCache.set(key, entry);
  });
  pruneCandidateResolutionCache();
}

function clearCandidateResolution(context = {}) {
  const keys = getCandidateResolutionCacheKeys(context);
  if (keys.length === 0) {
    return;
  }
  keys.forEach((key) => candidateResolutionCache.delete(key));
}

function contextHasCandidateIdentity(context = {}) {
  if (String(context?.sourcePlatform || "").trim().toLowerCase() === "gmail") {
    return Boolean(
      String(context.gmailThreadToken || "").trim() ||
        String(context.gmailSubject || "").trim() ||
        collectContextEmails(context).length > 0
    );
  }
  return Boolean(
    String(context.gemCandidateId || "").trim() ||
      String(context.linkedinUrl || "").trim() ||
      String(context.linkedInHandle || "").trim() ||
      collectContextEmails(context).length > 0 ||
      collectContextProfileUrls(context).length > 0
  );
}

function buildLinkedInUrlFromHandle(handle) {
  const clean = String(handle || "")
    .trim()
    .replace(/^@/, "");
  if (!clean) {
    return "";
  }
  return `https://www.linkedin.com/in/${encodeURIComponent(clean)}`;
}

function extractLinkedInIdentityFromCandidate(candidate) {
  const linkedInHandle = String(candidate?.linked_in_handle || candidate?.linkedInHandle || "").trim();
  const urls = [];
  const profileUrls = Array.isArray(candidate?.profile_urls) ? candidate.profile_urls : [];
  profileUrls.forEach((url) => urls.push(String(url || "").trim()));
  const profiles = Array.isArray(candidate?.profiles) ? candidate.profiles : [];
  profiles.forEach((profile) => {
    if (!profile || typeof profile !== "object") {
      return;
    }
    urls.push(
      String(profile.url || profile.link || profile.href || profile.value || "").trim()
    );
  });
  let linkedInUrl = "";
  for (const value of urls) {
    const normalized = normalizeProfileUrlForLookup(value).toLowerCase();
    if (!normalized || !normalized.includes("linkedin.com/")) {
      continue;
    }
    linkedInUrl = normalizeProfileUrlForLookup(value);
    if (/linkedin\.com\/(?:in|pub)\//i.test(normalized)) {
      break;
    }
  }
  if (!linkedInUrl && linkedInHandle) {
    linkedInUrl = buildLinkedInUrlFromHandle(linkedInHandle);
  }
  return {
    linkedInHandle,
    linkedInUrl
  };
}

function buildCandidateResolutionPayload(context = {}) {
  return {
    candidateId: String(context?.gemCandidateId || "").trim(),
    linkedInHandle: String(context?.linkedInHandle || "").trim(),
    linkedInUrl: String(context?.linkedinUrl || "").trim(),
    emails: collectContextEmails(context),
    profileUrls: collectContextProfileUrls(context)
  };
}

function candidateResolutionPayloadHasLookupValue(payload = {}) {
  return Boolean(
    String(payload?.candidateId || "").trim() ||
      String(payload?.linkedInHandle || "").trim() ||
      String(payload?.linkedInUrl || "").trim() ||
      (Array.isArray(payload?.emails) && payload.emails.length > 0) ||
      (Array.isArray(payload?.profileUrls) && payload.profileUrls.length > 0)
  );
}

function shouldFallbackToLegacyCandidateResolution(error) {
  const message = String(error?.message || "");
  return /unknown route/i.test(message) || /not found/i.test(message);
}

async function findCandidateByContextLegacy(settings, context, audit) {
  const gemCandidateId = String(context?.gemCandidateId || "").trim();
  if (gemCandidateId) {
    try {
      const byId = await callBackend(
        "/api/candidates/get",
        { candidateId: gemCandidateId },
        settings,
        { ...audit, step: "findCandidateById" }
      );
      if (byId?.candidate?.id) {
        return byId.candidate;
      }
    } catch (_error) {
      // Continue with other lookup strategies.
    }
  }

  const linkedInHandle = String(context?.linkedInHandle || "").trim();
  const linkedInUrl = String(context?.linkedinUrl || "").trim();
  if (linkedInHandle || linkedInUrl) {
    const byLinkedIn = await callBackend(
      "/api/candidates/find-by-linkedin",
      {
        linkedInHandle,
        linkedInUrl
      },
      settings,
      { ...audit, step: "findCandidateByLinkedIn" }
    );
    if (byLinkedIn?.candidate?.id) {
      return byLinkedIn.candidate;
    }
  }

  const emails = collectContextEmails(context);
  for (const email of emails) {
    const byEmail = await callBackend(
      "/api/candidates/find-by-email",
      { email },
      settings,
      { ...audit, step: "findCandidateByEmail" }
    );
    if (byEmail?.candidate?.id) {
      return byEmail.candidate;
    }
  }

  const profileUrls = collectContextProfileUrls(context);
  for (const profileUrl of profileUrls) {
    const byProfileUrl = await callBackend(
      "/api/candidates/find-by-profile-url",
      { profileUrl },
      settings,
      { ...audit, step: "findCandidateByProfileUrl" }
    );
    if (byProfileUrl?.candidate?.id) {
      return byProfileUrl.candidate;
    }
  }

  return null;
}

async function findCandidateByContext(settings, context, audit) {
  if (!audit?.forceFreshLookup) {
    const cachedResolution = getCachedCandidateResolution(context);
    if (cachedResolution.hasValue) {
      return cachedResolution.candidate;
    }
  } else {
    clearCandidateResolution(context);
  }

  if (typeof enrichGmailContext === "function") {
    await enrichGmailContext(settings, context, audit);
  }

  if (!audit?.forceFreshLookup) {
    const cachedResolution = getCachedCandidateResolution(context);
    if (cachedResolution.hasValue) {
      return cachedResolution.candidate;
    }
  }

  const payload = buildCandidateResolutionPayload(context);
  if (!candidateResolutionPayloadHasLookupValue(payload)) {
    rememberCandidateResolution(context, null);
    return null;
  }

  try {
    const resolved = await callBackend(
      "/api/candidates/resolve-context",
      payload,
      settings,
      { ...audit, step: "resolveCandidateByContext" }
    );
    const candidate = resolved?.candidate?.id ? resolved.candidate : null;
    rememberCandidateResolution(context, candidate);
    return candidate;
  } catch (error) {
    if (!shouldFallbackToLegacyCandidateResolution(error)) {
      throw error;
    }
    const candidate = await findCandidateByContextLegacy(settings, context, {
      ...audit,
      step: "resolveCandidateByContextLegacy"
    });
    rememberCandidateResolution(context, candidate);
    return candidate;
  }
}

async function refreshSequencesFromBackend(settings, runId, limit = SEQUENCE_CACHE_LIMIT, actionId = ACTIONS.SEND_SEQUENCE) {
  const normalizedLimit = normalizeSequenceLimit(limit);
  const { userId, userEmail } = getCreatedByIdentity(settings);
  const data = await callBackend(
    "/api/sequences/list",
    {
      query: "",
      limit: normalizedLimit,
      userId,
      userEmail
    },
    settings,
    { actionId, runId, step: "listSequences" }
  );
  const rawSequences = Array.isArray(data?.sequences) ? data.sequences.map(normalizeSequence).filter(Boolean) : [];
  const variantCollapseApplied = data?.variantCollapseApplied === true;
  const sequences = variantCollapseApplied ? rawSequences : collapseLikelySequenceVariants(rawSequences);
  const rawCount = Number.isFinite(Number(data?.rawCount)) ? Number(data.rawCount) : rawSequences.length;
  await setSequenceCache(sequences, { isComplete: normalizedLimit === 0 });
  logEvent(settings, {
    event: "sequences.cache.refreshed",
    actionId,
    runId,
    message: `Refreshed sequence cache with ${sequences.length} sequences.`,
    details: {
      limit: normalizedLimit,
      userId,
      userEmail,
      rawCount,
      dedupedCount: sequences.length,
      variantCollapseApplied
    }
  });
  return sequences;
}

function ensureSequenceRefresh(
  settings,
  runId,
  limit = SEQUENCE_CACHE_LIMIT,
  actionId = ACTIONS.SEND_SEQUENCE,
  options = {}
) {
  const forceNew = Boolean(options.forceNew);
  if (forceNew || !sequenceRefreshPromise) {
    sequenceRefreshPromise = refreshSequencesFromBackend(settings, runId, limit, actionId).finally(() => {
      sequenceRefreshPromise = null;
    });
  }
  return sequenceRefreshPromise;
}

function normalizeProjectLimit(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(raw, PROJECT_QUERY_LIMIT_MAX));
}

function normalizeSequenceLimit(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(raw, SEQUENCE_QUERY_LIMIT_MAX));
}

function normalizeAshbyJobLimit(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(raw, ASHBY_JOBS_QUERY_LIMIT_MAX));
}

function normalizeAshbyJob(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = String(raw.id || "").trim();
  if (!id) {
    return null;
  }
  const status = String(raw.status || "").trim();
  const statusLower = status.toLowerCase();
  const isArchived = Boolean(raw.isArchived) || statusLower.includes("archived");
  let isOpen = false;
  if (typeof raw.isOpen === "boolean") {
    isOpen = raw.isOpen;
  } else if (statusLower.includes("open")) {
    isOpen = true;
  } else if (!statusLower) {
    isOpen = !isArchived;
  } else if (statusLower.includes("closed") || statusLower.includes("draft") || statusLower.includes("archived")) {
    isOpen = false;
  } else {
    isOpen = !isArchived;
  }
  return {
    id,
    name: String(raw.name || raw.title || id).trim(),
    status: status || (isOpen ? "Open" : "Closed"),
    isOpen,
    isArchived,
    updatedAt: String(raw.updatedAt || raw.createdAt || "")
  };
}

function normalizeGemUser(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = String(raw.id || "").trim();
  if (!id) {
    return null;
  }
  const firstName = String(raw.first_name || raw.firstName || "").trim();
  const lastName = String(raw.last_name || raw.lastName || "").trim();
  const name = String(raw.name || `${firstName} ${lastName}`.trim()).trim();
  const email = String(raw.email || "").trim();
  return {
    id,
    first_name: firstName,
    last_name: lastName,
    name,
    email
  };
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
  const shouldPersistLocally = entry.level === "warn" || entry.level === "error";
  const shouldSendRemotely = entry.level === "error" && settings?.backendBaseUrl;
  if (shouldPersistLocally) {
    appendLocalLog(entry).catch(() => {});
  }
  if (shouldSendRemotely) {
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
    const backendMessage = parsed?.error || "Could not load backend logs.";
    const errorMessage =
      response.status === 401 && /unauthorized/i.test(String(backendMessage))
        ? "Unauthorized. Check BACKEND_SHARED_TOKEN and/or ALLOWED_EXTENSION_ORIGINS in backend/.env."
        : backendMessage;
    return { logs: [], error: errorMessage };
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

function ensureQueryParam(url, key, value) {
  if (!url || !key || value === undefined || value === null || value === "") {
    return url;
  }
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(key, String(value));
    return parsed.toString();
  } catch (_error) {
    return url;
  }
}

function normalizeGemHost(url) {
  if (!url) {
    return "";
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "app.gem.com") {
      parsed.hostname = "www.gem.com";
    }
    return parsed.toString();
  } catch (_error) {
    return url;
  }
}

function buildGemSequenceAutomationUrl(baseUrl, params) {
  let url = normalizeGemHost(baseUrl);
  url = ensureQueryParam(url, "glsAction", "openSequenceForCandidate");
  url = ensureQueryParam(url, "glsRunId", params.runId || "");
  url = ensureQueryParam(url, "glsCandidateId", params.candidateId || "");
  url = ensureQueryParam(url, "glsSequenceId", params.sequenceId || "");
  url = ensureQueryParam(url, "glsSequenceName", params.sequenceName || "");
  return url;
}

function buildGemSequenceEditUrl(settings, sequenceId) {
  const id = String(sequenceId || "").trim();
  if (!id) {
    return "";
  }

  const templateUrl = normalizeGemHost(
    applyTemplate(settings.sequenceComposeUrlTemplate, {
      sequenceId: id
    })
  );
  if (!templateUrl) {
    return `https://www.gem.com/sequence/${id}/edit/stages`;
  }

  try {
    const parsed = new URL(templateUrl);
    const listMatch = parsed.pathname.match(/^\/sequences\/([^/]+)\/?$/);
    const singularMatch = parsed.pathname.match(/^\/sequence\/([^/]+)(?:\/.*)?$/);
    const resolvedId = listMatch?.[1] || singularMatch?.[1] || id;
    parsed.pathname = `/sequence/${resolvedId}/edit/stages`;
    parsed.search = "";
    parsed.hash = "";
    return normalizeGemHost(parsed.toString());
  } catch (_error) {
    return `https://www.gem.com/sequence/${id}/edit/stages`;
  }
}

function buildAdjacentTabOptions(url, meta = {}, overrides = {}) {
  const options = { url };
  if (Number.isInteger(meta.sourceTabIndex)) {
    options.index = meta.sourceTabIndex + 1;
  }
  if (Number.isInteger(meta.sourceWindowId)) {
    options.windowId = meta.sourceWindowId;
  }
  if (typeof overrides.active === "boolean") {
    options.active = overrides.active;
  }
  return options;
}

function isWwwGemTabUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) {
    return false;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" && parsed.hostname === "www.gem.com";
  } catch (_error) {
    return false;
  }
}

function slugifyGemProjectName(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildGemProjectUrl(projectId, projectName = "") {
  const id = String(projectId || "").trim();
  if (!id) {
    return "";
  }
  const slug = slugifyGemProjectName(projectName);
  const segment = slug ? `${slug}--${id}` : id;
  return `https://www.gem.com/projects/${segment}`;
}

function normalizeSourceTabMeta(sender, meta = {}) {
  const tab = sender?.tab || null;
  const normalized = { ...(meta || {}) };
  if (!tab) {
    return normalized;
  }
  if (Number.isInteger(tab.id)) {
    normalized.sourceTabId = tab.id;
  }
  if (Number.isInteger(tab.index)) {
    normalized.sourceTabIndex = tab.index;
  }
  if (Number.isInteger(tab.windowId)) {
    normalized.sourceWindowId = tab.windowId;
  }
  if (typeof tab.url === "string" && tab.url) {
    normalized.sourceTabUrl = tab.url;
  }
  return normalized;
}

async function openGemNavigationTarget(url, meta = {}, options = {}) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) {
    throw new Error("Missing Gem navigation URL.");
  }

  const openInBackground = Boolean(options.openInBackground);
  const shouldReuseSourceTab = !openInBackground && isWwwGemTabUrl(meta.sourceTabUrl) && Number.isInteger(meta.sourceTabId);
  if (shouldReuseSourceTab) {
    const updated = await chrome.tabs.update(meta.sourceTabId, {
      url: rawUrl,
      active: true
    });
    return {
      mode: "same_tab",
      tabId: Number.isInteger(updated?.id) ? updated.id : meta.sourceTabId,
      url: rawUrl
    };
  }

  const created = await chrome.tabs.create(
    buildAdjacentTabOptions(rawUrl, meta, {
      active: !openInBackground
    })
  );
  return {
    mode: openInBackground ? "background_tab" : "new_tab",
    tabId: Number.isInteger(created?.id) ? created.id : 0,
    url: rawUrl
  };
}

function pingTabContentRuntime(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "CONTENT_RUNTIME_PING" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(response?.ok && response?.version === CONTENT_RUNTIME_VERSION));
    });
  });
}

async function probeTabContentRuntime(tabId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (expectedVersion) => {
        const globalReady =
          Boolean(globalThis.__GLS_UNIFIED_CONTENT_RUNTIME_READY__) &&
          globalThis.__GLS_UNIFIED_CONTENT_RUNTIME_VERSION__ === expectedVersion;
        const markerReady = document.documentElement?.getAttribute("data-gls-content-runtime") === "ready";
        return globalReady || markerReady;
      },
      args: [CONTENT_RUNTIME_VERSION]
    });
    return Array.isArray(result) && result[0] ? Boolean(result[0].result) : false;
  } catch (_error) {
    return false;
  }
}

function delayMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForTabContentRuntime(tabId, attempts = 24, delayMs = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await pingTabContentRuntime(tabId)) || (await probeTabContentRuntime(tabId))) {
      return true;
    }
    if (attempt < attempts - 1) {
      await delayMilliseconds(delayMs);
    }
  }
  return false;
}

async function ensureContentRuntimeInTab(tabId, files = CONTENT_RUNTIME_FILES) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    throw new Error("No active tab available for runtime injection.");
  }
  const ready = await waitForTabContentRuntime(tabId, 2, 40);
  if (ready) {
    return { injected: false };
  }
  const sharedProbe = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => Boolean(globalThis.__GLS_SHARED_RUNTIME_READY__)
  });
  const sharedReady = Array.isArray(sharedProbe) && sharedProbe[0] ? Boolean(sharedProbe[0].result) : false;
  if (!sharedReady) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [SHARED_RUNTIME_FILE]
    });
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: Array.isArray(files) && files.length > 0 ? files : CONTENT_RUNTIME_FILES
  });
  const readyAfterInject = await waitForTabContentRuntime(tabId);
  if (!readyAfterInject && (!Array.isArray(files) || files.includes("src/content.js"))) {
    throw new Error("Could not initialize the current page helper. Reload the tab and retry.");
  }
  return { injected: true };
}

async function callBackend(path, payload, settings, audit = {}) {
  const base = (settings.backendBaseUrl || "").replace(/\/$/, "");
  if (!base) {
    throw new Error("Missing backend base URL in extension settings.");
  }

  const startedAt = Date.now();
  let response;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => {
        controller.abort(new Error("Backend request timed out."));
      }, BACKEND_REQUEST_TIMEOUT_MS)
    : 0;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(settings.backendSharedToken ? { "X-Backend-Token": settings.backendSharedToken } : {})
      },
      signal: controller?.signal,
      body: JSON.stringify({
        ...(payload || {}),
        runId: audit.runId || "",
        actionId: audit.actionId || ""
      })
    });
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    const durationMs = Date.now() - startedAt;
    const isTimeout = String(error?.name || "").toLowerCase() === "aborterror";
    const message = isTimeout
      ? `Backend request timed out after ${Math.round(BACKEND_REQUEST_TIMEOUT_MS / 1000)}s (${base}).`
      : `Could not reach backend (${base}). ` +
        "If this org uses a hosted backend, verify backend URL/service health. " +
        "For local development, start backend with: cd /Users/maximilian/coding/gem-linkedin-shortcuts-extension/backend && npm start";
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
  if (timeoutId) {
    clearTimeout(timeoutId);
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
    const backendMessage = parsed?.error || parsed?.message || "Backend request failed.";
    const errorMessage =
      response.status === 401 && /unauthorized/i.test(String(backendMessage))
        ? "Unauthorized. Check BACKEND_SHARED_TOKEN and/or ALLOWED_EXTENSION_ORIGINS in backend/.env."
        : backendMessage;
    const surfacedError = `${errorMessage} (Backend: ${base})`;
    logEvent(settings, {
      level: "error",
      event: "backend.call.error",
      actionId: audit.actionId,
      runId: audit.runId,
      message: surfacedError,
      link: `${base}${path}`,
      durationMs,
      details: {
        step: audit.step || "",
        status: response.status,
        response: parsed
      }
    });
    throw new Error(surfacedError);
  }

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

function formatDateForHumans(rawDate) {
  const value = String(rawDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

async function ensureCandidate(settings, context, audit, options = {}) {
  const sourcePlatform = String(context?.sourcePlatform || "").trim().toLowerCase();
  const allowCreate = options.allowCreate !== false && sourcePlatform !== "gmail";
  const linkedInHandle = String(context.linkedInHandle || "").trim();
  const linkedInUrl = String(context.linkedinUrl || "").trim();
  const gemCandidateId = String(context.gemCandidateId || "").trim();
  const contextLink = getContextLink(context);

  const foundCandidate = await findCandidateByContext(settings, context, audit);
  if (foundCandidate?.id) {
    rememberCandidateResolution(context, foundCandidate);
    logEvent(settings, {
      event: "candidate.found",
      actionId: audit.actionId,
      runId: audit.runId,
      message: `Candidate already exists: ${foundCandidate.id}`,
      link: contextLink || linkedInUrl || context.gemProfileUrl || "",
      details: {
        candidateId: foundCandidate.id,
        linkedInHandle,
        linkedInUrl,
        gemCandidateId
      }
    });
    return foundCandidate;
  }

  if (!allowCreate) {
    if (sourcePlatform === "gmail") {
      throw new Error("Could not find an existing Gem candidate for this Gmail thread.");
    }
    throw new Error("Could not find an existing Gem candidate for this context.");
  }

  const names = splitProfileName(context.profileName);
  const { userId: createdByUserId, userEmail: createdByUserEmail } = getCreatedByIdentity(settings, context);
  let created = null;
  if (linkedInHandle || linkedInUrl) {
    created = await callBackend(
      "/api/candidates/create-from-linkedin",
      {
        linkedInHandle,
        linkedInUrl,
        profileUrl: linkedInUrl || context.profileUrl || context.githubUrl || context.gemProfileUrl || "",
        firstName: names.firstName,
        lastName: names.lastName,
        createdByUserId,
        createdByUserEmail
      },
      settings,
      { ...audit, step: "createCandidateFromLinkedIn" }
    );
  } else {
    const emails = collectContextEmails(context);
    const profileUrls = collectContextProfileUrls(context);
    created = await callBackend(
      "/api/candidates/create-from-context",
      {
        firstName: names.firstName,
        lastName: names.lastName,
        email: emails[0] || "",
        contactEmails: emails,
        profileUrl: profileUrls[0] || "",
        profileUrls,
        createdByUserId,
        createdByUserEmail
      },
      settings,
      { ...audit, step: "createCandidateFromContext" }
    );
  }

  if (!created?.candidate?.id) {
    throw new Error("Gem did not return a candidate id.");
  }

  rememberCandidateResolution(context, created.candidate);
  logEvent(settings, {
    event: "candidate.created",
    actionId: audit.actionId,
    runId: audit.runId,
    message: `Created candidate ${created.candidate.id}`,
    link: contextLink || linkedInUrl || context.gemProfileUrl || "",
    details: {
      candidateId: created.candidate.id,
      linkedInHandle,
      linkedInUrl,
      gemCandidateId,
      contactEmail: collectContextEmails(context)[0] || "",
      profileUrl: collectContextProfileUrls(context)[0] || ""
    }
  });
  notifyLinkedInStatusChanged({ ...context, gemCandidateId: created.candidate.id }, audit.runId);
  return created.candidate;
}

async function runAction(actionId, context, settings, meta = {}) {
  const runId = meta.runId || generateId();
  const source = meta.source || "unknown";
  const audit = { actionId, runId };
  const contextLink = getContextLink(context);

  logEvent(settings, {
    event: "action.requested",
    actionId,
    runId,
    source: `extension.${source}`,
    message: `Action requested: ${actionId}`,
    link: contextLink,
    details: {
      source,
      sourcePlatform: context.sourcePlatform || "",
      linkedInHandle: context.linkedInHandle || "",
      profileName: context.profileName || "",
      gemCandidateId: context.gemCandidateId || "",
      contactEmail: context.contactEmail || "",
      profileUrl: context.profileUrl || "",
      ashbyJobId: context.ashbyJobId || "",
      candidateNoteLength: String(context.candidateNote || "").trim().length || 0
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
      link: contextLink
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
      link: contextLink
    });
    return { ok: false, message, runId };
  }
  if (!contextHasCandidateIdentity(context)) {
    const message = "No supported profile context detected for this action.";
    logEvent(settings, {
      level: "warn",
      event: "action.rejected",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: contextLink
    });
    return { ok: false, message, runId };
  }

  if (actionId === ACTIONS.OPEN_ASHBY_PROFILE) {
    let linkedInUrl = String(context.linkedinUrl || "").trim();
    let linkedInHandle = String(context.linkedInHandle || "").trim();
    if (!linkedInUrl && !linkedInHandle) {
      try {
        const existingCandidate = await ensureCandidate(settings, context, audit, { allowCreate: false });
        const identity = extractLinkedInIdentityFromCandidate(existingCandidate);
        linkedInUrl = String(identity.linkedInUrl || "").trim();
        linkedInHandle = String(identity.linkedInHandle || "").trim();
      } catch (_error) {
        // Continue to rejection path below.
      }
    }
    if (!linkedInUrl && !linkedInHandle) {
      const message = "Could not determine LinkedIn identity for Ashby profile lookup.";
      logEvent(settings, {
        level: "warn",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        link: contextLink
      });
      return { ok: false, message, runId };
    }

    const lookup = await callBackend(
      "/api/ashby/candidates/find-by-linkedin",
      {
        linkedInUrl,
        linkedInHandle,
        profileName: String(context.profileName || "").trim()
      },
      settings,
      { ...audit, step: "findAshbyCandidateByLinkedIn" }
    );

    const url = String(lookup?.link || lookup?.candidate?.profileUrl || "").trim();
    if (!lookup?.found || !url) {
      const message = lookup?.message || "No Ashby candidate matched this LinkedIn profile.";
      logEvent(settings, {
        level: "warn",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        link: contextLink,
        details: {
          linkedInHandle,
          linkedInUrl
        }
      });
      return { ok: false, message, runId };
    }

    await chrome.tabs.create({ url });
    const message = lookup?.message || "Opened profile in Ashby.";
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: url,
      details: {
        linkedInHandle,
        linkedInUrl,
        ashbyCandidateId: String(lookup?.candidate?.id || ""),
        indexAgeMs: Number(lookup?.index?.ageMs) || 0,
        indexFresh: Boolean(lookup?.index?.fresh)
      }
    });
    return { ok: true, message, runId, link: url, details: lookup };
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
      link: candidate.weblink || contextLink,
      details: { candidateId: candidate.id }
    });
    return { ok: true, message, runId, link: candidate.weblink || "" };
  }

  if (actionId === ACTIONS.UPLOAD_TO_ASHBY) {
    const jobId = String(context.ashbyJobId || "").trim();
    if (!jobId) {
      const message = "Missing Ashby job selection.";
      logEvent(settings, {
        level: "warn",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        link: contextLink
      });
      return { ok: false, message, runId };
    }

    let gemCandidateId = String(context.gemCandidateId || "").trim();
    if (!gemCandidateId) {
      const candidate = await ensureCandidate(settings, context, audit);
      gemCandidateId = String(candidate.id || "").trim();
    }
    if (!gemCandidateId) {
      throw new Error("Could not resolve candidate id for Ashby upload.");
    }

    const data = await callBackend(
      "/api/ashby/upload-candidate",
      {
        gemCandidateId,
        jobId,
        jobName: String(context.ashbyJobName || "").trim(),
        profileName: String(context.profileName || "").trim()
      },
      settings,
      { ...audit, step: "uploadToAshby" }
    );

    const message = data?.message || "Uploaded candidate to Ashby.";
    const link = String(data?.link || "").trim();
    await touchAshbyJobRecentUsage(jobId, String(context.ashbyJobName || "").trim());
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: link || contextLink,
      details: {
        gemCandidateId,
        ashbyJobId: jobId,
        ashbyJobName: String(context.ashbyJobName || "").trim(),
        ashbyApplicationId: String(data?.ashbyApplicationId || ""),
        ashbyCandidateId: String(data?.ashbyCandidateId || ""),
        stageTitle: String(data?.stageTitle || "")
      }
    });
    return { ok: true, message, runId, link, details: data || {} };
  }

  if (actionId === ACTIONS.EDIT_SEQUENCE) {
    const sequenceId = String(context.sequenceId || "").trim();
    if (!sequenceId) {
      const message = "Pick a sequence to edit.";
      logEvent(settings, {
        level: "warn",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        link: contextLink
      });
      return { ok: false, message, runId };
    }

    await touchSequenceRecentUsage(sequenceId, context.sequenceName || "");
    const openUrl = buildGemSequenceEditUrl(settings, sequenceId);
    if (!openUrl) {
      const message = "Could not build a Gem URL for sequence edit.";
      logEvent(settings, {
        level: "error",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        details: {
          sequenceId,
          sequenceName: context.sequenceName || ""
        }
      });
      return { ok: false, message, runId };
    }

    await chrome.tabs.create({ url: openUrl });
    const message = "Opened sequence edit view in Gem.";
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: openUrl,
      details: {
        sequenceId,
        sequenceName: context.sequenceName || ""
      }
    });
    return { ok: true, message, runId, link: openUrl };
  }

  if (actionId === ACTIONS.SET_CUSTOM_FIELD) {
    let candidateId = String(context.gemCandidateId || "").trim();
    let candidateLink = String(context.gemProfileUrl || "").trim();
    if (!candidateId) {
      const candidate = await ensureCandidate(settings, context, audit);
      candidateId = String(candidate.id || "").trim();
      candidateLink = String(candidate.weblink || candidateLink || "").trim();
    }
    if (!candidateId) {
      throw new Error("Could not resolve candidate id for custom field update.");
    }

    const customFieldId = context.customFieldId || settings.customFieldId;
    const customFieldValue =
      context.customFieldValue !== undefined && context.customFieldValue !== null
        ? context.customFieldValue
        : settings.customFieldValue;
    const customFieldOptionId = context.customFieldOptionId || "";
    const customFieldOptionIds = Array.isArray(context.customFieldOptionIds)
      ? context.customFieldOptionIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
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
        link: contextLink
      });
      return { ok: false, message, runId };
    }

    await callBackend(
      "/api/candidates/set-custom-field",
      {
        candidateId,
        customFieldId,
        value: customFieldValue,
        customFieldOptionId,
        customFieldOptionIds,
        customFieldValueType
      },
      settings,
      { ...audit, step: "setCustomField" }
    );
    await patchCachedCustomFieldSelectionForContext(
      { ...context, gemCandidateId: candidateId },
      candidateId,
      {
        customFieldId,
        customFieldValue,
        customFieldValueLabels: Array.isArray(context.customFieldValueLabels)
          ? context.customFieldValueLabels.slice()
          : [],
        customFieldOptionId,
        customFieldOptionIds,
        customFieldValueType
      }
    ).catch(() => false);
    notifyLinkedInStatusChanged({ ...context, gemCandidateId: candidateId }, runId);
    const message = "Custom field updated for candidate.";
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: candidateLink || contextLink,
      details: {
        candidateId,
        customFieldId,
        selectedOptionCount: customFieldOptionIds.length
      }
    });
    return { ok: true, message, runId, link: candidateLink || "", candidateId };
  }

  if (actionId === ACTIONS.OPEN_ACTIVITY) {
    const directGemProfileUrl = normalizeGemHost(String(context.gemProfileUrl || "").trim());
    if (directGemProfileUrl) {
      const navigation = await openGemNavigationTarget(directGemProfileUrl, meta);
      const message = "Opened profile in Gem.";
      logEvent(settings, {
        event: "action.succeeded",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        link: navigation.url,
        details: {
          candidateId: String(context.gemCandidateId || "").trim(),
          mode: navigation.mode,
          resolvedFrom: "context.gemProfileUrl"
        }
      });
      return { ok: true, message, runId, link: navigation.url };
    }
  }

  const candidate = await ensureCandidate(settings, context, audit);

  if (actionId === ACTIONS.ADD_TO_PROJECT) {
    const projectId = context.projectId || settings.defaultProjectId;
    const { userId, userEmail } = getCreatedByIdentity(settings, context);
    if (!projectId) {
      const message = "Missing project ID. Set a default or enter one at runtime.";
      logEvent(settings, {
        level: "warn",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        link: contextLink
      });
      return { ok: false, message, runId };
    }
    await callBackend(
      "/api/projects/add-candidate",
      {
        projectId,
        candidateId: candidate.id,
        userId,
        userEmail
      },
      settings,
      { ...audit, step: "addToProject" }
    );
    await touchProjectRecentUsage(projectId, context.projectName || "");
    notifyLinkedInStatusChanged({ ...context, gemCandidateId: candidate.id }, runId);
    const message = `Candidate added to project ${projectId}.`;
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: candidate.weblink || contextLink,
      details: {
        candidateId: candidate.id,
        projectId,
        userId,
        userEmail
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
    const navigation = await openGemNavigationTarget(url, meta);
    const message = "Opened profile in Gem.";
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: navigation.url,
      details: {
        candidateId: candidate.id,
        mode: navigation.mode,
        resolvedFrom: directLink ? "candidate.weblink" : "activityUrlTemplate"
      }
    });
    return { ok: true, message, runId, link: navigation.url };
  }

  if (actionId === ACTIONS.ADD_NOTE_TO_CANDIDATE) {
    const note = String(context.candidateNote || "").trim();
    const { userId, userEmail } = getCreatedByIdentity(settings, context);
    if (!note) {
      const message = "Note is required.";
      logEvent(settings, {
        level: "warn",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        link: contextLink
      });
      return { ok: false, message, runId };
    }

    const data = await callBackend(
      "/api/candidates/add-note",
      {
        candidateId: candidate.id,
        note,
        userId,
        userEmail
      },
      settings,
      { ...audit, step: "addCandidateNote" }
    );
    const message = "Added note to candidate.";
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: candidate.weblink || contextLink,
      details: {
        candidateId: candidate.id,
        userId,
        userEmail,
        noteLength: note.length,
        noteId: String(data?.note?.id || "")
      }
    });
    return { ok: true, message, runId, link: candidate.weblink || "", details: data || {} };
  }

  if (actionId === ACTIONS.SET_REMINDER) {
    const reminderDueDate = String(context.reminderDueDate || "").trim();
    const reminderNote = String(context.reminderNote || "").trim();
    const { userId, userEmail } = getCreatedByIdentity(settings, context);

    if (!reminderDueDate) {
      const message = "Missing reminder due date.";
      logEvent(settings, {
        level: "warn",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        link: contextLink
      });
      return { ok: false, message, runId };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reminderDueDate)) {
      const message = "Reminder due date must use YYYY-MM-DD.";
      logEvent(settings, {
        level: "warn",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        link: contextLink,
        details: { reminderDueDate }
      });
      return { ok: false, message, runId };
    }

    await callBackend(
      "/api/candidates/set-due-date",
      {
        candidateId: candidate.id,
        date: reminderDueDate,
        note: reminderNote,
        userId,
        userEmail
      },
      settings,
      { ...audit, step: "setReminder" }
    );

    const message = `Reminder set for ${formatDateForHumans(reminderDueDate)}.`;
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: candidate.weblink || contextLink,
      details: {
        candidateId: candidate.id,
        dueDate: reminderDueDate,
        userId,
        userEmail,
        hasNote: Boolean(reminderNote)
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
        link: contextLink
      });
      return { ok: false, message, runId };
    }

    await touchSequenceRecentUsage(sequenceId, context.sequenceName || "");

    let candidateProfileUrl = normalizeGemHost(String(candidate.weblink || ""));
    if (!candidateProfileUrl) {
      const candidateData = await callBackend(
        "/api/candidates/get",
        { candidateId: candidate.id },
        settings,
        { ...audit, step: "getCandidateForSequence" }
      );
      candidateProfileUrl = normalizeGemHost(String(candidateData?.candidate?.weblink || ""));
    }

    let openUrl = "";
    if (candidateProfileUrl) {
      openUrl = buildGemSequenceAutomationUrl(candidateProfileUrl, {
        runId,
        candidateId: candidate.id,
        sequenceId,
        sequenceName: context.sequenceName || ""
      });
    } else {
      openUrl = normalizeGemHost(
        applyTemplate(settings.sequenceComposeUrlTemplate, {
          sequenceId,
          candidateId: candidate.id
        })
      );
    }

    if (!openUrl) {
      const message = "Could not build a Gem URL for sequence flow.";
      logEvent(settings, {
        level: "error",
        event: "action.rejected",
        actionId,
        runId,
        source: `extension.${source}`,
        message,
        details: {
          candidateId: candidate.id,
          sequenceId
        }
      });
      return { ok: false, message, runId };
    }

    const createdTab = await chrome.tabs.create(buildAdjacentTabOptions(openUrl, meta, { active: false }));
    const message = candidateProfileUrl
      ? "Opened candidate-specific sequence flow in Gem."
      : "Opened sequence in Gem. Complete send + activate in Gem UI.";
    logEvent(settings, {
      event: "action.succeeded",
      actionId,
      runId,
      source: `extension.${source}`,
      message,
      link: openUrl || "",
      details: {
        candidateId: candidate.id,
        sequenceId,
        sequenceName: context.sequenceName || "",
        candidateProfileUrl: candidateProfileUrl || "",
        tabId: Number.isInteger(createdTab?.id) ? createdTab.id : null,
        active: false,
        runId
      }
    });
    return {
      ok: true,
      message,
      runId,
      link: openUrl || ""
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
    link: contextLink
  });
  return { ok: false, message, runId };
}

async function refreshCustomFieldsForContext(settings, context, runId, options = {}) {
  const allowCreate = options.allowCreate !== false;
  if (!allowCreate) {
    const prefetched = await prefetchCustomFieldsForContext(settings, context, runId, {
      forceFreshLookup: Boolean(options.forceRefresh)
    });
    return {
      candidateId: prefetched.candidateId,
      customFields: prefetched.customFields,
      statusLabels: normalizePassiveStatusLabels(prefetched.statusLabels),
      candidateProjectIds: normalizeCandidateProjectIds(prefetched.candidateProjectIds),
      fromCache: false,
      stale: false
    };
  }

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
  const candidateProjectIds = normalizeCandidateProjectIds(data?.candidateProjectIds);
  const statusLabels = (() => {
    const explicit = normalizePassiveStatusLabels(data?.statusLabels);
    return explicit.length > 0 ? explicit : getPassiveGemStatusLabels(customFields);
  })();
  await setCachedCustomFieldsForContext(context, candidate.id, customFields, {
    statusLabels,
    candidateProjectIds
  });
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
    statusLabels,
    candidateProjectIds,
    fromCache: false,
    stale: false
  };
}

async function prefetchCustomFieldsForContext(settings, context, runId, options = {}) {
  const actionId = ACTIONS.SET_CUSTOM_FIELD;
  const audit = { actionId, runId };
  const candidateId = await findExistingCandidateIdForContext(settings, context, runId, actionId, {
    forceFreshLookup: Boolean(options.forceFreshLookup)
  });
  if (!candidateId) {
    let customFields = [];
    try {
      const catalog = await callBackend(
        "/api/custom-fields/list",
        {
          limit: 0,
          catalogOnly: true
        },
        settings,
        { ...audit, step: "warmCustomFieldCatalog" }
      );
      customFields = Array.isArray(catalog?.customFields) ? catalog.customFields : [];
    } catch (_error) {
      // Best-effort warm-up only. The interactive load path will still fetch on demand.
    }
    await setCachedCustomFieldsForContext(context, "", customFields, { candidateProjectIds: [] });
    return {
      candidateId: "",
      customFields,
      statusLabels: [],
      candidateProjectIds: []
    };
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
  const candidateProjectIds = normalizeCandidateProjectIds(data?.candidateProjectIds);
  const statusLabels = (() => {
    const explicit = normalizePassiveStatusLabels(data?.statusLabels);
    return explicit.length > 0 ? explicit : getPassiveGemStatusLabels(customFields);
  })();
  await setCachedCustomFieldsForContext(context, candidateId, customFields, {
    statusLabels,
    candidateProjectIds
  });

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
    customFields,
    statusLabels,
    candidateProjectIds
  };
}

function ensureCustomFieldRefresh(settings, context, runId, options = {}) {
  const allowCreate = options.allowCreate !== false;
  const baseKey = getCustomFieldCacheKey(context) || `fallback:${runId}`;
  const key = `${baseKey}|${allowCreate ? "create" : "nocreate"}`;
  const existing = customFieldRefreshPromises.get(key);
  if (existing) {
    return existing;
  }
  const promise = refreshCustomFieldsForContext(settings, context, runId, {
    allowCreate,
    forceRefresh: Boolean(options.forceRefresh)
  }).finally(() => {
    customFieldRefreshPromises.delete(key);
  });
  customFieldRefreshPromises.set(key, promise);
  return promise;
}

async function listCustomFieldsForContext(settings, context, runId, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const allowCreate = options.allowCreate !== false;
  const allowEmptyCandidateCache = Boolean(options.allowEmptyCandidateCache);
  const refreshInBackground = options.refreshInBackground !== false;
  const actionId = ACTIONS.SET_CUSTOM_FIELD;

  const cached = await getCachedCustomFieldsForContext(context);
  const cachedCandidateId = String(cached.entry?.candidateId || "").trim();
  const hasUsableCachedEntry = Boolean(cached.entry && (cachedCandidateId || allowEmptyCandidateCache));
  if (!forceRefresh && hasUsableCachedEntry) {
    if (refreshInBackground && (!cached.isFresh || !cachedCandidateId)) {
      ensureCustomFieldRefresh(settings, context, runId, {
        allowCreate,
        forceRefresh: Boolean(!cachedCandidateId)
      }).catch(() => {});
    }
    logEvent(settings, {
      event: "custom_fields.list.loaded",
      actionId,
      runId,
      message: `Loaded ${cached.entry.customFields.length} custom fields from cache.`,
      details: {
        candidateId: cached.entry.candidateId,
        stale: !cached.isFresh,
        allowCreate
      }
    });
    return {
      candidateId: cachedCandidateId,
      customFields: cached.entry.customFields,
      statusLabels: normalizePassiveStatusLabels(cached.entry.statusLabels),
      candidateProjectIds: normalizeCandidateProjectIds(cached.entry.candidateProjectIds),
      fromCache: true,
      stale: !cached.isFresh
    };
  }

  const refreshed = await ensureCustomFieldRefresh(settings, context, runId, {
    allowCreate,
    forceRefresh: forceRefresh || Boolean(cached.entry && !cachedCandidateId)
  });
  logEvent(settings, {
    event: "custom_fields.list.loaded",
    actionId,
    runId,
    message: `Loaded ${refreshed.customFields.length} custom fields from backend.`,
    details: {
      candidateId: refreshed.candidateId,
      stale: false,
      allowCreate
    }
  });
  return refreshed;
}

async function getPassiveGemStatusForContext(settings, context, runId, options = {}) {
  const data = await listCustomFieldsForContext(settings, context, runId, {
    preferCache: options.preferCache !== false,
    refreshInBackground: options.refreshInBackground !== false,
    forceRefresh: Boolean(options.forceRefresh),
    allowCreate: false,
    allowEmptyCandidateCache: true
  });
  const candidateId = String(data?.candidateId || "").trim();
  return {
    candidateId,
    statusLabels: normalizePassiveStatusLabels(data?.statusLabels),
    isDoNotContact: Boolean(candidateId) && isCandidateInDoNotContactProject(data?.candidateProjectIds),
    hasCandidate: Boolean(candidateId),
    fromCache: Boolean(data?.fromCache),
    stale: Boolean(data?.stale),
    source: data?.fromCache ? (data?.stale ? "stale-cache" : "cache") : "backend"
  };
}

async function findExistingCandidateIdForContext(settings, context, runId, actionId, options = {}) {
  const existing = await findCandidateByContext(settings, context, {
    actionId,
    runId,
    step: "findExistingCandidateForContext",
    forceFreshLookup: Boolean(options.forceFreshLookup)
  });
  if (existing?.id) {
    rememberCandidateResolution(context, existing);
  }
  return String(existing?.id || "").trim();
}

async function refreshCandidateEmailsForContext(settings, context, runId, options = {}) {
  const actionId = ACTIONS.MANAGE_EMAILS;
  const allowCreate = options.allowCreate !== false;
  let candidateId = "";

  if (allowCreate) {
    const candidate = await ensureCandidate(settings, context, { actionId, runId });
    candidateId = String(candidate?.id || "").trim();
  } else {
    candidateId = await findExistingCandidateIdForContext(settings, context, runId, actionId);
  }

  if (!candidateId) {
    await setCachedCandidateEmailsForContext(context, "", [], "");
    return {
      candidateId: "",
      emails: [],
      primaryEmail: "",
      fromCache: false,
      stale: false
    };
  }

  const data = await callBackend(
    "/api/candidates/emails/list",
    {
      candidateId
    },
    settings,
    { actionId, runId, step: "listCandidateEmails" }
  );
  const emails = normalizeCandidateEmailList(data?.emails);
  const primaryEmail = normalizeEmailAddress(data?.primaryEmail || getPrimaryEmailFromList(emails));
  await setCachedCandidateEmailsForContext(context, String(data?.candidateId || candidateId), emails, primaryEmail);

  return {
    candidateId: String(data?.candidateId || candidateId),
    emails,
    primaryEmail,
    fromCache: false,
    stale: false
  };
}

function ensureCandidateEmailRefresh(settings, context, runId, options = {}) {
  const allowCreate = options.allowCreate !== false;
  const baseKey = getCustomFieldCacheKey(context) || `fallback:${runId}`;
  const key = `${baseKey}|${allowCreate ? "create" : "nocreate"}`;
  const existing = candidateEmailRefreshPromises.get(key);
  if (existing) {
    return existing;
  }
  const promise = refreshCandidateEmailsForContext(settings, context, runId, { allowCreate }).finally(() => {
    candidateEmailRefreshPromises.delete(key);
  });
  candidateEmailRefreshPromises.set(key, promise);
  return promise;
}

async function listCandidateEmailsForContext(settings, context, runId, options = {}) {
  const actionId = ACTIONS.MANAGE_EMAILS;
  const forceRefresh = Boolean(options.forceRefresh);
  const allowCreate = options.allowCreate !== false;

  const cached = await getCachedCandidateEmailsForContext(context);
  if (!forceRefresh && cached.entry) {
    if (!cached.isFresh) {
      ensureCandidateEmailRefresh(settings, context, runId, { allowCreate }).catch(() => {});
    }
    logEvent(settings, {
      event: "candidate.emails.loaded",
      actionId,
      runId,
      message: `Loaded ${cached.entry.emails.length} candidate email${cached.entry.emails.length === 1 ? "" : "s"} from cache.`,
      details: {
        candidateId: cached.entry.candidateId,
        stale: !cached.isFresh,
        allowCreate
      }
    });
    return {
      candidateId: cached.entry.candidateId,
      emails: cached.entry.emails,
      primaryEmail: cached.entry.primaryEmail,
      fromCache: true,
      stale: !cached.isFresh
    };
  }

  const refreshed = await ensureCandidateEmailRefresh(settings, context, runId, { allowCreate });
  logEvent(settings, {
    event: "candidate.emails.loaded",
    actionId,
    runId,
    message: `Loaded ${refreshed.emails.length} candidate email${refreshed.emails.length === 1 ? "" : "s"} from backend.`,
    details: {
      candidateId: refreshed.candidateId,
      stale: false,
      allowCreate
    }
  });
  return refreshed;
}

async function addCandidateEmailForContext(settings, context, runId, emailAddress) {
  const actionId = ACTIONS.MANAGE_EMAILS;
  const candidate = await ensureCandidate(settings, context, { actionId, runId });
  const data = await callBackend(
    "/api/candidates/emails/add",
    {
      candidateId: candidate.id,
      email: String(emailAddress || "").trim()
    },
    settings,
    { actionId, runId, step: "addCandidateEmail" }
  );
  const emails = normalizeCandidateEmailList(data?.emails);
  const primaryEmail = getPrimaryEmailFromList(emails);
  await setCachedCandidateEmailsForContext(context, String(data?.candidateId || candidate.id || ""), emails, primaryEmail);
  logEvent(settings, {
    event: "candidate.email.added",
    actionId,
    runId,
    message: "Candidate email added and set primary.",
    details: {
      candidateId: String(data?.candidateId || candidate.id || ""),
      emailAddress: String(emailAddress || "").trim(),
      emailCount: emails.length
    }
  });
  return {
    candidateId: String(data?.candidateId || candidate.id || ""),
    emails,
    primaryEmail
  };
}

async function setCandidatePrimaryEmailForContext(settings, context, runId, emailAddress) {
  const actionId = ACTIONS.MANAGE_EMAILS;
  const candidate = await ensureCandidate(settings, context, { actionId, runId });
  const data = await callBackend(
    "/api/candidates/emails/set-primary",
    {
      candidateId: candidate.id,
      email: String(emailAddress || "").trim()
    },
    settings,
    { actionId, runId, step: "setCandidatePrimaryEmail" }
  );
  const emails = normalizeCandidateEmailList(data?.emails);
  const primaryEmail = getPrimaryEmailFromList(emails);
  await setCachedCandidateEmailsForContext(context, String(data?.candidateId || candidate.id || ""), emails, primaryEmail);
  logEvent(settings, {
    event: "candidate.email.primary_set",
    actionId,
    runId,
    message: "Candidate primary email updated.",
    details: {
      candidateId: String(data?.candidateId || candidate.id || ""),
      primaryEmail
    }
  });
  return {
    candidateId: String(data?.candidateId || candidate.id || ""),
    emails,
    primaryEmail
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "GET_SETTINGS") {
    getSettings().then((settings) => sendResponse({ ok: true, settings }));
    return true;
  }

  if (message.type === "GET_ORG_DEFAULTS") {
    loadOrgDefaults()
      .then((orgDefaults) => sendResponse({ ok: true, orgDefaults: orgDefaults || {} }))
      .catch((error) => sendResponse({ ok: false, message: error.message || "Could not load org defaults." }));
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
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "UPDATE_SHORTCUT") {
    getSettings()
      .then(async (settings) => {
        const shortcutId = String(message.shortcutId || "").trim();
        const validIds = SHORTCUT_IDS;
        if (!validIds.includes(shortcutId)) {
          throw new Error("Unknown shortcut action.");
        }

        const shortcut = normalizeShortcut(message.shortcut || "");
        if (!shortcut) {
          throw new Error("Shortcut is required.");
        }
        if (!shortcutCanOmitModifier(shortcutId) && !shortcutHasModifier(shortcut)) {
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

  if (message.type === "ENSURE_CONTENT_RUNTIME") {
    Promise.resolve()
      .then(async () => {
        const requestedTabId = Number(message.tabId);
        const senderTabId = Number(sender?.tab?.id);
        const tabId = Number.isInteger(requestedTabId) && requestedTabId >= 0
          ? requestedTabId
          : Number.isInteger(senderTabId) && senderTabId >= 0
            ? senderTabId
            : -1;
        const files = Array.isArray(message.files) && message.files.length > 0 ? message.files : CONTENT_RUNTIME_FILES;
        const result = await ensureContentRuntimeInTab(tabId, files);
        sendResponse({ ok: true, injected: Boolean(result.injected) });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "RUN_ACTION") {
    getSettings()
      .then(async (settings) => {
        const sourceTabMeta = normalizeSourceTabMeta(sender, message.meta || {});
        try {
          return await runAction(message.actionId, message.context || {}, settings, {
            ...sourceTabMeta
          });
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

  if (message.type === "CREATE_GEM_PROJECT") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const actionId = ACTIONS.GEM_ACTIONS;
        const payload = {
          name: String(message.name || "").trim(),
          description: String(message.description || "").trim(),
          privacyType: String(message.privacyType || "").trim(),
          userId: String(message.userId || settings.createdByUserId || "").trim(),
          userEmail: String(message.userEmail || settings.createdByUserEmail || "").trim()
        };
        const data = await callBackend("/api/projects/create", payload, settings, {
          actionId,
          runId,
          step: "createProject"
        });
        const createdAt = String(data?.project?.createdAt || new Date().toISOString());
        const createdProject = data?.project && typeof data.project === "object" ? data.project : {};
        const cachedProject = await upsertProjectCache(
          {
            ...createdProject,
            createdAt
          },
          {
            createdAt
          }
        );
        const project = {
          ...createdProject,
          ...(cachedProject || {}),
          createdAt,
          url: String(createdProject.url || buildGemProjectUrl(cachedProject?.id || createdProject.id, cachedProject?.name || createdProject.name) || "")
        };
        if (project?.id) {
          await touchProjectRecentUsage(project.id, project.name || "");
        }
        sendResponse({
          ok: true,
          runId,
          message: data?.message || "Created project.",
          project: {
            id: String(project.id || ""),
            name: String(project.name || ""),
            privacyType: String(project.privacyType || ""),
            description: String(project.description || ""),
            createdAt: String(project.createdAt || ""),
            url: String(project.url || buildGemProjectUrl(project.id, project.name) || "")
          }
        });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "SEARCH_GEM_PEOPLE") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const actionId = ACTIONS.GEM_ACTIONS;
        const query = String(message.query || "").trim();
        const limitRaw = Number(message.limit);
        const limit =
          Number.isFinite(limitRaw) && limitRaw > 0 ? Math.max(1, Math.min(Math.trunc(limitRaw), 200)) : 25;
        const data = await callBackend(
          "/api/candidates/search",
          {
            query,
            limit
          },
          settings,
          {
            actionId,
            runId,
            step: "searchPeople"
          }
        );
        sendResponse({
          ok: true,
          runId,
          candidates: Array.isArray(data?.candidates) ? data.candidates : []
        });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "OPEN_GEM_NAVIGATION") {
    const meta = normalizeSourceTabMeta(sender, message.meta || {});
    const runId = String(message.runId || meta.runId || "").trim() || generateId();
    const actionId = String(message.actionId || ACTIONS.GEM_ACTIONS).trim();
    getSettings()
      .then(async (settings) => {
        const url = String(message.url || "").trim();
        if (!url) {
          throw new Error("Missing URL to open.");
        }
        const result = await openGemNavigationTarget(url, meta, {
          openInBackground: Boolean(message.openInBackground)
        });
        logEvent(settings, {
          source: "extension.background",
          event: "gem.navigation.opened",
          actionId,
          runId,
          message:
            result.mode === "same_tab"
              ? "Opened Gem navigation in current tab."
              : result.mode === "background_tab"
                ? "Opened Gem navigation in background tab."
                : "Opened Gem navigation in adjacent tab.",
          link: result.url,
          details: {
            mode: result.mode,
            tabId: result.tabId || 0,
            sourceTabUrl: String(meta.sourceTabUrl || "")
          }
        });
        sendResponse({
          ok: true,
          runId,
          link: result.url,
          message:
            result.mode === "same_tab"
              ? "Opened in current tab."
              : result.mode === "background_tab"
                ? "Opened in background tab."
                : "Opened in new tab."
        });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message, runId }));
    return true;
  }

  if (message.type === "LIST_PROJECTS") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const actionId = ACTIONS.ADD_TO_PROJECT;
        const query = String(message.query || "").trim();
        const limit = normalizeProjectLimit(message.limit);
        const forceRefresh = Boolean(message.forceRefresh);
        const preferCache = Boolean(message.preferCache);
        const forceNewRefresh = Boolean(message.forceNewRefresh);
        const cache = await getProjectCache();
        let projects = Array.isArray(cache.projects) ? cache.projects : [];
        const hadCache = projects.length > 0;
        const cacheComplete = Boolean(cache.isComplete);
        const cacheFresh = isProjectCacheFresh(cache);

        if (forceRefresh) {
          projects = await ensureProjectRefresh(settings, runId, limit, { forceNew: forceNewRefresh });
        } else if (projects.length === 0) {
          if (preferCache) {
            ensureProjectRefresh(settings, runId, limit).catch(() => {});
          } else {
            projects = await ensureProjectRefresh(settings, runId, limit);
          }
        } else if (!cacheFresh || !cacheComplete) {
          ensureProjectRefresh(settings, runId, limit).catch(() => {});
        }

        const usageMap = await getProjectRecentUsage();
        let sorted = sortProjectsForPicker(projects, usageMap, query);

        if (!forceRefresh && query && (sorted.length === 0 || !cacheComplete)) {
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
            cacheComplete,
            forceRefresh,
            preferCache,
            forceNewRefresh
          }
        });
        sendResponse({ ok: true, projects: trimmed, runId });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "LIST_SEQUENCES") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const requestedActionId = String(message.actionId || "").trim();
        const validActionIds = ACTION_IDS;
        const actionId = validActionIds.includes(requestedActionId) ? requestedActionId : ACTIONS.SEND_SEQUENCE;
        const query = String(message.query || "").trim();
        const limit = normalizeSequenceLimit(message.limit);
        const forceRefresh = Boolean(message.forceRefresh);
        const preferCache = Boolean(message.preferCache);
        const forceNewRefresh = Boolean(message.forceNewRefresh);
        const cache = await getSequenceCache();
        let sequences = Array.isArray(cache.sequences) ? cache.sequences : [];
        const hadCache = sequences.length > 0;
        const cacheComplete = Boolean(cache.isComplete);
        const cacheFresh = isSequenceCacheFresh(cache);

        if (forceRefresh) {
          sequences = await ensureSequenceRefresh(settings, runId, limit, actionId, { forceNew: forceNewRefresh });
        } else if (sequences.length === 0) {
          if (preferCache) {
            ensureSequenceRefresh(settings, runId, limit, actionId).catch(() => {});
          } else {
            sequences = await ensureSequenceRefresh(settings, runId, limit, actionId);
          }
        } else if (!cacheFresh || !cacheComplete) {
          ensureSequenceRefresh(settings, runId, limit, actionId).catch(() => {});
        }

        const usageMap = await getSequenceRecentUsage();
        let sorted = sortSequencesForPicker(sequences, usageMap, query);

        if (!forceRefresh && query && (sorted.length === 0 || !cacheComplete)) {
          const refreshed = await ensureSequenceRefresh(settings, runId, limit, actionId);
          sorted = sortSequencesForPicker(refreshed, usageMap, query);
        }
        const trimmed = limit > 0 ? sorted.slice(0, limit) : sorted;
        logEvent(settings, {
          event: "sequences.list.loaded",
          actionId,
          runId,
          message: `Loaded ${trimmed.length} sequences for picker.`,
          details: {
            query,
            limit,
            cacheCount: sequences.length,
            fromCache: hadCache,
            cacheFresh,
            cacheComplete,
            forceRefresh,
            preferCache,
            forceNewRefresh
          }
        });
        sendResponse({ ok: true, sequences: trimmed, runId });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "LIST_ASHBY_JOBS") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const actionId = ACTIONS.UPLOAD_TO_ASHBY;
        const query = String(message.query || "").trim();
        const limit = normalizeAshbyJobLimit(message.limit);
        const data = await callBackend(
          "/api/ashby/jobs/list",
          {
            query,
            limit
          },
          settings,
          { actionId, runId, step: "listAshbyJobs" }
        );
        const jobs = Array.isArray(data?.jobs) ? data.jobs.map(normalizeAshbyJob).filter(Boolean) : [];
        const usageMap = await getAshbyJobRecentUsage();
        const sorted = sortAshbyJobsForPicker(jobs, usageMap, query);
        const trimmed = limit > 0 ? sorted.slice(0, limit) : sorted;
        logEvent(settings, {
          event: "ashby.jobs.list.loaded",
          actionId,
          runId,
          message: `Loaded ${trimmed.length} Ashby jobs for picker.`,
          details: {
            query,
            limit
          }
        });
        sendResponse({ ok: true, jobs: trimmed, runId });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "LIST_GEM_USERS") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const actionId = "listUsers";
        const pageSizeRaw = Number(message.pageSize);
        const pageSize =
          Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
            ? Math.max(1, Math.min(Math.trunc(pageSizeRaw), 100))
            : 100;
        const email = String(message.email || "").trim();
        const data = await callBackend(
          "/api/users/list",
          {
            email: email || undefined,
            pageSize
          },
          settings,
          { actionId, runId, step: "listUsers" }
        );
        const users = Array.isArray(data?.users) ? data.users.map(normalizeGemUser).filter(Boolean) : [];
        logEvent(settings, {
          event: "gem.users.list.loaded",
          actionId,
          runId,
          message: `Loaded ${users.length} Gem users.`,
          details: {
            pageSize,
            email
          }
        });
        sendResponse({ ok: true, users, runId });
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
          forceRefresh: Boolean(message.forceRefresh),
          allowCreate: message.allowCreate !== false,
          allowEmptyCandidateCache: Boolean(message.allowEmptyCandidateCache)
        });
        sendResponse({
          ok: true,
          runId,
          candidateId: data.candidateId,
          customFields: data.customFields,
          statusLabels: normalizePassiveStatusLabels(data.statusLabels),
          fromCache: Boolean(data.fromCache),
          stale: Boolean(data.stale)
        });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "LIST_CANDIDATE_EMAILS_FOR_CONTEXT") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const context = message.context || {};
        const data = await listCandidateEmailsForContext(settings, context, runId, {
          preferCache: Boolean(message.preferCache),
          refreshInBackground: message.refreshInBackground !== false,
          forceRefresh: Boolean(message.forceRefresh),
          allowCreate: message.allowCreate !== false
        });
        sendResponse({
          ok: true,
          runId,
          candidateId: data.candidateId,
          emails: data.emails,
          primaryEmail: data.primaryEmail,
          fromCache: Boolean(data.fromCache),
          stale: Boolean(data.stale)
        });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "GET_PASSIVE_GEM_STATUS") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const context = message.context || {};
        const data = await getPassiveGemStatusForContext(settings, context, runId, {
          preferCache: message.preferCache !== false,
          refreshInBackground: message.refreshInBackground !== false,
          forceRefresh: Boolean(message.forceRefresh)
        });
        sendResponse({
          ok: true,
          runId,
          candidateId: data.candidateId,
          statusLabels: data.statusLabels,
          isDoNotContact: Boolean(data.isDoNotContact),
          hasCandidate: data.hasCandidate,
          fromCache: data.fromCache,
          stale: data.stale,
          source: data.source
        });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "ADD_CANDIDATE_EMAIL_FOR_CONTEXT") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const context = message.context || {};
        const email = String(message.email || "").trim();
        const data = await addCandidateEmailForContext(settings, context, runId, email);
        sendResponse({
          ok: true,
          runId,
          candidateId: data.candidateId,
          emails: data.emails,
          primaryEmail: data.primaryEmail
        });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "SET_PRIMARY_CANDIDATE_EMAIL_FOR_CONTEXT") {
    getSettings()
      .then(async (settings) => {
        const runId = message.runId || generateId();
        const context = message.context || {};
        const email = String(message.email || "").trim();
        const data = await setCandidatePrimaryEmailForContext(settings, context, runId, email);
        sendResponse({
          ok: true,
          runId,
          candidateId: data.candidateId,
          emails: data.emails,
          primaryEmail: data.primaryEmail
        });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "PREFETCH_CUSTOM_FIELDS_FOR_CONTEXT") {
    sendResponse({ ok: true, skipped: true, reason: "passive_prefetch_disabled" });
    return false;
  }

  if (message.type === "PREFETCH_PROJECTS") {
    sendResponse({ ok: true, skipped: true, reason: "passive_prefetch_disabled" });
    return false;
  }

  if (message.type === "PREFETCH_SEQUENCES") {
    sendResponse({ ok: true, skipped: true, reason: "passive_prefetch_disabled" });
    return false;
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

chrome.runtime.onInstalled.addListener((details) => {
  const reason = details?.reason ? `onInstalled:${details.reason}` : "onInstalled";
  ensureOrgDefaultsBootstrapped(reason).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && Object.prototype.hasOwnProperty.call(changes || {}, "settings")) {
    invalidateSettingsCache();
  }
  if (namespace === "local" && Object.prototype.hasOwnProperty.call(changes || {}, LOCAL_LOG_KEY)) {
    localLogsCache = Array.isArray(changes[LOCAL_LOG_KEY]?.newValue) ? changes[LOCAL_LOG_KEY].newValue.slice() : [];
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureOrgDefaultsBootstrapped("onStartup").catch(() => {});
});

ensureOrgDefaultsBootstrapped("serviceWorkerLoad").catch(() => {});
