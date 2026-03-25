"use strict";

(() => {
  if (window.__GLS_LINKEDIN_BOOTSTRAP__) {
    return;
  }

  if (
    typeof ACTIONS === "undefined" ||
    typeof ACTION_IDS === "undefined" ||
    typeof DEFAULT_SETTINGS === "undefined" ||
    typeof DEFAULT_SHORTCUTS === "undefined" ||
    typeof GEM_STATUS_DISPLAY_MODE_SHORTCUT_ID === "undefined" ||
    typeof LINKEDIN_NATIVE_SHORTCUT_IDS === "undefined" ||
    typeof normalizeShortcut !== "function" ||
    typeof keyboardEventToShortcut !== "function" ||
    typeof normalizeGemStatusDisplayMode !== "function" ||
    typeof getGemStatusDisplayModeFromSettings !== "function" ||
    typeof isGemStatusDisplayEnabled !== "function" ||
    typeof cycleGemStatusDisplayMode !== "function" ||
    typeof formatShortcutForMac !== "function" ||
    typeof deepMerge !== "function"
  ) {
    throw new Error("[GLS] shared.js must load before content_bootstrap.js");
  }

  const PAGE_CHANGE_FORWARD_DELAY_MS = 650;
  const PAGE_CHANGE_POLL_INTERVAL_MS = 300;
  const INVITE_DECISION_TIMEOUT_MS = 1200;
  const INVITE_DECISION_POLL_INTERVAL_MS = 50;
  const ACTIVE_RUNTIME_FILES = ["src/content.js"];
  const PASSIVE_RUNTIME_FILES = ["src/linkedin_passive.js"];

  const state = {
    cachedSettings: null,
    contextRecoveryTriggered: false,
    initialized: false,
    pageUrl: "",
    passiveRuntimeEnsured: false,
    passiveRuntimeEnsurePromise: null,
    pageUrlPollTimerId: 0,
    runtimeEnsured: false,
    runtimeEnsurePromise: null,
    pageChangeTimerId: 0,
    replayingShortcut: false
  };
  let toastContainer = null;

  function markBootstrapRuntimeReadyForPage() {
    try {
      document.documentElement?.setAttribute("data-gls-bootstrap-runtime", "ready");
      document.documentElement?.setAttribute("data-gls-bootstrap-version", String(CONTENT_RUNTIME_VERSION || ""));
    } catch (_error) {
      // Ignore DOM marker failures.
    }
  }

  function markBootstrapShortcutListenerReadyForPage(source = "linkedin-bootstrap") {
    try {
      const root = document.documentElement;
      if (!root) {
        return;
      }
      root.setAttribute("data-gls-keydown-runtime", "ready");
      root.setAttribute("data-gls-keydown-source", String(source || ""));
    } catch (_error) {
      // Ignore DOM marker failures.
    }
  }

  function markConfiguredShortcutDiagnosticsForPage() {
    try {
      const root = document.documentElement;
      if (!root) {
        return;
      }
      root.setAttribute("data-gls-shortcut-linkedin-connect", getConfiguredShortcut("linkedinConnect"));
      root.setAttribute("data-gls-shortcut-linkedin-message", getConfiguredShortcut("linkedinMessageProfile"));
      root.setAttribute("data-gls-shortcut-linkedin-contact", getConfiguredShortcut("linkedinContactInfo"));
      root.setAttribute(
        "data-gls-shortcut-linkedin-view-in-recruiter",
        getConfiguredShortcut("linkedinViewInRecruiter")
      );
      root.setAttribute("data-gls-shortcut-linkedin-see-more", getConfiguredShortcut("linkedinExpandSeeMore"));
    } catch (_error) {
      // Ignore DOM marker failures.
    }
  }

  function clearPendingPassiveRuntimeEnsure() {
    if (!state.pageChangeTimerId) {
      return;
    }
    window.clearTimeout(state.pageChangeTimerId);
    state.pageChangeTimerId = 0;
  }

  function getBootstrapEventShortcutCandidates(event) {
    const candidates = [];
    const primaryShortcut = normalizeShortcut(keyboardEventToShortcut(event));
    if (primaryShortcut) {
      candidates.push(primaryShortcut);
    }
    const legacyShortcut = normalizeShortcut(keyboardEventToShortcut(event, { preferLegacyCode: true }));
    if (legacyShortcut && !candidates.includes(legacyShortcut)) {
      candidates.push(legacyShortcut);
    }
    return candidates;
  }

  function normalizeSettings(settings) {
    const normalized = deepMerge(DEFAULT_SETTINGS, settings || {});
    const { showGemStatusBadge: _legacyShowGemStatusBadge, ...rest } = normalized;
    return {
      ...rest,
      gemStatusDisplayMode: getGemStatusDisplayModeFromSettings(settings, true)
    };
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

  function getLinkedInIdentityHelpers() {
    return window.__GLS_LINKEDIN_IDENTITY_HELPERS__ || {};
  }

  function toCanonicalLinkedInPublicProfileUrl(rawUrl) {
    return getLinkedInIdentityHelpers().toCanonicalPublicProfileUrl?.(rawUrl, window.location.origin) || "";
  }

  function getLinkedInHandle(url) {
    return getLinkedInIdentityHelpers().getLinkedInHandle?.(url, window.location.origin) || "";
  }

  function findLinkedInPublicProfileUrlInInlineScripts() {
    return getLinkedInIdentityHelpers().findLinkedInPublicProfileUrlInInlineScripts?.({
      document,
      urlBase: window.location.origin,
      maxScriptTextLength: 800000,
      requireSignalPattern: true
    }) || "";
  }

  function findLinkedInPublicProfileUrlInDom(options = {}) {
    return getLinkedInIdentityHelpers().findLinkedInPublicProfileUrlInDom?.({
      document,
      locationHref: window.location.href,
      urlBase: window.location.origin,
      allowInlineScript: options.allowInlineScript !== false,
      allowAnchorScan: true,
      anchorScanLimit: 160,
      inlineScriptOrder: "beforeAnchors",
      inlineScriptOptions: {
        maxScriptTextLength: 800000,
        requireSignalPattern: true
      }
    }) || "";
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

  function isContextInvalidatedError(message) {
    return /Extension context invalidated|Receiving end does not exist|The message port closed before a response was received|chrome-extension:\/\/invalid/i.test(
      String(message || "")
    );
  }

  function triggerContextRecovery(message) {
    if (state.contextRecoveryTriggered) {
      return;
    }
    state.contextRecoveryTriggered = true;
    showToast("Extension was updated. Reloading this tab...", true);
    window.setTimeout(() => {
      window.location.reload();
    }, 900);
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn("[GLS] bootstrap context invalidated:", message || "Extension context invalidated.");
    }
  }

  function getCurrentGemStatusDisplayMode(settings = state.cachedSettings || DEFAULT_SETTINGS) {
    return getGemStatusDisplayModeFromSettings(settings, true);
  }

  function isCurrentGemStatusDisplayEnabled(settings = state.cachedSettings || DEFAULT_SETTINGS) {
    return isGemStatusDisplayEnabled(getCurrentGemStatusDisplayMode(settings));
  }

  function sendRuntimeMessage(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          const message = chrome.runtime.lastError.message || "Runtime message failed.";
          if (isContextInvalidatedError(message)) {
            triggerContextRecovery(message);
          }
          reject(new Error(message));
          return;
        }
        if (isContextInvalidatedError(response?.message || "")) {
          triggerContextRecovery(response?.message || "Extension context invalidated.");
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
        if (isContextInvalidatedError(response?.message || "")) {
          triggerContextRecovery(response?.message || "Extension context invalidated.");
        }
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
        if (isContextInvalidatedError(response?.message || "")) {
          triggerContextRecovery(response?.message || "Extension context invalidated.");
        }
        throw new Error(response?.message || "Could not save settings.");
      }
      state.cachedSettings = normalizeSettings(settings);
      return response;
    });
  }

  function getConfiguredShortcut(shortcutId) {
    const configured = normalizeShortcut(state.cachedSettings?.shortcuts?.[shortcutId] || "");
    if (configured) {
      return configured;
    }
    return normalizeShortcut(DEFAULT_SHORTCUTS[shortcutId] || "");
  }

  function isConfiguredShortcut(event, shortcutId) {
    if (!event || event.repeat) {
      return false;
    }
    const expectedShortcut = getConfiguredShortcut(shortcutId);
    if (!expectedShortcut) {
      return false;
    }
    const actualShortcuts = getBootstrapEventShortcutCandidates(event);
    if (actualShortcuts.length === 0) {
      return false;
    }
    return actualShortcuts.includes(expectedShortcut);
  }

  function findActionByShortcut(shortcut) {
    const mapping = state.cachedSettings?.shortcuts || {};
    const validActionIds = new Set(ACTION_IDS);
    return (
      Object.keys(mapping).find(
        (actionId) => validActionIds.has(actionId) && normalizeShortcut(mapping[actionId]) === shortcut
      ) || ""
    );
  }

  function findActionByShortcutCandidates(shortcuts = []) {
    for (const shortcut of shortcuts) {
      const actionId = findActionByShortcut(shortcut);
      if (actionId) {
        return actionId;
      }
    }
    return "";
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

  function isElementVisible(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    return true;
  }

  function isCandidateDisabled(candidate) {
    if (!candidate) {
      return true;
    }
    return (
      candidate.getAttribute("disabled") !== null ||
      candidate.getAttribute("aria-disabled") === "true" ||
      candidate.classList.contains("artdeco-button--disabled")
    );
  }

  function getElementLabel(element) {
    if (!element) {
      return "";
    }
    return [
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.innerText || "",
      element.textContent || ""
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function querySelectorAllDeep(root, selector) {
    if (!root || typeof root.querySelectorAll !== "function" || !selector) {
      return [];
    }

    const results = [];
    const seenRoots = new Set();
    const seenElements = new Set();
    const queue = [root];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || seenRoots.has(current) || typeof current.querySelectorAll !== "function") {
        continue;
      }
      seenRoots.add(current);

      if (current instanceof Element && typeof current.matches === "function" && current.matches(selector) && !seenElements.has(current)) {
        seenElements.add(current);
        results.push(current);
      }

      for (const candidate of current.querySelectorAll(selector)) {
        if (seenElements.has(candidate)) {
          continue;
        }
        seenElements.add(candidate);
        results.push(candidate);
      }

      for (const candidate of current.querySelectorAll("*")) {
        if (candidate?.shadowRoot && !seenRoots.has(candidate.shadowRoot)) {
          queue.push(candidate.shadowRoot);
        }
      }
    }

    return results;
  }

  function findVisibleInviteDecisionButtons() {
    const roots = [document.getElementById("interop-outlet"), document.body, document.documentElement].filter(Boolean);
    const seen = new Set();
    let addNoteButton = null;
    let sendWithoutNoteButton = null;

    for (const root of roots) {
      if (seen.has(root) || typeof root.querySelectorAll !== "function") {
        continue;
      }
      seen.add(root);
      const candidates = querySelectorAllDeep(root, "button, a[role='button'], [role='button']");
      for (const candidate of candidates) {
        if (!isElementVisible(candidate) || isCandidateDisabled(candidate)) {
          continue;
        }
        const label = getElementLabel(candidate);
        if (!addNoteButton && (label === "add a note" || label.startsWith("add a note"))) {
          addNoteButton = candidate;
        }
        if (
          !sendWithoutNoteButton &&
          (label.includes("send without a note") ||
            (label.includes("send") && label.includes("without") && label.includes("note")))
        ) {
          sendWithoutNoteButton = candidate;
        }
        if (addNoteButton && sendWithoutNoteButton) {
          return { addNoteButton, sendWithoutNoteButton };
        }
      }

      if (!addNoteButton || !sendWithoutNoteButton) {
        const textCandidates = querySelectorAllDeep(root, "*");
        for (const candidate of textCandidates) {
          if (!isElementVisible(candidate)) {
            continue;
          }
          const label = getElementLabel(candidate);
          const button = candidate.closest("button, a[role='button'], [role='button']");
          if (!button || !isElementVisible(button) || isCandidateDisabled(button)) {
            continue;
          }
          if (!addNoteButton && (label === "add a note" || label.startsWith("add a note"))) {
            addNoteButton = button;
          }
          if (
            !sendWithoutNoteButton &&
            (label.includes("send without a note") ||
              (label.includes("send") && label.includes("without") && label.includes("note")))
          ) {
            sendWithoutNoteButton = button;
          }
          if (addNoteButton && sendWithoutNoteButton) {
            return { addNoteButton, sendWithoutNoteButton };
          }
        }
      }
    }

    return { addNoteButton, sendWithoutNoteButton };
  }

  function hasVisibleInviteDecisionDialogShell() {
    const selectors = [
      "#interop-outlet .artdeco-modal",
      "#interop-outlet .artdeco-modal-overlay",
      "#interop-outlet [role='dialog']",
      ".artdeco-modal.send-invite",
      ".send-invite"
    ];
    for (const candidate of document.querySelectorAll(selectors.join(","))) {
      if (!isElementVisible(candidate)) {
        continue;
      }
      const label = getElementLabel(candidate);
      if (
        label.includes("add a note") ||
        label.includes("send without a note") ||
        label.includes("invitation") ||
        label.includes("invite")
      ) {
        return true;
      }
    }
    return false;
  }

  function waitForInviteDecisionButton(kind, timeoutMs = INVITE_DECISION_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const startedAt = Date.now();

      const poll = () => {
        const { addNoteButton, sendWithoutNoteButton } = findVisibleInviteDecisionButtons();
        const targetButton = kind === "send-without-note" ? sendWithoutNoteButton : addNoteButton;
        if (targetButton) {
          resolve(targetButton);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(null);
          return;
        }
        window.setTimeout(poll, INVITE_DECISION_POLL_INTERVAL_MS);
      };

      poll();
    });
  }

  function handleInviteDecisionShortcut(event) {
    const wantsSendWithoutNote = isConfiguredShortcut(event, "linkedinInviteSendWithoutNote");
    const wantsAddNote = isConfiguredShortcut(event, "linkedinInviteAddNote");
    if (!wantsSendWithoutNote && !wantsAddNote) {
      return false;
    }

    const action = wantsSendWithoutNote ? "send-without-note" : "add-note";
    if (!hasVisibleInviteDecisionDialogShell()) {
      return false;
    }

    event.preventDefault();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    } else {
      event.stopPropagation();
    }

    waitForInviteDecisionButton(action)
      .then((targetButton) => {
        if (!targetButton) {
          showToast("Could not find invite action button.", true);
          return;
        }
        targetButton.click();
        showToast(action === "send-without-note" ? "Send without note selected." : "Add note selected.");
      })
      .catch(() => {
        showToast("Could not trigger invite action.", true);
      });
    return true;
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
          settings: state.cachedSettings || DEFAULT_SETTINGS
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
    const hasRuntimeListener = state.runtimeEnsured || state.passiveRuntimeEnsured || isPassiveRuntimeReadyLocally();
    if (!isLinkedInProfilePage()) {
      clearPendingPassiveRuntimeEnsure();
      if (hasRuntimeListener) {
        dispatchDeferredRuntimeEvent("gls:linkedin-page-changed", {
          reason,
          pageUrl: nextUrl
        });
      }
      return;
    }

    if (hasRuntimeListener) {
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

  function startPageUrlPoll() {
    if (state.pageUrlPollTimerId) {
      return;
    }
    state.pageUrlPollTimerId = window.setInterval(() => {
      notifyPageChanged("poll");
    }, PAGE_CHANGE_POLL_INTERVAL_MS);
  }

  async function cycleGemStatusDisplayModeSetting() {
    const currentSettings = state.cachedSettings || (await getSettings());
    const nextSettings = normalizeSettings(currentSettings || {});
    const nextMode = cycleGemStatusDisplayMode(getCurrentGemStatusDisplayMode(currentSettings));
    nextSettings.gemStatusDisplayMode = nextMode;
    await saveSettings(nextSettings);
    showToast(isGemStatusDisplayEnabled(nextMode) ? "Gem status banner enabled." : "Gem status banner hidden.");

    if (nextSettings.enabled && isGemStatusDisplayEnabled(nextMode)) {
      scheduleBannerRuntimeEnsure("cycle-status-display");
    }

    dispatchDeferredRuntimeEvent("gls:settings-updated", {
      settings: nextSettings,
      shortcut: formatShortcutForMac(getConfiguredShortcut(GEM_STATUS_DISPLAY_MODE_SHORTCUT_ID))
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

    if (handleInviteDecisionShortcut(event)) {
      return;
    }

    const actualShortcuts = getBootstrapEventShortcutCandidates(event);
    if (actualShortcuts.length === 0) {
      return;
    }

    const linkedInShortcutId = LINKEDIN_NATIVE_SHORTCUT_IDS.find(
      (shortcutId) => actualShortcuts.includes(normalizeShortcut(getConfiguredShortcut(shortcutId)))
    );
    const actionId = findActionByShortcutCandidates(actualShortcuts);
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
    markConfiguredShortcutDiagnosticsForPage();
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
    markBootstrapRuntimeReadyForPage();
    markBootstrapShortcutListenerReadyForPage();
    markConfiguredShortcutDiagnosticsForPage();
    state.pageUrl = normalizePageUrl();

    window.addEventListener(
      "keydown",
      (event) => {
        onKeyDown(event).catch(() => {});
      },
      true
    );
    installHistoryObservers();
    startPageUrlPoll();

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
      markConfiguredShortcutDiagnosticsForPage();
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
      markConfiguredShortcutDiagnosticsForPage();
    } catch (_error) {
      if (state.contextRecoveryTriggered) {
        return;
      }
      state.cachedSettings = normalizeSettings({});
      markConfiguredShortcutDiagnosticsForPage();
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
