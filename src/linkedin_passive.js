"use strict";

(() => {
  if (window.__GLS_LINKEDIN_PASSIVE_RUNTIME_READY__) {
    return;
  }

  if (
    typeof deepMerge !== "function" ||
    typeof DEFAULT_SETTINGS === "undefined" ||
    typeof glsNormalizeUrl !== "function" ||
    typeof glsNormalizePageUrl !== "function" ||
    typeof glsIsLinkedInProfilePage !== "function" ||
    typeof glsIsLinkedInPublicProfilePage !== "function" ||
    typeof glsIsLinkedInRecruiterProfilePage !== "function"
  ) {
    throw new Error("[GLS] shared.js must load before linkedin_passive.js");
  }

  const VISIBLE_REFRESH_MS = 60 * 1000;
  const PAGE_CHANGE_IDLE_TIMEOUT_MS = 420;
  const FOCUS_REFRESH_DELAY_MS = 220;
  const VISIBILITY_REFRESH_DELAY_MS = 160;
  const SETTINGS_REFRESH_DELAY_MS = 120;
  const STATUS_CHANGED_REFRESH_DELAY_MS = 80;
  const FALLBACK_IDLE_DELAY_MS = 180;
  const INLINE_SCRIPT_MAX_TEXT_LENGTH = 400000;
  const INLINE_SCRIPT_MAX_COUNT = 12;
  const ANCHOR_SCAN_LIMIT = 60;
  const IDENTITY_RETRY_DELAYS_MS = [900, 2400];
  const HEADER_SELECTORS = ["#global-nav", ".global-nav", "header.global-nav", "header[role='banner']"];
  const INDICATOR_VIEW_STATES = Object.freeze({
    HIDDEN: "hidden",
    READY: "ready",
    EMPTY: "empty"
  });

  const state = {
    cachedSettings: null,
    indicatorElements: null,
    indicatorViewState: INDICATOR_VIEW_STATES.HIDDEN,
    refreshTimerId: 0,
    deferredRefreshTimerId: 0,
    deferredRefreshIdleId: 0,
    refreshRequestId: 0,
    identityRetryTimerId: 0,
    identityRetryAttempt: 0,
    contextCache: {
      pageUrl: "",
      context: null,
      inlineScriptScanned: false
    }
  };

  function normalizeSettings(settings) {
    if (typeof deepMerge === "function" && typeof DEFAULT_SETTINGS !== "undefined") {
      const normalized = deepMerge(DEFAULT_SETTINGS, settings || {});
      return {
        ...normalized,
        gemStatusDisplayMode:
          typeof getGemStatusDisplayModeFromSettings === "function"
            ? getGemStatusDisplayModeFromSettings(normalized, true)
            : String(normalized.gemStatusDisplayMode || "")
      };
    }
    return settings && typeof settings === "object" ? { ...settings } : {};
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

  function getProfileName() {
    const heading = document.querySelector("h1");
    return heading ? String(heading.textContent || "").trim() : "";
  }

  function findLinkedInPublicProfileUrlInDom(options = {}) {
    return getLinkedInIdentityHelpers().findLinkedInPublicProfileUrlInDom?.({
      document,
      locationHref: window.location.href,
      urlBase: window.location.origin,
      allowInlineScript: options.allowInlineScript !== false,
      allowAnchorScan: options.allowAnchorScan !== false,
      anchorScanLimit: ANCHOR_SCAN_LIMIT,
      inlineScriptOrder: "afterAnchors",
      inlineScriptOptions: {
        maxScriptTextLength: INLINE_SCRIPT_MAX_TEXT_LENGTH,
        maxScriptCount: INLINE_SCRIPT_MAX_COUNT,
        requireSignalPattern: true
      }
    }) || "";
  }

  function buildLinkedInContext(options = {}) {
    const pageUrl = glsNormalizePageUrl(window.location.href);
    const profileUrl = glsNormalizeUrl(window.location.href);
    const currentPublicUrl = glsIsLinkedInPublicProfilePage()
      ? toCanonicalLinkedInPublicProfileUrl(window.location.href)
      : "";
    let linkedinUrl = currentPublicUrl;

    if (!linkedinUrl && glsIsLinkedInRecruiterProfilePage()) {
      linkedinUrl = findLinkedInPublicProfileUrlInDom({
        allowInlineScript: Boolean(options.allowInlineScript),
        allowAnchorScan: options.allowAnchorScan !== false
      });
    }

    return {
      sourcePlatform: "linkedin",
      pageUrl,
      profileUrl,
      linkedinUrl,
      linkedInHandle: getLinkedInHandle(linkedinUrl),
      profileName: getProfileName()
    };
  }

  function contextHasIdentity(context) {
    return Boolean(String(context?.linkedinUrl || "").trim() || String(context?.linkedInHandle || "").trim());
  }

  function clearRefreshTimer() {
    if (!state.refreshTimerId) {
      return;
    }
    window.clearTimeout(state.refreshTimerId);
    state.refreshTimerId = 0;
  }

  function clearDeferredRefresh() {
    if (state.deferredRefreshTimerId) {
      window.clearTimeout(state.deferredRefreshTimerId);
      state.deferredRefreshTimerId = 0;
    }
    if (state.deferredRefreshIdleId && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(state.deferredRefreshIdleId);
      state.deferredRefreshIdleId = 0;
    }
  }

  function clearIdentityRetryTimer() {
    if (!state.identityRetryTimerId) {
      return;
    }
    window.clearTimeout(state.identityRetryTimerId);
    state.identityRetryTimerId = 0;
  }

  function clearPendingWork() {
    clearRefreshTimer();
    clearDeferredRefresh();
    clearIdentityRetryTimer();
  }

  function invalidatePendingRefreshRequests() {
    state.refreshRequestId += 1;
  }

  function resetContextCache() {
    state.contextCache = {
      pageUrl: glsNormalizePageUrl(window.location.href),
      context: null,
      inlineScriptScanned: false
    };
    state.identityRetryAttempt = 0;
    clearIdentityRetryTimer();
  }

  function scheduleIdentityRetry() {
    if (!glsIsLinkedInRecruiterProfilePage() || state.identityRetryTimerId) {
      return false;
    }
    const retryDelayMs = IDENTITY_RETRY_DELAYS_MS[state.identityRetryAttempt];
    if (!Number.isFinite(retryDelayMs)) {
      return false;
    }
    const shouldAllowInlineScript = state.identityRetryAttempt > 0;
    state.identityRetryAttempt += 1;
    state.identityRetryTimerId = window.setTimeout(() => {
      state.identityRetryTimerId = 0;
      scheduleDeferredRefresh(
        {
          forceRefresh: true,
          allowInlineScript: shouldAllowInlineScript,
          allowAnchorScan: true,
          scheduleNext: true,
          scheduleRetry: true
        },
        {
          preferIdle: false
        }
      );
    }, retryDelayMs);
    return true;
  }

  function resolveLinkedInContext(options = {}) {
    const pageUrl = glsNormalizePageUrl(window.location.href);
    if (state.contextCache.pageUrl !== pageUrl) {
      resetContextCache();
    }

    const shouldAttemptInlineScript =
      glsIsLinkedInRecruiterProfilePage() &&
      Boolean(options.allowInlineScript) &&
      !state.contextCache.inlineScriptScanned;
    const context = buildLinkedInContext({
      allowInlineScript: shouldAttemptInlineScript,
      allowAnchorScan: options.allowAnchorScan !== false
    });

    state.contextCache.pageUrl = pageUrl;
    state.contextCache.context = context;
    if (shouldAttemptInlineScript) {
      state.contextCache.inlineScriptScanned = true;
    }

    if (contextHasIdentity(context)) {
      state.identityRetryAttempt = 0;
      clearIdentityRetryTimer();
    } else if (glsIsLinkedInRecruiterProfilePage() && options.scheduleRetry !== false) {
      scheduleIdentityRetry();
    }

    return context;
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

  async function getSettings() {
    const bootstrapSettings = window.__GLS_LINKEDIN_BOOTSTRAP__?.getSettings?.();
    if (bootstrapSettings && typeof bootstrapSettings === "object") {
      state.cachedSettings = normalizeSettings(bootstrapSettings);
      return state.cachedSettings;
    }
    const response = await sendRuntimeMessage({ type: "GET_SETTINGS" });
    if (!response?.ok) {
      throw new Error(response?.message || "Could not load settings.");
    }
    state.cachedSettings = normalizeSettings(response.settings || {});
    return state.cachedSettings;
  }

  function getCurrentDisplayMode() {
    if (typeof getGemStatusDisplayModeFromSettings === "function") {
      return getGemStatusDisplayModeFromSettings(state.cachedSettings, true);
    }
    return String(state.cachedSettings?.gemStatusDisplayMode || "off");
  }

  function isStatusEnabled() {
    if (!state.cachedSettings?.enabled) {
      return false;
    }
    if (typeof isGemStatusDisplayEnabled === "function") {
      return isGemStatusDisplayEnabled(getCurrentDisplayMode(), true);
    }
    return getCurrentDisplayMode() !== "off";
  }

  function normalizeStatusTextToken(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function normalizeStatusMatchKey(value) {
    return normalizeStatusTextToken(value)
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function summarizeStatusLabels(labels, maxVisible = 3) {
    if (!Array.isArray(labels) || labels.length === 0) {
      return "";
    }
    const normalized = labels
      .map((label) => String(label || "").trim())
      .filter(Boolean);
    if (normalized.length === 0) {
      return "";
    }
    if (normalized.length <= maxVisible) {
      return normalized.join(", ");
    }
    return `${normalized.slice(0, maxVisible).join(", ")} +${normalized.length - maxVisible} more`;
  }

  function getStatusPalette(statusText, hasValue) {
    const normalized = normalizeStatusTextToken(statusText);
    const matchKey = normalizeStatusMatchKey(statusText);
    if (!hasValue) {
      return {
        accent: "#96a3b8",
        accentSecondary: "#d6deea",
        accentSoft: "rgba(150, 163, 184, 0.16)",
        accentSecondarySoft: "rgba(214, 222, 234, 0.14)",
        outline: "rgba(198, 209, 226, 0.46)",
        surface: "rgba(28, 34, 44, 0.8)",
        surfaceTop: "rgba(255, 255, 255, 0.08)",
        shadow: "rgba(15, 23, 42, 0.18)",
        text: "#f8fafc",
        frameOpacity: "0.76"
      };
    }
    const exactPaletteByStatus = {
      "reviewed accepted": {
        accent: "#2fd07f",
        accentSecondary: "#9af2c7",
        accentSoft: "rgba(47, 208, 127, 0.22)",
        accentSecondarySoft: "rgba(154, 242, 199, 0.16)",
        outline: "rgba(120, 236, 178, 0.62)",
        surface: "rgba(12, 43, 29, 0.8)",
        surfaceTop: "rgba(255, 255, 255, 0.12)",
        shadow: "rgba(8, 74, 46, 0.34)",
        text: "#effff7",
        frameOpacity: "0.96"
      },
      "reviewed rejected": {
        accent: "#ff5e74",
        accentSecondary: "#ffb0ba",
        accentSoft: "rgba(255, 94, 116, 0.24)",
        accentSecondarySoft: "rgba(255, 176, 186, 0.16)",
        outline: "rgba(255, 128, 147, 0.66)",
        surface: "rgba(52, 16, 27, 0.82)",
        surfaceTop: "rgba(255, 255, 255, 0.12)",
        shadow: "rgba(122, 19, 42, 0.36)",
        text: "#fff4f6",
        frameOpacity: "0.97"
      },
      "applied in review": {
        accent: "#8b96ad",
        accentSecondary: "#d8deea",
        accentSoft: "rgba(139, 150, 173, 0.2)",
        accentSecondarySoft: "rgba(216, 222, 234, 0.16)",
        outline: "rgba(196, 205, 223, 0.56)",
        surface: "rgba(31, 37, 48, 0.82)",
        surfaceTop: "rgba(255, 255, 255, 0.12)",
        shadow: "rgba(16, 22, 34, 0.34)",
        text: "#f6f8fc",
        frameOpacity: "0.93"
      },
      hired: {
        accent: "#98a2b8",
        accentSecondary: "#33d17f",
        accentSoft: "rgba(152, 162, 184, 0.18)",
        accentSecondarySoft: "rgba(51, 209, 127, 0.2)",
        outline: "rgba(171, 224, 197, 0.56)",
        surface: "rgba(27, 35, 39, 0.82)",
        surfaceTop: "rgba(255, 255, 255, 0.12)",
        shadow: "rgba(9, 44, 28, 0.34)",
        text: "#f1fff7",
        frameOpacity: "0.96"
      },
      interviewing: {
        accent: "#98a2b8",
        accentSecondary: "#49a6ff",
        accentSoft: "rgba(152, 162, 184, 0.18)",
        accentSecondarySoft: "rgba(73, 166, 255, 0.22)",
        outline: "rgba(151, 201, 245, 0.56)",
        surface: "rgba(25, 33, 45, 0.82)",
        surfaceTop: "rgba(255, 255, 255, 0.12)",
        shadow: "rgba(11, 48, 94, 0.34)",
        text: "#f2f9ff",
        frameOpacity: "0.95"
      },
      "rejected us": {
        accent: "#98a2b8",
        accentSecondary: "#ffaf4f",
        accentSoft: "rgba(152, 162, 184, 0.18)",
        accentSecondarySoft: "rgba(255, 175, 79, 0.22)",
        outline: "rgba(240, 190, 129, 0.56)",
        surface: "rgba(39, 32, 23, 0.82)",
        surfaceTop: "rgba(255, 255, 255, 0.12)",
        shadow: "rgba(117, 72, 17, 0.34)",
        text: "#fff9f2",
        frameOpacity: "0.95"
      },
      "we rejected": {
        accent: "#98a2b8",
        accentSecondary: "#ff6678",
        accentSoft: "rgba(152, 162, 184, 0.18)",
        accentSecondarySoft: "rgba(255, 102, 120, 0.22)",
        outline: "rgba(238, 151, 164, 0.56)",
        surface: "rgba(45, 24, 31, 0.82)",
        surfaceTop: "rgba(255, 255, 255, 0.12)",
        shadow: "rgba(122, 24, 44, 0.34)",
        text: "#fff5f7",
        frameOpacity: "0.96"
      }
    };
    if (exactPaletteByStatus[matchKey]) {
      return exactPaletteByStatus[matchKey];
    }
    if (/(^|[^a-z])(dnc|do not contact|do-not-contact|don't contact|dont contact|no contact|opt out|opt-out|unsubscribe|blocked|blacklist)([^a-z]|$)/.test(normalized)) {
      return {
        accent: "#ff5f67",
        accentSecondary: "#ffb7bf",
        accentSoft: "rgba(255, 95, 103, 0.24)",
        accentSecondarySoft: "rgba(255, 183, 191, 0.16)",
        outline: "rgba(255, 95, 103, 0.76)",
        surface: "rgba(86, 12, 22, 0.82)",
        surfaceTop: "rgba(255, 255, 255, 0.12)",
        shadow: "rgba(145, 18, 32, 0.36)",
        text: "#fff5f6",
        frameOpacity: "1"
      };
    }
    if (/(on hold|hold|paused|pause|cooldown|later|nurture|waiting|not now|rejected|rejection|pass)([^a-z]|$)/.test(normalized)) {
      return {
        accent: "#ffb020",
        accentSecondary: "#ffd28a",
        accentSoft: "rgba(255, 176, 32, 0.22)",
        accentSecondarySoft: "rgba(255, 210, 138, 0.16)",
        outline: "rgba(255, 176, 32, 0.68)",
        surface: "rgba(73, 44, 2, 0.8)",
        surfaceTop: "rgba(255, 255, 255, 0.1)",
        shadow: "rgba(140, 95, 10, 0.28)",
        text: "#fff9ef",
        frameOpacity: "0.9"
      };
    }
    if (/(interested|engaged|active process|interview|ready|approved|priority|top target|move forward|moving forward)([^a-z]|$)/.test(normalized)) {
      return {
        accent: "#1fce78",
        accentSecondary: "#8bf0be",
        accentSoft: "rgba(31, 206, 120, 0.22)",
        accentSecondarySoft: "rgba(139, 240, 190, 0.16)",
        outline: "rgba(31, 206, 120, 0.66)",
        surface: "rgba(7, 61, 35, 0.8)",
        surfaceTop: "rgba(255, 255, 255, 0.1)",
        shadow: "rgba(10, 116, 61, 0.28)",
        text: "#effff6",
        frameOpacity: "0.9"
      };
    }
    if (/(contacted|reached out|outreach|sequence|sequenced|new lead|new|sourced|screen|pipeline|active)([^a-z]|$)/.test(normalized)) {
      return {
        accent: "#3aa0ff",
        accentSecondary: "#9fd2ff",
        accentSoft: "rgba(58, 160, 255, 0.22)",
        accentSecondarySoft: "rgba(159, 210, 255, 0.16)",
        outline: "rgba(58, 160, 255, 0.66)",
        surface: "rgba(9, 38, 82, 0.82)",
        surfaceTop: "rgba(255, 255, 255, 0.1)",
        shadow: "rgba(10, 63, 135, 0.28)",
        text: "#eef7ff",
        frameOpacity: "0.9"
      };
    }
    return {
      accent: "#b7c2d8",
      accentSecondary: "#eef3ff",
      accentSoft: "rgba(183, 194, 216, 0.14)",
      accentSecondarySoft: "rgba(238, 243, 255, 0.12)",
      outline: "rgba(183, 194, 216, 0.48)",
      surface: "rgba(28, 36, 47, 0.8)",
      surfaceTop: "rgba(255, 255, 255, 0.08)",
      shadow: "rgba(15, 23, 42, 0.2)",
      text: "#f8fafc",
      frameOpacity: "0.8"
    };
  }

  function createIndicatorStyles() {
    if (document.getElementById("gls-linkedin-passive-status-style")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "gls-linkedin-passive-status-style";
    style.textContent = `
      #gls-linkedin-passive-status-signal {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483000;
        --gls-status-banner-gap: 14px;
        --gls-status-card-top: 74px;
        --gls-status-stack-gap: 8px;
        --gls-status-accent: #ff5f67;
        --gls-status-secondary: #ffb4bc;
        --gls-status-accent-soft: rgba(255, 95, 103, 0.72);
        --gls-status-secondary-soft: rgba(255, 180, 188, 0.64);
        --gls-status-outline: rgba(255, 95, 103, 0.72);
        --gls-status-surface: rgba(21, 23, 30, 0.98);
        --gls-status-surface-top: rgba(255, 255, 255, 0.12);
        --gls-status-shadow: rgba(145, 18, 32, 0.36);
        --gls-status-text: #fff5f6;
        --gls-status-frame-opacity: 1;
      }
      #gls-linkedin-passive-status-signal[hidden] {
        display: none !important;
      }
      .gls-linkedin-passive-status-stack {
        position: fixed;
        top: var(--gls-status-card-top);
        left: var(--gls-status-banner-gap);
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--gls-status-stack-gap);
        width: min(460px, calc(100vw - (var(--gls-status-banner-gap) * 2)));
      }
      .gls-linkedin-passive-status-card {
        position: relative;
        transform: none;
        width: fit-content;
        max-width: 100%;
        padding: 7px 12px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.26);
        background:
          linear-gradient(
            98deg,
            var(--gls-status-accent) 0,
            rgba(14, 16, 21, 0.985) 18%,
            rgba(14, 16, 21, 0.985) 82%,
            var(--gls-status-secondary) 100%
          ),
          var(--gls-status-surface);
        color: var(--gls-status-text);
        text-align: left;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.2),
          inset 0 -1px 0 rgba(255, 255, 255, 0.1),
          0 8px 18px var(--gls-status-shadow),
          0 0 0 1px rgba(255, 255, 255, 0.12),
          0 0 28px var(--gls-status-accent),
          0 0 40px var(--gls-status-secondary);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .gls-linkedin-passive-dnc-card {
        position: relative;
        width: fit-content;
        max-width: 100%;
        padding: 8px 14px;
        border-radius: 12px;
        border: 1px solid rgba(255, 228, 232, 0.34);
        background:
          linear-gradient(124deg, rgba(255, 102, 120, 0.98) 0%, rgba(123, 10, 27, 0.98) 58%, rgba(255, 190, 198, 0.94) 100%);
        color: #fff7f8;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.18),
          inset 0 -1px 0 rgba(255, 255, 255, 0.08),
          0 10px 24px rgba(126, 14, 29, 0.34),
          0 0 0 1px rgba(255, 255, 255, 0.08),
          0 0 26px rgba(255, 102, 120, 0.22);
        overflow: hidden;
      }
      .gls-linkedin-passive-dnc-card::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(112deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.06) 34%, transparent 62%),
          radial-gradient(circle at right center, rgba(255, 235, 239, 0.18), transparent 42%);
        pointer-events: none;
      }
      .gls-linkedin-passive-status-card::before {
        content: none;
      }
      .gls-linkedin-passive-status-card::after {
        content: none;
      }
      .gls-linkedin-passive-status-value {
        max-width: 100%;
        font-size: clamp(15px, 1vw, 19px);
        line-height: 1.14;
        font-weight: 730;
        letter-spacing: -0.007em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow:
          0 0 10px var(--gls-status-accent-soft),
          0 0 14px var(--gls-status-secondary-soft);
      }
      .gls-linkedin-passive-dnc-value {
        position: relative;
        max-width: 100%;
        font-size: clamp(14px, 0.96vw, 17px);
        line-height: 1.1;
        font-weight: 810;
        letter-spacing: 0.015em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: 0 0 10px rgba(255, 215, 220, 0.22);
      }
      @media (max-width: 900px) {
        .gls-linkedin-passive-status-stack {
          width: min(360px, calc(100vw - (var(--gls-status-banner-gap) * 2)));
        }
        .gls-linkedin-passive-status-card {
          padding: 6px 10px;
        }
        .gls-linkedin-passive-dnc-card {
          padding: 7px 11px;
        }
        .gls-linkedin-passive-status-value {
          font-size: clamp(13px, 3.5vw, 16px);
        }
        .gls-linkedin-passive-dnc-value {
          font-size: clamp(12px, 3.2vw, 14px);
        }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function getHeaderBounds() {
    const candidates = [];
    HEADER_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (!element || typeof element.getBoundingClientRect !== "function") {
          return;
        }
        const rect = element.getBoundingClientRect();
        if (rect.height <= 0 || rect.bottom <= 0) {
          return;
        }
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") {
          return;
        }
        const position = String(style.position || "").toLowerCase();
        if (position === "fixed" || position === "sticky" || rect.top <= 8) {
          candidates.push({ top: rect.top, bottom: rect.bottom });
        }
      });
    });
    if (candidates.length === 0) {
      return { top: 0, bottom: 56 };
    }
    const minTop = Math.min(...candidates.map((candidate) => candidate.top));
    const maxBottom = Math.max(...candidates.map((candidate) => candidate.bottom));
    return {
      top: Math.max(0, Math.min(60, Math.round(minTop))),
      bottom: Math.max(44, Math.min(180, Math.round(maxBottom)))
    };
  }

  function applyIndicatorLayout() {
    if (!state.indicatorElements?.root) {
      return;
    }
    const gap = window.innerWidth <= 900 ? 8 : 10;
    const stackGap = window.innerWidth <= 900 ? 6 : 8;
    const headerBounds = getHeaderBounds();
    const cardTop = headerBounds.top + gap;
    state.indicatorElements.root.style.setProperty("--gls-status-banner-gap", `${gap}px`);
    state.indicatorElements.root.style.setProperty("--gls-status-card-top", `${cardTop}px`);
    state.indicatorElements.root.style.setProperty("--gls-status-stack-gap", `${stackGap}px`);
  }

  function ensureIndicatorElements() {
    if (state.indicatorElements?.root?.isConnected) {
      return state.indicatorElements;
    }
    createIndicatorStyles();
    const root = document.createElement("div");
    root.id = "gls-linkedin-passive-status-signal";
    root.hidden = true;

    const stack = document.createElement("div");
    stack.className = "gls-linkedin-passive-status-stack";

    const statusCard = document.createElement("div");
    statusCard.className = "gls-linkedin-passive-status-card";
    statusCard.setAttribute("role", "status");
    statusCard.setAttribute("aria-live", "polite");

    const statusValue = document.createElement("div");
    statusValue.className = "gls-linkedin-passive-status-value";

    const dncCard = document.createElement("div");
    dncCard.className = "gls-linkedin-passive-dnc-card";
    dncCard.hidden = true;

    const dncValue = document.createElement("div");
    dncValue.className = "gls-linkedin-passive-dnc-value";
    dncValue.textContent = "Do not contact";

    statusCard.appendChild(statusValue);
    dncCard.appendChild(dncValue);
    stack.appendChild(statusCard);
    stack.appendChild(dncCard);
    root.appendChild(stack);
    (document.body || document.documentElement).appendChild(root);
    state.indicatorElements = { root, stack, statusCard, statusValue, dncCard, dncValue };

    window.addEventListener(
      "resize",
      () => {
        if (!state.indicatorElements?.root || state.indicatorElements.root.hidden) {
          return;
        }
        applyIndicatorLayout();
      },
      { passive: true }
    );

    return state.indicatorElements;
  }

  function hideIndicator() {
    if (state.indicatorElements?.root) {
      state.indicatorElements.root.hidden = true;
      state.indicatorElements.root.setAttribute("data-gls-status-state", INDICATOR_VIEW_STATES.HIDDEN);
    }
    state.indicatorViewState = INDICATOR_VIEW_STATES.HIDDEN;
    try {
      const root = document.documentElement;
      if (!root) {
        return;
      }
      root.setAttribute("data-gls-passive-status-state", INDICATOR_VIEW_STATES.HIDDEN);
      root.setAttribute("data-gls-passive-status-text", "");
    } catch (_error) {
      // Ignore marker failures.
    }
  }

  function renderIndicatorCard(text, palette, options = {}) {
    const elements = ensureIndicatorElements();
    const normalizedText = String(text || "").trim() || "Not in Gem";
    const viewState = String(options.viewState || INDICATOR_VIEW_STATES.READY).trim() || INDICATOR_VIEW_STATES.READY;
    elements.root.style.setProperty("--gls-status-accent", palette.accent);
    elements.root.style.setProperty("--gls-status-secondary", palette.accentSecondary || palette.accent);
    elements.root.style.setProperty("--gls-status-accent-soft", palette.accentSoft);
    elements.root.style.setProperty("--gls-status-secondary-soft", palette.accentSecondarySoft || palette.accentSoft);
    elements.root.style.setProperty("--gls-status-outline", palette.outline);
    elements.root.style.setProperty("--gls-status-surface", palette.surface);
    elements.root.style.setProperty("--gls-status-surface-top", palette.surfaceTop);
    elements.root.style.setProperty("--gls-status-shadow", palette.shadow);
    elements.root.style.setProperty("--gls-status-text", palette.text);
    elements.root.style.setProperty("--gls-status-frame-opacity", palette.frameOpacity);
    applyIndicatorLayout();
    elements.statusValue.textContent = normalizedText;
    elements.statusCard.setAttribute("aria-busy", "false");
    elements.dncCard.hidden = !Boolean(options.isDoNotContact);
    elements.root.setAttribute("data-gls-status-state", viewState);
    elements.root.hidden = false;
    state.indicatorViewState = viewState;
    try {
      const root = document.documentElement;
      if (!root) {
        return;
      }
      root.setAttribute("data-gls-passive-status-state", viewState);
      root.setAttribute("data-gls-passive-status-text", normalizedText);
    } catch (_error) {
      // Ignore marker failures.
    }
  }

  function renderIndicator(statusLabels, isDoNotContact = false) {
    const labels = Array.isArray(statusLabels) ? statusLabels : [];
    const hasValue = labels.length > 0;
    const statusText = hasValue ? summarizeStatusLabels(labels, 3) : "Not set";
    const palette = getStatusPalette(statusText, hasValue);
    renderIndicatorCard(statusText, palette, {
      viewState: INDICATOR_VIEW_STATES.READY,
      isDoNotContact: Boolean(isDoNotContact)
    });
  }

  function renderNotInGemIndicator() {
    renderIndicatorCard("Not in Gem", getStatusPalette("", false), {
      viewState: INDICATOR_VIEW_STATES.EMPTY
    });
  }

  function scheduleRefresh(delayMs = VISIBLE_REFRESH_MS) {
    clearRefreshTimer();
    if (document.visibilityState !== "visible" || !isStatusEnabled()) {
      return;
    }
    state.refreshTimerId = window.setTimeout(() => {
      state.refreshTimerId = 0;
      refreshStatus({
        forceRefresh: false,
        allowInlineScript: false,
        allowAnchorScan: true,
        scheduleNext: true,
        scheduleRetry: false
      }).catch(() => {});
    }, Math.max(0, Number(delayMs) || 0));
  }

  function scheduleDeferredRefresh(refreshOptions = {}, options = {}) {
    clearDeferredRefresh();
    const delayMs = Math.max(0, Number(options.delayMs) || 0);
    const preferIdle = options.preferIdle !== false;
    const idleTimeoutMs = Math.max(800, Number(options.idleTimeoutMs) || 1500);
    const fallbackDelayMs = Math.max(0, Number(options.fallbackDelayMs) || FALLBACK_IDLE_DELAY_MS);
    const run = () => {
      state.deferredRefreshTimerId = 0;
      state.deferredRefreshIdleId = 0;
      refreshStatus(refreshOptions).catch(() => {});
    };

    if (delayMs > 0) {
      state.deferredRefreshTimerId = window.setTimeout(run, delayMs);
      return;
    }
    if (preferIdle && typeof window.requestIdleCallback === "function") {
      state.deferredRefreshIdleId = window.requestIdleCallback(run, { timeout: idleTimeoutMs });
      return;
    }
    state.deferredRefreshTimerId = window.setTimeout(run, fallbackDelayMs);
  }

  function getContextSummary(context) {
    if (contextHasIdentity(context)) {
      return "LinkedIn profile detected. Signals: LinkedIn profile link.";
    }
    return "LinkedIn profile detected, but no stable candidate identity signal was found.";
  }

  async function loadPassiveGemStatus(context, options = {}) {
    const response = await sendRuntimeMessage({
      type: "GET_PASSIVE_GEM_STATUS",
      context,
      runId:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      preferCache: options.preferCache !== false,
      refreshInBackground: options.refreshInBackground !== false,
      forceRefresh: Boolean(options.forceRefresh)
    });
    if (!response?.ok) {
      throw new Error(response?.message || "Could not load Gem status.");
    }
    return response;
  }

  async function refreshStatus(options = {}) {
    if (!glsIsLinkedInProfilePage()) {
      invalidatePendingRefreshRequests();
      clearPendingWork();
      hideIndicator();
      return;
    }
    if (!state.cachedSettings) {
      await getSettings().catch(() => {});
    }
    if (!isStatusEnabled()) {
      invalidatePendingRefreshRequests();
      clearPendingWork();
      hideIndicator();
      return;
    }

    const requestId = ++state.refreshRequestId;
    const context = resolveLinkedInContext({
      allowInlineScript: Boolean(options.allowInlineScript),
      allowAnchorScan: options.allowAnchorScan !== false,
      scheduleRetry: options.scheduleRetry !== false
    });

    if (!contextHasIdentity(context)) {
      if (options.scheduleNext !== false) {
        scheduleRefresh(VISIBLE_REFRESH_MS);
      }
      return;
    }

    try {
      const status = await loadPassiveGemStatus(context, {
        forceRefresh: Boolean(options.forceRefresh),
        preferCache: !options.forceRefresh,
        refreshInBackground: true
      });
      if (requestId !== state.refreshRequestId) {
        return;
      }
      if (String(status.candidateId || "").trim()) {
        renderIndicator(status.statusLabels, Boolean(status.isDoNotContact));
      } else {
        renderNotInGemIndicator();
      }
    } catch (_error) {
      if (requestId !== state.refreshRequestId) {
        return;
      }
    } finally {
      if (requestId === state.refreshRequestId && options.scheduleNext !== false) {
        scheduleRefresh(VISIBLE_REFRESH_MS);
      }
    }
  }

  function updateSettings(nextSettings) {
    state.cachedSettings = normalizeSettings(nextSettings || {});
    if (!isStatusEnabled()) {
      invalidatePendingRefreshRequests();
      clearPendingWork();
      hideIndicator();
      return;
    }
    scheduleDeferredRefresh(
      {
        forceRefresh: false,
        allowInlineScript: false,
        allowAnchorScan: true,
        scheduleNext: true,
        scheduleRetry: true
      },
      {
        delayMs: SETTINGS_REFRESH_DELAY_MS,
        preferIdle: true
      }
    );
  }

  function getContextDebug() {
    const context = resolveLinkedInContext({
      allowInlineScript: true,
      allowAnchorScan: true,
      scheduleRetry: false
    });
    return {
      ok: true,
      supported: true,
      hasIdentity: contextHasIdentity(context),
      sourcePlatform: "linkedin",
      summary: getContextSummary(context),
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
    };
  }

  window.addEventListener("gls:linkedin-page-changed", (event) => {
    const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
    const nextPageUrl = glsNormalizePageUrl(detail.pageUrl || window.location.href);
    const previousPageUrl = glsNormalizePageUrl(state.contextCache.pageUrl || "");
    const didNavigateToDifferentProfile =
      Boolean(nextPageUrl) && Boolean(previousPageUrl) && previousPageUrl !== nextPageUrl;

    invalidatePendingRefreshRequests();
    clearPendingWork();
    if (!glsIsLinkedInProfilePage()) {
      resetContextCache();
      hideIndicator();
      return;
    }

    if (didNavigateToDifferentProfile) {
      resetContextCache();
      hideIndicator();
    } else if (nextPageUrl) {
      state.contextCache.pageUrl = nextPageUrl;
    }

    scheduleDeferredRefresh(
      {
        forceRefresh: didNavigateToDifferentProfile || Boolean(detail.forceRefresh),
        allowInlineScript: false,
        allowAnchorScan: true,
        scheduleNext: true,
        scheduleRetry: true
      },
      {
        preferIdle: true,
        idleTimeoutMs: PAGE_CHANGE_IDLE_TIMEOUT_MS,
        fallbackDelayMs: 120
      }
    );
  });

  window.addEventListener("gls:gem-status-changed", () => {
    scheduleDeferredRefresh(
      {
        forceRefresh: true,
        allowInlineScript: false,
        allowAnchorScan: true,
        scheduleNext: true,
        scheduleRetry: false
      },
      {
        delayMs: STATUS_CHANGED_REFRESH_DELAY_MS,
        preferIdle: false
      }
    );
  });

  window.addEventListener("gls:settings-updated", (event) => {
    const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
    if (detail.settings && typeof detail.settings === "object") {
      updateSettings(detail.settings);
      return;
    }
    getSettings().then(updateSettings).catch(() => {});
  });

  window.addEventListener(
    "focus",
    () => {
      scheduleDeferredRefresh(
        {
          forceRefresh: false,
          allowInlineScript: false,
          allowAnchorScan: true,
          scheduleNext: true,
          scheduleRetry: false
        },
        {
          delayMs: FOCUS_REFRESH_DELAY_MS,
          preferIdle: true
        }
      );
    },
    { passive: true }
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") {
        scheduleDeferredRefresh(
          {
            forceRefresh: false,
            allowInlineScript: false,
            allowAnchorScan: true,
            scheduleNext: true,
            scheduleRetry: false
          },
          {
            delayMs: VISIBILITY_REFRESH_DELAY_MS,
            preferIdle: true
          }
        );
        return;
      }
      clearRefreshTimer();
      clearDeferredRefresh();
      clearIdentityRetryTimer();
    },
    { passive: true }
  );

  window.__GLS_LINKEDIN_PASSIVE_RUNTIME_READY__ = true;
  window.__GLS_LINKEDIN_PASSIVE_RUNTIME__ = {
    getContextDebug
  };

  getSettings()
    .then((settings) => {
      state.cachedSettings = normalizeSettings(settings || {});
      if (!isStatusEnabled()) {
        hideIndicator();
        return;
      }
      if (!glsIsLinkedInProfilePage()) {
        hideIndicator();
        return;
      }
      scheduleDeferredRefresh(
        {
          forceRefresh: false,
          allowInlineScript: false,
          allowAnchorScan: true,
          scheduleNext: true,
          scheduleRetry: true
        },
        {
          preferIdle: true,
          idleTimeoutMs: PAGE_CHANGE_IDLE_TIMEOUT_MS,
          fallbackDelayMs: 120
        }
      );
    })
    .catch(() => {});
})();
