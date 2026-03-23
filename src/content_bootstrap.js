"use strict";

(() => {
  if (window.__GLS_LINKEDIN_BOOTSTRAP__) {
    return;
  }

  const FALLBACK_ACTIONS = Object.freeze({
    GEM_ACTIONS: "gemActions",
    ADD_PROSPECT: "addProspect",
    ADD_TO_PROJECT: "addToProject",
    ADD_NOTE_TO_CANDIDATE: "addNoteToCandidate",
    MANAGE_EMAILS: "manageEmails",
    UPLOAD_TO_ASHBY: "uploadToAshby",
    OPEN_ASHBY_PROFILE: "openAshbyProfile",
    OPEN_ACTIVITY: "openActivity",
    SET_CUSTOM_FIELD: "setCustomField",
    SET_REMINDER: "setReminder",
    SEND_SEQUENCE: "sendSequence",
    EDIT_SEQUENCE: "editSequence"
  });
  const FALLBACK_LINKEDIN_NATIVE_SHORTCUT_IDS = Object.freeze([
    "linkedinConnect",
    "linkedinInviteSendWithoutNote",
    "linkedinInviteAddNote",
    "linkedinViewInRecruiter",
    "linkedinMessageProfile",
    "linkedinContactInfo",
    "linkedinExpandSeeMore",
    "linkedinRecruiterTemplate",
    "linkedinRecruiterSend"
  ]);
  const FALLBACK_GEM_STATUS_DISPLAY_MODES = Object.freeze({
    STATUS_ONLY: "statusOnly",
    OFF: "off"
  });
  const FALLBACK_DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    showGemStatusBadge: true,
    gemStatusDisplayMode: FALLBACK_GEM_STATUS_DISPLAY_MODES.STATUS_ONLY,
    shortcuts: {
      gemActions: "Cmd+K",
      addProspect: "Cmd+Option+1",
      addToProject: "Cmd+Option+2",
      uploadToAshby: "Cmd+Option+3",
      openAshbyProfile: "Cmd+Option+4",
      openActivity: "Cmd+Option+5",
      setCustomField: "Cmd+Option+6",
      addNoteToCandidate: "Cmd+Option+7",
      manageEmails: "Cmd+Option+8",
      setReminder: "Cmd+Option+9",
      sendSequence: "Cmd+Option+0",
      editSequence: "Cmd+Control+Option+1",
      linkedinConnect: "Cmd+Option+Z",
      linkedinInviteSendWithoutNote: "W",
      linkedinInviteAddNote: "N",
      linkedinViewInRecruiter: "R",
      linkedinMessageProfile: "M",
      linkedinContactInfo: "C",
      linkedinExpandSeeMore: "Option+A",
      linkedinRecruiterTemplate: "T",
      linkedinRecruiterSend: "Option+S",
      cycleGemStatusDisplayMode: "Cmd+Control+Option+S"
    }
  });
  const BOOTSTRAP_ACTIONS = typeof ACTIONS !== "undefined" ? ACTIONS : FALLBACK_ACTIONS;
  const BOOTSTRAP_LINKEDIN_NATIVE_SHORTCUT_IDS =
    typeof LINKEDIN_NATIVE_SHORTCUT_IDS !== "undefined"
      ? LINKEDIN_NATIVE_SHORTCUT_IDS
      : FALLBACK_LINKEDIN_NATIVE_SHORTCUT_IDS;
  const BOOTSTRAP_GEM_STATUS_DISPLAY_MODES =
    typeof GEM_STATUS_DISPLAY_MODES !== "undefined"
      ? GEM_STATUS_DISPLAY_MODES
      : FALLBACK_GEM_STATUS_DISPLAY_MODES;
  const BOOTSTRAP_DEFAULT_SETTINGS =
    typeof DEFAULT_SETTINGS !== "undefined" ? DEFAULT_SETTINGS : FALLBACK_DEFAULT_SETTINGS;
  const GEM_STATUS_DISPLAY_MODE_SHORTCUT_ID = "cycleGemStatusDisplayMode";
  const PAGE_CHANGE_FORWARD_DELAY_MS = 650;
  const ACTIVE_RUNTIME_FILES = ["src/content.js"];
  const PASSIVE_RUNTIME_FILES = ["src/linkedin_passive.js"];

  const state = {
    cachedSettings: null,
    initialized: false,
    pageUrl: "",
    passiveRuntimeEnsured: false,
    passiveRuntimeEnsurePromise: null,
    runtimeEnsured: false,
    runtimeEnsurePromise: null,
    pageChangeTimerId: 0,
    replayingShortcut: false
  };
  let toastContainer = null;

  function clearPendingPassiveRuntimeEnsure() {
    if (!state.pageChangeTimerId) {
      return;
    }
    window.clearTimeout(state.pageChangeTimerId);
    state.pageChangeTimerId = 0;
  }

  function bootstrapIsPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function bootstrapDeepMerge(base, override) {
    if (!bootstrapIsPlainObject(base)) {
      return override;
    }
    const output = { ...base };
    if (!bootstrapIsPlainObject(override)) {
      return output;
    }
    for (const [key, value] of Object.entries(override)) {
      if (bootstrapIsPlainObject(value) && bootstrapIsPlainObject(output[key])) {
        output[key] = bootstrapDeepMerge(output[key], value);
        continue;
      }
      output[key] = value;
    }
    return output;
  }

  function bootstrapNormalizeShortcut(raw) {
    if (typeof normalizeShortcut === "function") {
      return normalizeShortcut(raw);
    }
    if (!raw || typeof raw !== "string") {
      return "";
    }

    const tokens = raw
      .split("+")
      .map((token) => token.trim())
      .filter(Boolean);
    const flags = {
      Ctrl: false,
      Alt: false,
      Shift: false,
      Meta: false
    };
    let key = "";

    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (lower === "ctrl" || lower === "control") {
        flags.Ctrl = true;
        continue;
      }
      if (lower === "alt" || lower === "option" || lower === "opt") {
        flags.Alt = true;
        continue;
      }
      if (lower === "shift") {
        flags.Shift = true;
        continue;
      }
      if (lower === "meta" || lower === "cmd" || lower === "command" || lower === "⌘") {
        flags.Meta = true;
        continue;
      }
      if (lower === "space" || lower === "spacebar") {
        key = "Space";
        continue;
      }
      if (lower === "escape" || lower === "esc") {
        key = "Escape";
        continue;
      }
      if (lower === "return") {
        key = "Enter";
        continue;
      }
      key = token.length === 1 ? token.toUpperCase() : token;
    }

    const ordered = [];
    if (flags.Meta) {
      ordered.push("Meta");
    }
    if (flags.Ctrl) {
      ordered.push("Ctrl");
    }
    if (flags.Shift) {
      ordered.push("Shift");
    }
    if (flags.Alt) {
      ordered.push("Alt");
    }
    if (key) {
      ordered.push(key);
    }
    return ordered.join("+");
  }

  function bootstrapKeyboardEventToShortcut(event) {
    if (typeof keyboardEventToShortcut === "function") {
      return keyboardEventToShortcut(event);
    }
    if (!event) {
      return "";
    }
    const parts = [];
    if (event.metaKey) {
      parts.push("Meta");
    }
    if (event.ctrlKey) {
      parts.push("Ctrl");
    }
    if (event.shiftKey) {
      parts.push("Shift");
    }
    if (event.altKey) {
      parts.push("Alt");
    }

    let key = String(event.key || "").trim();
    if (!key) {
      return "";
    }
    if (key === " ") {
      key = "Space";
    } else if (key.length === 1) {
      key = key.toUpperCase();
    }
    parts.push(key);
    return parts.join("+");
  }

  function bootstrapNormalizeGemStatusDisplayMode(rawValue, fallbackEnabled = true) {
    if (typeof normalizeGemStatusDisplayMode === "function") {
      return normalizeGemStatusDisplayMode(rawValue, fallbackEnabled);
    }
    const value = String(rawValue || "").trim();
    if (value === BOOTSTRAP_GEM_STATUS_DISPLAY_MODES.STATUS_ONLY || value === "frameAndStatus") {
      return BOOTSTRAP_GEM_STATUS_DISPLAY_MODES.STATUS_ONLY;
    }
    if (value === BOOTSTRAP_GEM_STATUS_DISPLAY_MODES.OFF) {
      return BOOTSTRAP_GEM_STATUS_DISPLAY_MODES.OFF;
    }
    if (rawValue === false) {
      return BOOTSTRAP_GEM_STATUS_DISPLAY_MODES.OFF;
    }
    return fallbackEnabled ? BOOTSTRAP_GEM_STATUS_DISPLAY_MODES.STATUS_ONLY : BOOTSTRAP_GEM_STATUS_DISPLAY_MODES.OFF;
  }

  function bootstrapIsGemStatusDisplayEnabled(mode, fallbackEnabled = true) {
    if (typeof isGemStatusDisplayEnabled === "function") {
      return isGemStatusDisplayEnabled(mode, fallbackEnabled);
    }
    return bootstrapNormalizeGemStatusDisplayMode(mode, fallbackEnabled) !== BOOTSTRAP_GEM_STATUS_DISPLAY_MODES.OFF;
  }

  function bootstrapCycleGemStatusDisplayMode(mode, fallbackEnabled = true) {
    if (typeof cycleGemStatusDisplayMode === "function") {
      return cycleGemStatusDisplayMode(mode, fallbackEnabled);
    }
    const normalized = bootstrapNormalizeGemStatusDisplayMode(mode, fallbackEnabled);
    return normalized === BOOTSTRAP_GEM_STATUS_DISPLAY_MODES.STATUS_ONLY
      ? BOOTSTRAP_GEM_STATUS_DISPLAY_MODES.OFF
      : BOOTSTRAP_GEM_STATUS_DISPLAY_MODES.STATUS_ONLY;
  }

  function bootstrapFormatShortcutForMac(shortcut) {
    if (typeof formatShortcutForMac === "function") {
      return formatShortcutForMac(shortcut);
    }
    return String(shortcut || "");
  }

  function normalizeSettings(settings) {
    return bootstrapDeepMerge(BOOTSTRAP_DEFAULT_SETTINGS, settings || {});
  }

  function isLinkedInPublicProfilePath(pathname) {
    return /^\/(?:in|pub)\/[^/]+(?:\/.*)?$/.test(String(pathname || ""));
  }

  function isLinkedInRecruiterProfilePath(pathname) {
    return /^\/talent\/(?:.*\/)?profile\/[^/]+(?:\/.*)?$/i.test(String(pathname || ""));
  }

  function isLinkedInProfilePath(pathname) {
    return isLinkedInPublicProfilePath(pathname) || isLinkedInRecruiterProfilePath(pathname);
  }

  function isLinkedInHost(hostname) {
    return /(^|\.)linkedin\.com$/i.test(String(hostname || ""));
  }

  function isLinkedInProfilePage() {
    try {
      const parsed = new URL(window.location.href);
      return isLinkedInHost(parsed.hostname) && isLinkedInProfilePath(parsed.pathname);
    } catch (_error) {
      return false;
    }
  }

  function isLinkedInPublicProfilePage() {
    try {
      const parsed = new URL(window.location.href);
      return isLinkedInHost(parsed.hostname) && isLinkedInPublicProfilePath(parsed.pathname);
    } catch (_error) {
      return false;
    }
  }

  function normalizePageUrl() {
    try {
      const parsed = new URL(window.location.href);
      parsed.hash = "";
      return parsed.toString();
    } catch (_error) {
      return String(window.location.href || "");
    }
  }

  function normalizeUrlForContext(url, options = {}) {
    const keepHash = Boolean(options.keepHash);
    const keepSearch = Boolean(options.keepSearch);
    const fallback = String(url || "").trim();
    if (!fallback) {
      return "";
    }
    try {
      const parsed = new URL(fallback, window.location.origin);
      if (!keepSearch) {
        parsed.search = "";
      }
      if (!keepHash) {
        parsed.hash = "";
      }
      return parsed.toString().replace(/\/$/, "");
    } catch (_error) {
      let normalized = fallback;
      if (!keepSearch) {
        normalized = normalized.replace(/\?.*$/, "");
      }
      if (!keepHash) {
        normalized = normalized.replace(/#.*$/, "");
      }
      return normalized.replace(/\/$/, "");
    }
  }

  function normalizeLinkedInIdentifier(value) {
    const raw = String(value || "")
      .trim()
      .replace(/^@/, "")
      .replace(/\/+$/, "");
    if (!raw) {
      return "";
    }
    try {
      return decodeURIComponent(raw);
    } catch (_error) {
      return raw;
    }
  }

  function toCanonicalLinkedInPublicProfileUrl(rawUrl) {
    const input = String(rawUrl || "").trim();
    if (!input) {
      return "";
    }
    try {
      const parsed = new URL(input, window.location.origin);
      if (!isLinkedInHost(parsed.hostname) || !isLinkedInPublicProfilePath(parsed.pathname)) {
        return "";
      }
      parsed.protocol = "https:";
      parsed.hostname = "www.linkedin.com";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    } catch (_error) {
      return "";
    }
  }

  function getLinkedInHandle(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      const match = parsed.pathname.match(/^\/(?:in|pub)\/([^/]+)/i);
      return match ? decodeURIComponent(match[1]) : "";
    } catch (_error) {
      return "";
    }
  }

  function findLinkedInPublicProfileUrlInInlineScripts() {
    const scripts = Array.from(document.querySelectorAll("script:not([src])"));
    const profileUrlPattern = /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9%._-]+/i;
    const identifierPatterns = [
      /"publicIdentifier"\s*:\s*"([^"]+)"/i,
      /"public_identifier"\s*:\s*"([^"]+)"/i,
      /"vanityName"\s*:\s*"([^"]+)"/i
    ];

    for (const script of scripts) {
      const text = String(script?.textContent || "").trim();
      if (!text || text.length > 800000) {
        continue;
      }
      const normalized = text.replace(/\\\//g, "/");
      const profileUrlMatch = normalized.match(profileUrlPattern);
      if (profileUrlMatch?.[0]) {
        return profileUrlMatch[0];
      }
      for (const pattern of identifierPatterns) {
        const identifierMatch = normalized.match(pattern);
        if (!identifierMatch?.[1]) {
          continue;
        }
        const identifier = normalizeLinkedInIdentifier(identifierMatch[1]);
        if (identifier) {
          return `https://www.linkedin.com/in/${encodeURIComponent(identifier)}`;
        }
      }
    }
    return "";
  }

  function findLinkedInPublicProfileUrlInDom(options = {}) {
    const allowInlineScript = options.allowInlineScript !== false;
    const currentUrl = String(window.location.href || "").trim();
    const canonicalHref = String(document.querySelector("link[rel='canonical']")?.getAttribute("href") || "").trim();
    const ogUrl = String(
      document.querySelector("meta[property='og:url'], meta[name='og:url']")?.getAttribute("content") || ""
    ).trim();
    const candidates = [currentUrl, canonicalHref, ogUrl];
    if (allowInlineScript) {
      candidates.push(findLinkedInPublicProfileUrlInInlineScripts());
    }

    for (const candidate of candidates) {
      const canonical = toCanonicalLinkedInPublicProfileUrl(candidate);
      if (canonical) {
        return canonical;
      }
    }

    const anchors = Array.from(
      document.querySelectorAll("a[href*='/in/'], a[href*='linkedin.com/in/'], a[href*='/pub/'], a[href*='linkedin.com/pub/']")
    );
    for (const anchor of anchors.slice(0, 160)) {
      const href = String(anchor.getAttribute("href") || anchor.href || "").trim();
      const canonical = toCanonicalLinkedInPublicProfileUrl(href);
      if (canonical) {
        return canonical;
      }
    }

    return "";
  }

  function getLinkedInProfileName() {
    const heading = document.querySelector("h1");
    return heading ? String(heading.textContent || "").trim() : "";
  }

  function getLinkedInDebugContext() {
    const linkedinUrl = isLinkedInPublicProfilePage()
      ? toCanonicalLinkedInPublicProfileUrl(window.location.href)
      : findLinkedInPublicProfileUrlInDom({ allowInlineScript: true });
    return {
      sourcePlatform: "linkedin",
      pageUrl: normalizePageUrl(),
      profileUrl: normalizeUrlForContext(window.location.href),
      linkedinUrl,
      linkedInHandle: getLinkedInHandle(linkedinUrl),
      profileName: getLinkedInProfileName()
    };
  }

  function getLinkedInDebugSummary(context) {
    if (String(context?.linkedinUrl || "").trim() || String(context?.linkedInHandle || "").trim()) {
      return "LinkedIn profile detected. Signals: LinkedIn profile link.";
    }
    return "LinkedIn profile detected, but no stable candidate identity signal was found.";
  }

  function getCurrentGemStatusDisplayMode(settings = state.cachedSettings || BOOTSTRAP_DEFAULT_SETTINGS) {
    const baseline = settings || {};
    return bootstrapNormalizeGemStatusDisplayMode(
      baseline.gemStatusDisplayMode,
      baseline.showGemStatusBadge !== false
    );
  }

  function isCurrentGemStatusDisplayEnabled(settings = state.cachedSettings || BOOTSTRAP_DEFAULT_SETTINGS) {
    return bootstrapIsGemStatusDisplayEnabled(getCurrentGemStatusDisplayMode(settings));
  }

  function sendRuntimeMessage(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Runtime message failed."));
          return;
        }
        resolve(response);
      });
    });
  }

  function isContentRuntimeReadyLocally() {
    return Boolean(
      window.__GLS_UNIFIED_CONTENT_RUNTIME_READY__ &&
      window.__GLS_UNIFIED_CONTENT_RUNTIME_VERSION__ === CONTENT_RUNTIME_VERSION
    );
  }

  function isPassiveRuntimeReadyLocally() {
    return Boolean(window.__GLS_LINKEDIN_PASSIVE_RUNTIME_READY__);
  }

  function getSettings() {
    return sendRuntimeMessage({ type: "GET_SETTINGS" }).then((response) => {
      if (!response?.ok) {
        throw new Error(response?.message || "Could not load settings.");
      }
      const settings = normalizeSettings(response.settings || {});
      state.cachedSettings = settings;
      return settings;
    });
  }

  function saveSettings(settings) {
    return sendRuntimeMessage({ type: "SAVE_SETTINGS", settings }).then((response) => {
      if (!response?.ok) {
        throw new Error(response?.message || "Could not save settings.");
      }
      state.cachedSettings = normalizeSettings(settings);
      return response;
    });
  }

  function getConfiguredShortcut(shortcutId) {
    const configured = bootstrapNormalizeShortcut(state.cachedSettings?.shortcuts?.[shortcutId] || "");
    if (configured) {
      return configured;
    }
    return bootstrapNormalizeShortcut(BOOTSTRAP_DEFAULT_SETTINGS?.shortcuts?.[shortcutId] || "");
  }

  function isConfiguredShortcut(event, shortcutId) {
    if (!event || event.repeat) {
      return false;
    }
    const expectedShortcut = getConfiguredShortcut(shortcutId);
    if (!expectedShortcut) {
      return false;
    }
    const actualShortcut = bootstrapNormalizeShortcut(bootstrapKeyboardEventToShortcut(event));
    if (!actualShortcut) {
      return false;
    }
    return actualShortcut === expectedShortcut;
  }

  function findActionByShortcut(shortcut) {
    const mapping = state.cachedSettings?.shortcuts || {};
    const validActionIds = new Set(Object.values(BOOTSTRAP_ACTIONS));
    return (
      Object.keys(mapping).find(
        (actionId) => validActionIds.has(actionId) && bootstrapNormalizeShortcut(mapping[actionId]) === shortcut
      ) || ""
    );
  }

  function replayKeyboardEvent(event) {
    dispatchDeferredRuntimeEvent("gls:content-runtime-keydown", {
      key: event.key,
      code: event.code,
      location: event.location,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey
    });
  }

  function dispatchDeferredRuntimeEvent(type, detail = {}) {
    window.dispatchEvent(
      new CustomEvent(type, {
        detail,
        bubbles: false,
        cancelable: false
      })
    );
  }

  function ensureToastContainer() {
    if (toastContainer?.isConnected) {
      return toastContainer;
    }
    const container = document.createElement("div");
    container.id = "gls-bootstrap-toast-root";
    container.style.position = "fixed";
    container.style.right = "20px";
    container.style.bottom = "20px";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.alignItems = "flex-end";
    container.style.gap = "10px";
    container.style.zIndex = "2147483647";
    container.style.pointerEvents = "none";
    (document.body || document.documentElement).appendChild(container);
    toastContainer = container;
    return container;
  }

  function showToast(message, isError = false) {
    const text = String(message || "").trim();
    if (!text) {
      return;
    }
    const container = ensureToastContainer();
    const card = document.createElement("div");
    card.textContent = text;
    card.style.maxWidth = "360px";
    card.style.padding = "12px 14px";
    card.style.borderRadius = "12px";
    card.style.background = isError ? "rgba(127, 29, 29, 0.96)" : "rgba(22, 101, 52, 0.96)";
    card.style.color = "#fff";
    card.style.boxShadow = "0 14px 30px rgba(0,0,0,0.22)";
    card.style.fontFamily = "-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif";
    card.style.fontSize = "13px";
    card.style.fontWeight = "600";
    card.style.lineHeight = "1.35";
    card.style.pointerEvents = "none";
    card.style.opacity = "0";
    card.style.transform = "translateY(6px)";
    card.style.transition = "opacity 120ms ease, transform 120ms ease";
    container.appendChild(card);
    requestAnimationFrame(() => {
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
    });
    window.setTimeout(() => {
      card.style.opacity = "0";
      card.style.transform = "translateY(6px)";
      window.setTimeout(() => card.remove(), 160);
    }, 2200);
  }

  function ensureContentRuntime(reason = "") {
    const shouldForceRefresh = /status-changed/i.test(String(reason || ""));
    if (isContentRuntimeReadyLocally()) {
      state.runtimeEnsured = true;
      if (isLinkedInProfilePage()) {
        dispatchDeferredRuntimeEvent("gls:linkedin-page-changed", {
          reason: reason || "runtime-ready",
          pageUrl: normalizePageUrl(),
          forceRefresh: shouldForceRefresh
        });
      }
      return Promise.resolve(true);
    }
    if (state.runtimeEnsured) {
      return Promise.resolve(true);
    }
    if (state.runtimeEnsurePromise) {
      return state.runtimeEnsurePromise;
    }

    state.runtimeEnsurePromise = sendRuntimeMessage({
      type: "ENSURE_CONTENT_RUNTIME",
      reason,
      files: ACTIVE_RUNTIME_FILES
    })
      .then((response) => {
        if (!response?.ok) {
          throw new Error(response?.message || "Could not load page runtime.");
        }
        state.runtimeEnsured = true;
        if (isLinkedInProfilePage()) {
          dispatchDeferredRuntimeEvent("gls:linkedin-page-changed", {
            reason: reason || "runtime-ensured",
            pageUrl: normalizePageUrl(),
            forceRefresh: shouldForceRefresh
          });
        }
        return true;
      })
      .finally(() => {
        state.runtimeEnsurePromise = null;
      });

    return state.runtimeEnsurePromise;
  }

  function ensurePassiveRuntime(reason = "") {
    if (isPassiveRuntimeReadyLocally()) {
      state.passiveRuntimeEnsured = true;
      return Promise.resolve(true);
    }
    if (state.passiveRuntimeEnsured) {
      return Promise.resolve(true);
    }
    if (state.passiveRuntimeEnsurePromise) {
      return state.passiveRuntimeEnsurePromise;
    }

    state.passiveRuntimeEnsurePromise = sendRuntimeMessage({
      type: "ENSURE_CONTENT_RUNTIME",
      reason,
      files: PASSIVE_RUNTIME_FILES
    })
      .then((response) => {
        if (!response?.ok) {
          throw new Error(response?.message || "Could not load LinkedIn status runtime.");
        }
        state.passiveRuntimeEnsured = true;
        dispatchDeferredRuntimeEvent("gls:settings-updated", {
          settings: state.cachedSettings || BOOTSTRAP_DEFAULT_SETTINGS
        });
        dispatchDeferredRuntimeEvent("gls:linkedin-page-changed", {
          reason: reason || "passive-runtime-ensured",
          pageUrl: normalizePageUrl(),
          forceRefresh: true
        });
        return true;
      })
      .finally(() => {
        state.passiveRuntimeEnsurePromise = null;
      });

    return state.passiveRuntimeEnsurePromise;
  }

  function scheduleBannerRuntimeEnsure(reason) {
    if (!state.cachedSettings?.enabled || !isCurrentGemStatusDisplayEnabled(state.cachedSettings)) {
      clearPendingPassiveRuntimeEnsure();
      return;
    }
    clearPendingPassiveRuntimeEnsure();
    state.pageChangeTimerId = window.setTimeout(() => {
      state.pageChangeTimerId = 0;
      ensurePassiveRuntime(reason).catch((error) => {
        showToast(error?.message || "Could not load LinkedIn status helper.", true);
      });
    }, PAGE_CHANGE_FORWARD_DELAY_MS);
  }

  function notifyPageChanged(reason) {
    const nextUrl = normalizePageUrl();
    if (state.pageUrl === nextUrl) {
      return;
    }
    state.pageUrl = nextUrl;
    if (!isLinkedInProfilePage()) {
      clearPendingPassiveRuntimeEnsure();
      return;
    }

    if (state.runtimeEnsured || state.passiveRuntimeEnsured || isPassiveRuntimeReadyLocally()) {
      dispatchDeferredRuntimeEvent("gls:linkedin-page-changed", {
        reason,
        pageUrl: nextUrl
      });
      return;
    }

    scheduleBannerRuntimeEnsure(reason);
  }

  function installHistoryObservers() {
    ["pushState", "replaceState"].forEach((methodName) => {
      const original = history[methodName];
      if (typeof original !== "function") {
        return;
      }
      history[methodName] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        notifyPageChanged(methodName);
        return result;
      };
    });

    window.addEventListener("popstate", () => notifyPageChanged("popstate"), { passive: true });
    window.addEventListener("pageshow", () => notifyPageChanged("pageshow"), { passive: true });
  }

  async function cycleGemStatusDisplayModeSetting() {
    const currentSettings = state.cachedSettings || (await getSettings());
    const nextSettings = normalizeSettings(currentSettings || {});
    const nextMode = bootstrapCycleGemStatusDisplayMode(getCurrentGemStatusDisplayMode(currentSettings));
    nextSettings.gemStatusDisplayMode = nextMode;
    nextSettings.showGemStatusBadge = bootstrapIsGemStatusDisplayEnabled(nextMode);
    await saveSettings(nextSettings);
    showToast(
      bootstrapIsGemStatusDisplayEnabled(nextMode)
        ? "Gem status banner enabled."
        : "Gem status banner hidden."
    );

    if (nextSettings.enabled && bootstrapIsGemStatusDisplayEnabled(nextMode)) {
      scheduleBannerRuntimeEnsure("cycle-status-display");
    }

    dispatchDeferredRuntimeEvent("gls:settings-updated", {
      settings: nextSettings,
      shortcut: bootstrapFormatShortcutForMac(getConfiguredShortcut(GEM_STATUS_DISPLAY_MODE_SHORTCUT_ID))
    });
  }

  async function onKeyDown(event) {
    if (!isLinkedInProfilePage() || state.replayingShortcut) {
      return;
    }
    if (!state.cachedSettings) {
      return;
    }

    if (isConfiguredShortcut(event, GEM_STATUS_DISPLAY_MODE_SHORTCUT_ID)) {
      event.preventDefault();
      event.stopPropagation();
      cycleGemStatusDisplayModeSetting().catch(() => {});
      return;
    }

    const actualShortcut = bootstrapNormalizeShortcut(bootstrapKeyboardEventToShortcut(event));
    if (!actualShortcut) {
      return;
    }

    const linkedInShortcutId = BOOTSTRAP_LINKEDIN_NATIVE_SHORTCUT_IDS.find(
      (shortcutId) => bootstrapNormalizeShortcut(getConfiguredShortcut(shortcutId)) === actualShortcut
    );
    const actionId = findActionByShortcut(actualShortcut);
    if (!linkedInShortcutId && !actionId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    try {
      await ensureContentRuntime(linkedInShortcutId || actionId || "shortcut");
      replayKeyboardEvent(event);
    } catch (error) {
      showToast(error?.message || "Could not load LinkedIn helper runtime.", true);
    }
  }

  function handleStatusMessage(message, sendResponse) {
    if (isContentRuntimeReadyLocally()) {
      state.runtimeEnsured = true;
    }
    if (!(state.cachedSettings?.enabled && isCurrentGemStatusDisplayEnabled(state.cachedSettings) && isLinkedInProfilePage())) {
      sendResponse({ ok: true, skipped: true });
      return false;
    }
    ensurePassiveRuntime("status-changed")
      .then(() => {
        dispatchDeferredRuntimeEvent("gls:gem-status-changed", {
          context: message?.context && typeof message.context === "object" ? message.context : {},
          runId: message?.runId || ""
        });
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  function handleSettingsUpdatedMessage(message, sendResponse) {
    state.cachedSettings = normalizeSettings(message.settings || {});
    const finish = () => {
      dispatchDeferredRuntimeEvent("gls:settings-updated", {
        settings: state.cachedSettings
      });
      sendResponse({ ok: true });
    };
    if (state.cachedSettings.enabled && isCurrentGemStatusDisplayEnabled(state.cachedSettings) && isLinkedInProfilePage()) {
      ensurePassiveRuntime("settings-updated")
        .then(finish)
        .catch((error) => sendResponse({ ok: false, message: error.message }));
      return true;
    }
    clearPendingPassiveRuntimeEnsure();
    finish();
    return false;
  }

  function handleGetContextDebugMessage(_message, sendResponse) {
    const passiveDebug =
      typeof window.__GLS_LINKEDIN_PASSIVE_RUNTIME__?.getContextDebug === "function"
        ? window.__GLS_LINKEDIN_PASSIVE_RUNTIME__.getContextDebug()
        : null;
    if (passiveDebug?.ok) {
      sendResponse(passiveDebug);
      return false;
    }
    const context = getLinkedInDebugContext();
    sendResponse({
      ok: true,
      supported: isLinkedInProfilePage(),
      hasIdentity: Boolean(String(context.linkedinUrl || "").trim() || String(context.linkedInHandle || "").trim()),
      sourcePlatform: "linkedin",
      summary: getLinkedInDebugSummary(context),
      context: {
        sourcePlatform: "linkedin",
        gemCandidateId: "",
        gemProfileUrl: "",
        linkedinUrl: String(context.linkedinUrl || "").trim(),
        linkedInHandle: String(context.linkedInHandle || "").trim(),
        contactEmail: "",
        contactEmailCount: 0,
        gmailThreadToken: ""
      }
    });
    return false;
  }

  function handleGetActionContextMessage(_message, sendResponse) {
    const context = getLinkedInDebugContext();
    sendResponse({
      ok: true,
      supported: isLinkedInProfilePage(),
      hasIdentity: Boolean(String(context.linkedinUrl || "").trim() || String(context.linkedInHandle || "").trim()),
      context
    });
    return false;
  }

  function handleTriggerActionMessage(message, sendResponse) {
    if (isContentRuntimeReadyLocally()) {
      state.runtimeEnsured = true;
    }
    if (state.runtimeEnsured) {
      return false;
    }
    ensureContentRuntime(message.actionId || "trigger-action")
      .then(() => {
        sendResponse({ ok: true, deferred: true });
      })
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  async function init() {
    if (state.initialized) {
      return;
    }
    state.initialized = true;
    state.pageUrl = normalizePageUrl();

    window.addEventListener(
      "keydown",
      (event) => {
        onKeyDown(event).catch(() => {});
      },
      true
    );
    installHistoryObservers();

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "PING") {
        sendResponse({ ok: true, kind: "bootstrap", version: typeof CONTENT_RUNTIME_VERSION !== "undefined" ? CONTENT_RUNTIME_VERSION : "" });
        return false;
      }

      if (message?.type === "GEM_STATUS_MAY_HAVE_CHANGED") {
        return handleStatusMessage(message, sendResponse);
      }

      if (message?.type === "SETTINGS_UPDATED") {
        return handleSettingsUpdatedMessage(message, sendResponse);
      }

      if (message?.type === "GET_CONTEXT_DEBUG") {
        return handleGetContextDebugMessage(message, sendResponse);
      }

      if (message?.type === "GET_ACTION_CONTEXT") {
        return handleGetActionContextMessage(message, sendResponse);
      }

      if (message?.type === "TRIGGER_ACTION") {
        return handleTriggerActionMessage(message, sendResponse);
      }

      return false;
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== "sync" || !changes.settings) {
        return;
      }
      state.cachedSettings = normalizeSettings(changes.settings.newValue || {});
      dispatchDeferredRuntimeEvent("gls:settings-updated", {
        settings: state.cachedSettings
      });
      if (state.cachedSettings.enabled && isCurrentGemStatusDisplayEnabled(state.cachedSettings) && isLinkedInProfilePage()) {
        ensurePassiveRuntime("storage-settings-updated").catch(() => {});
        return;
      }
      clearPendingPassiveRuntimeEnsure();
    });

    try {
      await getSettings();
    } catch (_error) {
      state.cachedSettings = normalizeSettings({});
    }

    if (state.cachedSettings?.enabled && isCurrentGemStatusDisplayEnabled(state.cachedSettings) && isLinkedInProfilePage()) {
      const scheduleInitialEnsure = () => scheduleBannerRuntimeEnsure("initial-status");
      if (document.readyState === "complete") {
        scheduleInitialEnsure();
      } else {
        window.addEventListener("load", scheduleInitialEnsure, { passive: true, once: true });
      }
    }
  }

  window.__GLS_LINKEDIN_BOOTSTRAP__ = {
    ensureContentRuntime,
    ensurePassiveRuntime,
    dispatchDeferredRuntimeEvent,
    getSettings: () => state.cachedSettings
  };

  init().catch(() => {});
})();
