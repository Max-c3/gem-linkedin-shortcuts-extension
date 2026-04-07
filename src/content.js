"use strict";

if (!window.__GLS_UNIFIED_CONTENT_RUNTIME_READY__ || window.__GLS_UNIFIED_CONTENT_RUNTIME_VERSION__ !== CONTENT_RUNTIME_VERSION) {
window.__GLS_UNIFIED_CONTENT_RUNTIME_READY__ = true;
window.__GLS_UNIFIED_CONTENT_RUNTIME_VERSION__ = CONTENT_RUNTIME_VERSION;

let cachedSettings = null;
let toastContainer = null;
let contextRecoveryTriggered = false;
const ASHBY_JOB_PICKER_RENDER_LIMIT = 100;
const CUSTOM_FIELD_KEYS_PER_PAGE = 26;
const CUSTOM_FIELD_SHORTCUT_KEYS = "abcdefghijklmnopqrstuvwxyz".split("");
const PINNED_CUSTOM_FIELD_NAMES = Object.freeze(["priority", "expertise", "status", "seniority"]);
const PINNED_CUSTOM_FIELD_RANK = new Map(PINNED_CUSTOM_FIELD_NAMES.map((name, index) => [name, index]));
const SEQUENCE_PICKER_KEYS_PER_PAGE = 26;
const SEQUENCE_PICKER_SHORTCUT_KEYS = "abcdefghijklmnopqrstuvwxyz".split("");
const LINKEDIN_SHORTCUT_IDS = {
  CONNECT: "linkedinConnect",
  INVITE_SEND_WITHOUT_NOTE: "linkedinInviteSendWithoutNote",
  INVITE_ADD_NOTE: "linkedinInviteAddNote",
  VIEW_IN_RECRUITER: "linkedinViewInRecruiter",
  MESSAGE_PROFILE: "linkedinMessageProfile",
  CONTACT_INFO: "linkedinContactInfo",
  EXPAND_SEE_MORE: "linkedinExpandSeeMore",
  RECRUITER_TEMPLATE: "linkedinRecruiterTemplate",
  RECRUITER_SEND: "linkedinRecruiterSend"
};
const LINKEDIN_EXPAND_MORE_MAX_PASSES = 6;
const LINKEDIN_EXPAND_MORE_PASS_DELAY_MS = 110;
const LINKEDIN_INVITE_DECISION_TIMEOUT_MS = 1200;
const LINKEDIN_INVITE_DECISION_POLL_INTERVAL_MS = 50;
const CANDIDATE_NOTE_MAX_LENGTH = 10000;
const REMINDER_PRESET_SHORTCUTS = [
  { key: "a", label: "1 week", kind: "days", amount: 7 },
  { key: "s", label: "3 months", kind: "months", amount: 3 },
  { key: "d", label: "6 months", kind: "months", amount: 6 }
];
const EMAIL_MENU_ADD_KEY = "a";
const EMAIL_MENU_COPY_PRIMARY_KEY = "s";
const EMAIL_MENU_VIEW_ALL_KEY = "d";
const PROFILE_ACTION_BAND_TOP_OFFSET = 160;
const PROFILE_ACTION_BAND_BOTTOM_OFFSET = 420;
const PROFILE_ACTION_COLUMN_MAX_X_OFFSET = 520;
const PROFILE_ACTION_FALLBACK_MAX_TOP = 500;
const CUSTOM_FIELD_MEMORY_CACHE_LIMIT = 40;
const CUSTOM_FIELD_MEMORY_TTL_MS = 30 * 60 * 1000;
const CANDIDATE_EMAIL_MEMORY_CACHE_LIMIT = 80;
const CANDIDATE_EMAIL_MEMORY_TTL_MS = 30 * 60 * 1000;
const PROJECT_MEMORY_TTL_MS = 30 * 60 * 1000;
const OPTIMISTIC_GEM_STATUS_TTL_MS = 12 * 1000;
const PROFILE_URL_POLL_INTERVAL_MS = 300;
const LINKEDIN_PAGE_CHANGE_REFRESH_DELAY_MS = 220;
const LINKEDIN_PAGE_CHANGE_IDENTITY_RETRY_DELAY_MS = 520;
const LINKEDIN_RECRUITER_IDENTITY_GRACE_MS = 500;
const LINKEDIN_STATUS_RETRY_DELAYS_MS = Object.freeze([650, 1400, 2600, 4200]);
const GEM_STATUS_LIVE_REFRESH_VISIBLE_MS = 2500;
const GEM_STATUS_LIVE_REFRESH_HIDDEN_MS = 8000;
const GEM_ACTION_ACCESS_OPTIONS = [
  { key: "a", value: "shared", label: "Shared project", description: "Everyone on your team can add or remove candidates." },
  { key: "s", value: "personal", label: "Personal project", description: "Only you can see and manage this project." },
  { key: "d", value: "confidential", label: "Confidential project", description: "Only select collaborators can access this project." }
];
const GEM_ACTION_MENU_OPTIONS = [
  { key: "c", id: "createProject", title: "Create project", subtitle: "Create a new Gem project." },
  { key: "p", id: "openProject", title: "Search project + open", subtitle: "Open an existing project or create one if missing." },
  { key: "s", id: "createSequence", title: "Create sequence", subtitle: "Open Gem sequences page." },
  { key: "k", id: "searchPerson", title: "Search someone in Gem", subtitle: "Search candidates and open Gem or LinkedIn profile." }
];
const GEM_ACTION_PEOPLE_SEARCH_DEBOUNCE_MS = 140;
const GEM_ACTION_PEOPLE_SEARCH_LIMIT = 20;
const ACTION_LOCK_ATTR = "data-gls-action-lock";
const ACTION_LOCK_OWNER_ATTR = "data-gls-action-lock-owner";
const ACTION_LOCK_AT_ATTR = "data-gls-action-lock-at";
const ACTION_LOCK_TIMEOUT_MS = 2 * 60 * 1000;
const SHARED_ACTION_OVERLAY_IDS = Object.freeze([
  "gem-custom-field-picker-overlay",
  "gem-reminder-picker-overlay",
  "gem-email-picker-overlay",
  "gem-sequence-picker-overlay",
  "gem-actions-overlay",
  "gem-project-picker-overlay",
  "gem-ashby-job-picker-overlay",
  "gem-candidate-note-picker-overlay"
]);
const CONTENT_RUNTIME_INSTANCE_ID = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const customFieldMemoryCache = new Map();
const customFieldWarmPromises = new Map();
const candidateEmailMemoryCache = new Map();
const candidateEmailWarmPromises = new Map();
const optimisticGemStatusCache = new Map();
let projectMemoryEntry = null;
let lastPrefetchedProfileContextKey = "";
let profileUrlPollTimerId = 0;
let profileUrlPollLastUrl = "";
let gemStatusIndicatorElements = null;
let gemStatusIndicatorRequestId = 0;
let gemStatusLayoutWatcherBound = false;
let gemStatusRefreshInFlightPromise = null;
let gemStatusRefreshInFlightContextKey = "";
let gemStatusRefreshInFlightForce = false;
let gemStatusBootstrapTimerIds = [];
let gemStatusLiveRefreshInFlight = false;
let gemStatusLiveRefreshNextAtMs = 0;
let gemStatusLiveRefreshFailureStreak = 0;
let linkedInPageChangeTimerId = 0;
let linkedInPageChangeBound = false;
let linkedInObservedPageUrl = "";
let linkedInLastPageChangeAtMs = 0;
let linkedInStatusRetryCount = 0;
let linkedInStatusRetryContextKey = "";
let profileIdentityCache = {
  pageUrl: "",
  linkedinUrl: "",
  linkedInHandle: "",
  gemCandidateId: "",
  resolvedAtMs: 0
};
const isLinkedInProfilePage = glsIsLinkedInProfilePage;
const isLinkedInPublicProfilePage = glsIsLinkedInPublicProfilePage;
const isLinkedInRecruiterProfilePage = glsIsLinkedInRecruiterProfilePage;
const normalizeUrlForContext = glsNormalizeUrl;
const normalizeLinkedInUrl = glsNormalizeUrl;

window.__GLS_UNIFIED_CONTENT_ACTIVE__ = true;

function markContentRuntimeReadyForPage() {
  try {
    document.documentElement?.setAttribute("data-gls-content-runtime", "ready");
    document.documentElement?.setAttribute("data-gls-content-version", String(CONTENT_RUNTIME_VERSION || ""));
  } catch (_error) {
    // Ignore DOM marker failures.
  }
}

function markContentShortcutListenerReadyForPage(source = "") {
  try {
    document.documentElement?.setAttribute("data-gls-keydown-runtime", "ready");
    document.documentElement?.setAttribute("data-gls-keydown-source", String(source || ""));
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
    root.setAttribute("data-gls-shortcut-linkedin-connect", getConfiguredLinkedInShortcut(LINKEDIN_SHORTCUT_IDS.CONNECT));
    root.setAttribute("data-gls-shortcut-linkedin-message", getConfiguredLinkedInShortcut(LINKEDIN_SHORTCUT_IDS.MESSAGE_PROFILE));
    root.setAttribute("data-gls-shortcut-linkedin-contact", getConfiguredLinkedInShortcut(LINKEDIN_SHORTCUT_IDS.CONTACT_INFO));
    root.setAttribute(
      "data-gls-shortcut-linkedin-view-in-recruiter",
      getConfiguredLinkedInShortcut(LINKEDIN_SHORTCUT_IDS.VIEW_IN_RECRUITER)
    );
    root.setAttribute("data-gls-shortcut-linkedin-see-more", getConfiguredLinkedInShortcut(LINKEDIN_SHORTCUT_IDS.EXPAND_SEE_MORE));
  } catch (_error) {
    // Ignore DOM marker failures.
  }
}

function markLastShortcutDiagnosticsForPage(details = {}) {
  try {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.setAttribute("data-gls-last-shortcut", String(details.shortcut || ""));
    root.setAttribute("data-gls-last-shortcut-key", String(details.key || ""));
    root.setAttribute("data-gls-last-shortcut-code", String(details.code || ""));
    root.setAttribute("data-gls-last-shortcut-target", String(details.target || ""));
    root.setAttribute("data-gls-last-shortcut-supported", details.supported ? "true" : "false");
    root.setAttribute("data-gls-last-shortcut-linkedin", details.linkedin ? "true" : "false");
    root.setAttribute("data-gls-last-shortcut-public", details.linkedinPublic ? "true" : "false");
    root.setAttribute("data-gls-last-shortcut-recruiter", details.linkedinRecruiter ? "true" : "false");
    root.setAttribute("data-gls-last-shortcut-editable", details.editable ? "true" : "false");
    root.setAttribute("data-gls-last-shortcut-match", String(details.match || ""));
  } catch (_error) {
    // Ignore DOM marker failures.
  }
}

function markLastLinkedInActionDiagnosticsForPage(details = {}) {
  try {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.setAttribute("data-gls-last-linkedin-action", String(details.action || ""));
    root.setAttribute("data-gls-last-linkedin-action-stage", String(details.stage || ""));
    root.setAttribute("data-gls-last-linkedin-action-shortcut", String(details.shortcut || ""));
    root.setAttribute("data-gls-last-linkedin-action-clicked", String(details.clicked || ""));
    root.setAttribute("data-gls-last-linkedin-action-top-card-root", details.topCardRootFound ? "true" : "false");
    root.setAttribute("data-gls-last-linkedin-action-heading", details.headingFound ? "true" : "false");
    root.setAttribute("data-gls-last-linkedin-action-search-roots", String(details.searchRootCount || 0));
  } catch (_error) {
    // Ignore DOM marker failures.
  }
}

function debugContentRuntime(eventName, details = {}) {
  try {
    if (typeof console !== "undefined" && typeof console.log === "function") {
      console.log("[GLS]", eventName, {
        href: window.location.href,
        ...details
      });
    } else if (typeof console !== "undefined" && typeof console.info === "function") {
      console.info("[GLS]", eventName, {
        href: window.location.href,
        ...details
      });
    }
  } catch (_error) {
    // Ignore console failures.
  }
}

function hasSharedActionOverlayOnPage() {
  return SHARED_ACTION_OVERLAY_IDS.some((id) => Boolean(document.getElementById(id)));
}

function tryAcquireActionLock(actionId, runId = "") {
  const root = document.documentElement;
  if (!root) {
    return true;
  }
  const activeActionId = String(root.getAttribute(ACTION_LOCK_ATTR) || "").trim();
  const lockedAtMs = Number(root.getAttribute(ACTION_LOCK_AT_ATTR)) || 0;
  const lockIsFresh = lockedAtMs > 0 && Date.now() - lockedAtMs < ACTION_LOCK_TIMEOUT_MS;
  if ((activeActionId && lockIsFresh) || hasSharedActionOverlayOnPage()) {
    return false;
  }
  root.setAttribute(ACTION_LOCK_ATTR, String(actionId || "").trim());
  root.setAttribute(ACTION_LOCK_OWNER_ATTR, CONTENT_RUNTIME_INSTANCE_ID);
  root.setAttribute(ACTION_LOCK_AT_ATTR, String(Date.now()));
  if (runId) {
    root.setAttribute("data-gls-action-lock-run-id", String(runId || "").trim());
  } else {
    root.removeAttribute("data-gls-action-lock-run-id");
  }
  return true;
}

function releaseActionLock() {
  const root = document.documentElement;
  if (!root) {
    return;
  }
  const owner = String(root.getAttribute(ACTION_LOCK_OWNER_ATTR) || "").trim();
  if (owner && owner !== CONTENT_RUNTIME_INSTANCE_ID) {
    return;
  }
  root.removeAttribute(ACTION_LOCK_ATTR);
  root.removeAttribute(ACTION_LOCK_OWNER_ATTR);
  root.removeAttribute(ACTION_LOCK_AT_ATTR);
  root.removeAttribute("data-gls-action-lock-run-id");
}

function isContextInvalidatedError(message) {
  return /Extension context invalidated|Receiving end does not exist|The message port closed before a response was received/i.test(
    String(message || "")
  );
}

function isContextInvalidatedResponse(response) {
  return isContextInvalidatedError(String(response?.message || ""));
}

function triggerContextRecovery(message) {
  if (contextRecoveryTriggered) {
    return;
  }
  contextRecoveryTriggered = true;
  showToast("Extension was updated. Reloading this tab...", true);
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

function isGemHost(hostname) {
  return /(^|\.)gem\.com$/i.test(String(hostname || ""));
}

function isGmailHost(hostname) {
  return /(^|\.)mail\.google\.com$/i.test(String(hostname || ""));
}

function isGitHubHost(hostname) {
  return /(^|\.)github\.com$/i.test(String(hostname || ""));
}

function isGmailMailboxPath(pathname) {
  return /^\/mail(?:\/|$)/i.test(String(pathname || ""));
}

function isGemCandidateProfilePath(pathname) {
  return /^\/candidate\/[^/?#]+(?:\/.*)?$/i.test(String(pathname || ""));
}

function isBootstrapManagedLinkedInPage() {
  return isLinkedInProfilePage() && Boolean(window.__GLS_LINKEDIN_BOOTSTRAP__);
}

function isGemCandidateProfilePage() {
  try {
    const parsed = new URL(window.location.href);
    return isGemHost(parsed.hostname) && isGemCandidateProfilePath(parsed.pathname);
  } catch (_error) {
    return /^https:\/\/(?:www|app)\.gem\.com\/candidate\/[^/?#]+/i.test(window.location.href);
  }
}

const GMAIL_HASH_ROUTE_RESERVED_SEGMENTS = new Set([
  "all",
  "category",
  "chat",
  "chats",
  "compose",
  "drafts",
  "important",
  "imp",
  "inbox",
  "label",
  "scheduled",
  "search",
  "sent",
  "settings",
  "snoozed",
  "spam",
  "starred",
  "trash"
]);

function decodeUrlSegment(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  try {
    return decodeURIComponent(raw);
  } catch (_error) {
    return raw;
  }
}

function extractGmailThreadTokenFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    if (!isGmailHost(parsed.hostname) || !isGmailMailboxPath(parsed.pathname)) {
      return "";
    }
    const rawHash = String(parsed.hash || "").replace(/^#/, "").trim();
    if (!rawHash) {
      return "";
    }
    const route = rawHash.split("?")[0] || "";
    const segments = route
      .split("/")
      .map((segment) => decodeUrlSegment(segment))
      .filter(Boolean);
    if (segments.length < 2) {
      return "";
    }
    const lastSegment = String(segments[segments.length - 1] || "").trim();
    if (!lastSegment) {
      return "";
    }
    if (GMAIL_HASH_ROUTE_RESERVED_SEGMENTS.has(lastSegment.toLowerCase())) {
      return "";
    }
    if (!/^[A-Za-z0-9_-]{10,}$/.test(lastSegment)) {
      return "";
    }
    return lastSegment;
  } catch (_error) {
    return "";
  }
}

function isGmailThreadPage() {
  try {
    const parsed = new URL(window.location.href);
    return (
      isGmailHost(parsed.hostname) &&
      isGmailMailboxPath(parsed.pathname) &&
      Boolean(extractGmailThreadTokenFromUrl(parsed.toString()))
    );
  } catch (_error) {
    return /^https:\/\/mail\.google\.com\/mail\//i.test(window.location.href) && Boolean(extractGmailThreadTokenFromUrl(window.location.href));
  }
}

const GITHUB_RESERVED_PROFILE_PATHS = new Set([
  "about",
  "account",
  "apps",
  "blog",
  "codespaces",
  "collections",
  "contact",
  "copilot",
  "customer-stories",
  "customers",
  "enterprise",
  "events",
  "explore",
  "features",
  "gist",
  "gists",
  "issues",
  "join",
  "login",
  "logout",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "readme",
  "search",
  "security",
  "session",
  "site",
  "sponsors",
  "topics",
  "trending"
]);

function isGitHubProfilePath(pathname) {
  const segments = String(pathname || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length !== 1) {
    return false;
  }
  const username = segments[0].toLowerCase();
  if (!username || GITHUB_RESERVED_PROFILE_PATHS.has(username)) {
    return false;
  }
  return true;
}

function isGitHubProfilePage() {
  try {
    const parsed = new URL(window.location.href);
    return isGitHubHost(parsed.hostname) && isGitHubProfilePath(parsed.pathname);
  } catch (_error) {
    return /^https:\/\/github\.com\/[^/]+\/?$/i.test(window.location.href);
  }
}

function isSupportedActionPage() {
  return isLinkedInProfilePage() || isGemCandidateProfilePage() || isGmailThreadPage() || isGitHubProfilePage();
}

function normalizePageUrlForWatcher(url = window.location.href) {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.search = "";
    if (!(isGmailHost(parsed.hostname) && isGmailMailboxPath(parsed.pathname))) {
      parsed.hash = "";
    }
    return parsed.toString();
  } catch (_error) {
    return String(url || "");
  }
}

function getLinkedInIdentityHelpers() {
  return window.__GLS_LINKEDIN_IDENTITY_HELPERS__ || {};
}

function toCanonicalLinkedInPublicProfileUrl(rawUrl) {
  return getLinkedInIdentityHelpers().toCanonicalPublicProfileUrl?.(rawUrl, window.location.origin) || "";
}

function getCurrentLinkedInPublicProfileUrl() {
  return toCanonicalLinkedInPublicProfileUrl(window.location.href);
}

function findLinkedInPublicProfileUrlInDom() {
  return getLinkedInIdentityHelpers().findLinkedInPublicProfileUrlInDom?.({
    document,
    locationHref: window.location.href,
    urlBase: window.location.origin,
    allowInlineScript: true,
    allowAnchorScan: true,
    anchorScanLimit: 250,
    inlineScriptOrder: "beforeAnchors",
    inlineScriptOptions: {
      maxScriptTextLength: 800000,
      requireSignalPattern: true
    }
  }) || getCurrentLinkedInPublicProfileUrl();
}

function getLinkedInHandle(url) {
  return getLinkedInIdentityHelpers().getLinkedInHandle?.(url, window.location.origin) || "";
}

function getProfileName() {
  const heading = document.querySelector("h1");
  return heading ? heading.textContent.trim() : "";
}

function refreshProfileIdentityFromDom(options = {}) {
  const pageUrl = normalizeLinkedInUrl(window.location.href);
  const force = Boolean(options.force);
  const shouldRetryRecruiterIdentity =
    isLinkedInRecruiterProfilePage() && !String(profileIdentityCache.linkedinUrl || "").trim();
  const shouldRefresh = force || profileIdentityCache.pageUrl !== pageUrl || shouldRetryRecruiterIdentity;

  if (!shouldRefresh) {
    return;
  }

  const previousLinkedinUrl = String(profileIdentityCache.linkedinUrl || "").trim();
  const previousLinkedInHandle = String(profileIdentityCache.linkedInHandle || "")
    .trim()
    .toLowerCase();
  const currentPublicProfileUrl = getCurrentLinkedInPublicProfileUrl();
  const shouldDelayRecruiterDomIdentity =
    !currentPublicProfileUrl &&
    isLinkedInRecruiterProfilePage() &&
    Date.now() - linkedInLastPageChangeAtMs < LINKEDIN_RECRUITER_IDENTITY_GRACE_MS;
  const linkedinUrl = currentPublicProfileUrl || (shouldDelayRecruiterDomIdentity ? "" : findLinkedInPublicProfileUrlInDom());
  const linkedInHandle = getLinkedInHandle(linkedinUrl);
  const normalizedNextHandle = String(linkedInHandle || "")
    .trim()
    .toLowerCase();
  const sameProfile =
    profileIdentityCache.pageUrl === pageUrl ||
    (previousLinkedinUrl && linkedinUrl && previousLinkedinUrl === linkedinUrl) ||
    (previousLinkedInHandle && normalizedNextHandle && previousLinkedInHandle === normalizedNextHandle);
  profileIdentityCache = {
    pageUrl,
    linkedinUrl,
    linkedInHandle,
    gemCandidateId: sameProfile ? String(profileIdentityCache.gemCandidateId || "").trim() : "",
    resolvedAtMs: Date.now()
  };
}

function applyGemCandidateHintToContext(context) {
  const base = context && typeof context === "object" ? context : {};
  const gemCandidateId = String(base.gemCandidateId || profileIdentityCache.gemCandidateId || "").trim();
  if (!gemCandidateId) {
    return { ...base };
  }
  return {
    ...base,
    gemCandidateId
  };
}

function rememberGemCandidateIdForCurrentLinkedInPage(candidateId) {
  const normalized = String(candidateId || "").trim();
  if (!normalized || !isLinkedInProfilePage()) {
    return;
  }
  profileIdentityCache.gemCandidateId = normalized;
}

function getLinkedInProfileContext() {
  refreshProfileIdentityFromDom();
  const linkedinUrl = getCurrentLinkedInPublicProfileUrl() || profileIdentityCache.linkedinUrl || "";
  return {
    sourcePlatform: "linkedin",
    pageUrl: normalizePageUrlForWatcher(window.location.href),
    profileUrl: normalizeUrlForContext(window.location.href),
    linkedinUrl,
    linkedInHandle: getLinkedInHandle(linkedinUrl) || profileIdentityCache.linkedInHandle || "",
    profileName: getProfileName()
  };
}

function readEmailsFromString(value, outputSet) {
  if (!value) {
    return;
  }
  const matches = String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  matches.forEach((match) => {
    const normalized = normalizeEmailAddressForPicker(match).toLowerCase();
    if (isValidEmailAddressForPicker(normalized)) {
      outputSet.add(normalized);
    }
  });
}

function collectEmailAddressesFromDom(options = {}) {
  const selectors =
    options.selectors ||
    [
      "a[href^='mailto:']",
      "span[email]",
      "div[email]",
      "[data-hovercard-id]",
      "[data-email]",
      "[aria-label*='@']"
    ];
  const maxNodes = Math.max(1, Number(options.maxNodes) || 300);
  const emails = new Set();
  const nodes = Array.from(document.querySelectorAll(selectors.join(","))).slice(0, maxNodes);
  nodes.forEach((node) => {
    const attrCandidates = [
      node.getAttribute("email"),
      node.getAttribute("data-email"),
      node.getAttribute("data-hovercard-id"),
      node.getAttribute("href"),
      node.getAttribute("aria-label"),
      node.textContent
    ];
    attrCandidates.forEach((value) => readEmailsFromString(value, emails));
  });
  return Array.from(emails);
}

function unwrapKnownRedirectUrl(rawUrl, depth = 0) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }
  if (depth > 2) {
    return value;
  }
  try {
    const parsed = new URL(value, window.location.origin);
    const redirected =
      parsed.searchParams.get("q") || parsed.searchParams.get("url") || parsed.searchParams.get("u") || "";
    if (redirected && /^https?:/i.test(redirected)) {
      return unwrapKnownRedirectUrl(redirected, depth + 1);
    }
    return parsed.toString();
  } catch (_error) {
    return value;
  }
}

function collectDocumentAnchorUrls(options = {}) {
  const maxAnchors = Math.max(1, Number(options.maxAnchors) || 300);
  const urls = [];
  const seen = new Set();
  const add = (value) => {
    const normalized = unwrapKnownRedirectUrl(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    urls.push(normalized);
  };
  Array.from(document.querySelectorAll("a[href], a[data-saferedirecturl]"))
    .slice(0, maxAnchors)
    .forEach((anchor) => {
      add(anchor.getAttribute("href"));
      add(anchor.getAttribute("data-saferedirecturl"));
      add(anchor.href);
    });
  return urls;
}

function readUrlsFromString(value, outputSet) {
  const text = String(value || "").trim();
  if (!text) {
    return;
  }
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi) || [];
  matches.forEach((match) => {
    outputSet.add(unwrapKnownRedirectUrl(match));
  });
}

function collectDocumentTextUrls(options = {}) {
  const maxNodes = Math.max(1, Number(options.maxNodes) || 120);
  const urls = [];
  const seen = new Set();
  const add = (value) => {
    const normalized = unwrapKnownRedirectUrl(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    urls.push(normalized);
  };

  Array.from(document.querySelectorAll("main, article, section, body"))
    .slice(0, Math.min(maxNodes, 20))
    .forEach((node) => {
      const text = String(node?.textContent || "");
      if (!text) {
        return;
      }
      const buffer = new Set();
      readUrlsFromString(text, buffer);
      buffer.forEach((url) => add(url));
    });

  return urls;
}

function findLinkedInUrlInDocument() {
  if (isLinkedInProfilePage()) {
    const fromDom = findLinkedInPublicProfileUrlInDom();
    if (fromDom) {
      return fromDom;
    }
  }
  const urls = [...collectDocumentAnchorUrls({ maxAnchors: 350 }), ...collectDocumentTextUrls({ maxNodes: 40 })];
  for (const href of urls) {
    const canonical = toCanonicalLinkedInPublicProfileUrl(href);
    if (canonical) {
      return canonical;
    }
  }
  return "";
}

function isGemAutomatedThreadEmail(value) {
  const email = normalizeEmailAddressForPicker(value).toLowerCase();
  return email === "no-reply@gem.com" || email === "noreply@gem.com";
}

function getConfiguredUserEmail() {
  const email = normalizeEmailAddressForPicker(cachedSettings?.createdByUserEmail || "").toLowerCase();
  return isValidEmailAddressForPicker(email) ? email : "";
}

function normalizeGmailThreadText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectGmailVisibleAccountEmails() {
  const emails = new Set();
  Array.from(
    document.querySelectorAll(
      "a[aria-label*='Google Account'], button[aria-label*='Google Account'], div[aria-label*='Google Account'], img[alt*='Google Account']"
    )
  )
    .slice(0, 40)
    .forEach((node) => {
      readEmailsFromString(node.getAttribute("aria-label"), emails);
      readEmailsFromString(node.getAttribute("title"), emails);
      readEmailsFromString(node.getAttribute("alt"), emails);
      readEmailsFromString(node.textContent, emails);
    });
  const configuredUserEmail = getConfiguredUserEmail();
  if (configuredUserEmail) {
    emails.add(configuredUserEmail);
  }
  return Array.from(emails)
    .map((email) => normalizeEmailAddressForPicker(email).toLowerCase())
    .filter((email) => isValidEmailAddressForPicker(email));
}

function getGmailThreadRoots() {
  const roots = Array.from(document.querySelectorAll("[data-message-id], .adn.ads")).slice(0, 80);
  return roots.length > 0 ? roots : [document];
}

function getGmailThreadSubject() {
  const selectors = ["h2[data-thread-perm-id]", "h2.hP", "h2[role='heading']", "[role='main'] h2"];
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    const text = normalizeGmailThreadText(node?.textContent || node?.getAttribute("aria-label") || "");
    if (text) {
      return text;
    }
  }
  return "";
}

function collectGmailVisibleParticipantEntries() {
  const currentUserEmails = new Set(collectGmailVisibleAccountEmails());
  const participantMap = new Map();

  const upsert = (emailValue, labelValue, rootIndex) => {
    const extractedEmails = new Set();
    readEmailsFromString(emailValue, extractedEmails);
    if (extractedEmails.size === 0) {
      extractedEmails.add(normalizeEmailAddressForPicker(emailValue).toLowerCase());
    }
    const email = String(Array.from(extractedEmails)[0] || "").toLowerCase();
    if (!isValidEmailAddressForPicker(email)) {
      return;
    }
    const label = normalizeGmailThreadText(labelValue).replace(/\s*<[^>]+>\s*$/, "");
    const normalizedLabel = label.toLowerCase();
    const existing = participantMap.get(email) || {
      email,
      label: "",
      occurrences: 0,
      firstIndex: Number.isFinite(rootIndex) ? rootIndex : 9999
    };
    existing.occurrences += 1;
    existing.firstIndex = Math.min(existing.firstIndex, Number.isFinite(rootIndex) ? rootIndex : existing.firstIndex);
    if (!existing.label && label && !/@/.test(label) && label.length <= 120) {
      existing.label = label;
    }
    existing.isCurrentUser = currentUserEmails.has(email) || existing.isCurrentUser === true;
    existing.isGem = isGemAutomatedThreadEmail(email) || normalizedLabel === "gem" || existing.isGem === true;
    participantMap.set(email, existing);
  };

  getGmailThreadRoots().forEach((root, rootIndex) => {
    Array.from(root.querySelectorAll("[data-hovercard-id]"))
      .slice(0, 40)
      .forEach((node) => {
        const email = node.getAttribute("data-hovercard-id") || "";
        const label =
          node.getAttribute("name") ||
          node.getAttribute("data-name") ||
          node.getAttribute("aria-label") ||
          node.textContent ||
          "";
        upsert(email, label, rootIndex);
      });

    Array.from(root.querySelectorAll("a[href^='mailto:']"))
      .slice(0, 20)
      .forEach((node) => {
        upsert(node.getAttribute("href"), node.textContent || node.getAttribute("aria-label") || "", rootIndex);
      });
  });

  return Array.from(participantMap.values()).sort((left, right) => {
    if (left.isCurrentUser !== right.isCurrentUser) {
      return left.isCurrentUser ? 1 : -1;
    }
    if (left.isGem !== right.isGem) {
      return left.isGem ? 1 : -1;
    }
    if (left.firstIndex !== right.firstIndex) {
      return left.firstIndex - right.firstIndex;
    }
    if (left.occurrences !== right.occurrences) {
      return right.occurrences - left.occurrences;
    }
    return left.email.localeCompare(right.email);
  });
}

function collectGmailVisibleParticipantEmails() {
  const participantEntries = collectGmailVisibleParticipantEntries().filter((entry) => !entry.isCurrentUser && !entry.isGem);
  if (participantEntries.length > 0) {
    return participantEntries.map((entry) => entry.email);
  }

  const ignored = new Set(["no-reply@gem.com", "noreply@gem.com", ...collectGmailVisibleAccountEmails()]);
  const emails = [];
  const seen = new Set();
  const add = (value) => {
    const normalized = normalizeEmailAddressForPicker(value).toLowerCase();
    if (!normalized || seen.has(normalized) || ignored.has(normalized) || isGemAutomatedThreadEmail(normalized)) {
      return;
    }
    if (!isValidEmailAddressForPicker(normalized)) {
      return;
    }
    seen.add(normalized);
    emails.push(normalized);
  };

  getGmailThreadRoots().forEach((root) => {
    Array.from(root.querySelectorAll("[data-hovercard-id], a[href^='mailto:'], [data-email], [email]"))
      .slice(0, 120)
      .forEach((node) => {
        add(node.getAttribute("data-hovercard-id"));
        add(node.getAttribute("data-email"));
        add(node.getAttribute("email"));
        add(node.getAttribute("href"));
        add(node.getAttribute("aria-label"));
        add(node.textContent);
      });
  });

  return emails;
}

function getGmailPrimaryParticipantName(participantEntries = []) {
  for (const entry of Array.isArray(participantEntries) ? participantEntries : []) {
    if (entry?.isCurrentUser || entry?.isGem) {
      continue;
    }
    const text = normalizeGmailThreadText(entry?.label || "");
    if (text && !/@/.test(text) && text.length <= 120) {
      return text;
    }
  }
  return "";
}

function decodeGemCandidateToken(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^\d+$/.test(raw)) {
    return raw;
  }
  const base64Like = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64Like}${"=".repeat((4 - (base64Like.length % 4 || 4)) % 4)}`;
  try {
    const decoded = atob(padded);
    const personMatch = decoded.match(/(?:Person|Candidate):(\d+)/i);
    if (personMatch?.[1]) {
      return personMatch[1];
    }
    if (/^\d+$/.test(decoded.trim())) {
      return decoded.trim();
    }
  } catch (_error) {
    // Fall through.
  }
  return "";
}

function extractGemCandidateIdFromUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value, window.location.origin);
    const match = parsed.pathname.match(/^\/candidate\/([^/?#]+)/i);
    if (!match?.[1]) {
      return "";
    }
    const slug = decodeURIComponent(match[1]);
    return decodeGemCandidateToken(slug) || slug;
  } catch (_error) {
    return "";
  }
}

function getGemProfileContext() {
  const pageUrl = normalizePageUrlForWatcher(window.location.href);
  const profileUrl = normalizeUrlForContext(window.location.href);
  const gemCandidateId = extractGemCandidateIdFromUrl(window.location.href);
  const linkedinUrl = findLinkedInUrlInDocument();
  const contactEmails = collectEmailAddressesFromDom({
    selectors: ["a[href^='mailto:']", "[data-email]", "span[email]", "div[email]"],
    maxNodes: 200
  });
  return {
    sourcePlatform: "gem",
    pageUrl,
    profileUrl,
    gemProfileUrl: profileUrl,
    gemCandidateId,
    linkedinUrl,
    linkedInHandle: getLinkedInHandle(linkedinUrl),
    contactEmails,
    contactEmail: contactEmails[0] || "",
    profileName: getProfileName()
  };
}

function getGitHubProfileName() {
  const selectors = [
    "h1.vcard-names span.p-name",
    "h1 .vcard-fullname",
    ".vcard-fullname",
    "[itemprop='name']"
  ];
  for (const selector of selectors) {
    const value = String(document.querySelector(selector)?.textContent || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function getGitHubUsernameFromPath() {
  try {
    const parsed = new URL(window.location.href);
    const segment = String(parsed.pathname || "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)[0];
    return segment ? decodeURIComponent(segment) : "";
  } catch (_error) {
    return "";
  }
}

function getGitHubContext() {
  const username = getGitHubUsernameFromPath();
  const canonicalHref = String(document.querySelector("link[rel='canonical']")?.getAttribute("href") || "").trim();
  const githubUrl = normalizeUrlForContext(canonicalHref || `https://github.com/${username}`);
  const linkedinUrl = findLinkedInUrlInDocument();
  const contactEmails = collectEmailAddressesFromDom({
    selectors: ["a[href^='mailto:']", "li[itemprop='email']", "[data-hovercard-id]"],
    maxNodes: 160
  });
  return {
    sourcePlatform: "github",
    pageUrl: normalizePageUrlForWatcher(window.location.href),
    profileUrl: githubUrl,
    githubUrl,
    githubUsername: username,
    linkedinUrl,
    linkedInHandle: getLinkedInHandle(linkedinUrl),
    contactEmails,
    contactEmail: contactEmails[0] || "",
    profileName: getGitHubProfileName() || username
  };
}

function getGmailContext() {
  const pageUrl = normalizePageUrlForWatcher(window.location.href);
  const gmailThreadUrl = normalizeUrlForContext(window.location.href, { keepHash: true });
  const gmailThreadToken = extractGmailThreadTokenFromUrl(window.location.href);
  const gmailSubject = getGmailThreadSubject();
  const gmailAccountEmails = collectGmailVisibleAccountEmails();
  const participantEntries = collectGmailVisibleParticipantEntries();
  const contactEmails = collectGmailVisibleParticipantEmails();
  const profileName = getGmailPrimaryParticipantName(participantEntries);
  return {
    sourcePlatform: "gmail",
    pageUrl,
    profileUrl: "",
    gmailThreadUrl,
    gmailThreadToken,
    gmailSubject,
    gmailAccountEmails,
    gemProfileUrl: "",
    gemCandidateId: "",
    linkedinUrl: "",
    linkedInHandle: "",
    contactEmails,
    contactEmail: contactEmails[0] || "",
    profileName
  };
}

function getProfileContext() {
  if (isLinkedInProfilePage()) {
    return getLinkedInProfileContext();
  }
  if (isGemCandidateProfilePage()) {
    return getGemProfileContext();
  }
  if (isGmailThreadPage()) {
    return getGmailContext();
  }
  if (isGitHubProfilePage()) {
    return getGitHubContext();
  }
  return {
    sourcePlatform: "unknown",
    pageUrl: normalizePageUrlForWatcher(window.location.href),
    profileUrl: normalizeUrlForContext(window.location.href),
    linkedinUrl: "",
    linkedInHandle: "",
    gemCandidateId: "",
    contactEmails: [],
    contactEmail: "",
    profileName: getProfileName()
  };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getTodayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function formatDateAsIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addMonthsClamped(baseDate, monthsToAdd) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const startDay = start.getDate();
  const targetMonthStart = new Date(start.getFullYear(), start.getMonth() + monthsToAdd, 1);
  const lastDayOfTargetMonth = new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth() + 1,
    0
  ).getDate();
  return new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth(),
    Math.min(startDay, lastDayOfTargetMonth)
  );
}

function getReminderPresetIsoDate(preset) {
  const today = new Date();
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!preset || typeof preset !== "object") {
    return formatDateAsIso(todayLocal);
  }
  if (preset.kind === "days") {
    const next = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate());
    next.setDate(next.getDate() + Number(preset.amount || 0));
    return formatDateAsIso(next);
  }
  if (preset.kind === "months") {
    return formatDateAsIso(addMonthsClamped(todayLocal, Number(preset.amount || 0)));
  }
  return formatDateAsIso(todayLocal);
}

function formatIsoDateForDisplay(dateValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))) {
    return "Pick date";
  }
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return "Pick date";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function normalizeEmailAddressForPicker(value) {
  return String(value || "").trim();
}

function isValidEmailAddressForPicker(value) {
  const email = normalizeEmailAddressForPicker(value);
  if (!email || email.length > 255) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeCandidateEmailsForPicker(data) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.emails) ? data.emails : [];
  const deduped = [];
  const byLower = new Map();

  for (const item of rows) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const emailAddress = normalizeEmailAddressForPicker(item.emailAddress || item.email_address || item.email);
    if (!emailAddress) {
      continue;
    }
    const lower = emailAddress.toLowerCase();
    const existingIndex = byLower.get(lower);
    const isPrimary = Boolean(item.isPrimary || item.is_primary);
    if (existingIndex !== undefined) {
      if (isPrimary) {
        deduped[existingIndex].isPrimary = true;
      }
      continue;
    }
    byLower.set(lower, deduped.length);
    deduped.push({ emailAddress, isPrimary });
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

function getPrimaryEmailForPicker(emails) {
  const normalized = normalizeCandidateEmailsForPicker(emails);
  const primary = normalized.find((entry) => entry.isPrimary);
  return primary ? primary.emailAddress : "";
}

async function copyTextToClipboard(value) {
  const text = String(value || "");
  if (!text) {
    return false;
  }

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_error) {
    // Fallback below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    textarea.remove();
    return Boolean(copied);
  } catch (_error) {
    return false;
  }
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

function showAshbyUploadResultCard(url, message = "") {
  const container = ensureToastContainer();
  const card = document.createElement("div");
  card.style.background = "#ffffff";
  card.style.color = "#1f2328";
  card.style.padding = "10px 12px";
  card.style.borderRadius = "8px";
  card.style.fontSize = "13px";
  card.style.fontFamily = "-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif";
  card.style.boxShadow = "0 6px 18px rgba(0,0,0,0.2)";
  card.style.maxWidth = "360px";
  card.style.border = "1px solid #d4dae3";

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.style.marginBottom = "6px";
  title.textContent = message || "Candidate uploaded to Ashby.";

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = url;
  link.style.display = "block";
  link.style.wordBreak = "break-all";
  link.style.marginBottom = "8px";
  link.style.color = "#0b57d0";

  const hint = document.createElement("div");
  hint.style.fontSize = "12px";
  hint.style.color = "#5b6168";
  hint.textContent = "Press O or Enter to open Ashby profile.";

  card.appendChild(title);
  card.appendChild(link);
  card.appendChild(hint);
  container.appendChild(card);

  function openLink() {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const onKeyDown = (event) => {
    if (event.key === "Enter" || String(event.key || "").trim().toLowerCase() === "o") {
      event.preventDefault();
      openLink();
    }
  };
  window.addEventListener("keydown", onKeyDown, true);

  const removeCard = () => {
    window.removeEventListener("keydown", onKeyDown, true);
    card.remove();
  };

  card.addEventListener("click", (event) => {
    const target = event.target;
    if (target && target.tagName === "A") {
      return;
    }
    openLink();
  });

  setTimeout(removeCard, 12000);
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

function saveSettings(settings) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings }, (response) => {
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
        reject(new Error(response?.message || "Could not save settings"));
        return;
      }
      resolve(response);
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

function listProjects(query, runId, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "LIST_PROJECTS",
        query: String(query || ""),
        limit: 0,
        runId: runId || "",
        forceRefresh: Boolean(options.forceRefresh),
        preferCache: Boolean(options.preferCache),
        forceNewRefresh: Boolean(options.forceNewRefresh)
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
          if (isContextInvalidatedResponse(response)) {
            triggerContextRecovery(response?.message || "Extension context invalidated.");
            reject(new Error("Extension updated. Reloading page."));
            return;
          }
          reject(new Error(response?.message || "Could not load projects"));
          return;
        }
        const projects = normalizeProjectsForPicker(response.projects);
        setProjectMemoryProjects(projects);
        resolve(projects);
      }
    );
  });
}

function listAshbyJobs(query, runId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "LIST_ASHBY_JOBS",
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
          if (isContextInvalidatedResponse(response)) {
            triggerContextRecovery(response?.message || "Extension context invalidated.");
            reject(new Error("Extension updated. Reloading page."));
            return;
          }
          reject(new Error(response?.message || "Could not load Ashby jobs"));
          return;
        }
        resolve(Array.isArray(response.jobs) ? response.jobs : []);
      }
    );
  });
}

function createGemProject(name, description, privacyType, runId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "CREATE_GEM_PROJECT",
        name: String(name || "").trim(),
        description: String(description || "").trim(),
        privacyType: String(privacyType || "").trim(),
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
          reject(new Error(response?.message || "Could not create project"));
          return;
        }
        const project = normalizeProjectForPicker(response.project);
        if (project) {
          upsertProjectMemoryProject(project);
        }
        resolve({
          message: String(response.message || ""),
          project: project || (response.project && typeof response.project === "object" ? response.project : {})
        });
      }
    );
  });
}

function searchGemPeople(query, runId, limit = GEM_ACTION_PEOPLE_SEARCH_LIMIT) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "SEARCH_GEM_PEOPLE",
        query: String(query || ""),
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
          reject(new Error(response?.message || "Could not search candidates"));
          return;
        }
        resolve(Array.isArray(response.candidates) ? response.candidates : []);
      }
    );
  });
}

function openGemNavigation(url, runId, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "OPEN_GEM_NAVIGATION",
        url: String(url || "").trim(),
        runId: runId || "",
        actionId: options.actionId || ACTIONS.GEM_ACTIONS,
        openInBackground: Boolean(options.openInBackground)
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
          reject(new Error(response?.message || "Could not open Gem link"));
          return;
        }
        resolve(response);
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
        forceRefresh: Boolean(options.forceRefresh),
        allowCreate: options.allowCreate !== false,
        allowEmptyCandidateCache: Boolean(options.allowEmptyCandidateCache)
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
        const payload = mergeOptimisticGemStatusIntoCustomFieldData(
          context,
          {
            candidateId: response.candidateId || "",
            customFields: Array.isArray(response.customFields) ? response.customFields : [],
            statusLabels: Array.isArray(response.statusLabels) ? response.statusLabels : []
          },
          response.candidateId || ""
        );
        resolve({
          candidateId: payload.candidateId || "",
          customFields: Array.isArray(payload.customFields) ? payload.customFields : [],
          statusLabels: Array.isArray(payload.statusLabels) ? payload.statusLabels : [],
          fromCache: Boolean(response.fromCache),
          stale: Boolean(response.stale)
        });
      }
    );
  });
}

function listCandidateEmailsForContext(context, runId, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "LIST_CANDIDATE_EMAILS_FOR_CONTEXT",
        context,
        runId: runId || "",
        preferCache: Boolean(options.preferCache),
        refreshInBackground: options.refreshInBackground !== false,
        forceRefresh: Boolean(options.forceRefresh),
        allowCreate: options.allowCreate !== false
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
          reject(new Error(response?.message || "Could not load candidate emails"));
          return;
        }
        resolve({
          candidateId: String(response.candidateId || ""),
          emails: normalizeCandidateEmailsForPicker(response.emails),
          primaryEmail: normalizeEmailAddressForPicker(response.primaryEmail || getPrimaryEmailForPicker(response.emails)),
          fromCache: Boolean(response.fromCache),
          stale: Boolean(response.stale)
        });
      }
    );
  });
}

function addCandidateEmailForContext(context, email, runId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "ADD_CANDIDATE_EMAIL_FOR_CONTEXT",
        context,
        email: normalizeEmailAddressForPicker(email),
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
          reject(new Error(response?.message || "Could not add email"));
          return;
        }
        resolve({
          candidateId: String(response.candidateId || ""),
          emails: normalizeCandidateEmailsForPicker(response.emails),
          primaryEmail: normalizeEmailAddressForPicker(response.primaryEmail || getPrimaryEmailForPicker(response.emails))
        });
      }
    );
  });
}

function setPrimaryCandidateEmailForContext(context, email, runId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "SET_PRIMARY_CANDIDATE_EMAIL_FOR_CONTEXT",
        context,
        email: normalizeEmailAddressForPicker(email),
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
          reject(new Error(response?.message || "Could not update primary email"));
          return;
        }
        resolve({
          candidateId: String(response.candidateId || ""),
          emails: normalizeCandidateEmailsForPicker(response.emails),
          primaryEmail: normalizeEmailAddressForPicker(response.primaryEmail || getPrimaryEmailForPicker(response.emails))
        });
      }
    );
  });
}

function getCustomFieldContextKey(context) {
  const gemCandidateId = String(context?.gemCandidateId || "").trim();
  if (gemCandidateId) {
    return `candidate:${gemCandidateId}`;
  }

  const handle = String(context?.linkedInHandle || "").trim().toLowerCase();
  if (handle) {
    return `handle:${handle}`;
  }

  const rawUrl = String(context?.linkedinUrl || "").trim().toLowerCase();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      parsed.search = "";
      parsed.hash = "";
      return `url:${parsed.toString().replace(/\/$/, "")}`;
    } catch (_error) {
      return `url:${rawUrl.replace(/[?#].*$/, "").replace(/\/$/, "")}`;
    }
  }

  const contactEmail =
    normalizeEmailAddressForPicker(context?.contactEmail || "").toLowerCase() ||
    normalizeEmailAddressForPicker(Array.isArray(context?.contactEmails) ? context.contactEmails[0] : "").toLowerCase();
  if (contactEmail && isValidEmailAddressForPicker(contactEmail)) {
    return `email:${contactEmail}`;
  }

  const profileUrl = String(context?.profileUrl || context?.gemProfileUrl || context?.pageUrl || "")
    .trim()
    .toLowerCase();
  if (profileUrl) {
    try {
      const parsed = new URL(profileUrl);
      parsed.search = "";
      parsed.hash = "";
      return `profile:${parsed.toString().replace(/\/$/, "")}`;
    } catch (_error) {
      return `profile:${profileUrl.replace(/[?#].*$/, "").replace(/\/$/, "")}`;
    }
  }

  return "";
}

function getContextLink(context) {
  return (
    String(context?.linkedinUrl || "").trim() ||
    String(context?.profileUrl || "").trim() ||
    String(context?.gemProfileUrl || "").trim() ||
    String(context?.gmailThreadUrl || "").trim() ||
    String(context?.pageUrl || "").trim() ||
    window.location.href
  );
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

function contextHasResolvableIdentity(context) {
  if (!context || typeof context !== "object") {
    return false;
  }
  if (String(context.sourcePlatform || "").trim().toLowerCase() === "gmail") {
    return Boolean(
      String(context.gmailThreadToken || "").trim() ||
        String(context.gmailSubject || "").trim() ||
        isValidEmailAddressForPicker(String(context.contactEmail || "").trim()) ||
        (Array.isArray(context.contactEmails) &&
          context.contactEmails.some((email) => isValidEmailAddressForPicker(email)))
    );
  }
  if (String(context.gemCandidateId || "").trim()) {
    return true;
  }
  if (String(context.linkedinUrl || "").trim()) {
    return true;
  }
  if (String(context.linkedInHandle || "").trim()) {
    return true;
  }
  if (String(context.profileUrl || "").trim()) {
    return true;
  }
  if (String(context.gemProfileUrl || "").trim()) {
    return true;
  }
  if (isValidEmailAddressForPicker(String(context.contactEmail || "").trim())) {
    return true;
  }
  if (Array.isArray(context.contactEmails)) {
    return context.contactEmails.some((email) => isValidEmailAddressForPicker(email));
  }
  return false;
}

function describeContextSignals(context) {
  const sourcePlatform = String(context?.sourcePlatform || "").trim().toLowerCase();
  const signals = [];
  const contactEmails = Array.isArray(context?.contactEmails)
    ? context.contactEmails.filter((email) => isValidEmailAddressForPicker(email))
    : [];
  const gmailSubject = normalizeGmailThreadText(context?.gmailSubject || "");

  if (sourcePlatform === "gmail") {
    if (gmailSubject) {
      signals.push("subject");
    }
    if (String(context?.gmailThreadToken || "").trim()) {
      signals.push("thread token");
    }
    if (contactEmails.length > 0) {
      signals.push(`${contactEmails.length} visible email${contactEmails.length === 1 ? "" : "s"}`);
    } else if (isValidEmailAddressForPicker(String(context?.contactEmail || "").trim())) {
      signals.push("1 visible email");
    }
    if (signals.length === 0) {
      return "Gmail thread detected, but no visible subject or participant email was found.";
    }
    return `Gmail thread detected. Signals: ${signals.join(", ")}.`;
  }

  if (String(context?.gemCandidateId || "").trim()) {
    signals.push("Gem candidate ID");
  }
  if (String(context?.gemProfileUrl || "").trim()) {
    signals.push("Gem profile link");
  }
  if (String(context?.linkedinUrl || "").trim()) {
    signals.push("LinkedIn profile link");
  } else if (String(context?.linkedInHandle || "").trim()) {
    signals.push("LinkedIn handle");
  }
  if (contactEmails.length > 0) {
    signals.push(`${contactEmails.length} email${contactEmails.length === 1 ? "" : "s"}`);
  } else if (isValidEmailAddressForPicker(String(context?.contactEmail || "").trim())) {
    signals.push("1 email");
  }
  if (String(context?.profileUrl || "").trim() && sourcePlatform !== "gmail") {
    signals.push("profile URL");
  }

  if (signals.length === 0) {
    if (sourcePlatform === "linkedin") {
      return "LinkedIn profile detected, but no stable candidate identity signal was found.";
    }
    if (sourcePlatform === "gem") {
      return "Gem page detected, but no stable candidate identity signal was found.";
    }
    if (sourcePlatform === "github") {
      return "GitHub profile detected, but no stable candidate identity signal was found.";
    }
    return "No stable candidate identity signal was found on this page.";
  }

  const label =
    sourcePlatform === "gmail"
      ? "Gmail thread detected"
      : sourcePlatform === "linkedin"
        ? "LinkedIn profile detected"
        : sourcePlatform === "gem"
          ? "Gem page detected"
          : sourcePlatform === "github"
            ? "GitHub profile detected"
            : "Supported page detected";
  return `${label}. Signals: ${signals.join(", ")}.`;
}

function shouldAllowCandidateCreateForContext(context) {
  return String(context?.sourcePlatform || "").trim().toLowerCase() !== "gmail";
}

function contextHasResolvedLinkedInStatusIdentity(context) {
  if (!context || typeof context !== "object") {
    return false;
  }
  if (String(context.gemCandidateId || "").trim()) {
    return true;
  }
  if (String(context.linkedinUrl || "").trim()) {
    return true;
  }
  if (String(context.linkedInHandle || "").trim()) {
    return true;
  }
  return false;
}

function normalizeCustomFieldPickerName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sortCustomFieldsForPicker(fields) {
  const normalized = Array.isArray(fields) ? fields.slice() : [];
  normalized.sort((left, right) => {
    const leftName = normalizeCustomFieldPickerName(left?.name);
    const rightName = normalizeCustomFieldPickerName(right?.name);
    const leftPinnedRank = PINNED_CUSTOM_FIELD_RANK.has(leftName)
      ? PINNED_CUSTOM_FIELD_RANK.get(leftName)
      : Number.POSITIVE_INFINITY;
    const rightPinnedRank = PINNED_CUSTOM_FIELD_RANK.has(rightName)
      ? PINNED_CUSTOM_FIELD_RANK.get(rightName)
      : Number.POSITIVE_INFINITY;
    if (leftPinnedRank !== rightPinnedRank) {
      return leftPinnedRank - rightPinnedRank;
    }
    const nameCompare = String(left?.name || "").localeCompare(String(right?.name || ""), undefined, {
      sensitivity: "base"
    });
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return String(left?.id || "").localeCompare(String(right?.id || ""), undefined, {
      sensitivity: "base"
    });
  });
  return normalized;
}

function normalizeCustomFieldsForPicker(data) {
  const input = Array.isArray(data) ? data : Array.isArray(data?.customFields) ? data.customFields : [];
  return sortCustomFieldsForPicker(
    input
      .map((field) => ({
      id: String(field.id || ""),
      name: String(field.name || ""),
      scope: String(field.scope || ""),
      valueType: String(field.valueType || ""),
      currentOptionIds: Array.isArray(field.currentOptionIds)
        ? field.currentOptionIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
      currentValueLabels: Array.isArray(field.currentValueLabels)
        ? field.currentValueLabels.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
      options: Array.isArray(field.options)
        ? field.options.map((option) => ({
            id: String(option.id || ""),
            value: String(option.value || "")
          }))
        : []
      }))
      .filter((field) => field.id && field.name)
  );
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

function isStatusFieldLike(value) {
  const normalized = normalizeStatusTextToken(value);
  return normalized === "status" || normalized.startsWith("status");
}

function getStatusLabelsFromCustomFieldData(data) {
  const explicit = Array.isArray(data?.statusLabels)
    ? data.statusLabels.map((label) => String(label || "").trim()).filter(Boolean)
    : [];
  if (explicit.length > 0) {
    return explicit;
  }
  const statusField = findGemStatusField(data?.customFields);
  return Array.isArray(statusField?.currentValueLabels)
    ? statusField.currentValueLabels.map((label) => String(label || "").trim()).filter(Boolean)
    : [];
}

function areStatusLabelSetsEqual(left, right) {
  const normalize = (labels) =>
    (Array.isArray(labels) ? labels : [])
      .map((label) => normalizeStatusTextToken(label))
      .filter(Boolean)
      .sort();
  const leftNormalized = normalize(left);
  const rightNormalized = normalize(right);
  if (leftNormalized.length !== rightNormalized.length) {
    return false;
  }
  return leftNormalized.every((value, index) => value === rightNormalized[index]);
}

function getOptimisticGemStatusKeys(context, candidateId = "") {
  const baseContext = context && typeof context === "object" ? context : {};
  const normalizedCandidateId = String(candidateId || baseContext.gemCandidateId || "").trim();
  const keys = [];
  if (normalizedCandidateId) {
    keys.push(`candidate:${normalizedCandidateId}`);
  }
  const hintedContext = normalizedCandidateId
    ? {
        ...baseContext,
        gemCandidateId: normalizedCandidateId
      }
    : baseContext;
  const hintedKey = getCustomFieldContextKey(hintedContext);
  if (hintedKey) {
    keys.push(hintedKey);
  }
  const baseKey = getCustomFieldContextKey(baseContext);
  if (baseKey) {
    keys.push(baseKey);
  }
  return Array.from(new Set(keys.filter(Boolean)));
}

function pruneOptimisticGemStatusCache() {
  const now = Date.now();
  for (const [key, entry] of optimisticGemStatusCache.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) {
      optimisticGemStatusCache.delete(key);
    }
  }
}

function rememberOptimisticGemStatusSelection(context, selection, candidateId = "") {
  if (!isStatusFieldLike(selection?.customFieldName || selection?.name || "")) {
    return null;
  }
  const normalizedCandidateId = String(candidateId || selection?.candidateId || context?.gemCandidateId || "").trim();
  const labels = normalizeCustomFieldSelectionLabels(selection);
  const now = Date.now();
  const entry = {
    candidateId: normalizedCandidateId,
    customFieldId: String(selection?.customFieldId || selection?.id || "").trim() || "gls-optimistic-status",
    customFieldName: String(selection?.customFieldName || selection?.name || "Status").trim() || "Status",
    customFieldValue: selection?.customFieldValue,
    customFieldValueLabels: labels,
    customFieldOptionId: String(selection?.customFieldOptionId || "").trim(),
    customFieldOptionIds: Array.isArray(selection?.customFieldOptionIds)
      ? selection.customFieldOptionIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [],
    customFieldValueType: String(selection?.customFieldValueType || selection?.valueType || "single_select").trim(),
    appliedAt: now,
    expiresAt: now + OPTIMISTIC_GEM_STATUS_TTL_MS
  };
  getOptimisticGemStatusKeys(context, normalizedCandidateId).forEach((key) => {
    optimisticGemStatusCache.set(key, entry);
  });
  pruneOptimisticGemStatusCache();
  return entry;
}

function getOptimisticGemStatusSelection(context, candidateId = "") {
  pruneOptimisticGemStatusCache();
  for (const key of getOptimisticGemStatusKeys(context, candidateId)) {
    const entry = optimisticGemStatusCache.get(key);
    if (!entry) {
      continue;
    }
    if (Number(entry.expiresAt || 0) <= Date.now()) {
      optimisticGemStatusCache.delete(key);
      continue;
    }
    return entry;
  }
  return null;
}

function clearOptimisticGemStatusSelection(context, candidateId = "") {
  getOptimisticGemStatusKeys(context, candidateId).forEach((key) => optimisticGemStatusCache.delete(key));
}

function buildDataWithStatusSelection(customFields, selection) {
  const normalizedFields = normalizeCustomFieldsForPicker(customFields);
  const labels = normalizeCustomFieldSelectionLabels(selection);
  const nextStatusField = {
    id: String(selection?.customFieldId || selection?.id || "gls-optimistic-status").trim() || "gls-optimistic-status",
    name: String(selection?.customFieldName || selection?.name || "Status").trim() || "Status",
    scope: "team",
    valueType: String(selection?.customFieldValueType || selection?.valueType || "single_select").trim() || "single_select",
    currentOptionIds: Array.isArray(selection?.customFieldOptionIds)
      ? selection.customFieldOptionIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [],
    currentValueLabels: labels,
    options: []
  };
  let replaced = false;
  const nextFields = normalizedFields.map((field) => {
    if (!isStatusFieldLike(field?.name || "")) {
      return field;
    }
    replaced = true;
    return {
      ...field,
      ...nextStatusField,
      name: nextStatusField.name || field.name || "Status",
      scope: nextStatusField.scope || field.scope || "team",
      options: Array.isArray(field.options) ? field.options : []
    };
  });
  if (!replaced) {
    nextFields.push(nextStatusField);
  }
  return sortCustomFieldsForPicker(nextFields);
}

function buildOptimisticGemStatusData(context, selection, candidateId = "") {
  const normalizedCandidateId = String(candidateId || selection?.candidateId || context?.gemCandidateId || "").trim();
  const candidateContext = normalizedCandidateId
    ? {
        ...(context && typeof context === "object" ? context : {}),
        gemCandidateId: normalizedCandidateId
      }
    : context;
  const existingEntry = getCustomFieldMemoryEntry(candidateContext).entry || getCustomFieldMemoryEntry(context).entry;
  const customFields = buildDataWithStatusSelection(existingEntry?.customFields || [], selection);
  return {
    candidateId: normalizedCandidateId,
    customFields,
    statusLabels: getStatusLabelsFromCustomFieldData({ customFields })
  };
}

function mergeOptimisticGemStatusIntoCustomFieldData(context, data, candidateId = "") {
  const normalizedData = data && typeof data === "object" ? data : {};
  const resolvedCandidateId = String(
    candidateId || normalizedData.candidateId || context?.gemCandidateId || ""
  ).trim();
  const optimisticEntry = getOptimisticGemStatusSelection(context, resolvedCandidateId);
  if (!shouldPreferOptimisticGemStatusData(normalizedData, optimisticEntry)) {
    return normalizedData;
  }
  const customFields = buildDataWithStatusSelection(normalizedData.customFields || [], optimisticEntry);
  return {
    ...normalizedData,
    candidateId: resolvedCandidateId || String(normalizedData.candidateId || "").trim(),
    customFields,
    statusLabels: getStatusLabelsFromCustomFieldData({ customFields })
  };
}

function shouldPreferOptimisticGemStatusData(data, optimisticEntry) {
  if (!optimisticEntry) {
    return false;
  }
  const backendCandidateId = String(data?.candidateId || "").trim();
  const optimisticCandidateId = String(optimisticEntry.candidateId || "").trim();
  if (!backendCandidateId) {
    return true;
  }
  if (optimisticCandidateId && backendCandidateId && optimisticCandidateId !== backendCandidateId) {
    return false;
  }
  return !areStatusLabelSetsEqual(
    getStatusLabelsFromCustomFieldData(data),
    optimisticEntry.customFieldValueLabels
  );
}

function applyOptimisticGemStatusSelection(context, selection, candidateId = "") {
  const optimisticEntry = rememberOptimisticGemStatusSelection(context, selection, candidateId);
  if (!optimisticEntry) {
    return null;
  }
  rememberResolvedCandidateIdForContext(context, optimisticEntry.candidateId);
  const optimisticData = buildOptimisticGemStatusData(context, optimisticEntry, optimisticEntry.candidateId);
  setCustomFieldMemoryEntry(
    {
      ...(context && typeof context === "object" ? context : {}),
      gemCandidateId: optimisticData.candidateId || String(context?.gemCandidateId || "").trim()
    },
    optimisticData
  );
  if (isLinkedInProfilePage() && isCurrentGemStatusDisplayEnabled(cachedSettings)) {
    renderGemStatusIndicator(
      {
        ...(context && typeof context === "object" ? context : {}),
        gemCandidateId: optimisticData.candidateId || String(context?.gemCandidateId || "").trim()
      },
      optimisticData
    );
  }
  return optimisticData;
}

function applyCustomFieldSelectionToCustomFields(customFields, selection) {
  const fields = normalizeCustomFieldsForPicker(customFields);
  const selectionFieldId = String(selection?.customFieldId || "").trim();
  if (!selectionFieldId) {
    return { matched: false, customFields: fields };
  }

  let matched = false;
  const nextFields = fields.map((field) => {
    if (field.id !== selectionFieldId) {
      return field;
    }
    matched = true;
    const valueType = String(selection?.customFieldValueType || field.valueType || "").trim().toLowerCase();
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
    customFields: sortCustomFieldsForPicker(nextFields)
  };
}

function patchCustomFieldMemoryEntry(context, selection, candidateId = "") {
  const normalizedCandidateId = String(candidateId || selection?.candidateId || context?.gemCandidateId || "").trim();
  const baseContext = context && typeof context === "object" ? context : {};
  const candidateContext = normalizedCandidateId
    ? {
        ...baseContext,
        gemCandidateId: normalizedCandidateId
      }
    : baseContext;
  const tryPatchEntry = (entry) => {
    if (!entry) {
      return null;
    }
    const patchedEntry = applyCustomFieldSelectionToCustomFields(entry.customFields, selection);
    if (!patchedEntry.matched) {
      return null;
    }
    return {
      candidateId: String(normalizedCandidateId || entry.candidateId || "").trim(),
      customFields: patchedEntry.customFields
    };
  };
  const memoryEntry = getCustomFieldMemoryEntry(candidateContext);
  let nextData = tryPatchEntry(memoryEntry.entry);
  if (!nextData && candidateContext !== baseContext) {
    const fallbackEntry = getCustomFieldMemoryEntry(baseContext);
    nextData = tryPatchEntry(fallbackEntry.entry);
  }
  if (!nextData) {
    return null;
  }
  setCustomFieldMemoryEntry(candidateContext, nextData);
  return nextData;
}

function getCustomFieldMemoryEntry(context) {
  const key = getCustomFieldContextKey(context);
  if (!key) {
    return { key: "", entry: null, isFresh: false };
  }
  const entry = customFieldMemoryCache.get(key) || null;
  if (!entry) {
    return { key, entry: null, isFresh: false };
  }
  return {
    key,
    entry,
    isFresh: Date.now() - Number(entry.fetchedAt || 0) <= CUSTOM_FIELD_MEMORY_TTL_MS
  };
}

function setCustomFieldMemoryEntry(context, data) {
  const normalizedFields = normalizeCustomFieldsForPicker(data);
  const baseContext = context && typeof context === "object" ? context : {};
  const candidateId = String(data?.candidateId || baseContext.gemCandidateId || "").trim();
  const candidateContext = candidateId
    ? { ...baseContext, gemCandidateId: candidateId }
    : baseContext;
  const contextsToPersist = [baseContext];
  if (candidateId) {
    contextsToPersist.push(candidateContext);
    if (isLinkedInProfilePage()) {
      contextsToPersist.push(getProfileContext());
    }
  }

  const writtenKeys = new Set();
  contextsToPersist.forEach((entryContext) => {
    const key = getCustomFieldContextKey(entryContext);
    if (!key || writtenKeys.has(key)) {
      return;
    }
    writtenKeys.add(key);
    customFieldMemoryCache.delete(key);
    customFieldMemoryCache.set(key, {
      fetchedAt: Date.now(),
      candidateId,
      customFields: normalizedFields
    });
  });

  if (writtenKeys.size === 0) {
    return;
  }

  if (candidateId && isLinkedInProfilePage()) {
    rememberGemCandidateIdForCurrentLinkedInPage(candidateId);
  }

  while (customFieldMemoryCache.size > CUSTOM_FIELD_MEMORY_CACHE_LIMIT) {
    const oldestKey = customFieldMemoryCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    customFieldMemoryCache.delete(oldestKey);
  }
}

function getLiveCustomFieldContextKey() {
  return getCustomFieldContextKey(applyGemCandidateHintToContext(getProfileContext()));
}

function shouldRenderUpdatedCustomFieldContext(context) {
  return getLiveCustomFieldContextKey() === getCustomFieldContextKey(applyGemCandidateHintToContext(context));
}

function rememberResolvedCandidateIdForContext(context, candidateId = "") {
  const normalizedCandidateId = String(candidateId || "").trim();
  if (!normalizedCandidateId || !isLinkedInProfilePage()) {
    return;
  }
  rememberGemCandidateIdForCurrentLinkedInPage(normalizedCandidateId);
  const liveContext = getProfileContext();
  const liveKey = getCustomFieldContextKey(applyGemCandidateHintToContext(liveContext));
  const targetKey = getCustomFieldContextKey({
    ...(context && typeof context === "object" ? context : {}),
    gemCandidateId: normalizedCandidateId
  });
  if (liveKey && targetKey && liveKey !== targetKey) {
    setCustomFieldMemoryEntry(
      {
        ...(context && typeof context === "object" ? context : {}),
        gemCandidateId: normalizedCandidateId
      },
      getCustomFieldMemoryEntry(context).entry || { candidateId: normalizedCandidateId, customFields: [] }
    );
  }
}

function warmCustomFieldsForContext(context, runId, options = {}) {
  const baseKey = getCustomFieldContextKey(context);
  if (!baseKey) {
    return Promise.resolve(null);
  }
  const allowCreate = options.allowCreate !== false;
  const allowEmptyCandidateCache = Boolean(options.allowEmptyCandidateCache);
  const key = `${baseKey}|${allowCreate ? "create" : "nocreate"}|${allowEmptyCandidateCache ? "allow-empty" : "candidate-only"}`;
  if (!options.forceRefresh) {
    const existingPromise = customFieldWarmPromises.get(key);
    if (existingPromise) {
      return existingPromise;
    }
  }

  const promise = listCustomFieldsForContext(context, runId, {
    preferCache: options.preferCache !== false,
    refreshInBackground: options.refreshInBackground !== false,
    forceRefresh: Boolean(options.forceRefresh),
    allowCreate,
    allowEmptyCandidateCache
  })
    .then((data) => {
      setCustomFieldMemoryEntry(context, data);
      return data;
    })
    .finally(() => {
      if (customFieldWarmPromises.get(key) === promise) {
        customFieldWarmPromises.delete(key);
      }
    });

  customFieldWarmPromises.set(key, promise);
  return promise;
}

function createGemStatusIndicatorStyles() {
  if (document.getElementById("gls-gem-status-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "gls-gem-status-style";
  style.textContent = `
    #gls-gem-status-signal {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483000;
      --gls-status-banner-gap: 14px;
      --gls-status-card-top: 74px;
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
    #gls-gem-status-signal[hidden] {
      display: none !important;
    }
    .gls-gem-status-card {
      position: fixed;
      top: var(--gls-status-card-top);
      left: var(--gls-status-banner-gap);
      z-index: 1;
      transform: none;
      max-width: min(460px, calc(100vw - (var(--gls-status-banner-gap) * 2)));
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
    .gls-gem-status-card::before {
      content: none;
    }
    .gls-gem-status-card::after {
      content: none;
    }
    .gls-gem-status-label {
      display: none;
    }
    .gls-gem-status-value {
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
    .gls-gem-status-meta {
      display: none;
    }
    @media (max-width: 900px) {
      .gls-gem-status-card {
        max-width: min(360px, calc(100vw - (var(--gls-status-banner-gap) * 2)));
        padding: 6px 10px;
      }
      .gls-gem-status-value {
        font-size: clamp(13px, 3.5vw, 16px);
      }
    }
  `;
  document.documentElement.appendChild(style);
}

function getLinkedInHeaderBounds() {
  const candidates = [];
  const selectors = ["#global-nav", ".global-nav", "header.global-nav", "header[role='banner']"];
  selectors.forEach((selector) => {
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

function applyGemStatusLayout() {
  if (!gemStatusIndicatorElements?.root) {
    return;
  }
  const gap = window.innerWidth <= 900 ? 8 : 10;
  const headerBounds = getLinkedInHeaderBounds();
  const cardTop = headerBounds.top + gap;
  gemStatusIndicatorElements.root.style.setProperty("--gls-status-banner-gap", `${gap}px`);
  gemStatusIndicatorElements.root.style.setProperty("--gls-status-card-top", `${cardTop}px`);
}

function ensureGemStatusIndicatorElements() {
  if (gemStatusIndicatorElements?.root?.isConnected) {
    return gemStatusIndicatorElements;
  }
  createGemStatusIndicatorStyles();
  const root = document.createElement("div");
  root.id = "gls-gem-status-signal";
  root.hidden = true;

  const card = document.createElement("div");
  card.className = "gls-gem-status-card";
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");

  const value = document.createElement("div");
  value.className = "gls-gem-status-value";

  card.appendChild(value);
  root.appendChild(card);

  (document.body || document.documentElement).appendChild(root);
  gemStatusIndicatorElements = { root, card, value };
  if (!gemStatusLayoutWatcherBound) {
    gemStatusLayoutWatcherBound = true;
    window.addEventListener(
      "resize",
      () => {
        if (!gemStatusIndicatorElements?.root || gemStatusIndicatorElements.root.hidden) {
          return;
        }
        applyGemStatusLayout();
      },
      { passive: true }
    );
  }
  return gemStatusIndicatorElements;
}

function hideGemStatusIndicator() {
  if (!gemStatusIndicatorElements?.root) {
    return;
  }
  gemStatusIndicatorElements.root.hidden = true;
}

function clearGemStatusBootstrapTimers() {
  if (!Array.isArray(gemStatusBootstrapTimerIds) || gemStatusBootstrapTimerIds.length === 0) {
    return;
  }
  gemStatusBootstrapTimerIds.forEach((timerId) => window.clearTimeout(timerId));
  gemStatusBootstrapTimerIds = [];
}

function scheduleGemStatusLiveRefresh(delayMs = 0) {
  gemStatusLiveRefreshNextAtMs = Date.now() + Math.max(0, Number(delayMs) || 0);
}

function getGemStatusLiveRefreshIntervalMs() {
  return document.visibilityState === "visible"
    ? GEM_STATUS_LIVE_REFRESH_VISIBLE_MS
    : GEM_STATUS_LIVE_REFRESH_HIDDEN_MS;
}

function scheduleGemStatusBootstrapRefreshes(contextHint = null, options = {}) {
  clearGemStatusBootstrapTimers();
  const settings = cachedSettings;
  if (!settings?.enabled || !isCurrentGemStatusDisplayEnabled(settings) || !isLinkedInProfilePage()) {
    return;
  }
  const hintedContextKey = getCustomFieldContextKey(contextHint);
  const forceRefresh = Boolean(options.forceRefresh);
  const requestedDelayMs = Number(options.delayMs);
  const hasResolvableIdentity = contextHasResolvedLinkedInStatusIdentity(contextHint || getProfileContext());
  const delayMs = Number.isFinite(requestedDelayMs)
    ? Math.max(0, requestedDelayMs)
    : hasResolvableIdentity
      ? LINKEDIN_PAGE_CHANGE_REFRESH_DELAY_MS
      : LINKEDIN_PAGE_CHANGE_IDENTITY_RETRY_DELAY_MS;
  const timerId = window.setTimeout(() => {
    const liveSettings = cachedSettings;
    if (!liveSettings?.enabled || !isCurrentGemStatusDisplayEnabled(liveSettings) || !isLinkedInProfilePage()) {
      return;
    }
    const liveContext = getProfileContext();
    const liveContextKey = getCustomFieldContextKey(liveContext);
    const effectiveContext = hintedContextKey && hintedContextKey === liveContextKey ? contextHint : liveContext;
    refreshGemStatusIndicator({
      context: effectiveContext,
      runId: generateRunId(),
      forceRefresh
    }).catch(() => {});
  }, delayMs);
  gemStatusBootstrapTimerIds.push(timerId);
}

function scheduleLinkedInStatusRetry(contextHint = null, options = {}) {
  const context = contextHint && typeof contextHint === "object" ? contextHint : getProfileContext();
  const contextKey = getCustomFieldContextKey(context);
  if (!contextKey) {
    return false;
  }
  if (linkedInStatusRetryContextKey !== contextKey) {
    linkedInStatusRetryContextKey = contextKey;
    linkedInStatusRetryCount = 0;
  }
  const retryDelayMs = LINKEDIN_STATUS_RETRY_DELAYS_MS[linkedInStatusRetryCount];
  if (!Number.isFinite(retryDelayMs)) {
    return false;
  }
  linkedInStatusRetryCount += 1;
  scheduleGemStatusBootstrapRefreshes(context, {
    delayMs: Number.isFinite(Number(options.delayMs))
      ? Math.max(0, Number(options.delayMs))
      : retryDelayMs,
    forceRefresh: options.forceRefresh !== false
  });
  return true;
}

function maybeRefreshGemStatusLive(options = {}) {
  if (!cachedSettings) {
    return;
  }
  const settings = cachedSettings;
  if (!settings.enabled || !isCurrentGemStatusDisplayEnabled(settings) || !isLinkedInProfilePage()) {
    return;
  }
  const force = Boolean(options.force);
  if (!force && gemStatusLiveRefreshNextAtMs && Date.now() < gemStatusLiveRefreshNextAtMs) {
    return;
  }
  if (gemStatusLiveRefreshInFlight) {
    return;
  }
  const context = applyGemCandidateHintToContext(options.context || getProfileContext());
  if (!contextHasResolvedLinkedInStatusIdentity(context)) {
    refreshProfileIdentityFromDom({ force: true });
    scheduleGemStatusLiveRefresh(LINKEDIN_PAGE_CHANGE_IDENTITY_RETRY_DELAY_MS);
    return;
  }

  gemStatusLiveRefreshInFlight = true;
  refreshGemStatusIndicator({
    context,
    runId: options.runId || generateRunId(),
    forceRefresh: Boolean(options.forceRefresh)
  })
    .then(() => {
      gemStatusLiveRefreshFailureStreak = 0;
    })
    .catch(() => {
      gemStatusLiveRefreshFailureStreak = Math.min(gemStatusLiveRefreshFailureStreak + 1, 6);
    })
    .finally(() => {
      gemStatusLiveRefreshInFlight = false;
      scheduleGemStatusLiveRefresh(getGemStatusLiveRefreshIntervalMs());
    });
}

function resetGemStatusIndicator() {
  gemStatusIndicatorRequestId += 1;
  hideGemStatusIndicator();
  clearGemStatusBootstrapTimers();
  pruneOptimisticGemStatusCache();
  if (linkedInPageChangeTimerId) {
    window.clearTimeout(linkedInPageChangeTimerId);
    linkedInPageChangeTimerId = 0;
  }
  gemStatusLiveRefreshInFlight = false;
  gemStatusLiveRefreshNextAtMs = 0;
  gemStatusLiveRefreshFailureStreak = 0;
  gemStatusRefreshInFlightPromise = null;
  gemStatusRefreshInFlightContextKey = "";
  gemStatusRefreshInFlightForce = false;
  linkedInStatusRetryCount = 0;
  linkedInStatusRetryContextKey = "";
}

function getGemStatusPalette(statusText, hasValue) {
  const normalized = normalizeStatusTextToken(statusText);
  const matchKey = normalizeStatusMatchKey(statusText);
  if (!hasValue) {
    return {
      tone: "neutral",
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
      tone: "reviewed-accepted",
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
      tone: "reviewed-rejected",
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
      tone: "applied-in-review",
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
      tone: "hired",
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
      tone: "interviewing",
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
      tone: "rejected-us",
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
      tone: "we-rejected",
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
      tone: "danger",
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
      tone: "caution",
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
      tone: "positive",
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
      tone: "info",
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
    tone: "neutral",
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

function findGemStatusField(customFields) {
  const fields = normalizeCustomFieldsForPicker(customFields);
  if (fields.length === 0) {
    return null;
  }
  const exactMatches = fields.filter((field) => normalizeStatusTextToken(field.name) === "status");
  const fuzzyMatches = exactMatches.length > 0
    ? exactMatches
    : fields.filter((field) => normalizeStatusTextToken(field.name).startsWith("status"));
  if (fuzzyMatches.length === 0) {
    return null;
  }
  return fuzzyMatches
    .slice()
    .sort((left, right) => {
      const leftScore = (left.currentValueLabels?.length ? 4 : 0) + (left.scope === "team" ? 2 : 0) + (left.scope === "project" ? 1 : 0);
      const rightScore = (right.currentValueLabels?.length ? 4 : 0) + (right.scope === "team" ? 2 : 0) + (right.scope === "project" ? 1 : 0);
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }
      return String(left.name || "").localeCompare(String(right.name || ""));
    })[0];
}

function renderGemStatusIndicator(context, data) {
  if (isBootstrapManagedLinkedInPage()) {
    hideGemStatusIndicator();
    return;
  }
  const displayMode = getCurrentGemStatusDisplayMode();
  if (!isGemStatusDisplayEnabled(displayMode)) {
    hideGemStatusIndicator();
    return;
  }
  const candidateId = String(data?.candidateId || "").trim();
  if (!candidateId) {
    hideGemStatusIndicator();
    return;
  }
  rememberGemCandidateIdForCurrentLinkedInPage(candidateId);
  const labels = getStatusLabelsFromCustomFieldData(data);
  const hasValue = labels.length > 0;
  const statusText = hasValue ? summarizeStatusLabels(labels, 3) : "Not set";
  const palette = getGemStatusPalette(statusText, hasValue);
  const elements = ensureGemStatusIndicatorElements();
  elements.root.style.setProperty("--gls-status-accent", palette.accent);
  elements.root.style.setProperty("--gls-status-secondary", palette.accentSecondary || palette.accent);
  elements.root.style.setProperty("--gls-status-accent-soft", palette.accentSoft);
  elements.root.style.setProperty(
    "--gls-status-secondary-soft",
    palette.accentSecondarySoft || palette.accentSoft
  );
  elements.root.style.setProperty("--gls-status-outline", palette.outline);
  elements.root.style.setProperty("--gls-status-surface", palette.surface);
  elements.root.style.setProperty("--gls-status-surface-top", palette.surfaceTop);
  elements.root.style.setProperty("--gls-status-shadow", palette.shadow);
  elements.root.style.setProperty("--gls-status-text", palette.text);
  elements.root.style.setProperty("--gls-status-frame-opacity", palette.frameOpacity);
  applyGemStatusLayout();
  elements.value.textContent = statusText;
  elements.root.hidden = false;
}

async function refreshGemStatusIndicator(options = {}) {
  if (isBootstrapManagedLinkedInPage()) {
    hideGemStatusIndicator();
    return;
  }
  const settings = cachedSettings || DEFAULT_SETTINGS;
  const context = applyGemCandidateHintToContext(options.context || getProfileContext());
  const isStatusEnabled = Boolean(settings.enabled) && isCurrentGemStatusDisplayEnabled(settings);
  if (!isStatusEnabled || !isLinkedInProfilePage()) {
    resetGemStatusIndicator();
    return;
  }
  if (!contextHasResolvedLinkedInStatusIdentity(context)) {
    hideGemStatusIndicator();
    return;
  }

  const contextKey = getCustomFieldContextKey(context);
  if (!contextKey) {
    hideGemStatusIndicator();
    return;
  }

  const memoryEntry = getCustomFieldMemoryEntry(context);
  const memoryCandidateId = String(memoryEntry.entry?.candidateId || "").trim();
  const memoryHasStatusField = Boolean(findGemStatusField(memoryEntry.entry?.customFields));
  const optimisticEntry = getOptimisticGemStatusSelection(context, memoryCandidateId);
  if (optimisticEntry) {
    renderGemStatusIndicator(context, buildOptimisticGemStatusData(context, optimisticEntry, optimisticEntry.candidateId));
  } else if (memoryEntry.entry && memoryCandidateId) {
    renderGemStatusIndicator(context, memoryEntry.entry);
  } else {
    hideGemStatusIndicator();
  }

  const forceRefresh = Boolean(options.forceRefresh);
  if (
    gemStatusRefreshInFlightPromise &&
    gemStatusRefreshInFlightContextKey === contextKey &&
    (gemStatusRefreshInFlightForce || !forceRefresh)
  ) {
    await gemStatusRefreshInFlightPromise;
    return;
  }

  const requestId = ++gemStatusIndicatorRequestId;
  const refreshPromise = warmCustomFieldsForContext(context, options.runId || generateRunId(), {
      preferCache: !forceRefresh,
      refreshInBackground: !forceRefresh,
      forceRefresh,
      allowCreate: false
    })
    .then((data) => {
      if (requestId !== gemStatusIndicatorRequestId) {
        return;
      }
      const liveContextKey = getCustomFieldContextKey(applyGemCandidateHintToContext(getProfileContext()));
      if (liveContextKey !== contextKey || !cachedSettings?.enabled || !isCurrentGemStatusDisplayEnabled(cachedSettings) || !isLinkedInProfilePage()) {
        return;
      }
      const resolvedCandidateId = String(data?.candidateId || "").trim();
      const hasStatusField = Boolean(findGemStatusField(data?.customFields));
      const liveOptimisticEntry = getOptimisticGemStatusSelection(context, resolvedCandidateId);
      if (shouldPreferOptimisticGemStatusData(data, liveOptimisticEntry)) {
        renderGemStatusIndicator(
          context,
          buildOptimisticGemStatusData(context, liveOptimisticEntry, liveOptimisticEntry?.candidateId || resolvedCandidateId)
        );
      } else {
        if (liveOptimisticEntry) {
          clearOptimisticGemStatusSelection(context, liveOptimisticEntry.candidateId || resolvedCandidateId);
        }
        renderGemStatusIndicator(context, data);
      }
      if (resolvedCandidateId && hasStatusField) {
        linkedInStatusRetryCount = 0;
        linkedInStatusRetryContextKey = "";
        return;
      }
      scheduleLinkedInStatusRetry(context, { forceRefresh: true });
    })
    .catch((_error) => {
      if (requestId === gemStatusIndicatorRequestId) {
        if (!(optimisticEntry || (memoryEntry.entry && memoryCandidateId))) {
          hideGemStatusIndicator();
        }
        scheduleLinkedInStatusRetry(context, { forceRefresh: true });
      }
      throw _error;
    });

  gemStatusRefreshInFlightPromise = refreshPromise;
  gemStatusRefreshInFlightContextKey = contextKey;
  gemStatusRefreshInFlightForce = forceRefresh;

  try {
    await refreshPromise;
  } finally {
    if (gemStatusRefreshInFlightPromise === refreshPromise) {
      gemStatusRefreshInFlightPromise = null;
      gemStatusRefreshInFlightContextKey = "";
      gemStatusRefreshInFlightForce = false;
    }
  }
}

function getCandidateEmailMemoryEntry(context) {
  const key = getCustomFieldContextKey(context);
  if (!key) {
    return { key: "", entry: null, isFresh: false };
  }
  const entry = candidateEmailMemoryCache.get(key) || null;
  if (!entry) {
    return { key, entry: null, isFresh: false };
  }
  return {
    key,
    entry,
    isFresh: Date.now() - Number(entry.fetchedAt || 0) <= CANDIDATE_EMAIL_MEMORY_TTL_MS
  };
}

function setCandidateEmailMemoryEntry(context, data) {
  const key = getCustomFieldContextKey(context);
  if (!key) {
    return;
  }
  const emails = normalizeCandidateEmailsForPicker(data?.emails);
  const primaryEmail = normalizeEmailAddressForPicker(data?.primaryEmail || getPrimaryEmailForPicker(emails));
  candidateEmailMemoryCache.delete(key);
  candidateEmailMemoryCache.set(key, {
    fetchedAt: Date.now(),
    candidateId: String(data?.candidateId || ""),
    emails,
    primaryEmail
  });
  while (candidateEmailMemoryCache.size > CANDIDATE_EMAIL_MEMORY_CACHE_LIMIT) {
    const oldestKey = candidateEmailMemoryCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    candidateEmailMemoryCache.delete(oldestKey);
  }
}

function warmCandidateEmailsForContext(context, runId, options = {}) {
  const baseKey = getCustomFieldContextKey(context);
  if (!baseKey) {
    return Promise.resolve(null);
  }
  const allowCreate = options.allowCreate !== false;
  const key = `${baseKey}|${allowCreate ? "create" : "nocreate"}`;
  if (!options.forceRefresh) {
    const existingPromise = candidateEmailWarmPromises.get(key);
    if (existingPromise) {
      return existingPromise;
    }
  }

  const promise = listCandidateEmailsForContext(context, runId, {
    preferCache: options.preferCache !== false,
    refreshInBackground: options.refreshInBackground !== false,
    forceRefresh: Boolean(options.forceRefresh),
    allowCreate
  })
    .then((data) => {
      setCandidateEmailMemoryEntry(context, data);
      return data;
    })
    .finally(() => {
      if (candidateEmailWarmPromises.get(key) === promise) {
        candidateEmailWarmPromises.delete(key);
      }
    });

  candidateEmailWarmPromises.set(key, promise);
  return promise;
}

function syncLinkedInGemStatusForCurrentPage(options = {}) {
  if (isBootstrapManagedLinkedInPage()) {
    hideGemStatusIndicator();
    return;
  }
  const settings = cachedSettings;
  if (!settings?.enabled || !isLinkedInProfilePage()) {
    resetGemStatusIndicator();
    return;
  }
  if (!isCurrentGemStatusDisplayEnabled(settings)) {
    resetGemStatusIndicator();
    return;
  }

  refreshProfileIdentityFromDom({ force: Boolean(options.forceIdentity) });
  const context = applyGemCandidateHintToContext(getProfileContext());
  const hasResolvedIdentity = contextHasResolvedLinkedInStatusIdentity(context);
  if (!hasResolvedIdentity) {
    hideGemStatusIndicator();
    clearGemStatusBootstrapTimers();
    scheduleGemStatusLiveRefresh(LINKEDIN_PAGE_CHANGE_IDENTITY_RETRY_DELAY_MS);
    return;
  }
  const memoryEntry = getCustomFieldMemoryEntry(context);
  const memoryCandidateId = String(memoryEntry.entry?.candidateId || "").trim();
  const memoryHasStatusField = Boolean(findGemStatusField(memoryEntry.entry?.customFields));
  const optimisticEntry = getOptimisticGemStatusSelection(context, memoryCandidateId);
  if (optimisticEntry) {
    renderGemStatusIndicator(context, buildOptimisticGemStatusData(context, optimisticEntry, optimisticEntry.candidateId));
  } else if (memoryEntry.entry && memoryCandidateId) {
    renderGemStatusIndicator(context, memoryEntry.entry);
  } else {
    hideGemStatusIndicator();
  }

  const shouldRefresh =
    Boolean(options.forceRefresh) ||
    !memoryEntry.entry ||
    !memoryCandidateId ||
    !memoryHasStatusField ||
    !memoryEntry.isFresh;
  if (!shouldRefresh) {
    clearGemStatusBootstrapTimers();
    scheduleGemStatusLiveRefresh(getGemStatusLiveRefreshIntervalMs());
    return;
  }

  scheduleGemStatusBootstrapRefreshes(context, {
    delayMs: options.delayMs,
    forceRefresh: Boolean(options.forceRefresh) || Boolean(memoryEntry.entry && !memoryEntry.isFresh)
  });
  scheduleGemStatusLiveRefresh(0);
}

function handleLinkedInPageChange(options = {}) {
  if (!isLinkedInProfilePage()) {
    resetGemStatusIndicator();
    return;
  }
  linkedInLastPageChangeAtMs = Date.now();
  linkedInStatusRetryCount = 0;
  linkedInStatusRetryContextKey = "";
  profileIdentityCache = {
    pageUrl: "",
    linkedinUrl: "",
    linkedInHandle: "",
    gemCandidateId: "",
    resolvedAtMs: 0
  };
  syncLinkedInGemStatusForCurrentPage({
    forceIdentity: true,
    delayMs: options.delayMs,
    forceRefresh: Boolean(options.forceRefresh)
  });
  scheduleGemStatusLiveRefresh(0);
}

function normalizeComparableContextUrl(value) {
  return normalizeUrlForContext(value || "").toLowerCase();
}

function doesGemStatusSignalMatchCurrentPage(messageContext, liveContext) {
  const currentContext = applyGemCandidateHintToContext(liveContext);
  const messageCandidateId = String(messageContext?.gemCandidateId || "").trim();
  const liveCandidateId = String(currentContext?.gemCandidateId || "").trim();
  if (messageCandidateId && liveCandidateId) {
    return messageCandidateId === liveCandidateId;
  }

  const messageLinkedInUrl = normalizeLinkedInUrl(String(messageContext?.linkedinUrl || "").trim());
  const liveLinkedInUrl = normalizeLinkedInUrl(String(liveContext?.linkedinUrl || "").trim());
  if (messageLinkedInUrl && liveLinkedInUrl) {
    return messageLinkedInUrl === liveLinkedInUrl;
  }

  const messageHandle = String(messageContext?.linkedInHandle || "").trim().toLowerCase();
  const liveHandle = String(liveContext?.linkedInHandle || "").trim().toLowerCase();
  if (messageHandle && liveHandle) {
    return messageHandle === liveHandle;
  }

  const messageProfileUrl = normalizeComparableContextUrl(
    messageContext?.profileUrl || messageContext?.pageUrl || ""
  );
  const liveProfileUrl = normalizeComparableContextUrl(liveContext?.profileUrl || liveContext?.pageUrl || "");
  if (messageProfileUrl && liveProfileUrl) {
    return messageProfileUrl === liveProfileUrl;
  }

  return !(messageCandidateId || messageLinkedInUrl || messageHandle || messageProfileUrl);
}

function queueLinkedInPageChange(options = {}) {
  const nextUrl = normalizePageUrlForWatcher(window.location.href);
  const force = Boolean(options.force);
  if (!force && nextUrl === linkedInObservedPageUrl) {
    return;
  }
  linkedInObservedPageUrl = nextUrl;
  if (linkedInPageChangeTimerId) {
    window.clearTimeout(linkedInPageChangeTimerId);
  }
  linkedInPageChangeTimerId = window.setTimeout(() => {
    linkedInPageChangeTimerId = 0;
    handleLinkedInPageChange(options);
  }, Math.max(0, Number(options.delayMs) || 0));
}

function bindLinkedInPageChangeWatcher() {
  if (linkedInPageChangeBound) {
    return;
  }
  linkedInPageChangeBound = true;

  const notify = (delayMs = LINKEDIN_PAGE_CHANGE_REFRESH_DELAY_MS) => {
    queueLinkedInPageChange({ delayMs, force: true });
  };

  const wrapHistoryMethod = (methodName) => {
    const original = window.history?.[methodName];
    if (typeof original !== "function") {
      return;
    }
    window.history[methodName] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      notify();
      return result;
    };
  };

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
  window.addEventListener("popstate", () => notify(), { passive: true });
  window.addEventListener("pageshow", () => notify(0), { passive: true });
}

function prefetchPickersForCurrentProfile() {
  const settings = cachedSettings;
  if (!settings?.enabled || !isSupportedActionPage()) {
    resetGemStatusIndicator();
    return;
  }
  let profileContext = getProfileContext();
  const isLinkedInContext = isLinkedInProfilePage();
  if (isLinkedInContext) {
    syncLinkedInGemStatusForCurrentPage({
      delayMs: contextHasResolvedLinkedInStatusIdentity(profileContext)
        ? LINKEDIN_PAGE_CHANGE_REFRESH_DELAY_MS
        : LINKEDIN_PAGE_CHANGE_IDENTITY_RETRY_DELAY_MS
    });
    profileContext = getProfileContext();
  } else {
    resetGemStatusIndicator();
  }
  if (!contextHasResolvableIdentity(profileContext)) {
    return;
  }
  const contextKey = getCustomFieldContextKey(profileContext);
  if (!contextKey || contextKey === lastPrefetchedProfileContextKey) {
    return;
  }
  lastPrefetchedProfileContextKey = contextKey;
  warmCustomFieldsForContext(profileContext, generateRunId(), {
    preferCache: true,
    refreshInBackground: true,
    allowCreate: false,
    allowEmptyCandidateCache: true
  }).catch(() => {});
  if (isLinkedInContext) {
    return;
  }
  prefetchProjects(generateRunId(), { forceRefresh: true }).catch(() => {});
  prefetchSequences(generateRunId()).catch(() => {});
  warmCandidateEmailsForContext(profileContext, generateRunId(), {
    preferCache: true,
    refreshInBackground: true,
    allowCreate: false
  }).catch(() => {});
}

function startProfileUrlPrefetchWatcher() {
  if (profileUrlPollTimerId) {
    return;
  }
  profileUrlPollLastUrl = normalizePageUrlForWatcher(window.location.href);
  profileUrlPollTimerId = window.setInterval(() => {
    const currentUrl = normalizePageUrlForWatcher(window.location.href);
    if (currentUrl !== profileUrlPollLastUrl) {
      profileUrlPollLastUrl = currentUrl;
      if (isLinkedInProfilePage()) {
        queueLinkedInPageChange({ force: true, delayMs: 0, forceRefresh: false });
      } else if (!isSupportedActionPage()) {
        lastPrefetchedProfileContextKey = "";
        resetGemStatusIndicator();
      } else {
        prefetchPickersForCurrentProfile();
      }
    }
    if (isLinkedInProfilePage()) {
      maybeRefreshGemStatusLive({
        context: getProfileContext(),
        forceRefresh: false
      });
      return;
    }
    maybeRefreshGemStatusLive();
  }, PROFILE_URL_POLL_INTERVAL_MS);
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

function getCurrentGemStatusDisplayMode(settings = cachedSettings || DEFAULT_SETTINGS) {
  return getGemStatusDisplayModeFromSettings(settings, true);
}

function isCurrentGemStatusDisplayEnabled(settings = cachedSettings || DEFAULT_SETTINGS) {
  const mode = getCurrentGemStatusDisplayMode(settings);
  return isGemStatusDisplayEnabled(mode);
}

function findActionByShortcut(shortcut) {
  if (!cachedSettings) {
    return "";
  }
  const mapping = cachedSettings.shortcuts || {};
  const validActionIds = new Set(ACTION_IDS);
  return (
    Object.keys(mapping).find(
      (actionId) => validActionIds.has(actionId) && normalizeShortcut(mapping[actionId]) === shortcut
    ) || ""
  );
}

function filterProjectsByQuery(projects, query) {
  const normalized = Array.isArray(projects) ? projects : [];
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return normalized;
  }
  return normalized.filter((project) => String(project?.name || "").toLowerCase().includes(normalizedQuery));
}

function normalizeProjectForPicker(item) {
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
    createdAt: String(item.createdAt || item.created_at || item.created || "").trim()
  };
}

function normalizeProjectsForPicker(items) {
  const byId = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const normalized = normalizeProjectForPicker(item);
    if (!normalized) {
      continue;
    }
    byId.set(normalized.id, normalized);
  }
  return Array.from(byId.values());
}

function getProjectMemoryEntry() {
  const entry = projectMemoryEntry;
  if (!entry) {
    return { entry: null, isFresh: false };
  }
  return {
    entry,
    isFresh: Date.now() - Number(entry.fetchedAt || 0) <= PROJECT_MEMORY_TTL_MS
  };
}

function setProjectMemoryProjects(projects) {
  projectMemoryEntry = {
    fetchedAt: Date.now(),
    projects: normalizeProjectsForPicker(projects)
  };
}

function upsertProjectMemoryProject(project) {
  const normalized = normalizeProjectForPicker(project);
  if (!normalized) {
    return;
  }
  const current = getProjectMemoryEntry().entry;
  const byId = new Map();
  for (const item of current?.projects || []) {
    const existing = normalizeProjectForPicker(item);
    if (!existing) {
      continue;
    }
    byId.set(existing.id, existing);
  }
  const existing = byId.get(normalized.id) || null;
  byId.set(normalized.id, {
    ...existing,
    ...normalized,
    createdAt: normalized.createdAt || existing?.createdAt || new Date().toISOString()
  });
  setProjectMemoryProjects(Array.from(byId.values()));
}

function prefetchProjects(runId, options = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "PREFETCH_PROJECTS",
        runId: runId || "",
        limit: 0,
        forceRefresh: Boolean(options.forceRefresh),
        forceNewRefresh: Boolean(options.forceNewRefresh)
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

function listSequences(query, runId, actionId = ACTIONS.SEND_SEQUENCE, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "LIST_SEQUENCES",
        query: String(query || ""),
        limit: 0,
        runId: runId || "",
        actionId,
        forceRefresh: Boolean(options.forceRefresh),
        preferCache: Boolean(options.preferCache),
        forceNewRefresh: Boolean(options.forceNewRefresh)
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
          if (isContextInvalidatedResponse(response)) {
            triggerContextRecovery(response?.message || "Extension context invalidated.");
            reject(new Error("Extension updated. Reloading page."));
            return;
          }
          reject(new Error(response?.message || "Could not load sequences"));
          return;
        }
        resolve(Array.isArray(response.sequences) ? response.sequences : []);
      }
    );
  });
}

function prefetchSequences(runId, options = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "PREFETCH_SEQUENCES",
        runId: runId || "",
        limit: 0,
        forceRefresh: Boolean(options.forceRefresh),
        forceNewRefresh: Boolean(options.forceNewRefresh)
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

function createGemActionsStyles() {
  if (document.getElementById("gem-actions-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "gem-actions-style";
  style.textContent = `
    #gem-actions-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #gem-actions-modal {
      width: min(780px, 100%);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: #1f2328;
      position: relative;
      max-height: min(86vh, 920px);
      overflow: auto;
    }
    #gem-actions-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    #gem-actions-subtitle {
      font-size: 13px;
      color: #4f5358;
      margin-bottom: 12px;
    }
    #gem-actions-list {
      border: 1px solid #d4dae3;
      border-radius: 8px;
      overflow: auto;
      background: #fff;
      max-height: 420px;
    }
    .gem-actions-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid #eff2f7;
      font-size: 14px;
      line-height: 1.3;
    }
    .gem-actions-item:last-child {
      border-bottom: none;
    }
    .gem-actions-item.active {
      background: #eaf2fe;
    }
    .gem-actions-item.selected {
      background: #eef6ec;
    }
    .gem-actions-item.active.selected {
      background: #dcebd8;
    }
    .gem-actions-hotkey {
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
    .gem-actions-main {
      color: #1f2328;
      font-weight: 500;
      min-width: 0;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gem-actions-meta {
      font-size: 12px;
      color: #5b6168;
      margin-left: auto;
      flex-shrink: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 55%;
    }
    .gem-actions-hint {
      margin-top: 10px;
      font-size: 12px;
      color: #5b6168;
    }
    .gem-actions-empty {
      padding: 12px;
      font-size: 13px;
      color: #5b6168;
    }
    #gem-actions-input, #gem-actions-project-name, #gem-actions-project-description {
      width: 100%;
      border: 1px solid #b6beca;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      color: #1f2328;
      margin-bottom: 10px;
      font-family: inherit;
    }
    #gem-actions-project-description {
      min-height: 96px;
      resize: vertical;
    }
    .gem-actions-access-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin: 2px 0 8px;
      color: #2a3442;
    }
    #gem-actions-access-list {
      border: 1px solid #d4dae3;
      border-radius: 8px;
      overflow: auto;
      background: #fff;
      margin-bottom: 8px;
    }
    .gem-actions-access-item {
      padding: 10px 12px;
      border-bottom: 1px solid #eff2f7;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .gem-actions-access-item:last-child {
      border-bottom: none;
    }
    .gem-actions-access-item.selected {
      background: #eef6ec;
    }
    .gem-actions-access-item.active {
      outline: 1px solid #8db4f4;
      outline-offset: -1px;
    }
    .gem-actions-access-dot {
      width: 16px;
      height: 16px;
      border-radius: 999px;
      border: 1px solid #bcc6d6;
      background: #fff;
      flex-shrink: 0;
      position: relative;
    }
    .gem-actions-access-item.selected .gem-actions-access-dot {
      border-color: #1e69d2;
    }
    .gem-actions-access-item.selected .gem-actions-access-dot::after {
      content: "";
      position: absolute;
      inset: 3px;
      border-radius: 999px;
      background: #1e69d2;
    }
    .gem-actions-access-content {
      min-width: 0;
      flex: 1;
    }
    .gem-actions-access-name {
      font-size: 14px;
      font-weight: 600;
      color: #1f2328;
    }
    .gem-actions-access-description {
      font-size: 12px;
      color: #5b6168;
      margin-top: 2px;
    }
    .gem-actions-access-key {
      border: 1px solid #b9c3d3;
      border-radius: 6px;
      background: #f5f8fc;
      color: #2f3a4b;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 6px;
      text-transform: uppercase;
    }
    #gem-actions-confirm-mask {
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.92);
      border-radius: 12px;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 6;
    }
    #gem-actions-confirm-mask.visible {
      display: flex;
    }
    #gem-actions-confirm-card {
      width: min(460px, 100%);
      border: 1px solid #d4dae3;
      border-radius: 10px;
      padding: 16px;
      background: #fff;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
    }
    #gem-actions-confirm-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2328;
      margin-bottom: 8px;
    }
    #gem-actions-confirm-body {
      font-size: 14px;
      color: #32363c;
      margin-bottom: 14px;
      word-break: break-word;
      white-space: pre-wrap;
    }
    #gem-actions-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .gem-actions-confirm-btn {
      border-radius: 7px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    #gem-actions-confirm-cancel {
      border-color: #c4cbd7;
      background: #fff;
      color: #1f2328;
    }
    #gem-actions-confirm-ok {
      border-color: #1e69d2;
      background: #1e69d2;
      color: #fff;
    }
    .gem-actions-status {
      min-height: 18px;
      font-size: 12px;
      color: #5b6168;
      margin: 4px 0 8px;
    }
    .gem-actions-status.error {
      color: #a61d24;
    }
    .gem-actions-search-input-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .gem-actions-tag {
      display: inline-flex;
      align-items: center;
      border: 1px solid #d4dae3;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      color: #2f3a4b;
      background: #f8fafe;
      margin-left: 6px;
    }
  `;
  document.documentElement.appendChild(style);
}

function createAshbyJobPickerStyles() {
  if (document.getElementById("gem-ashby-job-picker-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "gem-ashby-job-picker-style";
  style.textContent = `
    #gem-ashby-job-picker-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #gem-ashby-job-picker-modal {
      width: min(680px, 100%);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: #1f2328;
      position: relative;
    }
    #gem-ashby-job-picker-brand {
      position: absolute;
      top: 12px;
      right: 14px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #4f5358;
      user-select: none;
    }
    #gem-ashby-job-picker-brand-dot {
      width: 18px;
      height: 18px;
      border-radius: 4px;
      background: #4b3fa8;
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
    }
    #gem-ashby-job-picker-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    #gem-ashby-job-picker-subtitle {
      font-size: 13px;
      color: #4f5358;
      margin-bottom: 12px;
    }
    #gem-ashby-job-picker-input {
      width: 100%;
      border: 1px solid #b6beca;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      margin-bottom: 10px;
    }
    #gem-ashby-job-picker-results {
      border: 1px solid #d4dae3;
      border-radius: 8px;
      max-height: 280px;
      overflow: auto;
      background: #fff;
    }
    .gem-ashby-job-picker-item {
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid #eff2f7;
      font-size: 14px;
      line-height: 1.3;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .gem-ashby-job-picker-item:last-child {
      border-bottom: none;
    }
    .gem-ashby-job-picker-item.active {
      background: #eaf2fe;
    }
    .gem-ashby-job-picker-item-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1;
    }
    .gem-ashby-job-picker-item-key {
      min-width: 22px;
      height: 22px;
      border: 1px solid #bcc6d6;
      border-radius: 6px;
      background: #f5f8fc;
      color: #2f3a4b;
      font-size: 12px;
      font-weight: 600;
      line-height: 20px;
      text-align: center;
      flex-shrink: 0;
    }
    .gem-ashby-job-picker-item-name {
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gem-ashby-job-picker-item-status {
      font-size: 12px;
      color: #5b6168;
      white-space: nowrap;
    }
    .gem-ashby-job-picker-hint {
      margin-top: 10px;
      font-size: 12px;
      color: #5b6168;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .gem-ashby-job-picker-empty {
      padding: 12px;
      font-size: 13px;
      color: #5b6168;
    }
    #gem-ashby-job-picker-confirm-mask {
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.92);
      border-radius: 12px;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 5;
    }
    #gem-ashby-job-picker-confirm-mask.visible {
      display: flex;
    }
    #gem-ashby-job-picker-confirm-card {
      width: min(440px, 100%);
      border: 1px solid #d4dae3;
      border-radius: 10px;
      padding: 16px;
      background: #fff;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
    }
    #gem-ashby-job-picker-confirm-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2328;
      margin-bottom: 8px;
    }
    #gem-ashby-job-picker-confirm-body {
      font-size: 14px;
      color: #32363c;
      margin-bottom: 14px;
      word-break: break-word;
    }
    #gem-ashby-job-picker-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .gem-ashby-job-picker-confirm-btn {
      border-radius: 7px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    #gem-ashby-job-picker-confirm-cancel {
      border-color: #c4cbd7;
      background: #fff;
      color: #1f2328;
    }
    #gem-ashby-job-picker-confirm-ok {
      border-color: #4b3fa8;
      background: #4b3fa8;
      color: #fff;
    }
  `;
  document.documentElement.appendChild(style);
}

function createCandidateNotePickerStyles() {
  if (document.getElementById("gem-candidate-note-picker-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "gem-candidate-note-picker-style";
  style.textContent = `
    #gem-candidate-note-picker-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #gem-candidate-note-picker-modal {
      width: min(680px, 100%);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: #1f2328;
      position: relative;
    }
    #gem-candidate-note-picker-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    #gem-candidate-note-picker-subtitle {
      font-size: 13px;
      color: #4f5358;
      margin-bottom: 12px;
    }
    #gem-candidate-note-picker-input {
      width: 100%;
      min-height: 132px;
      max-height: 280px;
      border: 1px solid #b6beca;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      line-height: 1.4;
      resize: vertical;
      color: #1f2328;
      font-family: inherit;
    }
    #gem-candidate-note-picker-meta {
      margin-top: 6px;
      margin-bottom: 8px;
      font-size: 12px;
      color: #5b6168;
      text-align: right;
    }
    #gem-candidate-note-picker-error {
      min-height: 18px;
      font-size: 12px;
      color: #a61d24;
      margin-bottom: 6px;
    }
    .gem-candidate-note-picker-hint {
      margin-top: 4px;
      font-size: 12px;
      color: #5b6168;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    #gem-candidate-note-picker-confirm-mask {
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.92);
      border-radius: 12px;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 5;
    }
    #gem-candidate-note-picker-confirm-mask.visible {
      display: flex;
    }
    #gem-candidate-note-picker-confirm-card {
      width: min(440px, 100%);
      border: 1px solid #d4dae3;
      border-radius: 10px;
      padding: 16px;
      background: #fff;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
    }
    #gem-candidate-note-picker-confirm-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2328;
      margin-bottom: 8px;
    }
    #gem-candidate-note-picker-confirm-body {
      font-size: 14px;
      color: #32363c;
      margin-bottom: 14px;
      word-break: break-word;
      white-space: pre-wrap;
      max-height: 220px;
      overflow: auto;
    }
    #gem-candidate-note-picker-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .gem-candidate-note-picker-confirm-btn {
      border-radius: 7px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    #gem-candidate-note-picker-confirm-cancel {
      border-color: #c4cbd7;
      background: #fff;
      color: #1f2328;
    }
    #gem-candidate-note-picker-confirm-ok {
      border-color: #4b3fa8;
      background: #4b3fa8;
      color: #fff;
    }
  `;
  document.documentElement.appendChild(style);
}

function createSequencePickerStyles() {
  if (document.getElementById("gem-sequence-picker-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "gem-sequence-picker-style";
  style.textContent = `
    #gem-sequence-picker-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #gem-sequence-picker-modal {
      width: min(760px, 100%);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: #1f2328;
    }
    #gem-sequence-picker-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    #gem-sequence-picker-subtitle {
      font-size: 13px;
      color: #4f5358;
      margin-bottom: 12px;
    }
    #gem-sequence-picker-results {
      border: 1px solid #d4dae3;
      border-radius: 8px;
      max-height: 340px;
      overflow: auto;
      background: #fff;
    }
    .gem-sequence-picker-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid #eff2f7;
      font-size: 14px;
      line-height: 1.3;
    }
    .gem-sequence-picker-item:last-child {
      border-bottom: none;
    }
    .gem-sequence-picker-item.active {
      background: #eaf2fe;
    }
    .gem-sequence-picker-hotkey {
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
    .gem-sequence-picker-name {
      color: #1f2328;
      font-weight: 500;
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gem-sequence-picker-meta {
      font-size: 12px;
      color: #5b6168;
      flex-shrink: 0;
    }
    .gem-sequence-picker-hint {
      margin-top: 10px;
      font-size: 12px;
      color: #5b6168;
    }
    .gem-sequence-picker-empty {
      padding: 12px;
      font-size: 13px;
      color: #5b6168;
    }
    #gem-sequence-picker-page {
      margin-top: 8px;
      font-size: 12px;
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
      position: relative;
    }
    #gem-custom-field-picker-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    #gem-custom-field-picker-title {
      font-size: 20px;
      font-weight: 700;
      margin: 0;
    }
    #gem-custom-field-picker-current-values {
      min-height: 24px;
      padding: 6px 10px;
      border: 1px solid #d4dae3;
      border-radius: 8px;
      background: #f8fafe;
      font-size: 12px;
      color: #2f3a4b;
      text-align: right;
      max-width: 52%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: none;
      line-height: 1.25;
    }
    #gem-custom-field-picker-current-values.visible {
      display: block;
    }
    .gem-custom-field-picker-current-label {
      font-weight: 600;
      margin-right: 6px;
    }
    #gem-custom-field-picker-subtitle {
      font-size: 13px;
      color: #4f5358;
      margin-bottom: 12px;
      margin-top: 6px;
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
    .gem-custom-field-picker-item.selected {
      background: #eef6ec;
    }
    .gem-custom-field-picker-item.active.selected {
      background: #dcebd8;
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
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
    #gem-custom-field-picker-confirm-mask {
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.92);
      border-radius: 12px;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 5;
    }
    #gem-custom-field-picker-confirm-mask.visible {
      display: flex;
    }
    #gem-custom-field-picker-confirm-card {
      width: min(440px, 100%);
      border: 1px solid #d4dae3;
      border-radius: 10px;
      padding: 16px;
      background: #fff;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
    }
    #gem-custom-field-picker-confirm-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2328;
      margin-bottom: 8px;
    }
    #gem-custom-field-picker-confirm-body {
      font-size: 14px;
      color: #32363c;
      margin-bottom: 14px;
      word-break: break-word;
    }
    #gem-custom-field-picker-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .gem-custom-field-picker-confirm-btn {
      border-radius: 7px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    #gem-custom-field-picker-confirm-cancel {
      border-color: #c4cbd7;
      background: #fff;
      color: #1f2328;
    }
    #gem-custom-field-picker-confirm-ok {
      border-color: #1e69d2;
      background: #1e69d2;
      color: #fff;
    }
  `;
  document.documentElement.appendChild(style);
}

function createReminderPickerStyles() {
  if (document.getElementById("gem-reminder-picker-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "gem-reminder-picker-style";
  style.textContent = `
    #gem-reminder-picker-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #gem-reminder-picker-modal {
      width: min(720px, 100%);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
      padding: 18px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: #1f2328;
      position: relative;
    }
    #gem-reminder-picker-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    #gem-reminder-picker-subtitle {
      font-size: 13px;
      color: #4f5358;
      margin-bottom: 14px;
    }
    .gem-reminder-picker-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin: 0 0 8px;
      color: #2a3442;
    }
    #gem-reminder-picker-note {
      width: 100%;
      min-height: 116px;
      max-height: 220px;
      border: 1px solid #b6beca;
      border-radius: 10px;
      padding: 12px;
      font-size: 16px;
      color: #1f2328;
      resize: vertical;
      margin-bottom: 14px;
      font-family: inherit;
    }
    .gem-reminder-picker-date-row {
      display: block;
      margin-bottom: 8px;
    }
    #gem-reminder-picker-date-input {
      width: 100%;
      border: 1px solid #ced6e2;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 16px;
      color: #1f2328;
      background: #fff;
    }
    .gem-reminder-picker-quick-actions {
      margin-top: 10px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .gem-reminder-picker-quick-btn {
      border: 1px solid #c5cedd;
      border-radius: 8px;
      background: #f8fafe;
      color: #1f2328;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 10px;
      cursor: pointer;
    }
    .gem-reminder-picker-quick-btn:hover {
      background: #edf2fc;
    }
    .gem-reminder-picker-quick-key {
      display: inline-block;
      min-width: 18px;
      margin-right: 6px;
      padding: 2px 5px;
      border-radius: 5px;
      border: 1px solid #bcc7d8;
      background: #fff;
      font-size: 11px;
      line-height: 1.1;
      text-transform: uppercase;
      color: #344255;
      text-align: center;
    }
    #gem-reminder-picker-error {
      min-height: 18px;
      font-size: 12px;
      color: #a61d24;
      margin-bottom: 8px;
    }
    .gem-reminder-picker-hint {
      margin-top: 2px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #5b6168;
    }
    .gem-reminder-picker-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .gem-reminder-picker-actions button {
      border: none;
      border-radius: 10px;
      padding: 10px 16px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    #gem-reminder-picker-cancel {
      background: #eff2f7;
      color: #1f2328;
    }
    #gem-reminder-picker-save {
      background: #1e69d2;
      color: #fff;
    }
    #gem-reminder-picker-confirm-mask {
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.92);
      border-radius: 12px;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 5;
    }
    #gem-reminder-picker-confirm-mask.visible {
      display: flex;
    }
    #gem-reminder-picker-confirm-card {
      width: min(440px, 100%);
      border: 1px solid #d4dae3;
      border-radius: 10px;
      padding: 16px;
      background: #fff;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
    }
    #gem-reminder-picker-confirm-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2328;
      margin-bottom: 8px;
    }
    #gem-reminder-picker-confirm-body {
      font-size: 14px;
      color: #32363c;
      margin-bottom: 14px;
      word-break: break-word;
    }
    #gem-reminder-picker-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .gem-reminder-picker-confirm-btn {
      border-radius: 7px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    #gem-reminder-picker-confirm-cancel {
      border-color: #c4cbd7;
      background: #fff;
      color: #1f2328;
    }
    #gem-reminder-picker-confirm-ok {
      border-color: #1e69d2;
      background: #1e69d2;
      color: #fff;
    }
  `;
  document.documentElement.appendChild(style);
}

function createEmailPickerStyles() {
  if (document.getElementById("gem-email-picker-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "gem-email-picker-style";
  style.textContent = `
    #gem-email-picker-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #gem-email-picker-modal {
      width: min(740px, 100%);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
      padding: 18px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: #1f2328;
      position: relative;
    }
    #gem-email-picker-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    #gem-email-picker-subtitle {
      font-size: 13px;
      color: #4f5358;
      margin-bottom: 12px;
    }
    #gem-email-picker-error {
      min-height: 18px;
      font-size: 12px;
      color: #a61d24;
      margin-bottom: 8px;
    }
    #gem-email-picker-list {
      border: 1px solid #d4dae3;
      border-radius: 8px;
      max-height: 320px;
      overflow: auto;
      background: #fff;
    }
    .gem-email-picker-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid #eff2f7;
      font-size: 14px;
      line-height: 1.3;
    }
    .gem-email-picker-item:last-child {
      border-bottom: none;
    }
    .gem-email-picker-item.active {
      background: #eaf2fe;
    }
    .gem-email-picker-item.primary {
      background: #eef6ec;
    }
    .gem-email-picker-item.active.primary {
      background: #dcebd8;
    }
    .gem-email-picker-hotkey {
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
    .gem-email-picker-value {
      color: #1f2328;
      font-weight: 500;
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gem-email-picker-meta {
      font-size: 12px;
      color: #5b6168;
      flex-shrink: 0;
    }
    .gem-email-picker-primary-badge {
      display: inline-flex;
      align-items: center;
      border: 1px solid #b8ccba;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 600;
      color: #27502d;
      background: #e8f3e7;
    }
    #gem-email-picker-input {
      width: 100%;
      border: 1px solid #b6beca;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 15px;
      margin-bottom: 10px;
      color: #1f2328;
    }
    .gem-email-picker-hint {
      margin-top: 10px;
      font-size: 12px;
      color: #5b6168;
    }
    .gem-email-picker-empty {
      padding: 12px;
      font-size: 13px;
      color: #5b6168;
    }
    .gem-email-picker-status {
      min-height: 18px;
      padding: 8px 2px 0;
      font-size: 12px;
      color: #5b6168;
    }
    .gem-email-picker-status.error {
      color: #a61d24;
    }
    #gem-email-picker-confirm-mask {
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.92);
      border-radius: 12px;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 5;
    }
    #gem-email-picker-confirm-mask.visible {
      display: flex;
    }
    #gem-email-picker-confirm-card {
      width: min(440px, 100%);
      border: 1px solid #d4dae3;
      border-radius: 10px;
      padding: 16px;
      background: #fff;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
    }
    #gem-email-picker-confirm-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2328;
      margin-bottom: 8px;
    }
    #gem-email-picker-confirm-body {
      font-size: 14px;
      color: #32363c;
      margin-bottom: 14px;
      word-break: break-word;
    }
    #gem-email-picker-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .gem-email-picker-confirm-btn {
      border-radius: 7px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    #gem-email-picker-confirm-cancel {
      border-color: #c4cbd7;
      background: #fff;
      color: #1f2328;
    }
    #gem-email-picker-confirm-ok {
      border-color: #1e69d2;
      background: #1e69d2;
      color: #fff;
    }
  `;
  document.documentElement.appendChild(style);
}

function formatSequenceDate(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleDateString();
}

async function showCustomFieldPicker(runId, context) {
  createCustomFieldPickerStyles();
  const linkedinUrl = context.linkedinUrl || window.location.href;
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-custom-field-picker-overlay";

    const modal = document.createElement("div");
    modal.id = "gem-custom-field-picker-modal";

    const header = document.createElement("div");
    header.id = "gem-custom-field-picker-header";

    const title = document.createElement("div");
    title.id = "gem-custom-field-picker-title";
    title.textContent = "Set Custom Field";

    const currentValues = document.createElement("div");
    currentValues.id = "gem-custom-field-picker-current-values";

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

    const confirmMask = document.createElement("div");
    confirmMask.id = "gem-custom-field-picker-confirm-mask";
    const confirmCard = document.createElement("div");
    confirmCard.id = "gem-custom-field-picker-confirm-card";
    const confirmTitle = document.createElement("div");
    confirmTitle.id = "gem-custom-field-picker-confirm-title";
    confirmTitle.textContent = "Confirm Custom Field Update";
    const confirmBody = document.createElement("div");
    confirmBody.id = "gem-custom-field-picker-confirm-body";
    const confirmActions = document.createElement("div");
    confirmActions.id = "gem-custom-field-picker-confirm-actions";
    const confirmCancelBtn = document.createElement("button");
    confirmCancelBtn.id = "gem-custom-field-picker-confirm-cancel";
    confirmCancelBtn.className = "gem-custom-field-picker-confirm-btn";
    confirmCancelBtn.type = "button";
    confirmCancelBtn.textContent = "Cancel";
    const confirmOkBtn = document.createElement("button");
    confirmOkBtn.id = "gem-custom-field-picker-confirm-ok";
    confirmOkBtn.className = "gem-custom-field-picker-confirm-btn";
    confirmOkBtn.type = "button";
    confirmOkBtn.textContent = "Confirm";
    confirmActions.appendChild(confirmCancelBtn);
    confirmActions.appendChild(confirmOkBtn);
    confirmCard.appendChild(confirmTitle);
    confirmCard.appendChild(confirmBody);
    confirmCard.appendChild(confirmActions);
    confirmMask.appendChild(confirmCard);

    header.appendChild(title);
    header.appendChild(currentValues);
    modal.appendChild(header);
    modal.appendChild(subtitle);
    modal.appendChild(results);
    modal.appendChild(pageInfo);
    modal.appendChild(hint);
    modal.appendChild(confirmMask);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    const memoryEntry = getCustomFieldMemoryEntry(context);
    const initialFieldData = memoryEntry.entry
      ? mergeOptimisticGemStatusIntoCustomFieldData(
          context,
          memoryEntry.entry,
          String(memoryEntry.entry.candidateId || "").trim()
        )
      : null;
    const hasMemory = Boolean(memoryEntry.entry);
    let loading = !hasMemory;
    let loadError = "";
    let step = "fields";
    let selectedIndex = 0;
    let currentPage = 0;
    let allFields = hasMemory ? normalizeCustomFieldsForPicker(initialFieldData).slice() : [];
    let fieldsForPage = [];
    let selectedField = null;
    let valueChoices = [];
    const pendingMultiOptionIds = new Set();
    let hasEditedMultiSelection = false;
    let pendingMultiConfirmation = null;
    let pickerActive = true;
    const startedAt = Date.now();
    let currentCandidateId = hasMemory ? String(initialFieldData?.candidateId || "").trim() : "";

    function clearPendingMultiSelection() {
      pendingMultiOptionIds.clear();
    }

    function seedPendingMultiSelectionFromExisting(field) {
      clearPendingMultiSelection();
      if (!isMultiSelectField(field)) {
        return;
      }
      const currentOptionIds = getCurrentOptionIdsForField(field, Array.isArray(field?.options) ? field.options : []);
      currentOptionIds.forEach((id) => pendingMultiOptionIds.add(id));
    }

    function getCurrentOptionIdsForField(field, choices) {
      const optionIds = new Set();
      const directOptionIds = Array.isArray(field?.currentOptionIds) ? field.currentOptionIds : [];
      directOptionIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
        .forEach((id) => optionIds.add(id));

      if (optionIds.size > 0) {
        return optionIds;
      }

      const currentLabels = Array.isArray(field?.currentValueLabels) ? field.currentValueLabels : [];
      if (currentLabels.length === 0 || !Array.isArray(choices) || choices.length === 0) {
        return optionIds;
      }

      const normalizedCurrentLabels = new Set(
        currentLabels.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
      );
      choices.forEach((option) => {
        const optionValue = String(option?.value || "").trim().toLowerCase();
        if (optionValue && normalizedCurrentLabels.has(optionValue)) {
          const optionId = String(option?.id || "").trim();
          if (optionId) {
            optionIds.add(optionId);
          }
        }
      });

      return optionIds;
    }

    function cleanup() {
      pickerActive = false;
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

    function isMultiSelectField(field) {
      return String(field?.valueType || "").toLowerCase() === "multi_select";
    }

    function summarizeLabels(values, maxVisible = 3) {
      if (!Array.isArray(values) || values.length === 0) {
        return "None";
      }
      const labels = values
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      if (labels.length === 0) {
        return "None";
      }
      if (labels.length <= maxVisible) {
        return labels.join(", ");
      }
      return `${labels.slice(0, maxVisible).join(", ")} +${labels.length - maxVisible} more`;
    }

    function setCurrentValuesBadge(field) {
      if (!field || step !== "values") {
        currentValues.classList.remove("visible");
        currentValues.textContent = "";
        return;
      }
      currentValues.classList.add("visible");
      const values = Array.isArray(field.currentValueLabels) ? field.currentValueLabels : [];
      currentValues.innerHTML = "";
      const label = document.createElement("span");
      label.className = "gem-custom-field-picker-current-label";
      label.textContent = "Current:";
      const valueText = document.createElement("span");
      valueText.textContent = summarizeLabels(values, 4);
      currentValues.appendChild(label);
      currentValues.appendChild(valueText);
    }

    function setHintText(text) {
      hint.textContent = text;
    }

    function updateValuesPageInfo() {
      if (step !== "values") {
        pageInfo.textContent = "";
        return;
      }
      if (isMultiSelectField(selectedField)) {
        const selectedCount = pendingMultiOptionIds.size;
        pageInfo.textContent =
          selectedCount > 0
            ? `${selectedCount} value${selectedCount === 1 ? "" : "s"} selected. Press Enter to review.`
            : "Press a letter to select additional values.";
        return;
      }
      pageInfo.textContent = "";
    }

    function isConfirmingMultiSelection() {
      return Boolean(pendingMultiConfirmation);
    }

    function updateMultiConfirmationMask() {
      if (!pendingMultiConfirmation) {
        confirmMask.classList.remove("visible");
        modal.focus();
        return;
      }
      confirmBody.textContent = pendingMultiConfirmation.message;
      confirmMask.classList.add("visible");
      confirmOkBtn.focus();
    }

    function closeMultiConfirmation() {
      if (!pendingMultiConfirmation) {
        return;
      }
      pendingMultiConfirmation = null;
      updateMultiConfirmationMask();
    }

    function buildValueChoicesForField(field) {
      const options = Array.isArray(field?.options) ? field.options.slice() : [];
      const valueType = String(field?.valueType || "").toLowerCase();
      if (options.length > 0) {
        return options;
      }
      if (valueType === "single_select" || valueType === "multi_select") {
        return [];
      }
      return [{ id: "__manual__", value: "Type a custom value..." }];
    }

    function setValuesHeaderForField(field) {
      title.textContent = `Set ${field.name}`;
      if (isMultiSelectField(field)) {
        subtitle.textContent = "Press letters to select additional values, then press Enter to continue.";
        setHintText(
          "Esc to go back. Letter shortcuts toggle immediately. Enter reviews selection. In confirmation: Enter confirms, Esc cancels."
        );
      } else {
        subtitle.textContent = "Press a number to choose a value.";
        setHintText("Esc to go back. Number shortcuts apply immediately. Arrow keys + Enter also work.");
      }
      setCurrentValuesBadge(field);
    }

    function renderFields() {
      updatePageFields();
      results.innerHTML = "";
      currentValues.classList.remove("visible");
      currentValues.textContent = "";
      setHintText("Esc to cancel. Arrow keys + Enter also work.");
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
          if (selectedIndex === index) {
            return;
          }
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

    function applyLoadedCustomFields(data) {
      if (!pickerActive) {
        return;
      }
      loading = false;
      loadError = "";
      const dataWithOptimisticStatus = mergeOptimisticGemStatusIntoCustomFieldData(
        context,
        data,
        String(data?.candidateId || currentCandidateId || "").trim()
      );
      currentCandidateId = String(dataWithOptimisticStatus?.candidateId || currentCandidateId || "").trim();
      rememberResolvedCandidateIdForContext(context, currentCandidateId);
      allFields = normalizeCustomFieldsForPicker(dataWithOptimisticStatus);
      setCustomFieldMemoryEntry(context, {
        candidateId: currentCandidateId,
        customFields: allFields
      });

      if (step === "values" && selectedField) {
        const refreshedField = allFields.find((field) => field.id === selectedField.id) || selectedField;
        selectedField = refreshedField;
        const nextChoices = buildValueChoicesForField(refreshedField);
        const activeChoiceId = valueChoices[selectedIndex]?.id || "";
        valueChoices = nextChoices;
        if (activeChoiceId) {
          const matchedChoiceIndex = nextChoices.findIndex((option) => option.id === activeChoiceId);
          selectedIndex = matchedChoiceIndex >= 0 ? matchedChoiceIndex : 0;
        } else {
          selectedIndex = 0;
        }
        if (pendingMultiOptionIds.size > 0) {
          const validOptionIds = new Set(nextChoices.map((option) => option.id));
          Array.from(pendingMultiOptionIds).forEach((optionId) => {
            if (!validOptionIds.has(optionId)) {
              pendingMultiOptionIds.delete(optionId);
            }
          });
        }
        if (isMultiSelectField(selectedField) && !hasEditedMultiSelection) {
          seedPendingMultiSelectionFromExisting(selectedField);
          const firstSelectedIndex = valueChoices.findIndex((option) => pendingMultiOptionIds.has(option.id));
          if (firstSelectedIndex >= 0) {
            selectedIndex = firstSelectedIndex;
          }
        }
        setValuesHeaderForField(selectedField);
        renderValues();
        return;
      }

      currentPage = 0;
      selectedIndex = 0;
      renderFields();
    }

    function openValuesForField(field) {
      step = "values";
      selectedField = field;
      closeMultiConfirmation();
      hasEditedMultiSelection = false;
      seedPendingMultiSelectionFromExisting(field);
      valueChoices = buildValueChoicesForField(field);
      if (valueChoices.length > 0) {
        const currentOptionIds = getCurrentOptionIdsForField(field, valueChoices);
        if (isMultiSelectField(field)) {
          const firstSelectedIndex = valueChoices.findIndex((option) => pendingMultiOptionIds.has(option.id));
          selectedIndex = firstSelectedIndex >= 0 ? firstSelectedIndex : 0;
        } else {
          const firstCurrentIndex = valueChoices.findIndex((option) => currentOptionIds.has(option.id));
          selectedIndex = firstCurrentIndex >= 0 ? firstCurrentIndex : 0;
        }
      } else {
        selectedIndex = 0;
      }
      setValuesHeaderForField(field);
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

    function finishSingleChoice(option) {
      if (!selectedField) {
        return;
      }
      if (option.id === "__manual__") {
        const typed = (window.prompt(`Enter value for "${selectedField.name}":`) || "").trim();
        if (!typed) {
          return;
        }
        finish({
          candidateId: currentCandidateId,
          customFieldId: selectedField.id,
          customFieldName: selectedField.name || "",
          customFieldValue: typed,
          customFieldValueLabels: [typed],
          customFieldOptionId: "",
          customFieldOptionIds: [],
          customFieldValueType: selectedField.valueType || "text"
        });
        return;
      }
      finish({
        candidateId: currentCandidateId,
        customFieldId: selectedField.id,
        customFieldName: selectedField.name || "",
        customFieldValue: option.value || "",
        customFieldValueLabels: option.value ? [option.value] : [],
        customFieldOptionId: option.id || "",
        customFieldOptionIds: option.id ? [option.id] : [],
        customFieldValueType: selectedField.valueType || ""
      });
    }

    function toggleMultiChoice(option) {
      const optionId = String(option?.id || "").trim();
      if (!optionId || optionId === "__manual__") {
        return;
      }
      hasEditedMultiSelection = true;
      if (pendingMultiOptionIds.has(optionId)) {
        pendingMultiOptionIds.delete(optionId);
      } else {
        pendingMultiOptionIds.add(optionId);
      }
      renderValues();
    }

    function buildSelectedMultiOptionIds() {
      if (!selectedField) {
        return [];
      }
      const validOptionIds = new Set(valueChoices.map((option) => String(option.id || "").trim()).filter(Boolean));
      const selected = Array.from(pendingMultiOptionIds)
        .map((id) => String(id || "").trim())
        .filter((id) => id && validOptionIds.has(id));
      return Array.from(new Set(selected));
    }

    function openMultiConfirmation() {
      if (!selectedField || !isMultiSelectField(selectedField)) {
        return;
      }
      if (pendingMultiOptionIds.size === 0 && !hasEditedMultiSelection) {
        return;
      }
      const selectedOptionIds = buildSelectedMultiOptionIds();
      const selectedLabels = valueChoices
        .filter((option) => pendingMultiOptionIds.has(option.id))
        .map((option) => option.value || option.id || "")
        .filter(Boolean);
      const existingOptionIds = getCurrentOptionIdsForField(selectedField, valueChoices);
      const additionalLabels = valueChoices
        .filter((option) => pendingMultiOptionIds.has(option.id) && !existingOptionIds.has(option.id))
        .map((option) => option.value || option.id || "")
        .filter(Boolean);
      const removedLabels = valueChoices
        .filter((option) => existingOptionIds.has(option.id) && !pendingMultiOptionIds.has(option.id))
        .map((option) => option.value || option.id || "")
        .filter(Boolean);
      const currentSummary = summarizeLabels(selectedField.currentValueLabels, 3);
      const selectedSummary = summarizeLabels(selectedLabels, 4);
      const additionalSummary = summarizeLabels(additionalLabels, 4);
      const removedSummary = summarizeLabels(removedLabels, 4);
      pendingMultiConfirmation = {
        selectedOptionIds,
        selectedLabels,
        message: `Set ${selectedOptionIds.length} selected value${selectedOptionIds.length === 1 ? "" : "s"} for "${
          selectedField.name
        }"? Current: ${currentSummary}. Selected: ${selectedSummary}. Additional: ${additionalSummary}. Removed: ${removedSummary}.`
      };
      updateMultiConfirmationMask();
    }

    function confirmMultiSelection() {
      if (!selectedField || !pendingMultiConfirmation) {
        return;
      }
      const selectedOptionIds = Array.isArray(pendingMultiConfirmation.selectedOptionIds)
        ? pendingMultiConfirmation.selectedOptionIds
        : [];
      const selectionLabels = Array.isArray(pendingMultiConfirmation.selectedLabels)
        ? pendingMultiConfirmation.selectedLabels
        : [];
      pendingMultiConfirmation = null;
      finish({
        candidateId: currentCandidateId,
        customFieldId: selectedField.id,
        customFieldName: selectedField.name || "",
        customFieldValue: selectionLabels.join(", "),
        customFieldValueLabels: selectionLabels,
        customFieldOptionId: selectedOptionIds[0] || "",
        customFieldOptionIds: selectedOptionIds,
        customFieldValueType: selectedField.valueType || ""
      });
    }

    function getSingleSelectShortcutIndexFromKey(key) {
      if (!/^[0-9]$/.test(key)) {
        return -1;
      }
      if (key === "0") {
        return 9;
      }
      return Number(key) - 1;
    }

    function renderValues() {
      results.innerHTML = "";
      const isMulti = isMultiSelectField(selectedField);
      const currentOptionIds = getCurrentOptionIdsForField(selectedField, valueChoices);
      if (valueChoices.length === 0) {
        const empty = document.createElement("div");
        empty.className = "gem-custom-field-picker-empty";
        empty.textContent = "No values available for this field.";
        results.appendChild(empty);
        updateValuesPageInfo();
        return;
      }
      valueChoices.forEach((option, index) => {
        const item = document.createElement("div");
        const isActive = index === selectedIndex;
        const isCurrentlySet = currentOptionIds.has(option.id);
        const isSelected = isMulti ? pendingMultiOptionIds.has(option.id) : isCurrentlySet;
        item.className = `gem-custom-field-picker-item${isActive ? " active" : ""}${isSelected ? " selected" : ""}`;

        const hotkey = document.createElement("div");
        hotkey.className = "gem-custom-field-picker-hotkey";
        hotkey.textContent = isMulti ? CUSTOM_FIELD_SHORTCUT_KEYS[index] || "" : String(index + 1);

        const value = document.createElement("div");
        value.className = "gem-custom-field-picker-value";
        value.textContent = option.value || option.id || "";

        item.appendChild(hotkey);
        item.appendChild(value);
        if (isCurrentlySet) {
          const existingTag = document.createElement("div");
          existingTag.className = "gem-custom-field-picker-meta";
          existingTag.textContent = "current";
          item.appendChild(existingTag);
        }
        item.addEventListener("mouseenter", () => {
          if (selectedIndex === index) {
            return;
          }
          selectedIndex = index;
          renderValues();
        });
        item.addEventListener("click", () => {
          selectedIndex = index;
          if (isMulti) {
            toggleMultiChoice(option);
            return;
          }
          finishSingleChoice(option);
        });
        results.appendChild(item);
      });
      updateValuesPageInfo();
    }

    function goBackToFields() {
      step = "fields";
      closeMultiConfirmation();
      clearPendingMultiSelection();
      hasEditedMultiSelection = false;
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

    function handleValuesNumberKey(event) {
      if (isMultiSelectField(selectedField)) {
        return false;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return false;
      }
      const key = String(event.key || "");
      const shortcutIndex = getSingleSelectShortcutIndexFromKey(key);
      if (shortcutIndex < 0) {
        return false;
      }
      if (shortcutIndex >= valueChoices.length) {
        return true;
      }
      selectedIndex = shortcutIndex;
      finishSingleChoice(valueChoices[shortcutIndex]);
      return true;
    }

    function handleValuesLetterKey(event) {
      if (!isMultiSelectField(selectedField)) {
        return false;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return false;
      }
      const lower = String(event.key || "").toLowerCase();
      const idx = CUSTOM_FIELD_SHORTCUT_KEYS.indexOf(lower);
      if (idx < 0) {
        return false;
      }
      if (idx >= valueChoices.length) {
        return true;
      }
      selectedIndex = idx;
      toggleMultiChoice(valueChoices[idx]);
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
      if (isMultiSelectField(selectedField) && event.key === " ") {
        event.preventDefault();
        if (valueChoices.length > 0) {
          toggleMultiChoice(valueChoices[selectedIndex]);
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (valueChoices.length > 0) {
          if (isMultiSelectField(selectedField)) {
            if (pendingMultiOptionIds.size > 0 || hasEditedMultiSelection) {
              openMultiConfirmation();
              return;
            }
            toggleMultiChoice(valueChoices[selectedIndex]);
            return;
          }
          finishSingleChoice(valueChoices[selectedIndex]);
        }
        return;
      }
      if (handleValuesLetterKey(event)) {
        event.preventDefault();
        return;
      }
      if (handleValuesNumberKey(event)) {
        event.preventDefault();
        return;
      }
    }

    overlay.addEventListener(
      "keydown",
      (event) => {
        if (isConfirmingMultiSelection()) {
          if (event.key === "Enter") {
            event.preventDefault();
            confirmMultiSelection();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeMultiConfirmation();
            return;
          }
        }

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

    confirmOkBtn.addEventListener("click", () => {
      confirmMultiSelection();
    });

    confirmCancelBtn.addEventListener("click", () => {
      closeMultiConfirmation();
    });

    confirmMask.addEventListener("click", (event) => {
      if (event.target === confirmMask) {
        closeMultiConfirmation();
      }
    });

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

    const canCreateCandidateForPicker = shouldAllowCandidateCreateForContext(context);

    async function surfaceCustomFieldLoadFailure(message) {
      if (!pickerActive) {
        return;
      }
      loading = false;
      loadError = message || "Failed to load custom fields.";
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
    }

    function maybeUpgradeCustomFieldsForCandidate(seedData = null, options = {}) {
      const seedCandidateId = String(seedData?.candidateId || currentCandidateId || "").trim();
      if (!pickerActive || !canCreateCandidateForPicker || seedCandidateId) {
        return Promise.resolve(false);
      }
      return warmCustomFieldsForContext(context, runId, {
        preferCache: true,
        refreshInBackground: false,
        allowCreate: true
      })
        .then((candidateData) => {
          if (!pickerActive || !candidateData) {
            return false;
          }
          const resolvedCandidateId = String(candidateData.candidateId || "").trim();
          if (!resolvedCandidateId) {
            return false;
          }
          applyLoadedCustomFields(candidateData);
          return true;
        })
        .catch(async (error) => {
          if (options.surfaceFailure) {
            await surfaceCustomFieldLoadFailure(error?.message || "Failed to load custom fields.");
          }
          // The fast picker path is already visible. Ignore candidate-upgrade failures here
          // and let the eventual field update action surface any real backend error.
          return false;
        });
    }

    warmCustomFieldsForContext(context, runId, {
      preferCache: true,
      refreshInBackground: true,
      allowCreate: false,
      allowEmptyCandidateCache: true
    })
      .then(async (data) => {
        if (!data) {
          maybeUpgradeCustomFieldsForCandidate();
          return;
        }
        applyLoadedCustomFields(data);
        maybeUpgradeCustomFieldsForCandidate(data);
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
      })
      .catch(async (error) => {
        if (!pickerActive) {
          return;
        }
        if (canCreateCandidateForPicker) {
          const upgraded = await maybeUpgradeCustomFieldsForCandidate(null, { surfaceFailure: true });
          if (upgraded) {
            return;
          }
          return;
        }
        await surfaceCustomFieldLoadFailure(error.message || "Failed to load custom fields.");
      });
  });
}

async function showReminderPicker(runId, context) {
  createReminderPickerStyles();
  const linkedinUrl = context.linkedinUrl || window.location.href;
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-reminder-picker-overlay";

    const modal = document.createElement("form");
    modal.id = "gem-reminder-picker-modal";

    const title = document.createElement("div");
    title.id = "gem-reminder-picker-title";
    title.textContent = "Set Reminder";

    const subtitle = document.createElement("div");
    subtitle.id = "gem-reminder-picker-subtitle";
    subtitle.textContent = "Add an optional reminder note and choose a due date.";

    const noteLabel = document.createElement("label");
    noteLabel.className = "gem-reminder-picker-label";
    noteLabel.setAttribute("for", "gem-reminder-picker-note");
    noteLabel.textContent = "Reminder (optional)";

    const noteInput = document.createElement("textarea");
    noteInput.id = "gem-reminder-picker-note";
    noteInput.placeholder = "e.g. set up a coffee chat";
    noteInput.maxLength = 2000;

    const dateLabel = document.createElement("label");
    dateLabel.className = "gem-reminder-picker-label";
    dateLabel.setAttribute("for", "gem-reminder-picker-date-input");
    dateLabel.textContent = "Due date";

    const dateRow = document.createElement("div");
    dateRow.className = "gem-reminder-picker-date-row";

    const dateInput = document.createElement("input");
    dateInput.id = "gem-reminder-picker-date-input";
    dateInput.type = "date";
    dateRow.appendChild(dateInput);

    const quickActionRow = document.createElement("div");
    quickActionRow.className = "gem-reminder-picker-quick-actions";
    const shortcutByKey = new Map();
    REMINDER_PRESET_SHORTCUTS.forEach((preset) => {
      shortcutByKey.set(preset.key, preset);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gem-reminder-picker-quick-btn";
      button.dataset.shortcut = preset.key;
      const keyTag = document.createElement("span");
      keyTag.className = "gem-reminder-picker-quick-key";
      keyTag.textContent = preset.key;
      const label = document.createElement("span");
      label.textContent = preset.label;
      button.appendChild(keyTag);
      button.appendChild(label);
      quickActionRow.appendChild(button);
    });
    dateRow.appendChild(quickActionRow);

    const errorEl = document.createElement("div");
    errorEl.id = "gem-reminder-picker-error";

    const hint = document.createElement("div");
    hint.className = "gem-reminder-picker-hint";
    hint.textContent =
      "Esc to cancel. Press Tab from note to date. Type date + Enter, or use A (1 week), S (3 months), D (6 months).";

    const confirmMask = document.createElement("div");
    confirmMask.id = "gem-reminder-picker-confirm-mask";
    const confirmCard = document.createElement("div");
    confirmCard.id = "gem-reminder-picker-confirm-card";
    const confirmTitle = document.createElement("div");
    confirmTitle.id = "gem-reminder-picker-confirm-title";
    confirmTitle.textContent = "Confirm Reminder";
    const confirmBody = document.createElement("div");
    confirmBody.id = "gem-reminder-picker-confirm-body";
    const confirmActions = document.createElement("div");
    confirmActions.id = "gem-reminder-picker-confirm-actions";
    const confirmCancelBtn = document.createElement("button");
    confirmCancelBtn.id = "gem-reminder-picker-confirm-cancel";
    confirmCancelBtn.className = "gem-reminder-picker-confirm-btn";
    confirmCancelBtn.type = "button";
    confirmCancelBtn.textContent = "Cancel";
    const confirmOkBtn = document.createElement("button");
    confirmOkBtn.id = "gem-reminder-picker-confirm-ok";
    confirmOkBtn.className = "gem-reminder-picker-confirm-btn";
    confirmOkBtn.type = "button";
    confirmOkBtn.textContent = "Confirm";
    confirmActions.appendChild(confirmCancelBtn);
    confirmActions.appendChild(confirmOkBtn);
    confirmCard.appendChild(confirmTitle);
    confirmCard.appendChild(confirmBody);
    confirmCard.appendChild(confirmActions);
    confirmMask.appendChild(confirmCard);

    const actions = document.createElement("div");
    actions.className = "gem-reminder-picker-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.id = "gem-reminder-picker-cancel";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";

    const saveBtn = document.createElement("button");
    saveBtn.id = "gem-reminder-picker-save";
    saveBtn.type = "submit";
    saveBtn.textContent = "Save";

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(noteLabel);
    modal.appendChild(noteInput);
    modal.appendChild(dateLabel);
    modal.appendChild(dateRow);
    modal.appendChild(errorEl);
    modal.appendChild(hint);
    modal.appendChild(actions);
    modal.appendChild(confirmMask);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    let selectedDate = getTodayIsoDate();
    let confirmationPreset = null;
    const startedAt = Date.now();

    function setError(message) {
      errorEl.textContent = message || "";
    }

    function setSelectedDate(dateValue) {
      selectedDate = dateValue;
      dateInput.value = dateValue;
    }

    function cleanup() {
      overlay.remove();
    }

    function finish(selection) {
      cleanup();
      resolve(selection || null);
    }

    function cancelPicker(reason) {
      logEvent({
        source: "extension.content",
        level: "warn",
        event: "reminder_picker.cancelled",
        actionId: ACTIONS.SET_REMINDER,
        runId,
        message: reason || "Reminder picker cancelled.",
        link: linkedinUrl
      });
      finish(null);
    }

    function submitReminder() {
      if (typeof modal.requestSubmit === "function") {
        modal.requestSubmit();
        return;
      }
      saveBtn.click();
    }

    function isConfirming() {
      return Boolean(confirmationPreset);
    }

    function updateConfirmationMask() {
      if (!confirmationPreset) {
        confirmMask.classList.remove("visible");
        dateInput.focus();
        return;
      }
      confirmBody.textContent = `Set reminder for ${confirmationPreset.label} from today (${formatIsoDateForDisplay(
        confirmationPreset.dueDate
      )})?`;
      confirmMask.classList.add("visible");
      confirmOkBtn.focus();
    }

    function openPresetConfirmation(preset) {
      if (!preset) {
        return;
      }
      const dueDate = getReminderPresetIsoDate(preset);
      if (!dueDate) {
        return;
      }
      setSelectedDate(dueDate);
      setError("");
      confirmationPreset = {
        key: preset.key,
        label: preset.label,
        dueDate
      };
      updateConfirmationMask();
    }

    function closePresetConfirmation() {
      if (!confirmationPreset) {
        return;
      }
      confirmationPreset = null;
      updateConfirmationMask();
    }

    function confirmPresetSelection() {
      if (!confirmationPreset) {
        return;
      }
      confirmationPreset = null;
      updateConfirmationMask();
      submitReminder();
    }

    setSelectedDate(selectedDate);

    dateInput.addEventListener("change", () => {
      const value = String(dateInput.value || "").trim();
      if (value) {
        setSelectedDate(value);
        setError("");
      }
    });

    noteInput.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        dateInput.focus();
      }
    });

    dateInput.addEventListener("keydown", (event) => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        const shortcutKey = String(event.key || "").trim().toLowerCase();
        const preset = shortcutByKey.get(shortcutKey);
        if (preset) {
          event.preventDefault();
          openPresetConfirmation(preset);
          return;
        }
      }
      if (event.key === "Enter") {
        event.preventDefault();
        // Let the native date input commit its current segment before submitting.
        setTimeout(() => {
          const value = String(dateInput.value || "").trim();
          if (value) {
            setSelectedDate(value);
            setError("");
          }
          submitReminder();
        }, 0);
      }
    });

    quickActionRow.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest(".gem-reminder-picker-quick-btn") : null;
      if (!target) {
        return;
      }
      const shortcutKey = String(target.getAttribute("data-shortcut") || "").trim().toLowerCase();
      if (!shortcutKey) {
        return;
      }
      const preset = shortcutByKey.get(shortcutKey);
      if (!preset) {
        return;
      }
      openPresetConfirmation(preset);
    });

    cancelBtn.addEventListener("click", () => {
      cancelPicker("Reminder picker cancelled.");
    });

    confirmOkBtn.addEventListener("click", () => {
      confirmPresetSelection();
    });

    confirmCancelBtn.addEventListener("click", () => {
      closePresetConfirmation();
    });

    confirmMask.addEventListener("click", (event) => {
      if (event.target === confirmMask) {
        closePresetConfirmation();
      }
    });

    modal.addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = noteInput.value.trim();
      const dateFromInput = String(dateInput.value || "").trim();
      if (dateFromInput) {
        setSelectedDate(dateFromInput);
      }
      if (!selectedDate) {
        setError("Please choose a due date.");
        dateInput.focus();
        return;
      }
      setError("");
      await logEvent({
        source: "extension.content",
        event: "reminder_picker.submitted",
        actionId: ACTIONS.SET_REMINDER,
        runId,
        message: `Reminder selected for ${formatIsoDateForDisplay(selectedDate)}.`,
        link: linkedinUrl,
        details: {
          dueDate: selectedDate,
          noteLength: note.length,
          durationMs: Date.now() - startedAt
        }
      });
      finish({
        reminderNote: note,
        reminderDueDate: selectedDate
      });
    });

    overlay.addEventListener(
      "keydown",
      (event) => {
        if (isConfirming()) {
          if (event.key === "Enter") {
            event.preventDefault();
            confirmPresetSelection();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closePresetConfirmation();
            return;
          }
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelPicker("Reminder picker cancelled.");
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          submitReminder();
        }
      },
      true
    );

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        cancelPicker("Reminder picker cancelled by outside click.");
      }
    });

    modal.tabIndex = -1;
    modal.focus();
    noteInput.focus();

    logEvent({
      source: "extension.content",
      event: "reminder_picker.opened",
      actionId: ACTIONS.SET_REMINDER,
      runId,
      message: "Reminder picker opened.",
      link: linkedinUrl
    });
  });
}

async function showEmailPicker(runId, context) {
  createEmailPickerStyles();
  const linkedinUrl = context.linkedinUrl || window.location.href;

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-email-picker-overlay";

    const modal = document.createElement("div");
    modal.id = "gem-email-picker-modal";

    const title = document.createElement("div");
    title.id = "gem-email-picker-title";

    const subtitle = document.createElement("div");
    subtitle.id = "gem-email-picker-subtitle";

    const errorEl = document.createElement("div");
    errorEl.id = "gem-email-picker-error";

    const content = document.createElement("div");
    content.id = "gem-email-picker-list";

    const hint = document.createElement("div");
    hint.className = "gem-email-picker-hint";

    const confirmMask = document.createElement("div");
    confirmMask.id = "gem-email-picker-confirm-mask";
    const confirmCard = document.createElement("div");
    confirmCard.id = "gem-email-picker-confirm-card";
    const confirmTitle = document.createElement("div");
    confirmTitle.id = "gem-email-picker-confirm-title";
    confirmTitle.textContent = "Confirm Email Update";
    const confirmBody = document.createElement("div");
    confirmBody.id = "gem-email-picker-confirm-body";
    const confirmActions = document.createElement("div");
    confirmActions.id = "gem-email-picker-confirm-actions";
    const confirmCancelBtn = document.createElement("button");
    confirmCancelBtn.id = "gem-email-picker-confirm-cancel";
    confirmCancelBtn.className = "gem-email-picker-confirm-btn";
    confirmCancelBtn.type = "button";
    confirmCancelBtn.textContent = "Cancel";
    const confirmOkBtn = document.createElement("button");
    confirmOkBtn.id = "gem-email-picker-confirm-ok";
    confirmOkBtn.className = "gem-email-picker-confirm-btn";
    confirmOkBtn.type = "button";
    confirmOkBtn.textContent = "Confirm";
    confirmActions.appendChild(confirmCancelBtn);
    confirmActions.appendChild(confirmOkBtn);
    confirmCard.appendChild(confirmTitle);
    confirmCard.appendChild(confirmBody);
    confirmCard.appendChild(confirmActions);
    confirmMask.appendChild(confirmCard);

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(errorEl);
    modal.appendChild(content);
    modal.appendChild(hint);
    modal.appendChild(confirmMask);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    const emailMemoryEntry = getCandidateEmailMemoryEntry(context);
    const hasEmailMemory = Boolean(emailMemoryEntry.entry);
    let step = "menu";
    let loading = !hasEmailMemory;
    let busy = false;
    let loadError = "";
    let selectedIndex = 0;
    let emails = hasEmailMemory ? normalizeCandidateEmailsForPicker(emailMemoryEntry.entry.emails) : [];
    let primaryEmail = hasEmailMemory
      ? normalizeEmailAddressForPicker(emailMemoryEntry.entry.primaryEmail || getPrimaryEmailForPicker(emailMemoryEntry.entry.emails))
      : "";
    let pendingAddEmail = "";
    let disposed = false;
    const addInput = document.createElement("input");
    addInput.id = "gem-email-picker-input";
    addInput.type = "text";
    addInput.autocomplete = "off";
    addInput.placeholder = "name@company.com";

    function cleanup() {
      if (disposed) {
        return;
      }
      disposed = true;
      overlay.remove();
    }

    function finish(result = null) {
      cleanup();
      resolve(result);
    }

    function setError(message) {
      errorEl.textContent = message || "";
    }

    function setHint(message) {
      hint.textContent = message || "";
    }

    function isConfirming() {
      return Boolean(pendingAddEmail);
    }

    function updateConfirmMask() {
      if (!pendingAddEmail) {
        confirmMask.classList.remove("visible");
        if (step === "add") {
          addInput.focus();
        } else {
          modal.focus();
        }
        return;
      }
      confirmBody.textContent = `Add "${pendingAddEmail}" and set it as the primary email?`;
      confirmMask.classList.add("visible");
      confirmOkBtn.focus();
    }

    function openAddConfirmation() {
      const emailAddress = normalizeEmailAddressForPicker(addInput.value || "");
      if (!isValidEmailAddressForPicker(emailAddress)) {
        setError("Enter a valid email address.");
        return;
      }
      setError("");
      pendingAddEmail = emailAddress;
      updateConfirmMask();
    }

    function closeAddConfirmation() {
      if (!pendingAddEmail) {
        return;
      }
      pendingAddEmail = "";
      updateConfirmMask();
    }

    function applyEmailData(data) {
      emails = normalizeCandidateEmailsForPicker(data?.emails);
      primaryEmail = normalizeEmailAddressForPicker(data?.primaryEmail || getPrimaryEmailForPicker(emails));
      if (!primaryEmail && emails.length > 0) {
        primaryEmail = emails[0].emailAddress;
      }
      setCandidateEmailMemoryEntry(context, {
        candidateId: String(data?.candidateId || ""),
        emails,
        primaryEmail
      });
      const primaryIndex = emails.findIndex((entry) => entry.isPrimary);
      selectedIndex = primaryIndex >= 0 ? primaryIndex : 0;
    }

    async function refreshEmails(options = {}) {
      const quiet = Boolean(options.quiet);
      if (!quiet) {
        loading = true;
        loadError = "";
        render();
      }
      try {
        const data = await warmCandidateEmailsForContext(context, runId, {
          preferCache: true,
          refreshInBackground: true,
          allowCreate: shouldAllowCandidateCreateForContext(context)
        });
        if (!data) {
          loading = false;
          render();
          return;
        }
        loading = false;
        applyEmailData(data);
      } catch (error) {
        loading = false;
        loadError = error.message || "Failed to load emails.";
        setError(loadError);
      }
      render();
    }

    async function copyEmailValue(value, options = {}) {
      const emailAddress = normalizeEmailAddressForPicker(value);
      if (!emailAddress) {
        setError("No email available to copy.");
        return false;
      }
      const copied = await copyTextToClipboard(emailAddress);
      if (!copied) {
        setError("Could not copy email.");
        return false;
      }
      showToast(`Copied email: ${emailAddress}`);
      setError("");
      await logEvent({
        source: "extension.content",
        event: "email_picker.copied",
        actionId: ACTIONS.MANAGE_EMAILS,
        runId,
        message: `Copied ${options.kind || "email"} ${emailAddress}.`,
        link: linkedinUrl,
        details: {
          kind: options.kind || "email",
          emailAddress
        }
      });
      return true;
    }

    async function copyPrimaryEmailAndClose() {
      if (loading) {
        setError("Still loading emails. Try again in a second.");
        return;
      }
      if (loadError) {
        setError(loadError);
        return;
      }
      const copied = await copyEmailValue(primaryEmail, { kind: "primary_email" });
      if (copied) {
        finish({
          type: "copy-primary",
          emailAddress: primaryEmail
        });
      }
    }

    async function confirmAddEmail() {
      if (!pendingAddEmail || busy) {
        return;
      }
      const emailAddress = pendingAddEmail;
      busy = true;
      try {
        const data = await addCandidateEmailForContext(context, emailAddress, runId);
        applyEmailData(data);
        showToast(`Added and set primary email: ${emailAddress}`);
        await logEvent({
          source: "extension.content",
          event: "email_picker.added",
          actionId: ACTIONS.MANAGE_EMAILS,
          runId,
          message: `Added email ${emailAddress} and set as primary.`,
          link: linkedinUrl,
          details: {
            emailAddress,
            emailCount: emails.length
          }
        });
        finish({
          type: "add-email",
          emailAddress
        });
      } catch (error) {
        setError(error.message || "Could not add email.");
      } finally {
        busy = false;
        pendingAddEmail = "";
        updateConfirmMask();
      }
    }

    function setPrimaryEmailByIndex(index) {
      if (busy || loading || loadError) {
        return Promise.resolve();
      }
      const selected = emails[index];
      if (!selected) {
        return Promise.resolve();
      }
      if (selected.isPrimary) {
        showToast(`Primary email already set: ${selected.emailAddress}`);
        finish({
          type: "set-primary-email",
          emailAddress: selected.emailAddress
        });
        return Promise.resolve();
      }
      const selectedEmail = selected.emailAddress;
      const previousEmails = emails.map((entry) => ({ ...entry }));
      const previousPrimaryEmail = primaryEmail;

      // Optimistic local update so the interaction feels instant.
      emails = emails.map((entry, entryIndex) => ({
        emailAddress: entry.emailAddress,
        isPrimary: entryIndex === index
      }));
      primaryEmail = selectedEmail;
      selectedIndex = index;
      setCandidateEmailMemoryEntry(context, {
        candidateId: "",
        emails,
        primaryEmail
      });
      showToast(`Set primary email: ${selectedEmail}`);
      finish({
        type: "set-primary-email",
        emailAddress: selectedEmail
      });

      setPrimaryCandidateEmailForContext(context, selectedEmail, runId)
        .then(async (data) => {
          setCandidateEmailMemoryEntry(context, {
            candidateId: String(data?.candidateId || ""),
            emails: data?.emails || [],
            primaryEmail: data?.primaryEmail || selectedEmail
          });
          await logEvent({
            source: "extension.content",
            event: "email_picker.primary_set",
            actionId: ACTIONS.MANAGE_EMAILS,
            runId,
            message: `Set primary email to ${selectedEmail}.`,
            link: linkedinUrl,
            details: {
              emailAddress: selectedEmail
            }
          });
        })
        .catch((error) => {
          setCandidateEmailMemoryEntry(context, {
            candidateId: "",
            emails: previousEmails,
            primaryEmail: previousPrimaryEmail
          });
          showToast(error.message || "Could not update primary email.", true);
        });

      return Promise.resolve();
    }

    async function copyEmailByQuickIndex(index) {
      if (loading || loadError) {
        return;
      }
      const selected = emails[index];
      if (!selected) {
        return;
      }
      selectedIndex = index;
      render();
      await copyEmailValue(selected.emailAddress, {
        kind: "email",
        index: index + 1
      });
    }

    function openAddStep() {
      step = "add";
      setError("");
      render();
    }

    function openListStep() {
      step = "list";
      const primaryIndex = emails.findIndex((entry) => entry.isPrimary);
      selectedIndex = primaryIndex >= 0 ? primaryIndex : 0;
      setError("");
      render();
      requestAnimationFrame(() => {
        modal.focus();
      });
    }

    function openMenuStep() {
      step = "menu";
      setError("");
      render();
      requestAnimationFrame(() => {
        modal.focus();
      });
    }

    function createMenuItem(shortcutLabel, label, meta, onClick) {
      const item = document.createElement("div");
      item.className = "gem-email-picker-item";
      const hotkey = document.createElement("div");
      hotkey.className = "gem-email-picker-hotkey";
      hotkey.textContent = String(shortcutLabel || "").toUpperCase();
      const value = document.createElement("div");
      value.className = "gem-email-picker-value";
      value.textContent = label;
      const details = document.createElement("div");
      details.className = "gem-email-picker-meta";
      details.textContent = meta || "";
      item.appendChild(hotkey);
      item.appendChild(value);
      item.appendChild(details);
      item.addEventListener("click", onClick);
      return item;
    }

    function renderMenuStep() {
      title.textContent = "Manage Emails";
      subtitle.textContent = primaryEmail
        ? `Current primary email: ${primaryEmail}`
        : "No primary email set yet for this candidate.";
      setHint("Press A to add email, S to copy primary email, D to view all emails. Esc to cancel.");

      content.innerHTML = "";
      content.appendChild(
        createMenuItem(EMAIL_MENU_ADD_KEY, "Add Email", "Add a new email and set as primary", () => {
          openAddStep();
        })
      );
      content.appendChild(
        createMenuItem(EMAIL_MENU_COPY_PRIMARY_KEY, "Copy Primary Email", "Copy current primary email", () => {
          copyPrimaryEmailAndClose().catch(() => {});
        })
      );
      content.appendChild(
        createMenuItem(EMAIL_MENU_VIEW_ALL_KEY, "View All Emails", "View, copy, and set primary email", () => {
          openListStep();
        })
      );
      const statusNode = document.createElement("div");
      statusNode.className = `gem-email-picker-status${loadError ? " error" : ""}`;
      if (loading) {
        statusNode.textContent = "Loading emails...";
      } else if (loadError) {
        statusNode.textContent = `Could not load emails: ${loadError}`;
      } else {
        statusNode.textContent = "";
      }
      content.appendChild(statusNode);
    }

    function renderAddStep() {
      title.textContent = "Add Email";
      subtitle.textContent = "Paste or type the email address, then press Enter.";
      setHint("Esc to go back. Enter opens confirmation.");
      content.innerHTML = "";
      content.appendChild(addInput);
      addInput.focus();
      addInput.select();
    }

    function renderListStep() {
      title.textContent = "All Emails";
      subtitle.textContent = "Press a number to copy an email. Arrow keys + Enter sets primary.";
      setHint("Esc to go back. Enter sets selected email as primary.");

      content.innerHTML = "";
      if (loading) {
        const loadingNode = document.createElement("div");
        loadingNode.className = "gem-email-picker-empty";
        loadingNode.textContent = "Loading emails...";
        content.appendChild(loadingNode);
        return;
      }
      if (loadError) {
        const errorNode = document.createElement("div");
        errorNode.className = "gem-email-picker-empty";
        errorNode.textContent = `Could not load emails: ${loadError}`;
        content.appendChild(errorNode);
        return;
      }
      if (emails.length === 0) {
        const emptyNode = document.createElement("div");
        emptyNode.className = "gem-email-picker-empty";
        emptyNode.textContent = "No emails stored for this candidate yet.";
        content.appendChild(emptyNode);
        return;
      }

      emails.forEach((entry, index) => {
        const item = document.createElement("div");
        const isActive = index === selectedIndex;
        item.className = `gem-email-picker-item${isActive ? " active" : ""}${entry.isPrimary ? " primary" : ""}`;

        const hotkey = document.createElement("div");
        hotkey.className = "gem-email-picker-hotkey";
        hotkey.textContent = String(index + 1);

        const value = document.createElement("div");
        value.className = "gem-email-picker-value";
        value.textContent = entry.emailAddress;

        item.appendChild(hotkey);
        item.appendChild(value);

        if (entry.isPrimary) {
          const badge = document.createElement("span");
          badge.className = "gem-email-picker-primary-badge";
          badge.textContent = "Primary";
          item.appendChild(badge);
        }

        item.addEventListener("mouseenter", () => {
          if (selectedIndex === index) {
            return;
          }
          selectedIndex = index;
          render();
        });
        item.addEventListener("click", () => {
          selectedIndex = index;
          render();
        });
        item.addEventListener("dblclick", () => {
          selectedIndex = index;
          setPrimaryEmailByIndex(index).catch(() => {});
        });
        content.appendChild(item);
      });
    }

    function render() {
      if (disposed) {
        return;
      }
      if (step === "menu") {
        renderMenuStep();
        return;
      }
      if (step === "add") {
        renderAddStep();
        return;
      }
      renderListStep();
    }

    function getQuickSelectIndex(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return -1;
      }
      const code = String(event?.code || "");
      let rawDigit = "";
      if (/^Digit[0-9]$/.test(code)) {
        rawDigit = code.slice(5);
      } else if (/^Numpad[0-9]$/.test(code)) {
        rawDigit = code.slice(6);
      } else if (/^[0-9]$/.test(String(event?.key || "")) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        rawDigit = String(event.key);
      } else {
        return -1;
      }
      const value = rawDigit === "0" ? 10 : Number(rawDigit);
      if (!Number.isFinite(value) || value <= 0) {
        return -1;
      }
      return value - 1;
    }

    function cancelPicker(message) {
      logEvent({
        source: "extension.content",
        level: "warn",
        event: "email_picker.cancelled",
        actionId: ACTIONS.MANAGE_EMAILS,
        runId,
        message,
        link: linkedinUrl
      });
      finish(null);
    }

    overlay.addEventListener(
      "keydown",
      (event) => {
        if (isConfirming()) {
          if (event.key === "Enter") {
            event.preventDefault();
            confirmAddEmail().catch(() => {});
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeAddConfirmation();
            return;
          }
        }

        if (step === "add") {
          if ((event.metaKey || event.ctrlKey) && String(event.key || "").toLowerCase() === "v") {
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            openAddConfirmation();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            openMenuStep();
          }
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          if (step === "list") {
            openMenuStep();
            return;
          }
          cancelPicker("Email picker cancelled.");
          return;
        }

        if (step === "menu") {
          if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
          }
          const key = String(event.key || "").toLowerCase();
          if (key === EMAIL_MENU_ADD_KEY) {
            event.preventDefault();
            openAddStep();
            return;
          }
          if (key === EMAIL_MENU_COPY_PRIMARY_KEY) {
            event.preventDefault();
            copyPrimaryEmailAndClose().catch(() => {});
            return;
          }
          if (key === EMAIL_MENU_VIEW_ALL_KEY) {
            event.preventDefault();
            openListStep();
          }
          return;
        }

        if (loading || loadError || emails.length === 0) {
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          selectedIndex = (selectedIndex + 1) % emails.length;
          render();
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          selectedIndex = (selectedIndex - 1 + emails.length) % emails.length;
          render();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          setPrimaryEmailByIndex(selectedIndex).catch(() => {});
          return;
        }
        const quickIndex = getQuickSelectIndex(event);
        if (quickIndex >= 0) {
          event.preventDefault();
          copyEmailByQuickIndex(quickIndex).catch(() => {});
        }
      },
      true
    );

    confirmOkBtn.addEventListener("click", () => {
      confirmAddEmail().catch(() => {});
    });
    confirmCancelBtn.addEventListener("click", () => {
      closeAddConfirmation();
    });
    confirmMask.addEventListener("click", (event) => {
      if (event.target === confirmMask) {
        closeAddConfirmation();
      }
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        cancelPicker("Email picker cancelled by outside click.");
      }
    });

    modal.tabIndex = -1;
    modal.focus();
    render();
    refreshEmails({ quiet: hasEmailMemory }).catch(() => {});

    logEvent({
      source: "extension.content",
      event: "email_picker.opened",
      actionId: ACTIONS.MANAGE_EMAILS,
      runId,
      message: "Email picker opened.",
      link: linkedinUrl
    });
  });
}

async function showSequencePicker(runId, linkedinUrl, options = {}) {
  createSequencePickerStyles();
  const actionId = options.actionId || ACTIONS.SEND_SEQUENCE;
  const titleText = String(options.title || "Open Sequence");
  const subtitleText = String(
    options.subtitle || "Press a letter to pick a sequence. Use Enter to open it in Gem."
  );
  const hintText = String(options.hint || "Esc to cancel. Arrow keys + Enter also work.");

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-sequence-picker-overlay";

    const modal = document.createElement("div");
    modal.id = "gem-sequence-picker-modal";

    const title = document.createElement("div");
    title.id = "gem-sequence-picker-title";
    title.textContent = titleText;

    const subtitle = document.createElement("div");
    subtitle.id = "gem-sequence-picker-subtitle";
    subtitle.textContent = subtitleText;

    const results = document.createElement("div");
    results.id = "gem-sequence-picker-results";

    const pageInfo = document.createElement("div");
    pageInfo.id = "gem-sequence-picker-page";

    const hint = document.createElement("div");
    hint.className = "gem-sequence-picker-hint";
    hint.textContent = hintText;

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(results);
    modal.appendChild(pageInfo);
    modal.appendChild(hint);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    let loading = true;
    let loadError = "";
    let allSequences = [];
    let pageSequences = [];
    let selectedIndex = 0;
    let currentPage = 0;
    let active = true;
    const startedAt = Date.now();
    let cachedSignature = "";
    let hasAppliedForceRefresh = false;

    function getSequenceSignature(sequences) {
      const normalized = Array.isArray(sequences) ? sequences : [];
      if (normalized.length === 0) {
        return "0";
      }
      const ids = normalized
        .map((sequence) => String(sequence?.id || ""))
        .filter(Boolean)
        .sort();
      return `${normalized.length}:${ids.join("|")}`;
    }

    function cleanup() {
      active = false;
      overlay.remove();
    }

    function finish(selection) {
      cleanup();
      resolve(selection || null);
    }

    function updatePageSequences() {
      const start = currentPage * SEQUENCE_PICKER_KEYS_PER_PAGE;
      pageSequences = allSequences.slice(start, start + SEQUENCE_PICKER_KEYS_PER_PAGE);
      if (selectedIndex >= pageSequences.length) {
        selectedIndex = Math.max(0, pageSequences.length - 1);
      }
      if (selectedIndex < 0) {
        selectedIndex = 0;
      }
    }

    function selectSequence(sequence) {
      if (!sequence) {
        return;
      }
      logEvent({
        source: "extension.content",
        event: "sequence_picker.selected",
        actionId,
        runId,
        message: `Selected sequence ${sequence.name || sequence.id}.`,
        link: linkedinUrl,
        details: {
          sequenceId: sequence.id || "",
          sequenceName: sequence.name || ""
        }
      });
      finish({
        id: sequence.id || "",
        name: sequence.name || ""
      });
    }

    function renderSequences() {
      updatePageSequences();
      results.innerHTML = "";
      if (loading) {
        const loadingNode = document.createElement("div");
        loadingNode.className = "gem-sequence-picker-empty";
        loadingNode.textContent = "Loading sequences...";
        results.appendChild(loadingNode);
        pageInfo.textContent = "";
        return;
      }
      if (loadError) {
        const errorNode = document.createElement("div");
        errorNode.className = "gem-sequence-picker-empty";
        errorNode.textContent = `Could not load sequences: ${loadError}`;
        results.appendChild(errorNode);
        pageInfo.textContent = "";
        return;
      }
      if (allSequences.length === 0) {
        const empty = document.createElement("div");
        empty.className = "gem-sequence-picker-empty";
        empty.textContent = "No sequences found.";
        results.appendChild(empty);
        pageInfo.textContent = "";
        return;
      }

      pageSequences.forEach((sequence, index) => {
        const item = document.createElement("div");
        item.className = `gem-sequence-picker-item${index === selectedIndex ? " active" : ""}`;

        const hotkey = document.createElement("div");
        hotkey.className = "gem-sequence-picker-hotkey";
        hotkey.textContent = SEQUENCE_PICKER_SHORTCUT_KEYS[index] || "";

        const name = document.createElement("div");
        name.className = "gem-sequence-picker-name";
        name.textContent = sequence.name || sequence.id || "";

        const meta = document.createElement("div");
        meta.className = "gem-sequence-picker-meta";
        meta.textContent = formatSequenceDate(sequence.createdAt);

        item.appendChild(hotkey);
        item.appendChild(name);
        item.appendChild(meta);
        item.addEventListener("mouseenter", () => {
          if (selectedIndex === index) {
            return;
          }
          selectedIndex = index;
          renderSequences();
        });
        item.addEventListener("click", () => selectSequence(sequence));
        results.appendChild(item);
      });

      const totalPages = Math.max(1, Math.ceil(allSequences.length / SEQUENCE_PICKER_KEYS_PER_PAGE));
      if (totalPages > 1) {
        pageInfo.textContent = `Page ${currentPage + 1}/${totalPages}. Press [ / ] to change page.`;
      } else {
        pageInfo.textContent = "";
      }
    }

    function cancel(reason) {
      logEvent({
        source: "extension.content",
        level: "warn",
        event: "sequence_picker.cancelled",
        actionId,
        runId,
        message: reason,
        link: linkedinUrl
      });
      finish(null);
    }

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        cancel("Sequence picker cancelled by outside click.");
      }
    });

    overlay.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel("Sequence picker cancelled.");
          return;
        }
        if (loading || loadError || pageSequences.length === 0) {
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          selectedIndex = (selectedIndex + 1) % pageSequences.length;
          renderSequences();
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          selectedIndex = (selectedIndex - 1 + pageSequences.length) % pageSequences.length;
          renderSequences();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          selectSequence(pageSequences[selectedIndex]);
          return;
        }
        const totalPages = Math.max(1, Math.ceil(allSequences.length / SEQUENCE_PICKER_KEYS_PER_PAGE));
        if (event.key === "]" && totalPages > 1) {
          event.preventDefault();
          currentPage = (currentPage + 1) % totalPages;
          selectedIndex = 0;
          renderSequences();
          return;
        }
        if (event.key === "[" && totalPages > 1) {
          event.preventDefault();
          currentPage = (currentPage - 1 + totalPages) % totalPages;
          selectedIndex = 0;
          renderSequences();
          return;
        }

        if (event.key.length === 1) {
          const exactIndex = SEQUENCE_PICKER_SHORTCUT_KEYS.indexOf(event.key.toLowerCase());
          if (Number.isFinite(exactIndex) && exactIndex >= 0 && exactIndex < pageSequences.length) {
            event.preventDefault();
            selectSequence(pageSequences[exactIndex]);
          }
        }
      },
      true
    );

    modal.tabIndex = -1;
    modal.focus();
    renderSequences();

    logEvent({
      source: "extension.content",
      event: "sequence_picker.opened",
      actionId,
      runId,
      message: "Sequence picker opened.",
      link: linkedinUrl
    });

    listSequences("", runId, actionId, { preferCache: true })
      .then(async (sequences) => {
        if (!active) {
          return;
        }
        cachedSignature = getSequenceSignature(sequences);
        if (sequences.length > 0 && !hasAppliedForceRefresh) {
          allSequences = sequences;
          loading = false;
          loadError = "";
          renderSequences();
        }
        await logEvent({
          source: "extension.content",
          event: "sequence_picker.cache_loaded",
          actionId,
          runId,
          message: `Loaded ${sequences.length} cached sequences for picker.`,
          link: linkedinUrl
        });
      })
      .catch(async (_error) => {
        if (!active) {
          return;
        }
        await logEvent({
          source: "extension.content",
          level: "warn",
          event: "sequence_picker.cache_load_failed",
          actionId,
          runId,
          message: "Could not load cached sequences for picker.",
          link: linkedinUrl
        });
      });

    function runForceRefresh(isRetry = false) {
      return listSequences("", runId, actionId, { forceRefresh: true, forceNewRefresh: true })
        .then(async (sequences) => {
          if (!active) {
            return;
          }
          const refreshedSignature = getSequenceSignature(sequences);
          hasAppliedForceRefresh = true;
          allSequences = sequences;
          loading = false;
          loadError = "";
          renderSequences();
          await logEvent({
            source: "extension.content",
            event: isRetry ? "sequence_picker.retry_loaded" : "sequence_picker.loaded",
            actionId,
            runId,
            message: `Sequence picker ${isRetry ? "retry " : ""}loaded ${allSequences.length} sequences.`,
            link: linkedinUrl,
            details: {
              durationMs: Date.now() - startedAt
            }
          });

          if (!isRetry && active && cachedSignature && refreshedSignature === cachedSignature) {
            setTimeout(() => {
              if (!active) {
                return;
              }
              runForceRefresh(true).catch(() => {});
            }, 900);
          }
        })
        .catch(async (error) => {
          if (!active) {
            return;
          }
          const message = error.message || "Failed to refresh sequence list.";
          const usedCachedSequences = allSequences.length > 0;
          if (!usedCachedSequences) {
            loading = false;
            loadError = message;
            renderSequences();
            showToast(message, true);
          }
          await logEvent({
            source: "extension.content",
            level: usedCachedSequences ? "warn" : "error",
            event: isRetry ? "sequence_picker.retry_failed" : "sequence_picker.load_failed",
            actionId,
            runId,
            message,
            link: linkedinUrl,
            details: {
              durationMs: Date.now() - startedAt,
              usedCachedSequences
            }
          });
        });
    }

    runForceRefresh(false).catch(() => {});
  });
}

function getBackgroundOpenFromEvent(event) {
  if (!event) {
    return false;
  }
  return Boolean(event.metaKey || event.ctrlKey);
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

function buildGemSequenceCreateUrl() {
  return "https://www.gem.com/sequences";
}

function normalizeGemProjectPrivacyType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "confidential" || normalized === "personal" || normalized === "shared") {
    return normalized;
  }
  return "shared";
}

async function showGemActionsMenu(runId) {
  createGemActionsStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-actions-overlay";
    const modal = document.createElement("div");
    modal.id = "gem-actions-modal";

    const title = document.createElement("div");
    title.id = "gem-actions-title";
    title.textContent = "Gem actions";

    const subtitle = document.createElement("div");
    subtitle.id = "gem-actions-subtitle";
    subtitle.textContent = "Press C, P, S, or K to choose the next action.";

    const list = document.createElement("div");
    list.id = "gem-actions-list";

    const hint = document.createElement("div");
    hint.className = "gem-actions-hint";
    hint.textContent = "Esc to cancel. Arrow keys + Enter also work.";

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(list);
    modal.appendChild(hint);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    let selectedIndex = 0;

    function cleanup() {
      overlay.remove();
    }

    function finish(value) {
      cleanup();
      resolve(value || "");
    }

    function selectByOption(option) {
      if (!option) {
        return;
      }
      finish(option.id);
    }

    function render() {
      list.innerHTML = "";
      GEM_ACTION_MENU_OPTIONS.forEach((option, index) => {
        const item = document.createElement("div");
        item.className = `gem-actions-item${selectedIndex === index ? " active" : ""}`;

        const hotkey = document.createElement("div");
        hotkey.className = "gem-actions-hotkey";
        hotkey.textContent = option.key;

        const main = document.createElement("div");
        main.className = "gem-actions-main";
        main.textContent = option.title;

        const meta = document.createElement("div");
        meta.className = "gem-actions-meta";
        meta.textContent = option.subtitle;

        item.appendChild(hotkey);
        item.appendChild(main);
        item.appendChild(meta);
        item.addEventListener("mouseenter", () => {
          if (selectedIndex === index) {
            return;
          }
          selectedIndex = index;
          render();
        });
        item.addEventListener("click", () => selectByOption(option));
        list.appendChild(item);
      });
    }

    overlay.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish("");
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          selectedIndex = (selectedIndex + 1) % GEM_ACTION_MENU_OPTIONS.length;
          render();
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          selectedIndex = (selectedIndex - 1 + GEM_ACTION_MENU_OPTIONS.length) % GEM_ACTION_MENU_OPTIONS.length;
          render();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          selectByOption(GEM_ACTION_MENU_OPTIONS[selectedIndex] || null);
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        const key = String(event.key || "").trim().toLowerCase();
        const matchIndex = GEM_ACTION_MENU_OPTIONS.findIndex((option) => option.key === key);
        if (matchIndex >= 0) {
          event.preventDefault();
          selectedIndex = matchIndex;
          render();
          selectByOption(GEM_ACTION_MENU_OPTIONS[matchIndex]);
        }
      },
      true
    );

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        finish("");
      }
    });

    render();
    modal.tabIndex = -1;
    modal.focus();

    logEvent({
      source: "extension.content",
      event: "gem_actions.menu.opened",
      actionId: ACTIONS.GEM_ACTIONS,
      runId,
      message: "Gem actions menu opened.",
      link: window.location.href
    });
  });
}

async function showGemActionConfirmationDialog(titleText, bodyText) {
  createGemActionsStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-actions-overlay";
    const modal = document.createElement("div");
    modal.id = "gem-actions-modal";
    const title = document.createElement("div");
    title.id = "gem-actions-title";
    title.textContent = titleText;
    const subtitle = document.createElement("div");
    subtitle.id = "gem-actions-subtitle";
    subtitle.textContent = "Press Enter to confirm or Esc to cancel.";
    const confirmCard = document.createElement("div");
    confirmCard.id = "gem-actions-confirm-card";
    const confirmTitle = document.createElement("div");
    confirmTitle.id = "gem-actions-confirm-title";
    confirmTitle.textContent = titleText;
    const confirmBody = document.createElement("div");
    confirmBody.id = "gem-actions-confirm-body";
    confirmBody.textContent = bodyText;
    const confirmActions = document.createElement("div");
    confirmActions.id = "gem-actions-confirm-actions";
    const cancelButton = document.createElement("button");
    cancelButton.id = "gem-actions-confirm-cancel";
    cancelButton.className = "gem-actions-confirm-btn";
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    const confirmButton = document.createElement("button");
    confirmButton.id = "gem-actions-confirm-ok";
    confirmButton.className = "gem-actions-confirm-btn";
    confirmButton.type = "button";
    confirmButton.textContent = "Confirm";

    confirmActions.appendChild(cancelButton);
    confirmActions.appendChild(confirmButton);
    confirmCard.appendChild(confirmTitle);
    confirmCard.appendChild(confirmBody);
    confirmCard.appendChild(confirmActions);
    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(confirmCard);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    function cleanup() {
      overlay.remove();
    }

    function finish(confirmed) {
      cleanup();
      resolve(Boolean(confirmed));
    }

    overlay.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      },
      true
    );

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        finish(false);
      }
    });
    confirmButton.addEventListener("click", () => finish(true));
    cancelButton.addEventListener("click", () => finish(false));
    confirmButton.focus();
  });
}

async function showGemProjectCreateForm(runId, options = {}) {
  createGemActionsStyles();
  const initialName = String(options.initialName || "").trim();
  const initialDescription = String(options.initialDescription || "").trim();
  const initialPrivacyType = normalizeGemProjectPrivacyType(options.initialPrivacyType || "shared");
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-actions-overlay";
    const modal = document.createElement("div");
    modal.id = "gem-actions-modal";

    const title = document.createElement("div");
    title.id = "gem-actions-title";
    title.textContent = "Create project";

    const subtitle = document.createElement("div");
    subtitle.id = "gem-actions-subtitle";
    subtitle.textContent = "Enter project details, then press Enter to confirm creation.";

    const nameLabel = document.createElement("label");
    nameLabel.className = "gem-actions-access-label";
    nameLabel.setAttribute("for", "gem-actions-project-name");
    nameLabel.textContent = "Project name *";

    const nameInput = document.createElement("input");
    nameInput.id = "gem-actions-project-name";
    nameInput.type = "text";
    nameInput.placeholder = "Project name";
    nameInput.autocomplete = "off";
    nameInput.value = initialName;

    const descriptionLabel = document.createElement("label");
    descriptionLabel.className = "gem-actions-access-label";
    descriptionLabel.setAttribute("for", "gem-actions-project-description");
    descriptionLabel.textContent = "Description";

    const descriptionInput = document.createElement("textarea");
    descriptionInput.id = "gem-actions-project-description";
    descriptionInput.placeholder = "Description";
    descriptionInput.value = initialDescription;

    const accessLabel = document.createElement("div");
    accessLabel.className = "gem-actions-access-label";
    accessLabel.textContent = "Access";

    const accessList = document.createElement("div");
    accessList.id = "gem-actions-access-list";

    const status = document.createElement("div");
    status.className = "gem-actions-status";

    const hint = document.createElement("div");
    hint.className = "gem-actions-hint";
    hint.textContent = "Tab through fields. A/S/D switches access. Enter opens confirmation. Esc cancels.";

    const confirmMask = document.createElement("div");
    confirmMask.id = "gem-actions-confirm-mask";
    const confirmCard = document.createElement("div");
    confirmCard.id = "gem-actions-confirm-card";
    const confirmTitle = document.createElement("div");
    confirmTitle.id = "gem-actions-confirm-title";
    confirmTitle.textContent = "Confirm project creation";
    const confirmBody = document.createElement("div");
    confirmBody.id = "gem-actions-confirm-body";
    const confirmActions = document.createElement("div");
    confirmActions.id = "gem-actions-confirm-actions";
    const confirmCancel = document.createElement("button");
    confirmCancel.id = "gem-actions-confirm-cancel";
    confirmCancel.className = "gem-actions-confirm-btn";
    confirmCancel.type = "button";
    confirmCancel.textContent = "Cancel";
    const confirmOk = document.createElement("button");
    confirmOk.id = "gem-actions-confirm-ok";
    confirmOk.className = "gem-actions-confirm-btn";
    confirmOk.type = "button";
    confirmOk.textContent = "Create project";
    confirmActions.appendChild(confirmCancel);
    confirmActions.appendChild(confirmOk);
    confirmCard.appendChild(confirmTitle);
    confirmCard.appendChild(confirmBody);
    confirmCard.appendChild(confirmActions);
    confirmMask.appendChild(confirmCard);

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(nameLabel);
    modal.appendChild(nameInput);
    modal.appendChild(descriptionLabel);
    modal.appendChild(descriptionInput);
    modal.appendChild(accessLabel);
    modal.appendChild(accessList);
    modal.appendChild(status);
    modal.appendChild(hint);
    modal.appendChild(confirmMask);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    let disposed = false;
    let selectedAccessIndex = Math.max(
      0,
      GEM_ACTION_ACCESS_OPTIONS.findIndex((option) => option.value === initialPrivacyType)
    );
    let confirmVisible = false;
    let creating = false;

    function setStatus(text, isError = false) {
      status.textContent = String(text || "");
      status.className = `gem-actions-status${isError ? " error" : ""}`;
    }

    function getSelectedAccess() {
      return GEM_ACTION_ACCESS_OPTIONS[selectedAccessIndex] || GEM_ACTION_ACCESS_OPTIONS[0];
    }

    function cleanup() {
      disposed = true;
      overlay.remove();
    }

    function finish(result) {
      cleanup();
      resolve(result || null);
    }

    function renderAccessList() {
      accessList.innerHTML = "";
      GEM_ACTION_ACCESS_OPTIONS.forEach((option, index) => {
        const item = document.createElement("div");
        const selected = selectedAccessIndex === index;
        item.className = `gem-actions-access-item${selected ? " selected active" : ""}`;
        item.tabIndex = 0;
        item.setAttribute("role", "radio");
        item.setAttribute("aria-checked", selected ? "true" : "false");

        const dot = document.createElement("div");
        dot.className = "gem-actions-access-dot";
        const content = document.createElement("div");
        content.className = "gem-actions-access-content";
        const optionName = document.createElement("div");
        optionName.className = "gem-actions-access-name";
        optionName.textContent = option.label;
        const optionDescription = document.createElement("div");
        optionDescription.className = "gem-actions-access-description";
        optionDescription.textContent = option.description;
        content.appendChild(optionName);
        content.appendChild(optionDescription);
        const hotkey = document.createElement("div");
        hotkey.className = "gem-actions-access-key";
        hotkey.textContent = option.key;

        item.appendChild(dot);
        item.appendChild(content);
        item.appendChild(hotkey);
        item.addEventListener("click", () => {
          selectedAccessIndex = index;
          renderAccessList();
          item.focus({ preventScroll: true });
        });
        item.addEventListener("focus", () => {
          selectedAccessIndex = index;
          renderAccessList();
        });
        item.addEventListener("keydown", (event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            selectedAccessIndex = (selectedAccessIndex + 1) % GEM_ACTION_ACCESS_OPTIONS.length;
            renderAccessList();
            const next = accessList.querySelectorAll(".gem-actions-access-item")[selectedAccessIndex];
            next?.focus();
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            selectedAccessIndex =
              (selectedAccessIndex - 1 + GEM_ACTION_ACCESS_OPTIONS.length) % GEM_ACTION_ACCESS_OPTIONS.length;
            renderAccessList();
            const next = accessList.querySelectorAll(".gem-actions-access-item")[selectedAccessIndex];
            next?.focus();
          }
        });
        accessList.appendChild(item);
      });
    }

    function updateConfirmation() {
      if (!confirmVisible) {
        confirmMask.classList.remove("visible");
        return;
      }
      const projectName = String(nameInput.value || "").trim();
      const projectDescription = String(descriptionInput.value || "").trim();
      const access = getSelectedAccess();
      confirmBody.textContent =
        `Create project "${projectName}"?\n` +
        `Access: ${access.label}\n` +
        `Description: ${projectDescription || "(none)"}`;
      confirmMask.classList.add("visible");
      confirmOk.focus();
    }

    function openConfirmation() {
      if (creating) {
        return;
      }
      const projectName = String(nameInput.value || "").trim();
      if (!projectName) {
        setStatus("Project name is required.", true);
        nameInput.focus();
        return;
      }
      setStatus("");
      confirmVisible = true;
      updateConfirmation();
    }

    function closeConfirmation() {
      if (!confirmVisible || creating) {
        return;
      }
      confirmVisible = false;
      updateConfirmation();
      nameInput.focus();
    }

    function isEditableTarget(node) {
      if (!node || typeof node !== "object") {
        return false;
      }
      const tagName = String(node.tagName || "").toLowerCase();
      if (node.isContentEditable) {
        return true;
      }
      if (tagName === "textarea") {
        return true;
      }
      if (tagName !== "input") {
        return false;
      }
      const type = String(node.type || "").toLowerCase();
      return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(type);
    }

    async function confirmCreation() {
      if (creating) {
        return;
      }
      const projectName = String(nameInput.value || "").trim();
      if (!projectName) {
        setStatus("Project name is required.", true);
        confirmVisible = false;
        updateConfirmation();
        nameInput.focus();
        return;
      }
      creating = true;
      setStatus("Creating project...");
      confirmOk.disabled = true;
      confirmCancel.disabled = true;
      try {
        const access = getSelectedAccess();
        const createResult = await createGemProject(projectName, descriptionInput.value || "", access.value, runId);
        const project = createResult?.project || {};
        const projectUrl = String(project.url || buildGemProjectUrl(project.id, project.name || projectName) || "").trim();
        if (!projectUrl) {
          throw new Error("Gem did not return a project URL.");
        }
        await openGemNavigation(projectUrl, runId, {
          actionId: ACTIONS.GEM_ACTIONS,
          openInBackground: false
        });
        showToast(createResult?.message || "Created project.");
        await logEvent({
          source: "extension.content",
          event: "gem_actions.project.created",
          actionId: ACTIONS.GEM_ACTIONS,
          runId,
          message: createResult?.message || "Created Gem project.",
          link: projectUrl,
          details: {
            projectId: String(project.id || ""),
            projectName: String(project.name || projectName),
            privacyType: access.value
          }
        });
        finish({
          project
        });
      } catch (error) {
        setStatus(error.message || "Could not create project.", true);
        showToast(error.message || "Could not create project.", true);
        creating = false;
        confirmOk.disabled = false;
        confirmCancel.disabled = false;
        confirmVisible = false;
        updateConfirmation();
      }
    }

    overlay.addEventListener(
      "keydown",
      (event) => {
        if (confirmVisible) {
          if (event.key === "Enter") {
            event.preventDefault();
            confirmCreation();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeConfirmation();
            return;
          }
        }

        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        const isTextEntryTarget = isEditableTarget(event.target);
        const key = String(event.key || "").trim().toLowerCase();
        const accessIndex = GEM_ACTION_ACCESS_OPTIONS.findIndex((option) => option.key === key);
        if (accessIndex >= 0) {
          if (isTextEntryTarget) {
            return;
          }
          event.preventDefault();
          selectedAccessIndex = accessIndex;
          renderAccessList();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          openConfirmation();
        }
      },
      true
    );

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay && !confirmVisible && !creating) {
        finish(null);
      }
    });
    confirmOk.addEventListener("click", () => {
      confirmCreation();
    });
    confirmCancel.addEventListener("click", () => {
      closeConfirmation();
    });
    confirmMask.addEventListener("click", (event) => {
      if (event.target === confirmMask) {
        closeConfirmation();
      }
    });

    renderAccessList();
    nameInput.focus();
    if (nameInput.value) {
      nameInput.select();
    }

    logEvent({
      source: "extension.content",
      event: "gem_actions.project_create.opened",
      actionId: ACTIONS.GEM_ACTIONS,
      runId,
      message: "Gem project creation form opened.",
      link: window.location.href
    });
  });
}

async function showGemProjectNavigator(runId) {
  createGemActionsStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-actions-overlay";
    const modal = document.createElement("div");
    modal.id = "gem-actions-modal";

    const title = document.createElement("div");
    title.id = "gem-actions-title";
    title.textContent = "Search project + open";
    const subtitle = document.createElement("div");
    subtitle.id = "gem-actions-subtitle";
    subtitle.textContent = "Type project name, use arrows to choose, press Enter to open.";

    const input = document.createElement("input");
    input.id = "gem-actions-input";
    input.type = "text";
    input.placeholder = "Search projects by name...";
    input.autocomplete = "off";

    const list = document.createElement("div");
    list.id = "gem-actions-list";
    const hint = document.createElement("div");
    hint.className = "gem-actions-hint";
    hint.textContent = "Esc to cancel. Cmd+Enter / Cmd+click opens in background tab.";

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(input);
    modal.appendChild(list);
    modal.appendChild(hint);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    const projectMemory = getProjectMemoryEntry();
    const hasProjectMemory = Boolean(projectMemory.entry);
    let loading = !hasProjectMemory;
    let loadError = "";
    let allProjects = hasProjectMemory ? normalizeProjectsForPicker(projectMemory.entry.projects) : [];
    let selectedIndex = 0;
    let visibleRows = [];
    let active = true;
    const startedAt = Date.now();
    let cachedSignature = "";
    let hasAppliedForceRefresh = false;

    function getProjectSignature(projects) {
      const normalized = Array.isArray(projects) ? projects : [];
      if (normalized.length === 0) {
        return "0";
      }
      const ids = normalized
        .map((project) => String(project?.id || ""))
        .filter(Boolean)
        .sort();
      return `${normalized.length}:${ids.join("|")}`;
    }

    function cleanup() {
      active = false;
      overlay.remove();
    }

    function finish(result) {
      cleanup();
      resolve(result || null);
    }

    function buildVisibleRows() {
      const filteredProjects = filterProjectsByQuery(allProjects, input.value || "");
      if (filteredProjects.length > 0) {
        return filteredProjects.map((project) => ({
          kind: "project",
          project,
          id: String(project.id || ""),
          title: String(project.name || project.id || ""),
          subtitle: "Open project in Gem"
        }));
      }
      const query = String(input.value || "").trim();
      if (!query) {
        return [];
      }
      return [
        {
          kind: "create",
          id: "__create__",
          title: `Create a new project: ${query}`,
          subtitle: "Open create project form with this name prefilled",
          createName: query
        }
      ];
    }

    function renderList() {
      visibleRows = buildVisibleRows();
      if (selectedIndex >= visibleRows.length) {
        selectedIndex = Math.max(0, visibleRows.length - 1);
      }
      if (selectedIndex < 0) {
        selectedIndex = 0;
      }

      list.innerHTML = "";
      if (loading) {
        const loadingNode = document.createElement("div");
        loadingNode.className = "gem-actions-empty";
        loadingNode.textContent = "Loading projects...";
        list.appendChild(loadingNode);
        return;
      }
      if (loadError) {
        const errorNode = document.createElement("div");
        errorNode.className = "gem-actions-empty";
        errorNode.textContent = `Could not load projects: ${loadError}`;
        list.appendChild(errorNode);
        return;
      }
      if (visibleRows.length === 0) {
        const empty = document.createElement("div");
        empty.className = "gem-actions-empty";
        empty.textContent = "No matching projects.";
        list.appendChild(empty);
        return;
      }

      visibleRows.forEach((row, index) => {
        const item = document.createElement("div");
        item.className = `gem-actions-item${index === selectedIndex ? " active" : ""}`;
        const main = document.createElement("div");
        main.className = "gem-actions-main";
        main.textContent = row.title || "";
        const meta = document.createElement("div");
        meta.className = "gem-actions-meta";
        meta.textContent = row.subtitle || "";
        item.appendChild(main);
        item.appendChild(meta);
        item.addEventListener("mouseenter", () => {
          if (selectedIndex === index) {
            return;
          }
          selectedIndex = index;
          renderList();
        });
        item.addEventListener("click", (event) => {
          const openInBackground = row.kind === "project" ? getBackgroundOpenFromEvent(event) : false;
          finish({
            ...row,
            openInBackground
          });
        });
        list.appendChild(item);
      });
    }

    input.addEventListener("input", () => {
      selectedIndex = 0;
      renderList();
    });

    overlay.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
          return;
        }
        if (loading) {
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (visibleRows.length > 0) {
            selectedIndex = (selectedIndex + 1) % visibleRows.length;
            renderList();
          }
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (visibleRows.length > 0) {
            selectedIndex = (selectedIndex - 1 + visibleRows.length) % visibleRows.length;
            renderList();
          }
          return;
        }
        if (event.key === "Enter") {
          if (visibleRows.length === 0) {
            return;
          }
          event.preventDefault();
          const row = visibleRows[selectedIndex] || null;
          if (!row) {
            return;
          }
          finish({
            ...row,
            openInBackground: row.kind === "project" ? getBackgroundOpenFromEvent(event) : false
          });
          return;
        }
      },
      true
    );

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        finish(null);
      }
    });

    renderList();
    input.focus();

    logEvent({
      source: "extension.content",
      event: "gem_actions.project_search.opened",
      actionId: ACTIONS.GEM_ACTIONS,
      runId,
      message: "Gem project search opened.",
      link: window.location.href
    });

    if (!hasProjectMemory) {
      listProjects("", runId, { preferCache: true })
        .then(async (projects) => {
          if (!active) {
            return;
          }
          const cached = projects.filter((project) => !project.archived);
          cachedSignature = getProjectSignature(cached);
          if (cached.length > 0 && !hasAppliedForceRefresh) {
            allProjects = cached;
            loading = false;
            loadError = "";
            renderList();
          }
          await logEvent({
            source: "extension.content",
            event: "gem_actions.project_search.cache_loaded",
            actionId: ACTIONS.GEM_ACTIONS,
            runId,
            message: `Loaded ${cached.length} cached projects for navigation.`,
            link: window.location.href
          });
        })
        .catch(() => {});
    } else {
      cachedSignature = getProjectSignature(allProjects.filter((project) => !project.archived));
    }

    function runForceRefresh(isRetry = false) {
      return listProjects("", runId, { forceRefresh: true, forceNewRefresh: true })
        .then(async (projects) => {
          if (!active) {
            return;
          }
          const refreshed = projects.filter((project) => !project.archived);
          const refreshedSignature = getProjectSignature(refreshed);
          hasAppliedForceRefresh = true;
          allProjects = refreshed;
          loading = false;
          loadError = "";
          renderList();
          await logEvent({
            source: "extension.content",
            event: isRetry ? "gem_actions.project_search.retry_loaded" : "gem_actions.project_search.loaded",
            actionId: ACTIONS.GEM_ACTIONS,
            runId,
            message: `Loaded ${allProjects.length} projects for navigation.`,
            link: window.location.href,
            details: {
              durationMs: Date.now() - startedAt
            }
          });

          // Retry once if fresh result looks identical to cache to avoid stale in-flight cache races.
          if (!isRetry && active && cachedSignature && refreshedSignature === cachedSignature) {
            setTimeout(() => {
              if (!active) {
                return;
              }
              runForceRefresh(true).catch(() => {});
            }, 900);
          }
        })
        .catch(async (error) => {
          if (!active) {
            return;
          }
          const message = error.message || "Failed to load projects.";
          const usedCachedProjects = allProjects.length > 0;
          if (!usedCachedProjects) {
            loading = false;
            loadError = message;
            renderList();
            showToast(message, true);
          }
          await logEvent({
            source: "extension.content",
            level: usedCachedProjects ? "warn" : "error",
            event: isRetry ? "gem_actions.project_search.retry_failed" : "gem_actions.project_search.load_failed",
            actionId: ACTIONS.GEM_ACTIONS,
            runId,
            message,
            link: window.location.href
          });
        });
    }

    runForceRefresh().catch(() => {});
  });
}

function formatGemPeopleMeta(candidate) {
  const parts = [];
  const primaryEmail = String(candidate?.primaryEmail || "").trim();
  const title = String(candidate?.title || "").trim();
  const company = String(candidate?.company || "").trim();
  const school = String(candidate?.school || "").trim();
  if (primaryEmail) {
    parts.push(primaryEmail);
  }
  if (title && company) {
    parts.push(`${title} at ${company}`);
  } else if (title) {
    parts.push(title);
  } else if (company) {
    parts.push(company);
  }
  if (school) {
    parts.push(school);
  }
  return parts.join(" • ");
}

async function showGemPeopleSearch(runId) {
  createGemActionsStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-actions-overlay";
    const modal = document.createElement("div");
    modal.id = "gem-actions-modal";
    const title = document.createElement("div");
    title.id = "gem-actions-title";
    title.textContent = "Search someone in Gem";
    const subtitle = document.createElement("div");
    subtitle.id = "gem-actions-subtitle";
    subtitle.textContent = "Type to search candidates. Enter opens Gem profile, L opens LinkedIn.";

    const input = document.createElement("input");
    input.id = "gem-actions-input";
    input.type = "text";
    input.placeholder = "Search people...";
    input.autocomplete = "off";

    const status = document.createElement("div");
    status.className = "gem-actions-status";

    const list = document.createElement("div");
    list.id = "gem-actions-list";
    const hint = document.createElement("div");
    hint.className = "gem-actions-hint";
    hint.textContent = "Press number keys to select result. Esc to cancel.";

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(input);
    modal.appendChild(status);
    modal.appendChild(list);
    modal.appendChild(hint);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    let disposed = false;
    let loading = true;
    let loadError = "";
    let candidates = [];
    let selectedIndex = 0;
    let pendingDebounce = 0;
    let requestCounter = 0;
    let selectionArmed = false;

    function cleanup() {
      disposed = true;
      if (pendingDebounce) {
        clearTimeout(pendingDebounce);
      }
      overlay.remove();
    }

    function finish(result) {
      cleanup();
      resolve(result || null);
    }

    function setStatus(text, isError = false) {
      status.textContent = String(text || "");
      status.className = `gem-actions-status${isError ? " error" : ""}`;
    }

    function getSelectedCandidate() {
      if (candidates.length === 0) {
        return null;
      }
      const boundedIndex = Math.max(0, Math.min(selectedIndex, candidates.length - 1));
      return candidates[boundedIndex] || null;
    }

    function getQuickSelectIndex(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return -1;
      }
      const code = String(event?.code || "");
      let rawDigit = "";
      if (/^Digit[0-9]$/.test(code)) {
        rawDigit = code.slice(5);
      } else if (/^Numpad[0-9]$/.test(code)) {
        rawDigit = code.slice(6);
      } else if (/^[0-9]$/.test(String(event?.key || ""))) {
        rawDigit = String(event.key);
      } else {
        return -1;
      }
      const value = rawDigit === "0" ? 10 : Number(rawDigit);
      if (!Number.isFinite(value) || value <= 0) {
        return -1;
      }
      return value - 1;
    }

    function renderList() {
      list.innerHTML = "";
      if (loading) {
        const loadingNode = document.createElement("div");
        loadingNode.className = "gem-actions-empty";
        loadingNode.textContent = "Searching people...";
        list.appendChild(loadingNode);
        return;
      }
      if (loadError) {
        const errorNode = document.createElement("div");
        errorNode.className = "gem-actions-empty";
        errorNode.textContent = `Could not search candidates: ${loadError}`;
        list.appendChild(errorNode);
        return;
      }
      if (candidates.length === 0) {
        const empty = document.createElement("div");
        empty.className = "gem-actions-empty";
        empty.textContent = "No people found.";
        list.appendChild(empty);
        return;
      }
      if (selectedIndex >= candidates.length) {
        selectedIndex = Math.max(0, candidates.length - 1);
      }
      if (selectedIndex < 0) {
        selectedIndex = 0;
      }

      candidates.forEach((candidate, index) => {
        const item = document.createElement("div");
        const isActive = index === selectedIndex;
        item.className = `gem-actions-item${isActive ? " active selected" : ""}`;
        const hotkey = document.createElement("div");
        hotkey.className = "gem-actions-hotkey";
        hotkey.textContent = index < 10 ? String(index + 1).replace("10", "0") : "";
        const main = document.createElement("div");
        main.className = "gem-actions-main";
        main.textContent = String(candidate.fullName || candidate.primaryEmail || candidate.id || "Candidate");
        const meta = document.createElement("div");
        meta.className = "gem-actions-meta";
        meta.textContent = formatGemPeopleMeta(candidate);
        item.appendChild(hotkey);
        item.appendChild(main);
        item.appendChild(meta);
        if (candidate.linkedInUrl) {
          const linkedInTag = document.createElement("span");
          linkedInTag.className = "gem-actions-tag";
          linkedInTag.textContent = "L LinkedIn";
          main.appendChild(linkedInTag);
        }
        item.addEventListener("mouseenter", () => {
          if (selectedIndex === index) {
            return;
          }
          selectedIndex = index;
          renderList();
        });
        item.addEventListener("click", () => {
          selectedIndex = index;
          selectionArmed = true;
          renderList();
        });
        item.addEventListener("dblclick", () => {
          selectedIndex = index;
          selectionArmed = true;
          renderList();
          const selected = getSelectedCandidate();
          if (selected) {
            finish({ candidate: selected, target: "gem" });
          }
        });
        list.appendChild(item);
      });
    }

    function scheduleSearch() {
      if (pendingDebounce) {
        clearTimeout(pendingDebounce);
      }
      pendingDebounce = setTimeout(async () => {
        pendingDebounce = 0;
        const token = ++requestCounter;
        loading = true;
        loadError = "";
        selectionArmed = false;
        setStatus("");
        renderList();
        try {
          const results = await searchGemPeople(input.value || "", runId, GEM_ACTION_PEOPLE_SEARCH_LIMIT);
          if (disposed || token !== requestCounter) {
            return;
          }
          candidates = results;
          loading = false;
          loadError = "";
          selectedIndex = 0;
          selectionArmed = false;
          setStatus(results.length > 0 ? `${results.length} result${results.length === 1 ? "" : "s"} loaded.` : "");
          renderList();
        } catch (error) {
          if (disposed || token !== requestCounter) {
            return;
          }
          candidates = [];
          loading = false;
          loadError = error.message || "Failed to search people.";
          selectionArmed = false;
          setStatus(loadError, true);
          renderList();
        }
      }, GEM_ACTION_PEOPLE_SEARCH_DEBOUNCE_MS);
    }

    overlay.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (candidates.length > 0) {
            selectedIndex = (selectedIndex + 1) % candidates.length;
            selectionArmed = true;
            renderList();
          }
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (candidates.length > 0) {
            selectedIndex = (selectedIndex - 1 + candidates.length) % candidates.length;
            selectionArmed = true;
            renderList();
          }
          return;
        }
        const quickIndex = getQuickSelectIndex(event);
        if (quickIndex >= 0) {
          event.preventDefault();
          if (quickIndex < candidates.length) {
            selectedIndex = quickIndex;
            selectionArmed = true;
            renderList();
          }
          return;
        }
        if (event.key === "Enter") {
          const selected = getSelectedCandidate();
          if (!selected) {
            return;
          }
          event.preventDefault();
          finish({ candidate: selected, target: "gem" });
          return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        const key = String(event.key || "").trim().toLowerCase();
        if (key === "l") {
          if (document.activeElement === input && !selectionArmed) {
            return;
          }
          const selected = getSelectedCandidate();
          if (!selected) {
            return;
          }
          event.preventDefault();
          finish({ candidate: selected, target: "linkedin" });
        }
      },
      true
    );

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        finish(null);
      }
    });
    input.addEventListener("input", () => {
      scheduleSearch();
    });

    renderList();
    input.focus();
    scheduleSearch();
  });
}

async function handleGemActionsShortcut(source = "keyboard", runId = "") {
  const effectiveRunId = runId || generateRunId();
  const selectedAction = await showGemActionsMenu(effectiveRunId);
  if (!selectedAction) {
    showToast("Action cancelled.", true);
    await logEvent({
      source: "extension.content",
      level: "warn",
      event: "gem_actions.cancelled",
      actionId: ACTIONS.GEM_ACTIONS,
      runId: effectiveRunId,
      message: "Gem actions menu cancelled.",
      link: window.location.href
    });
    return;
  }

  if (selectedAction === "createProject") {
    const created = await showGemProjectCreateForm(effectiveRunId, {});
    if (!created) {
      showToast("Action cancelled.", true);
    }
    return;
  }

  if (selectedAction === "openProject") {
    const projectSelection = await showGemProjectNavigator(effectiveRunId);
    if (!projectSelection) {
      showToast("Action cancelled.", true);
      return;
    }
    if (projectSelection.kind === "create") {
      const created = await showGemProjectCreateForm(effectiveRunId, {
        initialName: projectSelection.createName || ""
      });
      if (!created) {
        showToast("Action cancelled.", true);
      }
      return;
    }

    const selectedProject = projectSelection.project || null;
    const projectUrl = buildGemProjectUrl(selectedProject?.id || "", selectedProject?.name || "");
    if (!projectUrl) {
      showToast("Missing project URL.", true);
      return;
    }
    await openGemNavigation(projectUrl, effectiveRunId, {
      actionId: ACTIONS.GEM_ACTIONS,
      openInBackground: Boolean(projectSelection.openInBackground)
    });
    showToast(projectSelection.openInBackground ? "Opened project in background tab." : "Opened project in Gem.");
    await logEvent({
      source: "extension.content",
      event: "gem_actions.project.opened",
      actionId: ACTIONS.GEM_ACTIONS,
      runId: effectiveRunId,
      message: projectSelection.openInBackground ? "Opened project in background tab." : "Opened project in Gem.",
      link: projectUrl,
      details: {
        source,
        projectId: String(selectedProject?.id || ""),
        projectName: String(selectedProject?.name || ""),
        openInBackground: Boolean(projectSelection.openInBackground)
      }
    });
    return;
  }

  if (selectedAction === "createSequence") {
    const confirmed = await showGemActionConfirmationDialog("Create sequence", "Create a new sequence in Gem?");
    if (!confirmed) {
      showToast("Action cancelled.", true);
      return;
    }
    const url = buildGemSequenceCreateUrl();
    await openGemNavigation(url, effectiveRunId, {
      actionId: ACTIONS.GEM_ACTIONS,
      openInBackground: false
    });
    showToast("Opened sequence creation in Gem.");
    await logEvent({
      source: "extension.content",
      event: "gem_actions.sequence_create.opened",
      actionId: ACTIONS.GEM_ACTIONS,
      runId: effectiveRunId,
      message: "Opened sequence creation in Gem.",
      link: url,
      details: {
        source
      }
    });
    return;
  }

  if (selectedAction === "searchPerson") {
    const peopleSelection = await showGemPeopleSearch(effectiveRunId);
    if (!peopleSelection) {
      showToast("Action cancelled.", true);
      return;
    }
    const candidate = peopleSelection.candidate || {};
    const target = peopleSelection.target === "linkedin" ? "linkedin" : "gem";
    const url =
      target === "linkedin"
        ? String(candidate.linkedInUrl || "").trim()
        : String(candidate.gemProfileUrl || "").trim();
    if (!url) {
      showToast(target === "linkedin" ? "No LinkedIn URL available for this candidate." : "No Gem profile URL available.", true);
      return;
    }
    await openGemNavigation(url, effectiveRunId, {
      actionId: ACTIONS.GEM_ACTIONS,
      openInBackground: false
    });
    showToast(target === "linkedin" ? "Opened LinkedIn profile." : "Opened candidate in Gem.");
    await logEvent({
      source: "extension.content",
      event: "gem_actions.person.opened",
      actionId: ACTIONS.GEM_ACTIONS,
      runId: effectiveRunId,
      message: target === "linkedin" ? "Opened LinkedIn profile from people search." : "Opened Gem profile from people search.",
      link: url,
      details: {
        source,
        target,
        candidateId: String(candidate.id || ""),
        fullName: String(candidate.fullName || "")
      }
    });
    return;
  }
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

    const projectMemory = getProjectMemoryEntry();
    const hasProjectMemory = Boolean(projectMemory.entry);
    let selectedIndex = 0;
    let filteredProjects = [];
    let allProjects = hasProjectMemory ? normalizeProjectsForPicker(projectMemory.entry.projects) : [];
    let loading = !hasProjectMemory;
    let loadError = "";
    const startedAt = Date.now();
    let active = true;
    let cachedSignature = "";
    let hasAppliedForceRefresh = false;

    function getProjectSignature(projects) {
      const normalized = Array.isArray(projects) ? projects : [];
      if (normalized.length === 0) {
        return "0";
      }
      const ids = normalized
        .map((project) => String(project?.id || ""))
        .filter(Boolean)
        .sort();
      return `${normalized.length}:${ids.join("|")}`;
    }

    function cleanup() {
      active = false;
      overlay.remove();
    }

    function finish(selected) {
      cleanup();
      resolve(selected || null);
    }

    function selectProject(project) {
      if (!project) {
        return;
      }
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
          if (selectedIndex === index) {
            return;
          }
          selectedIndex = index;
          renderList();
        });
        item.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          selectProject(project);
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
          selectProject(filteredProjects[selectedIndex]);
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

    if (!hasProjectMemory) {
      listProjects("", runId, { preferCache: true })
        .then(async (projects) => {
          if (!active) {
            return;
          }
          const cachedProjects = projects.filter((project) => !project.archived);
          cachedSignature = getProjectSignature(cachedProjects);
          if (cachedProjects.length > 0 && !hasAppliedForceRefresh) {
            allProjects = cachedProjects;
            loading = false;
            loadError = "";
            renderList();
          }
          await logEvent({
            source: "extension.content",
            event: "project_picker.cache_loaded",
            actionId: ACTIONS.ADD_TO_PROJECT,
            runId,
            message: `Loaded ${cachedProjects.length} cached projects for picker.`,
            link: linkedinUrl
          });
        })
        .catch(async (_error) => {
          if (!active) {
            return;
          }
          await logEvent({
            source: "extension.content",
            level: "warn",
            event: "project_picker.cache_load_failed",
            actionId: ACTIONS.ADD_TO_PROJECT,
            runId,
            message: "Could not load cached projects for picker.",
            link: linkedinUrl
          });
        });
    } else {
      cachedSignature = getProjectSignature(allProjects.filter((project) => !project.archived));
    }

    function runForceRefresh(isRetry = false) {
      return listProjects("", runId, { forceRefresh: true, forceNewRefresh: true })
        .then(async (projects) => {
          if (!active) {
            return;
          }
          const refreshedProjects = projects.filter((project) => !project.archived);
          const refreshedSignature = getProjectSignature(refreshedProjects);
          hasAppliedForceRefresh = true;
          allProjects = refreshedProjects;
          loading = false;
          loadError = "";
          renderList();
          await logEvent({
            source: "extension.content",
            event: isRetry ? "project_picker.retry_loaded" : "project_picker.loaded",
            actionId: ACTIONS.ADD_TO_PROJECT,
            runId,
            message: `Project picker ${isRetry ? "retry " : ""}loaded ${allProjects.length} projects.`,
            link: linkedinUrl,
            details: {
              durationMs: Date.now() - startedAt
            }
          });

          // If refresh result equals cache exactly, retry once with a forced new refresh
          // to avoid stale in-flight refresh races after recent project creation.
          if (!isRetry && active && cachedSignature && refreshedSignature === cachedSignature) {
            setTimeout(() => {
              if (!active) {
                return;
              }
              runForceRefresh(true).catch(() => {});
            }, 900);
          }
        })
        .catch(async (error) => {
          if (!active) {
            return;
          }
          const message = error.message || "Failed to refresh project list.";
          const usedCachedProjects = allProjects.length > 0;
          if (!usedCachedProjects) {
            loading = false;
            loadError = message;
            renderList();
            showToast(message, true);
          }
          await logEvent({
            source: "extension.content",
            level: usedCachedProjects ? "warn" : "error",
            event: isRetry ? "project_picker.retry_failed" : "project_picker.load_failed",
            actionId: ACTIONS.ADD_TO_PROJECT,
            runId,
            message,
            link: linkedinUrl,
            details: {
              durationMs: Date.now() - startedAt,
              usedCachedProjects
            }
          });
        });
    }

    runForceRefresh(false).catch(() => {});
  });
}

async function showAshbyJobPicker(runId, profileUrl) {
  createAshbyJobPickerStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-ashby-job-picker-overlay";

    const modal = document.createElement("div");
    modal.id = "gem-ashby-job-picker-modal";

    const brand = document.createElement("div");
    brand.id = "gem-ashby-job-picker-brand";
    const brandDot = document.createElement("span");
    brandDot.id = "gem-ashby-job-picker-brand-dot";
    brandDot.textContent = "A";
    const brandText = document.createElement("span");
    brandText.textContent = "Ashby";
    brand.appendChild(brandDot);
    brand.appendChild(brandText);

    const title = document.createElement("div");
    title.id = "gem-ashby-job-picker-title";
    title.textContent = "Upload Candidate to Ashby";

    const subtitle = document.createElement("div");
    subtitle.id = "gem-ashby-job-picker-subtitle";
    subtitle.textContent = "Type job name, use arrow keys to choose, then upload candidate.";

    const input = document.createElement("input");
    input.id = "gem-ashby-job-picker-input";
    input.type = "text";
    input.placeholder = "Search jobs by name...";
    input.autocomplete = "off";

    const results = document.createElement("div");
    results.id = "gem-ashby-job-picker-results";

    const hint = document.createElement("div");
    hint.className = "gem-ashby-job-picker-hint";
    const hintText = document.createElement("span");
    hintText.textContent = "Click a job or press Enter to continue. Esc to cancel.";
    hint.appendChild(hintText);

    const confirmMask = document.createElement("div");
    confirmMask.id = "gem-ashby-job-picker-confirm-mask";
    const confirmCard = document.createElement("div");
    confirmCard.id = "gem-ashby-job-picker-confirm-card";
    const confirmTitle = document.createElement("div");
    confirmTitle.id = "gem-ashby-job-picker-confirm-title";
    confirmTitle.textContent = "Confirm Upload";
    const confirmBody = document.createElement("div");
    confirmBody.id = "gem-ashby-job-picker-confirm-body";
    const confirmActions = document.createElement("div");
    confirmActions.id = "gem-ashby-job-picker-confirm-actions";
    const confirmCancelBtn = document.createElement("button");
    confirmCancelBtn.id = "gem-ashby-job-picker-confirm-cancel";
    confirmCancelBtn.className = "gem-ashby-job-picker-confirm-btn";
    confirmCancelBtn.type = "button";
    confirmCancelBtn.textContent = "Cancel";
    const confirmOkBtn = document.createElement("button");
    confirmOkBtn.id = "gem-ashby-job-picker-confirm-ok";
    confirmOkBtn.className = "gem-ashby-job-picker-confirm-btn";
    confirmOkBtn.type = "button";
    confirmOkBtn.textContent = "Confirm";
    confirmActions.appendChild(confirmCancelBtn);
    confirmActions.appendChild(confirmOkBtn);
    confirmCard.appendChild(confirmTitle);
    confirmCard.appendChild(confirmBody);
    confirmCard.appendChild(confirmActions);
    confirmMask.appendChild(confirmCard);

    modal.appendChild(brand);
    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(input);
    modal.appendChild(results);
    modal.appendChild(hint);
    modal.appendChild(confirmMask);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    let selectedIndex = 0;
    let selectedJobId = "";
    let confirmationJob = null;
    let filteredJobs = [];
    let allJobs = [];
    let loading = true;
    let loadError = "";
    const startedAt = Date.now();
    let disposed = false;

    function isOpenAshbyJob(job) {
      if (!job || typeof job !== "object") {
        return false;
      }
      if (typeof job.isOpen === "boolean") {
        return job.isOpen;
      }
      const status = String(job.status || "").trim().toLowerCase();
      if (status.includes("open")) {
        return true;
      }
      if (!status) {
        return !Boolean(job.isArchived);
      }
      if (status.includes("closed") || status.includes("archived") || status.includes("draft")) {
        return false;
      }
      return !Boolean(job.isArchived);
    }

    function cleanup() {
      if (disposed) {
        return;
      }
      disposed = true;
      window.removeEventListener("keydown", onWindowKeyDown, true);
      overlay.remove();
    }

    function finish(selected) {
      cleanup();
      resolve(selected || null);
    }

    function isConfirming() {
      return Boolean(confirmationJob);
    }

    function getSelectedJob() {
      if (loading || filteredJobs.length === 0) {
        return null;
      }
      const byId = selectedJobId ? filteredJobs.find((job) => String(job?.id || "") === selectedJobId) : null;
      if (byId) {
        return byId;
      }
      return filteredJobs[Math.max(0, Math.min(selectedIndex, filteredJobs.length - 1))] || null;
    }

    function getQuickSelectIndex(event) {
      const code = String(event?.code || "");
      let rawDigit = "";
      if (/^Digit[0-9]$/.test(code)) {
        rawDigit = code.slice(5);
      } else if (/^Numpad[0-9]$/.test(code)) {
        rawDigit = code.slice(6);
      } else if (/^[0-9]$/.test(String(event?.key || "")) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        rawDigit = String(event.key);
      } else {
        return -1;
      }
      const value = rawDigit === "0" ? 10 : Number(rawDigit);
      if (!Number.isFinite(value) || value <= 0) {
        return -1;
      }
      return value - 1;
    }

    function moveSelection(delta) {
      if (loading || filteredJobs.length === 0) {
        return;
      }
      const currentById = selectedJobId ? filteredJobs.findIndex((job) => String(job?.id || "") === selectedJobId) : -1;
      const baseIndex = currentById >= 0 ? currentById : Math.max(0, Math.min(selectedIndex, filteredJobs.length - 1));
      const nextIndex = (baseIndex + delta + filteredJobs.length) % filteredJobs.length;
      const nextJob = filteredJobs[nextIndex] || null;
      selectedIndex = nextIndex;
      selectedJobId = nextJob ? String(nextJob.id || "") : "";
      renderList();
    }

    function selectByQuickIndex(index) {
      if (loading || index < 0 || index >= filteredJobs.length) {
        return null;
      }
      const job = filteredJobs[index] || null;
      if (!job) {
        return null;
      }
      selectedIndex = index;
      selectedJobId = String(job.id || "");
      renderList();
      return job;
    }

    function filterJobs(query) {
      const normalized = String(query || "").trim().toLowerCase();
      const base = Array.isArray(allJobs) ? allJobs : [];
      if (!normalized) {
        return base.slice(0, ASHBY_JOB_PICKER_RENDER_LIMIT);
      }
      return base
        .filter((job) => String(job?.name || "").toLowerCase().includes(normalized))
        .slice(0, ASHBY_JOB_PICKER_RENDER_LIMIT);
    }

    function selectJob(job) {
      if (!job) {
        return;
      }
      logEvent({
        source: "extension.content",
        event: "ashby_job_picker.selected",
        actionId: ACTIONS.UPLOAD_TO_ASHBY,
        runId,
        message: `Selected Ashby job ${job.name || job.id}.`,
        link: profileUrl,
        details: {
          jobId: job.id,
          jobName: job.name || "",
          jobStatus: job.status || ""
        }
      });
      finish({
        id: job.id,
        name: job.name || ""
      });
    }

    function updateConfirmationMask() {
      if (!confirmationJob) {
        confirmMask.classList.remove("visible");
        input.focus();
        return;
      }
      const jobName = String(confirmationJob.name || confirmationJob.id || "").trim();
      confirmBody.textContent = `Upload candidate to "${jobName}"?`;
      confirmMask.classList.add("visible");
      confirmOkBtn.focus();
    }

    function openConfirmation(job) {
      if (!job) {
        return;
      }
      confirmationJob = {
        id: String(job.id || "").trim(),
        name: String(job.name || "").trim(),
        status: String(job.status || "").trim()
      };
      updateConfirmationMask();
    }

    function closeConfirmation() {
      if (!confirmationJob) {
        return;
      }
      confirmationJob = null;
      updateConfirmationMask();
    }

    function confirmSelection() {
      if (!confirmationJob) {
        return;
      }
      const chosen = confirmationJob;
      confirmationJob = null;
      selectJob(chosen);
    }

    function renderList() {
      filteredJobs = filterJobs(input.value || "");
      if (filteredJobs.length === 0) {
        selectedIndex = 0;
        selectedJobId = "";
      } else {
        const selectedByIdIndex = selectedJobId ? filteredJobs.findIndex((job) => String(job?.id || "") === selectedJobId) : -1;
        if (selectedByIdIndex >= 0) {
          selectedIndex = selectedByIdIndex;
        } else if (selectedIndex >= filteredJobs.length) {
          selectedIndex = Math.max(0, filteredJobs.length - 1);
        } else if (selectedIndex < 0) {
          selectedIndex = 0;
        }
        const selected = filteredJobs[selectedIndex] || null;
        selectedJobId = selected ? String(selected.id || "") : "";
      }

      results.innerHTML = "";
      if (loading) {
        const loadingNode = document.createElement("div");
        loadingNode.className = "gem-ashby-job-picker-empty";
        loadingNode.textContent = "Loading jobs...";
        results.appendChild(loadingNode);
        return;
      }
      if (loadError) {
        const errorNode = document.createElement("div");
        errorNode.className = "gem-ashby-job-picker-empty";
        errorNode.textContent = `Could not load jobs: ${loadError}`;
        results.appendChild(errorNode);
        return;
      }
      if (filteredJobs.length === 0) {
        const empty = document.createElement("div");
        empty.className = "gem-ashby-job-picker-empty";
        empty.textContent = "No matching jobs.";
        results.appendChild(empty);
        return;
      }

      filteredJobs.forEach((job, index) => {
        const item = document.createElement("div");
        const jobId = String(job.id || "");
        item.className = `gem-ashby-job-picker-item${jobId === selectedJobId ? " active" : ""}`;

        const left = document.createElement("span");
        left.className = "gem-ashby-job-picker-item-left";
        const key = document.createElement("span");
        key.className = "gem-ashby-job-picker-item-key";
        key.textContent = String(index + 1);
        const name = document.createElement("span");
        name.className = "gem-ashby-job-picker-item-name";
        name.textContent = job.name || job.id;
        left.appendChild(key);
        left.appendChild(name);

        const status = document.createElement("span");
        status.className = "gem-ashby-job-picker-item-status";
        status.textContent = job.status || (job.isArchived ? "Archived" : "");

        item.appendChild(left);
        item.appendChild(status);
        item.addEventListener("mouseenter", () => {
          if (selectedIndex === index && selectedJobId === jobId) {
            return;
          }
          selectedIndex = index;
          selectedJobId = jobId;
          renderList();
        });
        item.addEventListener("click", () => {
          selectedIndex = index;
          selectedJobId = jobId;
          renderList();
          openConfirmation(job);
        });
        item.addEventListener("dblclick", () => {
          selectedIndex = index;
          selectedJobId = jobId;
          renderList();
          openConfirmation(job);
        });
        results.appendChild(item);
      });
    }

    input.addEventListener("input", () => {
      selectedIndex = 0;
      selectedJobId = "";
      confirmationJob = null;
      updateConfirmationMask();
      renderList();
    });
    input.addEventListener("keydown", (event) => {
      if (isConfirming()) {
        if (event.key === "Enter") {
          event.preventDefault();
          confirmSelection();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeConfirmation();
          return;
        }
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-1);
        return;
      }
      const quickIndex = getQuickSelectIndex(event);
      if (quickIndex >= 0) {
        const quickJob = selectByQuickIndex(quickIndex);
        if (quickJob) {
          event.preventDefault();
          openConfirmation(quickJob);
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        openConfirmation(getSelectedJob());
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelPicker("Ashby job picker cancelled.");
        finish(null);
      }
    });

    function cancelPicker(message) {
      logEvent({
        source: "extension.content",
        level: "warn",
        event: "ashby_job_picker.cancelled",
        actionId: ACTIONS.UPLOAD_TO_ASHBY,
        runId,
        message,
        link: profileUrl
      });
    }

    function onWindowKeyDown(event) {
      if (disposed || event.defaultPrevented) {
        return;
      }
      if (event.key === "Enter") {
        if (isConfirming()) {
          event.preventDefault();
          event.stopPropagation();
          confirmSelection();
          return;
        }
        if (event.target === input) {
          return;
        }
        const selected = getSelectedJob();
        if (!selected) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openConfirmation(selected);
        return;
      }
      const quickIndex = getQuickSelectIndex(event);
      if (quickIndex >= 0) {
        const quickJob = selectByQuickIndex(quickIndex);
        if (!quickJob) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openConfirmation(quickJob);
        return;
      }
      if (event.key === "Escape") {
        if (isConfirming()) {
          event.preventDefault();
          event.stopPropagation();
          closeConfirmation();
          return;
        }
        if (event.target === input) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        cancelPicker("Ashby job picker cancelled.");
        finish(null);
      }
    }
    window.addEventListener("keydown", onWindowKeyDown, true);

    confirmOkBtn.addEventListener("click", () => {
      confirmSelection();
    });
    confirmCancelBtn.addEventListener("click", () => {
      closeConfirmation();
    });
    confirmMask.addEventListener("click", (event) => {
      if (event.target === confirmMask) {
        closeConfirmation();
      }
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        cancelPicker("Ashby job picker cancelled by outside click.");
        finish(null);
      }
    });

    renderList();
    input.focus();

    logEvent({
      source: "extension.content",
      event: "ashby_job_picker.opened",
      actionId: ACTIONS.UPLOAD_TO_ASHBY,
      runId,
      message: "Ashby job picker opened.",
      link: profileUrl
    });

    listAshbyJobs("", runId)
      .then(async (jobs) => {
        allJobs = jobs.filter((job) => isOpenAshbyJob(job) && !job.isArchived);
        loading = false;
        loadError = "";
        renderList();
        await logEvent({
          source: "extension.content",
          event: "ashby_job_picker.loaded",
          actionId: ACTIONS.UPLOAD_TO_ASHBY,
          runId,
          message: `Ashby job picker loaded ${allJobs.length} jobs.`,
          link: profileUrl,
          details: {
            durationMs: Date.now() - startedAt
          }
        });
      })
      .catch(async (error) => {
        loading = false;
        loadError = error.message || "Failed to load Ashby job list.";
        renderList();
        showToast(loadError, true);
        await logEvent({
          source: "extension.content",
          level: "error",
          event: "ashby_job_picker.load_failed",
          actionId: ACTIONS.UPLOAD_TO_ASHBY,
          runId,
          message: loadError,
          link: profileUrl,
          details: {
            durationMs: Date.now() - startedAt
          }
        });
      });
  });
}

async function showCandidateNotePicker(runId, context) {
  createCandidateNotePickerStyles();
  const linkedinUrl = context.linkedinUrl || window.location.href;

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gem-candidate-note-picker-overlay";

    const modal = document.createElement("div");
    modal.id = "gem-candidate-note-picker-modal";

    const title = document.createElement("div");
    title.id = "gem-candidate-note-picker-title";
    title.textContent = "Add Note to Candidate";

    const subtitle = document.createElement("div");
    subtitle.id = "gem-candidate-note-picker-subtitle";
    subtitle.textContent = "Type note. Press Enter to continue, Shift+Enter for a new line.";

    const input = document.createElement("textarea");
    input.id = "gem-candidate-note-picker-input";
    input.placeholder = "Write candidate note...";
    input.maxLength = CANDIDATE_NOTE_MAX_LENGTH;

    const meta = document.createElement("div");
    meta.id = "gem-candidate-note-picker-meta";

    const errorEl = document.createElement("div");
    errorEl.id = "gem-candidate-note-picker-error";

    const hint = document.createElement("div");
    hint.className = "gem-candidate-note-picker-hint";
    hint.textContent = "Enter to continue. Shift+Enter for new line. Esc to cancel.";

    const confirmMask = document.createElement("div");
    confirmMask.id = "gem-candidate-note-picker-confirm-mask";
    const confirmCard = document.createElement("div");
    confirmCard.id = "gem-candidate-note-picker-confirm-card";
    const confirmTitle = document.createElement("div");
    confirmTitle.id = "gem-candidate-note-picker-confirm-title";
    confirmTitle.textContent = "Confirm Add Note";
    const confirmBody = document.createElement("div");
    confirmBody.id = "gem-candidate-note-picker-confirm-body";
    const confirmActions = document.createElement("div");
    confirmActions.id = "gem-candidate-note-picker-confirm-actions";
    const confirmCancelBtn = document.createElement("button");
    confirmCancelBtn.id = "gem-candidate-note-picker-confirm-cancel";
    confirmCancelBtn.className = "gem-candidate-note-picker-confirm-btn";
    confirmCancelBtn.type = "button";
    confirmCancelBtn.textContent = "Cancel";
    const confirmOkBtn = document.createElement("button");
    confirmOkBtn.id = "gem-candidate-note-picker-confirm-ok";
    confirmOkBtn.className = "gem-candidate-note-picker-confirm-btn";
    confirmOkBtn.type = "button";
    confirmOkBtn.textContent = "Confirm";
    confirmActions.appendChild(confirmCancelBtn);
    confirmActions.appendChild(confirmOkBtn);
    confirmCard.appendChild(confirmTitle);
    confirmCard.appendChild(confirmBody);
    confirmCard.appendChild(confirmActions);
    confirmMask.appendChild(confirmCard);

    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(input);
    modal.appendChild(meta);
    modal.appendChild(errorEl);
    modal.appendChild(hint);
    modal.appendChild(confirmMask);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);

    let confirmationNote = "";
    const startedAt = Date.now();
    let disposed = false;

    function setError(message) {
      errorEl.textContent = message || "";
    }

    function updateMeta() {
      meta.textContent = `${String(input.value || "").length}/${CANDIDATE_NOTE_MAX_LENGTH}`;
    }

    function cleanup() {
      if (disposed) {
        return;
      }
      disposed = true;
      window.removeEventListener("keydown", onWindowKeyDown, true);
      overlay.remove();
    }

    function finish(selection) {
      cleanup();
      resolve(selection || null);
    }

    function cancelPicker(message) {
      logEvent({
        source: "extension.content",
        level: "warn",
        event: "candidate_note_picker.cancelled",
        actionId: ACTIONS.ADD_NOTE_TO_CANDIDATE,
        runId,
        message,
        link: linkedinUrl
      });
      finish(null);
    }

    function isConfirming() {
      return Boolean(confirmationNote);
    }

    function updateConfirmationMask() {
      if (!confirmationNote) {
        confirmMask.classList.remove("visible");
        input.focus();
        return;
      }
      confirmBody.textContent = `Add this note to candidate in Gem?\n\n${confirmationNote}`;
      confirmMask.classList.add("visible");
      confirmOkBtn.focus();
    }

    function openConfirmation() {
      const note = String(input.value || "").trim();
      if (!note) {
        setError("Note is required.");
        input.focus();
        return;
      }
      setError("");
      confirmationNote = note;
      updateConfirmationMask();
    }

    function closeConfirmation() {
      if (!confirmationNote) {
        return;
      }
      confirmationNote = "";
      updateConfirmationMask();
    }

    function confirmSelection() {
      if (!confirmationNote) {
        return;
      }
      const note = confirmationNote;
      confirmationNote = "";
      logEvent({
        source: "extension.content",
        event: "candidate_note_picker.submitted",
        actionId: ACTIONS.ADD_NOTE_TO_CANDIDATE,
        runId,
        message: "Candidate note selected.",
        link: linkedinUrl,
        details: {
          noteLength: note.length,
          durationMs: Date.now() - startedAt
        }
      });
      finish({
        candidateNote: note
      });
    }

    function onWindowKeyDown(event) {
      if (disposed || event.defaultPrevented) {
        return;
      }
      if (event.key === "Enter") {
        if (isConfirming()) {
          event.preventDefault();
          event.stopPropagation();
          confirmSelection();
          return;
        }
        if (event.target === input) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openConfirmation();
        return;
      }
      if (event.key === "Escape") {
        if (isConfirming()) {
          event.preventDefault();
          event.stopPropagation();
          closeConfirmation();
          return;
        }
        if (event.target === input) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        cancelPicker("Candidate note picker cancelled.");
      }
    }
    window.addEventListener("keydown", onWindowKeyDown, true);

    input.addEventListener("input", () => {
      setError("");
      updateMeta();
      if (isConfirming()) {
        closeConfirmation();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (isConfirming()) {
        if (event.key === "Enter") {
          event.preventDefault();
          confirmSelection();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeConfirmation();
          return;
        }
      }
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        openConfirmation();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelPicker("Candidate note picker cancelled.");
      }
    });

    confirmOkBtn.addEventListener("click", () => {
      confirmSelection();
    });
    confirmCancelBtn.addEventListener("click", () => {
      closeConfirmation();
    });
    confirmMask.addEventListener("click", (event) => {
      if (event.target === confirmMask) {
        closeConfirmation();
      }
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        cancelPicker("Candidate note picker cancelled by outside click.");
      }
    });

    updateMeta();
    input.focus();

    logEvent({
      source: "extension.content",
      event: "candidate_note_picker.opened",
      actionId: ACTIONS.ADD_NOTE_TO_CANDIDATE,
      runId,
      message: "Candidate note picker opened.",
      link: linkedinUrl
    });
  });
}

async function getRuntimeContext(actionId, settings, runId) {
  const context = getProfileContext();
  const contextLink = getContextLink(context);

  if (actionId === ACTIONS.ADD_TO_PROJECT) {
    const project = await showProjectPicker(runId, contextLink);
    if (!project) {
      return null;
    }
    context.projectId = String(project.id || "").trim();
    context.projectName = String(project.name || "").trim();
  }

  if (actionId === ACTIONS.ADD_NOTE_TO_CANDIDATE) {
    const selection = await showCandidateNotePicker(runId, context);
    if (!selection) {
      return null;
    }
    context.candidateNote = selection.candidateNote || "";
  }

  if (actionId === ACTIONS.UPLOAD_TO_ASHBY) {
    const job = await showAshbyJobPicker(runId, contextLink);
    if (!job) {
      return null;
    }
    context.ashbyJobId = String(job.id || "").trim();
    context.ashbyJobName = String(job.name || "").trim();
  }

  if (actionId === ACTIONS.SET_CUSTOM_FIELD) {
    warmCustomFieldsForContext(context, runId, {
      preferCache: true,
      refreshInBackground: true,
      allowCreate: false,
      allowEmptyCandidateCache: true
    }).catch(() => {});
    const selection = await showCustomFieldPicker(runId, context);
    if (!selection) {
      return null;
    }
    context.gemCandidateId = selection.candidateId || context.gemCandidateId || "";
    context.customFieldId = selection.customFieldId || "";
    context.customFieldValue = selection.customFieldValue || "";
    context.customFieldValueLabels = Array.isArray(selection.customFieldValueLabels)
      ? selection.customFieldValueLabels.slice()
      : [];
    context.customFieldOptionId = selection.customFieldOptionId || "";
    context.customFieldOptionIds = Array.isArray(selection.customFieldOptionIds) ? selection.customFieldOptionIds.slice() : [];
    context.customFieldValueType = selection.customFieldValueType || "";
    context.customFieldName = selection.customFieldName || "";
  }

  if (actionId === ACTIONS.SET_REMINDER) {
    const selection = await showReminderPicker(runId, context);
    if (!selection) {
      return null;
    }
    context.reminderNote = selection.reminderNote || "";
    context.reminderDueDate = selection.reminderDueDate || "";
  }

  if (actionId === ACTIONS.SEND_SEQUENCE && !settings.defaultSequenceId) {
    const sequence = await showSequencePicker(runId, contextLink, {
      actionId: ACTIONS.SEND_SEQUENCE,
      title: "Open Sequence",
      subtitle: "Press a letter to pick a sequence. Use Enter to open it in Gem."
    });
    if (!sequence) {
      return null;
    }
    context.sequenceId = String(sequence.id || "").trim();
    context.sequenceName = String(sequence.name || "").trim();
  }

  if (actionId === ACTIONS.EDIT_SEQUENCE) {
    const sequence = await showSequencePicker(runId, contextLink, {
      actionId: ACTIONS.EDIT_SEQUENCE,
      title: "Edit Sequence",
      subtitle: "Press a letter to pick a sequence. Use Enter to open edit stages in Gem."
    });
    if (!sequence) {
      return null;
    }
    context.sequenceId = String(sequence.id || "").trim();
    context.sequenceName = String(sequence.name || "").trim();
  }

  return context;
}

async function handleAction(actionId, source = "keyboard", runId = "") {
  const effectiveRunId = runId || generateRunId();
  const initialContext = getProfileContext();
  const initialLink = getContextLink(initialContext);
  const contextSignalSummary = describeContextSignals(initialContext);
  if (!tryAcquireActionLock(actionId, effectiveRunId)) {
    return {
      ok: false,
      suppressed: true,
      message: "Another Gem action is already open in this tab.",
      runId: effectiveRunId,
      debugSummary: contextSignalSummary
    };
  }
  try {
    const settings = cachedSettings || (await refreshSettings());
    if (!settings.enabled) {
      const message = "Gem shortcuts are disabled in extension settings.";
      showToast(message, true);
      logEvent({
        source: "extension.content",
        level: "warn",
        event: "action.blocked",
        actionId,
        runId: effectiveRunId,
        message: "Action blocked because extension is disabled.",
        link: initialLink
      });
      return { ok: false, message, runId: effectiveRunId, debugSummary: contextSignalSummary };
    }

    if (actionId === ACTIONS.GEM_ACTIONS) {
      await logEvent({
        source: "extension.content",
        event: "gem_actions.triggered",
        actionId,
        runId: effectiveRunId,
        message: `Gem actions triggered from ${source}.`,
        link: window.location.href
      });
      await handleGemActionsShortcut(source, effectiveRunId);
      return { ok: true, message: "Opened Gem actions.", runId: effectiveRunId, debugSummary: contextSignalSummary };
    }

    if (!isSupportedActionPage()) {
      const message = "Open a LinkedIn, Gem candidate, Gmail thread, or GitHub profile to run this action.";
      showToast(message, true);
      logEvent({
        source: "extension.content",
        level: "warn",
        event: "action.blocked",
        actionId,
        runId: effectiveRunId,
        message: "Action blocked because current page is not supported.",
        link: window.location.href
      });
      return { ok: false, message, runId: effectiveRunId, debugSummary: contextSignalSummary };
    }
    if (!contextHasResolvableIdentity(initialContext)) {
      const missingIdentityMessage =
        String(initialContext?.sourcePlatform || "").trim().toLowerCase() === "gmail"
          ? describeContextSignals(initialContext)
          : "Could not detect a candidate identity on this page.";
      showToast(missingIdentityMessage, true);
      logEvent({
        source: "extension.content",
        level: "warn",
        event: "action.blocked",
        actionId,
        runId: effectiveRunId,
        message:
          String(initialContext?.sourcePlatform || "").trim().toLowerCase() === "gmail"
            ? "Action blocked because a Gem candidate could not be detected from this Gmail thread."
            : "Action blocked because candidate identity could not be detected.",
        link: initialLink
      });
      return { ok: false, message: missingIdentityMessage, runId: effectiveRunId, debugSummary: contextSignalSummary };
    }

    if (actionId === ACTIONS.MANAGE_EMAILS) {
      const result = await showEmailPicker(effectiveRunId, initialContext);
      if (!result) {
        const message = "Action cancelled.";
        showToast(message, true);
        return { ok: false, message, runId: effectiveRunId, debugSummary: contextSignalSummary };
      }
      return { ok: true, message: "Opened email picker.", runId: effectiveRunId, debugSummary: contextSignalSummary };
    }

    const context = await getRuntimeContext(actionId, settings, effectiveRunId);
    if (!context) {
      const message = "Action cancelled.";
      showToast(message, true);
      logEvent({
        source: "extension.content",
        level: "warn",
        event: "action.cancelled",
        actionId,
        runId: effectiveRunId,
        message: "Action cancelled by user input.",
        link: initialLink
      });
      return { ok: false, message, runId: effectiveRunId, debugSummary: contextSignalSummary };
    }
    context.source = source;
    context.runId = effectiveRunId;
    const contextLink = getContextLink(context);
    await logEvent({
      source: "extension.content",
      event: "action.dispatched",
      actionId,
      runId: effectiveRunId,
      message: `Dispatching action from ${source}.`,
      link: contextLink,
      details: {
        sourcePlatform: context.sourcePlatform || "",
        linkedInHandle: context.linkedInHandle,
        profileName: context.profileName,
        gemCandidateId: context.gemCandidateId || "",
        contactEmail: context.contactEmail || "",
        profileUrl: context.profileUrl || ""
      }
    });
    const result = await runAction(actionId, context);
    if (result?.ok) {
      if (actionId === ACTIONS.SET_CUSTOM_FIELD) {
        rememberResolvedCandidateIdForContext(context, result.candidateId || context.gemCandidateId || "");
        const optimisticStatusData = applyOptimisticGemStatusSelection(
          context,
          {
            candidateId: result.candidateId || context.gemCandidateId || "",
            customFieldId: context.customFieldId || "",
            customFieldName: context.customFieldName || "",
            customFieldValue: context.customFieldValue || "",
            customFieldValueLabels: Array.isArray(context.customFieldValueLabels)
              ? context.customFieldValueLabels.slice()
              : [],
            customFieldOptionId: context.customFieldOptionId || "",
            customFieldOptionIds: Array.isArray(context.customFieldOptionIds)
              ? context.customFieldOptionIds.slice()
              : [],
            customFieldValueType: context.customFieldValueType || ""
          },
          result.candidateId || context.gemCandidateId || ""
        );
        const patchedCustomFields = patchCustomFieldMemoryEntry(
          context,
          {
            candidateId: result.candidateId || context.gemCandidateId || "",
            customFieldId: context.customFieldId || "",
            customFieldValue: context.customFieldValue || "",
            customFieldValueLabels: Array.isArray(context.customFieldValueLabels)
              ? context.customFieldValueLabels.slice()
              : [],
            customFieldOptionId: context.customFieldOptionId || "",
            customFieldOptionIds: Array.isArray(context.customFieldOptionIds)
              ? context.customFieldOptionIds.slice()
              : [],
            customFieldValueType: context.customFieldValueType || ""
          },
          result.candidateId || context.gemCandidateId || ""
        );

        if (
          (optimisticStatusData || patchedCustomFields) &&
          isLinkedInProfilePage() &&
          isCurrentGemStatusDisplayEnabled(cachedSettings) &&
          shouldRenderUpdatedCustomFieldContext(context)
        ) {
          renderGemStatusIndicator(context, optimisticStatusData || patchedCustomFields);
        } else {
          warmCustomFieldsForContext(context, result.runId || effectiveRunId, {
            preferCache: false,
            refreshInBackground: false,
            forceRefresh: true
          })
            .then((refreshedCustomFields) => {
              if (
                isLinkedInProfilePage() &&
                isCurrentGemStatusDisplayEnabled(cachedSettings) &&
                shouldRenderUpdatedCustomFieldContext(context)
              ) {
                const refreshedCandidateId = String(
                  refreshedCustomFields?.candidateId || result.candidateId || context.gemCandidateId || ""
                ).trim();
                const liveOptimisticEntry = getOptimisticGemStatusSelection(context, refreshedCandidateId);
                if (shouldPreferOptimisticGemStatusData(refreshedCustomFields, liveOptimisticEntry)) {
                  renderGemStatusIndicator(
                    context,
                    buildOptimisticGemStatusData(
                      context,
                      liveOptimisticEntry,
                      liveOptimisticEntry?.candidateId || refreshedCandidateId
                    )
                  );
                } else {
                  if (liveOptimisticEntry) {
                    clearOptimisticGemStatusSelection(
                      context,
                      liveOptimisticEntry.candidateId || refreshedCandidateId
                    );
                  }
                  renderGemStatusIndicator(context, refreshedCustomFields);
                }
              }
            })
            .catch(() => {});
        }
      } else if (
        isLinkedInProfilePage() &&
        [
          ACTIONS.ADD_PROSPECT,
          ACTIONS.ADD_TO_PROJECT,
          ACTIONS.ADD_NOTE_TO_CANDIDATE,
          ACTIONS.OPEN_ACTIVITY,
          ACTIONS.SET_REMINDER,
          ACTIONS.SEND_SEQUENCE,
          ACTIONS.EDIT_SEQUENCE
        ].includes(actionId)
      ) {
        refreshGemStatusIndicator({
          context,
          forceRefresh: true,
          runId: result.runId || effectiveRunId
        }).catch(() => {});
      }
      showToast(result.message || "Action completed.");
      if (actionId === ACTIONS.UPLOAD_TO_ASHBY && result.link) {
        showAshbyUploadResultCard(result.link, result.message || "Candidate uploaded to Ashby.");
      }
      await logEvent({
        source: "extension.content",
        event: "action.result.success",
        actionId,
        runId: result.runId || effectiveRunId,
        message: result.message || "Action completed.",
        link: result.link || contextLink
      });
      return {
        ok: true,
        message: result.message || "Action completed.",
        runId: result.runId || effectiveRunId,
        link: result.link || "",
        debugSummary: describeContextSignals(context)
      };
    }
    showToast(result?.message || "Action failed.", true);
    await logEvent({
      source: "extension.content",
      level: "error",
      event: "action.result.failed",
      actionId,
      runId: result?.runId || effectiveRunId,
      message: result?.message || "Action failed.",
      link: contextLink
    });
    return {
      ok: false,
      message: result?.message || "Action failed.",
      runId: result?.runId || effectiveRunId,
      debugSummary: describeContextSignals(context)
    };
  } catch (error) {
    showToast(error.message || "Action failed.", true);
    logEvent({
      source: "extension.content",
      level: "error",
      event: "action.exception",
      actionId,
      runId: effectiveRunId,
      message: error.message || "Action failed.",
      link: initialLink
    });
    return {
      ok: false,
      message: error.message || "Action failed.",
      runId: effectiveRunId,
      debugSummary: contextSignalSummary
    };
  } finally {
    releaseActionLock();
  }
}

function getConfiguredShortcut(shortcutId) {
  const configured = normalizeShortcut(cachedSettings?.shortcuts?.[shortcutId] || "");
  if (configured) {
    return configured;
  }
  return normalizeShortcut(DEFAULT_SETTINGS?.shortcuts?.[shortcutId] || "");
}

function getConfiguredShortcutLabel(shortcutId) {
  const shortcut = getConfiguredShortcut(shortcutId);
  return formatShortcutForMac(shortcut) || shortcut;
}

function isConfiguredShortcut(event, shortcutId) {
  if (!event || event.repeat) {
    return false;
  }
  const expectedShortcut = getConfiguredShortcut(shortcutId);
  if (!expectedShortcut) {
    return false;
  }
  const actualShortcut = normalizeShortcut(keyboardEventToShortcut(event));
  if (!actualShortcut) {
    return false;
  }
  if (actualShortcut === expectedShortcut) {
    return true;
  }
  const legacyShortcut = normalizeShortcut(keyboardEventToShortcut(event, { preferLegacyCode: true }));
  return Boolean(legacyShortcut) && legacyShortcut === expectedShortcut;
}

function getConfiguredLinkedInShortcut(shortcutId) {
  return getConfiguredShortcut(shortcutId);
}

function getConfiguredLinkedInShortcutLabel(shortcutId) {
  return getConfiguredShortcutLabel(shortcutId);
}

function isConfiguredLinkedInShortcut(event, shortcutId) {
  return isConfiguredShortcut(event, shortcutId);
}

function isConnectShortcut(event) {
  return isConfiguredLinkedInShortcut(event, LINKEDIN_SHORTCUT_IDS.CONNECT);
}

function isCycleGemStatusDisplayModeShortcut(event) {
  return isConfiguredShortcut(event, GEM_STATUS_DISPLAY_MODE_SHORTCUT_ID);
}

function applyGemStatusDisplayModeLocally(mode, runId = "") {
  if (isBootstrapManagedLinkedInPage()) {
    hideGemStatusIndicator();
    return;
  }
  const nextMode = normalizeGemStatusDisplayMode(mode, true);
  if (!isGemStatusDisplayEnabled(nextMode)) {
    resetGemStatusIndicator();
    return;
  }
  if (!isLinkedInProfilePage()) {
    return;
  }
  const context = applyGemCandidateHintToContext(getProfileContext());
  const memoryEntry = getCustomFieldMemoryEntry(context);
  if (memoryEntry.entry && String(memoryEntry.entry.candidateId || "").trim()) {
    renderGemStatusIndicator(context, memoryEntry.entry);
  }
  syncLinkedInGemStatusForCurrentPage({
    forceIdentity: true,
    delayMs: 0,
    forceRefresh: true
  });
}

async function cycleGemStatusDisplayModeSetting(
  runId,
  shortcutLabel = getConfiguredShortcutLabel(GEM_STATUS_DISPLAY_MODE_SHORTCUT_ID)
) {
  const currentSettings = cachedSettings || (await refreshSettings());
  const previousSettings = deepMerge(DEFAULT_SETTINGS, currentSettings || {});
  const currentMode = getCurrentGemStatusDisplayMode(currentSettings);
  const nextMode = cycleGemStatusDisplayMode(currentMode);
  const nextSettings = deepMerge(DEFAULT_SETTINGS, currentSettings || {});
  nextSettings.gemStatusDisplayMode = nextMode;

  cachedSettings = deepMerge(DEFAULT_SETTINGS, nextSettings);
  applyGemStatusDisplayModeLocally(nextMode, runId);

  const nextLabel = formatGemStatusDisplayModeLabel(nextMode);
  showToast(`Gem status display: ${nextLabel}.`);
  logEvent({
    source: "extension.content",
    event: "gem_status.display_mode.cycled",
    runId,
    message: `Gem status display set to ${nextLabel.toLowerCase()}.`,
    link: window.location.href,
    details: {
      fromMode: currentMode,
      toMode: nextMode,
      shortcut: shortcutLabel
    }
  }).catch(() => {});

  saveSettings(nextSettings).catch((error) => {
    cachedSettings = deepMerge(DEFAULT_SETTINGS, previousSettings);
    applyGemStatusDisplayModeLocally(getCurrentGemStatusDisplayMode(previousSettings), runId);
    showToast(error.message || "Could not persist Gem status display mode.", true);
    logEvent({
      source: "extension.content",
      level: "error",
      event: "gem_status.display_mode.persist_failed",
      runId,
      message: error.message || "Could not persist Gem status display mode.",
      link: window.location.href,
      details: {
        attemptedMode: nextMode,
        fallbackMode: getCurrentGemStatusDisplayMode(previousSettings),
        shortcut: shortcutLabel
      }
    }).catch(() => {});
  });
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
    .trim();
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

function isInviteAddNoteLabel(label) {
  const normalized = normalizeProfileActionLabel(label);
  return normalized === "add a note" || normalized.startsWith("add a note");
}

function isInviteSendWithoutNoteLabel(label) {
  const normalized = normalizeProfileActionLabel(label);
  return (
    normalized.includes("send without a note") ||
    (normalized.includes("send") && normalized.includes("without") && normalized.includes("note"))
  );
}

function findVisibleInviteDecisionButtons(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return {
      addNoteButton: null,
      sendWithoutNoteButton: null
    };
  }

  let addNoteButton = null;
  let sendWithoutNoteButton = null;
  const candidates = querySelectorAllDeep(root, "button, a[role='button'], [role='button']");
  for (const candidate of candidates) {
    if (!isElementVisible(candidate) || isCandidateDisabled(candidate)) {
      continue;
    }
    const label = getElementLabel(candidate);
    if (!addNoteButton && isInviteAddNoteLabel(label)) {
      addNoteButton = candidate;
    }
    if (!sendWithoutNoteButton && isInviteSendWithoutNoteLabel(label)) {
      sendWithoutNoteButton = candidate;
    }
    if (addNoteButton && sendWithoutNoteButton) {
      break;
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
      if (!addNoteButton && isInviteAddNoteLabel(label)) {
        addNoteButton = button;
      }
      if (!sendWithoutNoteButton && isInviteSendWithoutNoteLabel(label)) {
        sendWithoutNoteButton = button;
      }
      if (addNoteButton && sendWithoutNoteButton) {
        break;
      }
    }
  }

  return {
    addNoteButton,
    sendWithoutNoteButton
  };
}

function getVisibleInviteDecisionDialogState() {
  const roots = getInviteDecisionRoots();
  for (const root of roots) {
    const buttons = findVisibleInviteDecisionButtons(root);
    if (buttons.addNoteButton && buttons.sendWithoutNoteButton) {
      return {
        dialog: root,
        ...buttons
      };
    }
  }

  return null;
}

function getInviteDecisionRoots() {
  const roots = [];
  const seen = new Set();
  const addRoot = (candidate) => {
    if (!candidate || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    roots.push(candidate);
  };

  addRoot(document.getElementById("interop-outlet"));
  addRoot(document.body);
  addRoot(document.documentElement);
  for (const candidate of document.querySelectorAll(
    "#interop-outlet, #interop-outlet *, [role='dialog'], .artdeco-modal, .artdeco-modal__content, .artdeco-modal-overlay, .send-invite"
  )) {
    addRoot(candidate);
  }

  return roots;
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
      isInviteAddNoteLabel(label) ||
      isInviteSendWithoutNoteLabel(label) ||
      label.toLowerCase().includes("invitation") ||
      label.toLowerCase().includes("invite")
    ) {
      return true;
    }
  }
  return false;
}

function findInviteDialogButton(dialog, matcher) {
  if (!dialog || typeof matcher !== "function") {
    return null;
  }
  const candidates = querySelectorAllDeep(dialog, "button, a[role='button'], [role='button']");
  for (const candidate of candidates) {
    if (!isElementVisible(candidate) || isCandidateDisabled(candidate)) {
      continue;
    }
    if (matcher(getElementLabel(candidate).toLowerCase())) {
      return candidate;
    }
  }
  return null;
}

function resolveInviteDecisionTargetButton(dialogState, action) {
  if (!dialogState || !action) {
    return null;
  }
  if (action === "send-without-note") {
    return (
      dialogState.sendWithoutNoteButton ||
      findInviteDialogButton(dialogState.dialog, (label) => isInviteSendWithoutNoteLabel(label))
    );
  }
  if (action === "add-note") {
    return dialogState.addNoteButton || findInviteDialogButton(dialogState.dialog, (label) => isInviteAddNoteLabel(label));
  }
  return null;
}

async function waitForInviteDecisionDialogState(
  timeoutMs = LINKEDIN_INVITE_DECISION_TIMEOUT_MS,
  pollIntervalMs = LINKEDIN_INVITE_DECISION_POLL_INTERVAL_MS
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const dialogState = getVisibleInviteDecisionDialogState();
    if (dialogState) {
      return dialogState;
    }
    await waitFor(pollIntervalMs);
  }
  return null;
}

function handleInviteDecisionShortcut(event) {
  let action = "";
  let shortcutLabel = "";
  if (isConfiguredLinkedInShortcut(event, LINKEDIN_SHORTCUT_IDS.INVITE_SEND_WITHOUT_NOTE)) {
    action = "send-without-note";
    shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.INVITE_SEND_WITHOUT_NOTE);
  } else if (isConfiguredLinkedInShortcut(event, LINKEDIN_SHORTCUT_IDS.INVITE_ADD_NOTE)) {
    action = "add-note";
    shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.INVITE_ADD_NOTE);
  } else {
    return false;
  }

  const initialDialogState = getVisibleInviteDecisionDialogState();
  if (!initialDialogState && !hasVisibleInviteDecisionDialogShell()) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  const runId = generateRunId();

  (async () => {
    const dialogState = initialDialogState || (await waitForInviteDecisionDialogState());
    const targetButton = resolveInviteDecisionTargetButton(dialogState, action);
    if (!targetButton) {
      showToast("Could not find invite action button.", true);
      await logEvent({
        source: "extension.content",
        level: "warn",
        event: "invite-shortcut.not-found",
        runId,
        message: "Invite modal shortcut pressed, but target button was not found.",
        link: window.location.href,
        details: {
          key: String(event.key || ""),
          action,
          shortcut: shortcutLabel
        }
      }).catch(() => {});
      return;
    }

    targetButton.click();
    showToast(action === "add-note" ? "Add note selected." : "Send without note selected.");
    await logEvent({
      source: "extension.content",
      event: "invite-shortcut.triggered",
      runId,
      message: `Triggered invite modal action: ${action}.`,
      link: window.location.href,
      details: {
        key: String(event.key || ""),
        action,
        shortcut: shortcutLabel
      }
    }).catch(() => {});
  })().catch(() => {
    showToast("Could not trigger invite action.", true);
  });
  return true;
}

function isConnectLabel(label) {
  const normalized = String(label || "").toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes("connected") || normalized.includes("connection") || normalized.includes("disconnect")) {
    return false;
  }
  if (normalized === "connect" || normalized.startsWith("connect ")) {
    return true;
  }
  return normalized.includes("invite") && normalized.includes("connect");
}

function isPendingConnectLabel(label) {
  const normalized = normalizeProfileActionLabel(label);
  if (!normalized) {
    return false;
  }
  return (
    normalized === "pending" ||
    normalized.startsWith("pending ") ||
    normalized.includes(" withdraw invitation") ||
    normalized.includes("withdraw invitation sent")
  );
}

function normalizeProfileActionLabel(label) {
  return String(label || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isViewInRecruiterLabel(label) {
  const normalized = normalizeProfileActionLabel(label);
  if (!normalized) {
    return false;
  }
  if (normalized === "view in recruiter" || normalized.startsWith("view in recruiter ")) {
    return true;
  }
  // LinkedIn variants can include extra lead-in words while still representing the same CTA.
  return (
    normalized.includes("recruiter") &&
    (normalized.startsWith("view ") || normalized.includes(" view ") || normalized.startsWith("open "))
  );
}

function isMessageActionLabel(label) {
  const normalized = normalizeProfileActionLabel(label);
  if (!normalized) {
    return false;
  }
  return normalized === "message" || normalized.startsWith("message ") || normalized.startsWith("send message");
}

function isContactInfoLabel(label) {
  const normalized = normalizeProfileActionLabel(label);
  if (!normalized) {
    return false;
  }
  return normalized === "contact info" || normalized === "contact information" || normalized.includes("contact info");
}

function isExactEllipsisSeeMoreLabel(label) {
  const normalized = normalizeProfileActionLabel(label);
  return /^(?:show\s+)?(?:\.\.\.|…)\s*(?:see\s+)?more$/.test(normalized);
}

function isSendLabel(label) {
  const normalized = normalizeProfileActionLabel(label);
  return normalized === "send" || normalized.startsWith("send ");
}

function isMoreLabel(label) {
  const normalized = String(label || "").toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized === "more" || normalized.includes("more actions");
}

function isPrimaryProfileActionLabel(label) {
  const normalized = String(label || "").toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    isMoreLabel(normalized) ||
    isConnectLabel(normalized) ||
    normalized === "message" ||
    normalized.startsWith("message ") ||
    normalized === "follow" ||
    normalized.startsWith("follow ") ||
    normalized.includes("pending")
  );
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

function getProfileHeadingElement() {
  const candidates = Array.from(document.querySelectorAll("main h1, h1")).filter((candidate) => {
    if (!candidate || !isElementVisible(candidate)) {
      return false;
    }
    if (candidate.closest("header, nav, aside, footer")) {
      return false;
    }
    return true;
  });
  if (candidates.length === 0) {
    return document.querySelector("main h1") || document.querySelector("h1");
  }
  candidates.sort((left, right) => {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    if (Math.abs(leftRect.top - rightRect.top) > 1) {
      return leftRect.top - rightRect.top;
    }
    return leftRect.left - rightRect.left;
  });
  return candidates[0];
}

function getProfileHeadingRect(headingElement) {
  if (!headingElement || typeof headingElement.getBoundingClientRect !== "function") {
    return null;
  }
  return headingElement.getBoundingClientRect();
}

function isElementInProfileActionBand(element, headingRect) {
  if (!headingRect) {
    if (!element?.closest("main")) {
      return false;
    }
    if (element.closest("header, nav, aside, footer")) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.top <= PROFILE_ACTION_FALLBACK_MAX_TOP;
  }
  const rect = element.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;
  const minY = headingRect.top - PROFILE_ACTION_BAND_TOP_OFFSET;
  const maxY = headingRect.bottom + PROFILE_ACTION_BAND_BOTTOM_OFFSET;
  if (centerY < minY || centerY > maxY) {
    return false;
  }
  const maxAllowedLeft = headingRect.right + PROFILE_ACTION_COLUMN_MAX_X_OFFSET;
  if (rect.left > maxAllowedLeft) {
    return false;
  }
  return true;
}

function describeElementForLog(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") {
    return {
      label: "",
      tag: "",
      className: "",
      top: 0,
      left: 0
    };
  }
  const rect = element.getBoundingClientRect();
  return {
    label: getElementLabel(element).slice(0, 120),
    tag: String(element.tagName || "").toLowerCase(),
    className: String(element.className || "").slice(0, 180),
    top: Math.round(rect.top),
    left: Math.round(rect.left)
  };
}

function isInsideRecommendationModule(element) {
  if (!element) {
    return false;
  }
  const blockedSectionTitles = [
    "people similar",
    "more profiles for you",
    "people also viewed",
    "people you may know"
  ];
  const blockedClassPatterns = /(right-rail|discovery|recommend|suggested|browsemap|ad-banner|ad-slot)/i;
  const section = element.closest("section, aside, article");
  if (section) {
    const heading = section.querySelector("h2, h3, h4");
    if (heading) {
      const headingText = String(heading.textContent || "").trim().toLowerCase();
      if (blockedSectionTitles.some((title) => headingText.includes(title))) {
        return true;
      }
    }
  }

  let cursor = element;
  while (cursor && cursor !== document.body) {
    if (blockedClassPatterns.test(String(cursor.className || ""))) {
      return true;
    }
    cursor = cursor.parentElement;
  }
  return false;
}

function isInsideLinkedInActivitySection(element) {
  if (!element) {
    return false;
  }
  let cursor = element.closest("section");
  while (cursor) {
    const heading = cursor.querySelector("h1, h2, h3, h4");
    const headingText = normalizeProfileActionLabel(heading?.textContent || "");
    if (headingText === "activity" || headingText.startsWith("activity ")) {
      return true;
    }
    cursor = cursor.parentElement?.closest("section") || null;
  }
  return false;
}

function getProfileSectionRootForHeading(headingElement) {
  if (!headingElement) {
    return null;
  }
  return headingElement.closest("section, article") || headingElement.parentElement || null;
}

function findVisibleProfileSectionRootByHeadingMatcher(matcher, root = document.querySelector("main")) {
  if (!root || typeof root.querySelectorAll !== "function" || typeof matcher !== "function") {
    return null;
  }

  const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4")).filter((candidate) => {
    if (!candidate || !isElementVisible(candidate)) {
      return false;
    }
    if (candidate.closest("header, nav, aside, footer")) {
      return false;
    }
    if (isInsideRecommendationModule(candidate)) {
      return false;
    }
    return matcher(normalizeProfileActionLabel(candidate.textContent || ""), candidate);
  });
  if (headings.length === 0) {
    return null;
  }

  headings.sort((left, right) => {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    if (Math.abs(leftRect.top - rightRect.top) > 1) {
      return leftRect.top - rightRect.top;
    }
    return leftRect.left - rightRect.left;
  });
  return getProfileSectionRootForHeading(headings[0]);
}

function getProfileAboutSectionRoot() {
  return findVisibleProfileSectionRootByHeadingMatcher((label) => label === "about" || label.startsWith("about "));
}

function isNodeBeforeReferenceInDom(node, referenceNode) {
  if (!node || !referenceNode || typeof node.compareDocumentPosition !== "function") {
    return true;
  }
  if (node === referenceNode || node.contains(referenceNode)) {
    return false;
  }
  return Boolean(node.compareDocumentPosition(referenceNode) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function findVisibleProfileActionControl(root = document, options = {}) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return null;
  }
  const headingRect = options.headingRect || null;
  const beforeElement = options.beforeElement || null;
  const skipHeadingBand = Boolean(options.skipHeadingBand);
  const matcher = typeof options.matcher === "function" ? options.matcher : null;
  if (!matcher) {
    return null;
  }
  const selectors = Array.isArray(options.selectors) && options.selectors.length > 0
    ? options.selectors
    : ["button", "a[role='button']", "[role='button']"];
  const matches = [];
  const candidates = root.querySelectorAll(selectors.join(","));
  for (const candidate of candidates) {
    if (!isElementVisible(candidate) || isCandidateDisabled(candidate)) {
      continue;
    }
    if (isInsideRecommendationModule(candidate)) {
      continue;
    }
    if (beforeElement && !isNodeBeforeReferenceInDom(candidate, beforeElement)) {
      continue;
    }
    if (!skipHeadingBand && !isElementInProfileActionBand(candidate, headingRect)) {
      continue;
    }
    if (!matcher(getElementLabel(candidate), candidate)) {
      continue;
    }
    matches.push(candidate);
  }
  if (matches.length === 0) {
    return null;
  }
  if (!headingRect || matches.length === 1) {
    return matches[0];
  }
  const headingCenter = {
    x: headingRect.left + headingRect.width / 2,
    y: headingRect.top + headingRect.height / 2
  };
  matches.sort((left, right) => getDistance(getNodeCenter(left), headingCenter) - getDistance(getNodeCenter(right), headingCenter));
  return matches[0];
}

function findVisibleConnectControl(root = document, options = {}) {
  return findVisibleProfileActionControl(root, {
    ...options,
    matcher: (label) => isConnectLabel(label),
    selectors: [
      "a",
      "button",
      "a[role='button']",
      "[role='button']",
      "[role='menuitem']",
      "li[role='menuitem']",
      ".artdeco-dropdown__item",
      ".artdeco-dropdown__item-content"
    ]
  });
}

function findVisibleMoreControl(root = document, options = {}) {
  const headingRect = options.headingRect || null;
  const beforeElement = options.beforeElement || null;
  const selectors = [
    "button",
    "a[role='button']",
    "[role='button']"
  ];
  const candidates = root.querySelectorAll(selectors.join(","));
  for (const candidate of candidates) {
    if (!isElementVisible(candidate) || isCandidateDisabled(candidate)) {
      continue;
    }
    if (isInsideRecommendationModule(candidate)) {
      continue;
    }
    if (beforeElement && !isNodeBeforeReferenceInDom(candidate, beforeElement)) {
      continue;
    }
    if (!isElementInProfileActionBand(candidate, headingRect)) {
      continue;
    }
    if (isMoreLabel(getElementLabel(candidate))) {
      return candidate;
    }
  }
  return null;
}

function findVisibleMoreControlAcrossRoots(roots, options = {}) {
  for (const root of roots) {
    const match = findVisibleMoreControl(root, options);
    if (match) {
      return match;
    }
  }
  return null;
}

function getProfileTopCardRoot(headingElement, headingRect) {
  if (!headingElement) {
    return null;
  }
  const aboutSectionRoot = getProfileAboutSectionRoot();

  const knownContainers = [
    ".pv-top-card-v2-ctas",
    ".pv-top-card__actions",
    ".pvs-profile-actions",
    ".pvs-profile-header__actions"
  ];
  const knownContainerCandidates = [];
  for (const selector of knownContainers) {
    for (const node of document.querySelectorAll(`main ${selector}`)) {
      if (!node || knownContainerCandidates.includes(node)) {
        continue;
      }
      if (isInsideRecommendationModule(node)) {
        continue;
      }
      if (aboutSectionRoot && !isNodeBeforeReferenceInDom(node, aboutSectionRoot) && !node.contains(headingElement)) {
        continue;
      }
      knownContainerCandidates.push(node);
    }
  }
  if (headingRect && knownContainerCandidates.length > 1) {
    const headingCenter = {
      x: headingRect.left + headingRect.width / 2,
      y: headingRect.top + headingRect.height / 2
    };
    knownContainerCandidates.sort(
      (left, right) => getDistance(getNodeCenter(left), headingCenter) - getDistance(getNodeCenter(right), headingCenter)
    );
  }
  for (const node of knownContainerCandidates) {
    let rootCandidate = node.closest("section, article") || node.parentElement;
    while (rootCandidate && rootCandidate !== document.body && rootCandidate.tagName !== "MAIN") {
      if (rootCandidate.contains(headingElement)) {
        return rootCandidate;
      }
      rootCandidate = rootCandidate.parentElement;
    }
  }

  let cursor = headingElement.parentElement;
  while (cursor && cursor.tagName !== "MAIN") {
    const controls = cursor.querySelectorAll("button, a[role='button'], [role='button']");
    let foundProfileAction = false;
    for (const control of controls) {
      if (!isElementVisible(control) || isCandidateDisabled(control)) {
        continue;
      }
      if (!isElementInProfileActionBand(control, headingRect)) {
        continue;
      }
      if (isPrimaryProfileActionLabel(getElementLabel(control))) {
        foundProfileAction = true;
        break;
      }
    }
    if (foundProfileAction) {
      return cursor;
    }
    cursor = cursor.parentElement;
  }

  const fallbackRoot = getProfileSectionRootForHeading(headingElement);
  if (fallbackRoot && (!aboutSectionRoot || isNodeBeforeReferenceInDom(fallbackRoot, aboutSectionRoot))) {
    return fallbackRoot;
  }
  return headingElement.parentElement || null;
}

function getProfileActionSearchRoots(topCardRoot) {
  const roots = [];
  const mainRoot = document.querySelector("main");
  [topCardRoot, mainRoot].forEach((candidate) => {
    if (!candidate || typeof candidate.querySelectorAll !== "function") {
      return;
    }
    if (!roots.includes(candidate)) {
      roots.push(candidate);
    }
  });
  if (roots.length === 0 && typeof document.querySelectorAll === "function") {
    roots.push(document);
  }
  return roots;
}

function findVisibleProfileActionControlAcrossRoots(roots, options = {}) {
  for (const root of roots) {
    const match = findVisibleProfileActionControl(root, options);
    if (match) {
      return match;
    }
  }
  return null;
}

function getNodeCenter(node) {
  const rect = node.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function getDistance(pointA, pointB) {
  const dx = pointA.x - pointB.x;
  const dy = pointA.y - pointB.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getMenuScopesForMoreControl(moreControl) {
  const scopes = [];
  if (!moreControl) {
    return scopes;
  }

  const controlsId = String(
    moreControl.getAttribute("aria-controls") || moreControl.getAttribute("aria-owns") || ""
  ).trim();
  if (controlsId) {
    const controlled = document.getElementById(controlsId);
    if (controlled && isElementVisible(controlled)) {
      scopes.push(controlled);
    }
  }

  const localPopover = moreControl
    .closest(".artdeco-dropdown, .artdeco-popover")
    ?.querySelector(".artdeco-dropdown__content, .artdeco-popover__content, [role='menu']");
  if (localPopover && isElementVisible(localPopover)) {
    scopes.push(localPopover);
  }

  const menuSelectors = [
    ".artdeco-dropdown__content:not([aria-hidden='true'])",
    ".artdeco-popover__content",
    "[role='menu']"
  ];
  const menuCandidates = Array.from(document.querySelectorAll(menuSelectors.join(","))).filter(isElementVisible);
  if (menuCandidates.length > 0) {
    const moreCenter = getNodeCenter(moreControl);
    menuCandidates.sort((a, b) => getDistance(getNodeCenter(a), moreCenter) - getDistance(getNodeCenter(b), moreCenter));
    scopes.push(menuCandidates[0]);
  }

  return Array.from(new Set(scopes));
}

function waitFor(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForProfileHeading(timeoutMs = 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const headingElement = getProfileHeadingElement();
    const headingRect = getProfileHeadingRect(headingElement);
    if (headingElement && headingRect) {
      return {
        headingElement,
        headingRect
      };
    }
    await waitFor(50);
  }
  return {
    headingElement: null,
    headingRect: null
  };
}

async function waitForConnectInMenuForControl(moreControl, timeoutMs = 1600) {
  return waitForProfileActionInMenuForControl(moreControl, {
    matcher: (label) => isConnectLabel(label),
    selectors: [
      "a",
      "button",
      "a[role='button']",
      "[role='button']",
      "[role='menuitem']",
      "li[role='menuitem']",
      ".artdeco-dropdown__item",
      ".artdeco-dropdown__item-content"
    ]
  }, timeoutMs);
}

async function waitForPendingInMenuForControl(moreControl, timeoutMs = 500) {
  return waitForProfileActionInMenuForControl(moreControl, {
    matcher: (label) => isPendingConnectLabel(label),
    selectors: [
      "a",
      "button",
      "a[role='button']",
      "[role='button']",
      "[role='menuitem']",
      "li[role='menuitem']",
      ".artdeco-dropdown__item",
      ".artdeco-dropdown__item-content"
    ]
  }, timeoutMs);
}

async function waitForProfileActionInMenuForControl(moreControl, findOptions = {}, timeoutMs = 1600) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const menuScopes = getMenuScopesForMoreControl(moreControl);
    for (const scope of menuScopes) {
      const menuAction = findVisibleProfileActionControl(scope, {
        ...findOptions,
        skipHeadingBand: true
      });
      if (menuAction) {
        return menuAction;
      }
    }
    await waitFor(50);
  }
  return null;
}

async function triggerConnectShortcut(runId, shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.CONNECT)) {
  const { headingElement, headingRect } = await waitForProfileHeading();
  const headingFound = Boolean(headingElement && headingRect);
  const aboutSectionRoot = headingFound ? getProfileAboutSectionRoot() : null;
  markLastLinkedInActionDiagnosticsForPage({
    action: "connect",
    stage: "start",
    shortcut: shortcutLabel,
    headingFound,
    topCardRootFound: false,
    searchRootCount: 0
  });
  const topCardRoot = headingFound ? getProfileTopCardRoot(headingElement, headingRect) : null;
  const searchRoots = getProfileActionSearchRoots(topCardRoot);
  markLastLinkedInActionDiagnosticsForPage({
    action: "connect",
    stage: headingFound ? "searching" : "searching-no-heading",
    shortcut: shortcutLabel,
    headingFound,
    topCardRootFound: Boolean(topCardRoot),
    searchRootCount: searchRoots.length
  });
  const directConnect = findVisibleProfileActionControlAcrossRoots(searchRoots, {
    headingRect,
    beforeElement: aboutSectionRoot,
    matcher: (label) => isConnectLabel(label),
    selectors: [
      "a",
      "button",
      "a[role='button']",
      "[role='button']",
      "[role='menuitem']",
      "li[role='menuitem']",
      ".artdeco-dropdown__item",
      ".artdeco-dropdown__item-content"
    ]
  });
  if (directConnect) {
    const clicked = describeElementForLog(directConnect);
    markLastLinkedInActionDiagnosticsForPage({
      action: "connect",
      stage: "clicked-direct",
      shortcut: shortcutLabel,
      clicked: clicked.label,
      headingFound,
      topCardRootFound: Boolean(topCardRoot),
      searchRootCount: searchRoots.length
    });
    directConnect.click();
    showToast("Connect action triggered.");
    await logEvent({
      source: "extension.content",
      event: "connect-shortcut.triggered",
      runId,
      message: `Triggered profile connect action via ${shortcutLabel}.`,
      link: window.location.href,
      details: {
        shortcut: shortcutLabel,
        method: "direct",
        clicked
      }
    });
    return;
  }

  const pendingConnect = findVisibleProfileActionControlAcrossRoots(searchRoots, {
    headingRect,
    beforeElement: aboutSectionRoot,
    matcher: (label) => isPendingConnectLabel(label),
    selectors: [
      "a",
      "button",
      "a[role='button']",
      "[role='button']",
      "[role='menuitem']",
      "li[role='menuitem']",
      ".artdeco-dropdown__item",
      ".artdeco-dropdown__item-content"
    ]
  });
  if (pendingConnect) {
    const clicked = describeElementForLog(pendingConnect);
    markLastLinkedInActionDiagnosticsForPage({
      action: "connect",
      stage: "already-pending",
      shortcut: shortcutLabel,
      clicked: clicked.label,
      headingFound,
      topCardRootFound: Boolean(topCardRoot),
      searchRootCount: searchRoots.length
    });
    showToast("Connection request already pending.");
    await logEvent({
      source: "extension.content",
      event: "connect-shortcut.pending",
      runId,
      message: `Connect shortcut pressed via ${shortcutLabel}, but the profile is already pending.`,
      link: window.location.href,
      details: {
        shortcut: shortcutLabel,
        clicked
      }
    });
    return;
  }

  const moreControl = findVisibleMoreControlAcrossRoots(searchRoots, {
    headingRect,
    beforeElement: aboutSectionRoot
  });
  if (!moreControl) {
    markLastLinkedInActionDiagnosticsForPage({
      action: "connect",
      stage: "missing-more",
      shortcut: shortcutLabel,
      headingFound,
      topCardRootFound: Boolean(topCardRoot),
      searchRootCount: searchRoots.length
    });
    showToast("Couldn't find a Connect action on this profile.", true);
    await logEvent({
      source: "extension.content",
      level: "warn",
      event: "connect-shortcut.not-found",
      runId,
      message: topCardRoot
        ? "Could not find direct Connect button or More actions menu."
        : headingFound
          ? "Could not resolve top-card root and fallback action search did not find Connect or More."
          : "Heading was unavailable and fallback action search did not find Connect or More.",
      link: window.location.href,
      details: {
        shortcut: shortcutLabel,
        headingFound,
        topCardRootFound: Boolean(topCardRoot),
        headingTop: headingRect ? Math.round(headingRect.top) : 0,
        headingBottom: headingRect ? Math.round(headingRect.bottom) : 0
      }
    });
    return;
  }

  moreControl.click();
  const menuConnect = await waitForConnectInMenuForControl(moreControl);
  if (menuConnect) {
    const clicked = describeElementForLog(menuConnect);
    markLastLinkedInActionDiagnosticsForPage({
      action: "connect",
      stage: "clicked-menu",
      shortcut: shortcutLabel,
      clicked: clicked.label,
      headingFound,
      topCardRootFound: Boolean(topCardRoot),
      searchRootCount: searchRoots.length
    });
    menuConnect.click();
    showToast("Connect action triggered.");
    await logEvent({
      source: "extension.content",
      event: "connect-shortcut.triggered",
      runId,
      message: `Triggered profile connect action via ${shortcutLabel}.`,
      link: window.location.href,
      details: {
        shortcut: shortcutLabel,
        method: "more-menu",
        clicked
      }
    });
    return;
  }

  const pendingMenuItem = await waitForPendingInMenuForControl(moreControl);
  if (pendingMenuItem) {
    const clicked = describeElementForLog(pendingMenuItem);
    markLastLinkedInActionDiagnosticsForPage({
      action: "connect",
      stage: "already-pending",
      shortcut: shortcutLabel,
      clicked: clicked.label,
      headingFound,
      topCardRootFound: Boolean(topCardRoot),
      searchRootCount: searchRoots.length
    });
    showToast("Connection request already pending.");
    await logEvent({
      source: "extension.content",
      event: "connect-shortcut.pending",
      runId,
      message: `Opened More menu via ${shortcutLabel}, but the profile is already pending.`,
      link: window.location.href,
      details: {
        shortcut: shortcutLabel,
        clicked
      }
    });
    return;
  }

  markLastLinkedInActionDiagnosticsForPage({
    action: "connect",
    stage: "missing-menu-action",
    shortcut: shortcutLabel,
    headingFound,
    topCardRootFound: Boolean(topCardRoot),
    searchRootCount: searchRoots.length
  });
  showToast("Opened More menu, but couldn't find Connect.", true);
  await logEvent({
    source: "extension.content",
    level: "warn",
    event: "connect-shortcut.not-found",
    runId,
    message: "Opened More actions menu but did not find Connect entry.",
    link: window.location.href,
    details: {
      shortcut: shortcutLabel
    }
  });
}

async function triggerLinkedInPublicProfileActionShortcut(runId, actionConfig) {
  const action = String(actionConfig?.action || "").trim();
  const shortcut = String(actionConfig?.shortcut || "").trim();
  const matcher = typeof actionConfig?.matcher === "function" ? actionConfig.matcher : null;
  const successToast = String(actionConfig?.successToast || "Action triggered.").trim();
  const notFoundToast = String(actionConfig?.notFoundToast || "Couldn't find that action on this profile.").trim();
  if (!action || !shortcut || !matcher) {
    return;
  }

  const selectors = [
    "button",
    "a",
    "a[role='button']",
    "[role='button']",
    "[role='menuitem']",
    "li[role='menuitem']",
    ".artdeco-dropdown__item",
    ".artdeco-dropdown__item-content"
  ];
  const { headingElement, headingRect } = await waitForProfileHeading();
  const headingFound = Boolean(headingElement && headingRect);
  const aboutSectionRoot = headingFound ? getProfileAboutSectionRoot() : null;
  markLastLinkedInActionDiagnosticsForPage({
    action,
    stage: "start",
    shortcut,
    headingFound,
    topCardRootFound: false,
    searchRootCount: 0
  });
  const topCardRoot = headingFound ? getProfileTopCardRoot(headingElement, headingRect) : null;
  const searchRoots = getProfileActionSearchRoots(topCardRoot);
  markLastLinkedInActionDiagnosticsForPage({
    action,
    stage: headingFound ? "searching" : "searching-no-heading",
    shortcut,
    headingFound,
    topCardRootFound: Boolean(topCardRoot),
    searchRootCount: searchRoots.length
  });
  const directAction = findVisibleProfileActionControlAcrossRoots(searchRoots, {
    headingRect,
    beforeElement: aboutSectionRoot,
    matcher,
    selectors
  });
  if (directAction) {
    const clicked = describeElementForLog(directAction);
    markLastLinkedInActionDiagnosticsForPage({
      action,
      stage: "clicked-direct",
      shortcut,
      clicked: clicked.label,
      headingFound,
      topCardRootFound: Boolean(topCardRoot),
      searchRootCount: searchRoots.length
    });
    directAction.click();
    showToast(successToast);
    await logEvent({
      source: "extension.content",
      event: "linkedin-profile-shortcut.triggered",
      runId,
      message: `Triggered LinkedIn profile action "${action}" via ${shortcut}.`,
      link: window.location.href,
      details: {
        action,
        shortcut,
        method: "direct",
        clicked
      }
    });
    return;
  }

  const moreControl = findVisibleMoreControlAcrossRoots(searchRoots, {
    headingRect,
    beforeElement: aboutSectionRoot
  });
  if (!moreControl) {
    markLastLinkedInActionDiagnosticsForPage({
      action,
      stage: "missing-more",
      shortcut,
      headingFound,
      topCardRootFound: Boolean(topCardRoot),
      searchRootCount: searchRoots.length
    });
    showToast(notFoundToast, true);
    await logEvent({
      source: "extension.content",
      level: "warn",
      event: "linkedin-profile-shortcut.not-found",
      runId,
      message: topCardRoot
        ? `Could not find direct action or More menu for "${action}".`
        : headingFound
          ? `Could not resolve top-card root and fallback action search did not find "${action}" or More.`
          : `Heading was unavailable and fallback action search did not find "${action}" or More.`,
      link: window.location.href,
      details: {
        action,
        shortcut,
        headingFound,
        topCardRootFound: Boolean(topCardRoot),
        headingTop: headingRect ? Math.round(headingRect.top) : 0,
        headingBottom: headingRect ? Math.round(headingRect.bottom) : 0
      }
    });
    return;
  }

  moreControl.click();
  const menuAction = await waitForProfileActionInMenuForControl(
    moreControl,
    {
      matcher,
      selectors
    },
    1600
  );
  if (menuAction) {
    const clicked = describeElementForLog(menuAction);
    markLastLinkedInActionDiagnosticsForPage({
      action,
      stage: "clicked-menu",
      shortcut,
      clicked: clicked.label,
      headingFound,
      topCardRootFound: Boolean(topCardRoot),
      searchRootCount: searchRoots.length
    });
    menuAction.click();
    showToast(successToast);
    await logEvent({
      source: "extension.content",
      event: "linkedin-profile-shortcut.triggered",
      runId,
      message: `Triggered LinkedIn profile action "${action}" via ${shortcut}.`,
      link: window.location.href,
      details: {
        action,
        shortcut,
        method: "more-menu",
        clicked
      }
    });
    return;
  }

  markLastLinkedInActionDiagnosticsForPage({
    action,
    stage: "missing-menu-action",
    shortcut,
    headingFound,
    topCardRootFound: Boolean(topCardRoot),
    searchRootCount: searchRoots.length
  });
  showToast(notFoundToast, true);
  await logEvent({
    source: "extension.content",
    level: "warn",
    event: "linkedin-profile-shortcut.not-found",
    runId,
    message: `Opened More actions menu but did not find "${action}".`,
    link: window.location.href,
    details: {
      action,
      shortcut
    }
  });
}

async function triggerLinkedInViewInRecruiterShortcut(
  runId,
  shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.VIEW_IN_RECRUITER)
) {
  await triggerLinkedInPublicProfileActionShortcut(runId, {
    action: "view-in-recruiter",
    shortcut: shortcutLabel,
    matcher: (label) => isViewInRecruiterLabel(label),
    successToast: "View in Recruiter action triggered.",
    notFoundToast: "Couldn't find View in Recruiter on this profile."
  });
}

async function triggerLinkedInMessageShortcut(
  runId,
  shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.MESSAGE_PROFILE)
) {
  await triggerLinkedInPublicProfileActionShortcut(runId, {
    action: "message",
    shortcut: shortcutLabel,
    matcher: (label) => isMessageActionLabel(label),
    successToast: "Message action triggered.",
    notFoundToast: "Couldn't find a Message action on this profile."
  });
}

async function triggerLinkedInContactInfoShortcut(
  runId,
  shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.CONTACT_INFO)
) {
  await triggerLinkedInPublicProfileActionShortcut(runId, {
    action: "contact-info",
    shortcut: shortcutLabel,
    matcher: (label) => isContactInfoLabel(label),
    successToast: "Contact info opened.",
    notFoundToast: "Couldn't find Contact info on this profile."
  });
}

function findVisibleEllipsisMoreControls(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return [];
  }
  const selectors = ["button", "a", "a[role='button']", "[role='button']"];
  const controls = [];
  const candidates = root.querySelectorAll(selectors.join(","));
  for (const candidate of candidates) {
    if (!isElementVisible(candidate) || isCandidateDisabled(candidate)) {
      continue;
    }
    if (isInsideRecommendationModule(candidate)) {
      continue;
    }
    if (isInsideLinkedInActivitySection(candidate)) {
      continue;
    }
    const labels = [
      candidate.getAttribute("aria-label") || "",
      candidate.getAttribute("title") || "",
      candidate.textContent || "",
      getElementLabel(candidate)
    ];
    if (labels.some((label) => isExactEllipsisSeeMoreLabel(label))) {
      controls.push(candidate);
    }
  }
  return controls;
}

function getWindowScrollPosition() {
  return {
    x: window.scrollX || window.pageXOffset || 0,
    y: window.scrollY || window.pageYOffset || 0
  };
}

function captureViewportAnchor() {
  const probeX = Math.max(0, Math.min(window.innerWidth - 1, Math.round(window.innerWidth / 2)));
  const probeY = Math.max(0, Math.min(window.innerHeight - 1, 120));
  const anchor = document.elementFromPoint(probeX, probeY);
  if (!anchor) {
    return null;
  }
  return {
    element: anchor,
    top: anchor.getBoundingClientRect().top
  };
}

function restoreWindowScrollPosition(position) {
  if (!position) {
    return;
  }
  window.scrollTo({
    left: Number(position.x) || 0,
    top: Number(position.y) || 0,
    behavior: "auto"
  });
}

function restoreViewportState(state) {
  if (!state || typeof state !== "object") {
    return;
  }
  restoreWindowScrollPosition(state.scrollPosition || null);
  const anchorElement = state.anchor?.element;
  if (!anchorElement || !anchorElement.isConnected || typeof anchorElement.getBoundingClientRect !== "function") {
    return;
  }
  const deltaTop = anchorElement.getBoundingClientRect().top - Number(state.anchor?.top || 0);
  if (Math.abs(deltaTop) < 1) {
    return;
  }
  window.scrollBy({
    left: 0,
    top: deltaTop,
    behavior: "auto"
  });
}

function captureActiveElementState() {
  const activeElement = document.activeElement;
  if (
    !activeElement ||
    activeElement === document.body ||
    activeElement === document.documentElement ||
    typeof activeElement.focus !== "function"
  ) {
    return null;
  }
  const selectionStart = typeof activeElement.selectionStart === "number" ? activeElement.selectionStart : null;
  const selectionEnd = typeof activeElement.selectionEnd === "number" ? activeElement.selectionEnd : null;
  return {
    element: activeElement,
    selectionStart,
    selectionEnd
  };
}

function restoreActiveElementState(state) {
  const currentActiveElement = document.activeElement;
  const targetElement = state?.element;
  if (targetElement && targetElement.isConnected && typeof targetElement.focus === "function") {
    try {
      targetElement.focus({ preventScroll: true });
    } catch (_error) {
      // Ignore focus restore failures and fall through to best-effort cleanup below.
    }
    if (
      typeof state?.selectionStart === "number" &&
      typeof state?.selectionEnd === "number" &&
      typeof targetElement.setSelectionRange === "function"
    ) {
      try {
        targetElement.setSelectionRange(state.selectionStart, state.selectionEnd);
      } catch (_error) {
        // Ignore selection restore failures.
      }
    }
    return;
  }
  if (
    currentActiveElement &&
    currentActiveElement !== document.body &&
    currentActiveElement !== document.documentElement &&
    typeof currentActiveElement.blur === "function"
  ) {
    try {
      currentActiveElement.blur();
    } catch (_error) {
      // Ignore blur failures.
    }
  }
}

function clickWithoutViewportJump(control, viewportState, activeElementState) {
  if (!control) {
    return;
  }
  control.click();
  restoreViewportState(viewportState);
  restoreActiveElementState(activeElementState);
  restoreViewportState(viewportState);
}

async function triggerExpandEllipsisMoreShortcut(
  runId,
  shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.EXPAND_SEE_MORE)
) {
  const pageRoot = document;
  if (!pageRoot || typeof pageRoot.querySelectorAll !== "function") {
    showToast('Couldn\'t find any "... see more" controls on this page.', true);
    await logEvent({
      source: "extension.content",
      level: "warn",
      event: "linkedin-profile-shortcut.not-found",
      runId,
      message: 'Could not resolve page root for "... see more" expansion.',
      link: window.location.href,
      details: {
        action: "expand-ellipsis-see-more",
        shortcut: shortcutLabel
      }
    });
    return;
  }

  const viewportState = {
    scrollPosition: getWindowScrollPosition(),
    anchor: captureViewportAnchor()
  };
  const activeElementState = captureActiveElementState();
  const clickedControls = new Set();
  let clickedCount = 0;
  let passCount = 0;
  for (let pass = 0; pass < LINKEDIN_EXPAND_MORE_MAX_PASSES; pass += 1) {
    const nextControls = findVisibleEllipsisMoreControls(pageRoot).filter((control) => !clickedControls.has(control));
    passCount = pass + 1;
    if (nextControls.length === 0) {
      break;
    }
    for (const control of nextControls) {
      clickedControls.add(control);
      clickWithoutViewportJump(control, viewportState, activeElementState);
      clickedCount += 1;
    }
    restoreActiveElementState(activeElementState);
    restoreViewportState(viewportState);
    await waitFor(LINKEDIN_EXPAND_MORE_PASS_DELAY_MS);
    restoreActiveElementState(activeElementState);
    restoreViewportState(viewportState);
  }
  restoreActiveElementState(activeElementState);
  restoreViewportState(viewportState);

  if (clickedCount > 0) {
    const noun = clickedCount === 1 ? "control" : "controls";
    showToast(`Expanded ${clickedCount} "... more" ${noun}.`);
    await logEvent({
      source: "extension.content",
      event: "linkedin-profile-shortcut.triggered",
      runId,
      message: `Expanded ${clickedCount} "... more" controls via ${shortcutLabel}.`,
      link: window.location.href,
      details: {
        action: "expand-ellipsis-see-more",
        shortcut: shortcutLabel,
        clickedCount,
        passCount
      }
    });
    return;
  }

  showToast('No "... more" controls found to expand.', true);
  await logEvent({
    source: "extension.content",
    level: "warn",
    event: "linkedin-profile-shortcut.not-found",
    runId,
    message: 'Shortcut pressed but no exact "... more" controls were found.',
    link: window.location.href,
    details: {
      action: "expand-ellipsis-see-more",
      shortcut: shortcutLabel
    }
  });
}

function getElementShortcutSearchText(element) {
  if (!element || typeof element.getAttribute !== "function") {
    return "";
  }
  const values = [
    element.getAttribute("aria-label") || "",
    element.getAttribute("placeholder") || "",
    element.getAttribute("title") || "",
    element.getAttribute("name") || "",
    element.getAttribute("id") || "",
    element.getAttribute("data-test-id") || "",
    element.getAttribute("data-control-name") || "",
    element.getAttribute("data-test-text") || "",
    getElementLabel(element)
  ];
  const labelledBy = String(element.getAttribute("aria-labelledby") || "").trim();
  if (labelledBy) {
    labelledBy.split(/\s+/).forEach((id) => {
      const labelNode = document.getElementById(id);
      if (labelNode) {
        values.push(labelNode.textContent || "");
      }
    });
  }
  const elementId = String(element.getAttribute("id") || "").trim();
  if (elementId) {
    const labels = document.querySelectorAll("label[for]");
    for (const label of labels) {
      if (String(label.getAttribute("for") || "").trim() !== elementId) {
        continue;
      }
      values.push(label.textContent || "");
      break;
    }
  }
  const nearestLabel = element.closest("label");
  if (nearestLabel) {
    values.push(nearestLabel.textContent || "");
  }
  const nearestContainer = element.closest("[aria-label], [data-test-id], [data-control-name], [class*='compose'], [class*='composer']");
  if (nearestContainer && nearestContainer !== element) {
    values.push(
      nearestContainer.getAttribute("aria-label") || "",
      nearestContainer.getAttribute("data-test-id") || "",
      nearestContainer.getAttribute("data-control-name") || ""
    );
  }
  return normalizeProfileActionLabel(values.join(" "));
}

function isLikelyRecruiterComposerElement(element) {
  let cursor = element;
  while (cursor && cursor !== document.body) {
    const descriptor = normalizeProfileActionLabel(
      [
        cursor.getAttribute?.("aria-label") || "",
        cursor.getAttribute?.("data-test-id") || "",
        cursor.getAttribute?.("data-control-name") || "",
        cursor.className || ""
      ].join(" ")
    );
    if (
      descriptor.includes("composer") ||
      descriptor.includes("compose") ||
      descriptor.includes("inmail") ||
      descriptor.includes("message-anywhere") ||
      descriptor.includes("message composer") ||
      descriptor.includes("right rail") ||
      descriptor.includes("right-rail")
    ) {
      return true;
    }
    cursor = cursor.parentElement;
  }
  return false;
}

function compareRecruiterComposerCandidates(left, right) {
  const leftPriority = isLikelyRecruiterComposerElement(left) ? 0 : 1;
  const rightPriority = isLikelyRecruiterComposerElement(right) ? 0 : 1;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  const leftRect = left.getBoundingClientRect();
  const rightRect = right.getBoundingClientRect();
  if (Math.abs(leftRect.top - rightRect.top) > 1) {
    return leftRect.top - rightRect.top;
  }
  return leftRect.left - rightRect.left;
}

function findRecruiterTemplateTextbox(options = {}) {
  const requireComposerContext = Boolean(options.requireComposerContext);
  const selectors = [
    "input:not([type='hidden']):not([disabled])",
    "textarea:not([disabled])",
    "[contenteditable='true']",
    "[role='textbox']"
  ];
  const matches = [];
  const candidates = document.querySelectorAll(selectors.join(","));
  for (const candidate of candidates) {
    if (!isElementVisible(candidate) || isCandidateDisabled(candidate)) {
      continue;
    }
    const searchText = getElementShortcutSearchText(candidate);
    if (!searchText.includes("template")) {
      continue;
    }
    if (requireComposerContext && !isLikelyRecruiterComposerElement(candidate)) {
      continue;
    }
    matches.push(candidate);
  }
  if (matches.length === 0) {
    return null;
  }
  matches.sort(compareRecruiterComposerCandidates);
  return matches[0];
}

function findRecruiterSendButton(options = {}) {
  const requireComposerContext = Boolean(options.requireComposerContext);
  const selectors = ["button", "a[role='button']", "[role='button']", "input[type='submit']", "input[type='button']"];
  const matches = [];
  const candidates = document.querySelectorAll(selectors.join(","));
  for (const candidate of candidates) {
    if (!isElementVisible(candidate) || isCandidateDisabled(candidate)) {
      continue;
    }
    const label = [getElementLabel(candidate), candidate.getAttribute("value") || ""].join(" ");
    if (!isSendLabel(label)) {
      continue;
    }
    if (requireComposerContext && !isLikelyRecruiterComposerElement(candidate)) {
      continue;
    }
    matches.push(candidate);
  }
  if (matches.length === 0) {
    return null;
  }
  matches.sort(compareRecruiterComposerCandidates);
  return matches[0];
}

function isRecruiterComposerVisible() {
  if (!isLinkedInRecruiterProfilePage()) {
    return false;
  }
  return Boolean(
    findRecruiterTemplateTextbox({ requireComposerContext: true }) ||
      findRecruiterSendButton({ requireComposerContext: true })
  );
}

async function triggerRecruiterTemplateShortcut(
  runId,
  shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.RECRUITER_TEMPLATE)
) {
  if (!isRecruiterComposerVisible()) {
    showToast("Recruiter composer is not visible.", true);
    await logEvent({
      source: "extension.content",
      level: "warn",
      event: "linkedin-recruiter-shortcut.not-found",
      runId,
      message: "Template shortcut pressed but recruiter composer is not visible.",
      link: window.location.href,
      details: {
        action: "focus-template-textbox",
        shortcut: shortcutLabel
      }
    });
    return;
  }

  const textbox = findRecruiterTemplateTextbox({ requireComposerContext: true });
  if (!textbox) {
    showToast("Couldn't find template textbox in Recruiter composer.", true);
    await logEvent({
      source: "extension.content",
      level: "warn",
      event: "linkedin-recruiter-shortcut.not-found",
      runId,
      message: "Recruiter composer is visible but template textbox was not found.",
      link: window.location.href,
      details: {
        action: "focus-template-textbox",
        shortcut: shortcutLabel
      }
    });
    return;
  }

  textbox.focus();
  if (typeof textbox.click === "function") {
    textbox.click();
  }
  showToast("Template textbox focused.");
  await logEvent({
    source: "extension.content",
    event: "linkedin-recruiter-shortcut.triggered",
    runId,
    message: `Focused recruiter template textbox via ${shortcutLabel}.`,
    link: window.location.href,
    details: {
      action: "focus-template-textbox",
      shortcut: shortcutLabel,
      clicked: describeElementForLog(textbox)
    }
  });
}

async function triggerRecruiterSendShortcut(
  runId,
  shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.RECRUITER_SEND)
) {
  if (!isRecruiterComposerVisible()) {
    showToast("Recruiter composer is not visible.", true);
    await logEvent({
      source: "extension.content",
      level: "warn",
      event: "linkedin-recruiter-shortcut.not-found",
      runId,
      message: "Send shortcut pressed but recruiter composer is not visible.",
      link: window.location.href,
      details: {
        action: "send",
        shortcut: shortcutLabel
      }
    });
    return;
  }

  const sendButton = findRecruiterSendButton({ requireComposerContext: true });
  if (!sendButton) {
    showToast("Couldn't find Send in Recruiter composer.", true);
    await logEvent({
      source: "extension.content",
      level: "warn",
      event: "linkedin-recruiter-shortcut.not-found",
      runId,
      message: "Recruiter composer is visible but Send button was not found.",
      link: window.location.href,
      details: {
        action: "send",
        shortcut: shortcutLabel
      }
    });
    return;
  }

  sendButton.click();
  showToast("Recruiter send action triggered.");
  await logEvent({
    source: "extension.content",
    event: "linkedin-recruiter-shortcut.triggered",
    runId,
    message: `Triggered recruiter send action via ${shortcutLabel}.`,
    link: window.location.href,
    details: {
      action: "send",
      shortcut: shortcutLabel,
      clicked: describeElementForLog(sendButton)
    }
  });
}

function onKeyDown(event) {
  const supportedPage = isSupportedActionPage();
  const isLinkedInContext = isLinkedInProfilePage();
  const isLinkedInPublicContext = isLinkedInPublicProfilePage();
  const isLinkedInRecruiterContext = isLinkedInRecruiterProfilePage();
  const isModifierBasedShortcut = Boolean(event.metaKey || event.ctrlKey || event.altKey);
  const editableTarget = isEditableElement(event.target);
  const actualShortcut = normalizeShortcut(keyboardEventToShortcut(event));
  const updateShortcutDiagnostics = (match = "") => {
    markLastShortcutDiagnosticsForPage({
      shortcut: actualShortcut,
      key: event.key,
      code: event.code,
      target: event.target?.tagName || "",
      supported: supportedPage,
      linkedin: isLinkedInContext,
      linkedinPublic: isLinkedInPublicContext,
      linkedinRecruiter: isLinkedInRecruiterContext,
      editable: editableTarget,
      match
    });
  };

  updateShortcutDiagnostics();

  if (editableTarget && !isModifierBasedShortcut) {
    updateShortcutDiagnostics("blocked:editable-no-modifier");
    return;
  }

  if (supportedPage && isLinkedInContext && handleInviteDecisionShortcut(event)) {
    updateShortcutDiagnostics("inviteDecision");
    return;
  }

  if (supportedPage && isLinkedInContext && isCycleGemStatusDisplayModeShortcut(event)) {
    updateShortcutDiagnostics("cycleGemStatusDisplayMode");
    debugContentRuntime("linkedin-shortcut-matched", {
      action: "cycleGemStatusDisplayMode",
      shortcut: getConfiguredShortcutLabel(GEM_STATUS_DISPLAY_MODE_SHORTCUT_ID)
    });
    event.preventDefault();
    event.stopPropagation();
    const runId = generateRunId();
    const shortcutLabel = getConfiguredShortcutLabel(GEM_STATUS_DISPLAY_MODE_SHORTCUT_ID);
    cycleGemStatusDisplayModeSetting(runId, shortcutLabel).catch((error) => {
      showToast(error.message || "Could not cycle Gem status display mode.", true);
      logEvent({
        source: "extension.content",
        level: "error",
        event: "gem_status.display_mode.cycle_failed",
        runId,
        message: error.message || "Unexpected Gem status display mode shortcut error.",
        link: window.location.href,
        details: {
          shortcut: shortcutLabel
        }
      });
    });
    return;
  }

  if (supportedPage && isLinkedInContext && isConnectShortcut(event)) {
    updateShortcutDiagnostics("connect");
    debugContentRuntime("linkedin-shortcut-matched", {
      action: "connect",
      shortcut: getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.CONNECT)
    });
    event.preventDefault();
    event.stopPropagation();
    const runId = generateRunId();
    const shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.CONNECT);
    triggerConnectShortcut(runId, shortcutLabel).catch((error) => {
      showToast(error.message || "Could not run Connect shortcut.", true);
      logEvent({
        source: "extension.content",
        level: "error",
        event: "connect-shortcut.exception",
        runId,
        message: error.message || "Unexpected Connect shortcut error.",
        link: window.location.href,
        details: {
          shortcut: shortcutLabel
        }
      });
    });
    return;
  }

  if (supportedPage && isLinkedInPublicContext && isConfiguredLinkedInShortcut(event, LINKEDIN_SHORTCUT_IDS.VIEW_IN_RECRUITER)) {
    updateShortcutDiagnostics("viewInRecruiter");
    debugContentRuntime("linkedin-shortcut-matched", {
      action: "viewInRecruiter",
      shortcut: getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.VIEW_IN_RECRUITER)
    });
    event.preventDefault();
    event.stopPropagation();
    const runId = generateRunId();
    const shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.VIEW_IN_RECRUITER);
    triggerLinkedInViewInRecruiterShortcut(runId, shortcutLabel).catch((error) => {
      showToast(error.message || "Could not run View in Recruiter shortcut.", true);
      logEvent({
        source: "extension.content",
        level: "error",
        event: "linkedin-profile-shortcut.exception",
        runId,
        message: error.message || "Unexpected View in Recruiter shortcut error.",
        link: window.location.href,
        details: {
          action: "view-in-recruiter",
          shortcut: shortcutLabel
        }
      });
    });
    return;
  }

  if (supportedPage && isLinkedInPublicContext && isConfiguredLinkedInShortcut(event, LINKEDIN_SHORTCUT_IDS.MESSAGE_PROFILE)) {
    updateShortcutDiagnostics("message");
    debugContentRuntime("linkedin-shortcut-matched", {
      action: "message",
      shortcut: getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.MESSAGE_PROFILE)
    });
    event.preventDefault();
    event.stopPropagation();
    const runId = generateRunId();
    const shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.MESSAGE_PROFILE);
    triggerLinkedInMessageShortcut(runId, shortcutLabel).catch((error) => {
      showToast(error.message || "Could not run Message shortcut.", true);
      logEvent({
        source: "extension.content",
        level: "error",
        event: "linkedin-profile-shortcut.exception",
        runId,
        message: error.message || "Unexpected Message shortcut error.",
        link: window.location.href,
        details: {
          action: "message",
          shortcut: shortcutLabel
        }
      });
    });
    return;
  }

  if (supportedPage && isLinkedInPublicContext && isConfiguredLinkedInShortcut(event, LINKEDIN_SHORTCUT_IDS.CONTACT_INFO)) {
    updateShortcutDiagnostics("contactInfo");
    debugContentRuntime("linkedin-shortcut-matched", {
      action: "contactInfo",
      shortcut: getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.CONTACT_INFO)
    });
    event.preventDefault();
    event.stopPropagation();
    const runId = generateRunId();
    const shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.CONTACT_INFO);
    triggerLinkedInContactInfoShortcut(runId, shortcutLabel).catch((error) => {
      showToast(error.message || "Could not run Contact info shortcut.", true);
      logEvent({
        source: "extension.content",
        level: "error",
        event: "linkedin-profile-shortcut.exception",
        runId,
        message: error.message || "Unexpected Contact info shortcut error.",
        link: window.location.href,
        details: {
          action: "contact-info",
          shortcut: shortcutLabel
        }
      });
    });
    return;
  }

  if (supportedPage && isLinkedInPublicContext && isConfiguredLinkedInShortcut(event, LINKEDIN_SHORTCUT_IDS.EXPAND_SEE_MORE)) {
    updateShortcutDiagnostics("expandSeeMore");
    debugContentRuntime("linkedin-shortcut-matched", {
      action: "expandSeeMore",
      shortcut: getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.EXPAND_SEE_MORE)
    });
    event.preventDefault();
    event.stopPropagation();
    const runId = generateRunId();
    const shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.EXPAND_SEE_MORE);
    triggerExpandEllipsisMoreShortcut(runId, shortcutLabel).catch((error) => {
      showToast(error.message || 'Could not run "... see more" expansion shortcut.', true);
      logEvent({
        source: "extension.content",
        level: "error",
        event: "linkedin-profile-shortcut.exception",
        runId,
        message: error.message || 'Unexpected "... see more" shortcut error.',
        link: window.location.href,
        details: {
          action: "expand-ellipsis-see-more",
          shortcut: shortcutLabel
        }
      });
    });
    return;
  }

  if (supportedPage && isLinkedInRecruiterContext && isConfiguredLinkedInShortcut(event, LINKEDIN_SHORTCUT_IDS.RECRUITER_TEMPLATE)) {
    updateShortcutDiagnostics("recruiterTemplate");
    debugContentRuntime("linkedin-shortcut-matched", {
      action: "recruiterTemplate",
      shortcut: getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.RECRUITER_TEMPLATE)
    });
    event.preventDefault();
    event.stopPropagation();
    const runId = generateRunId();
    const shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.RECRUITER_TEMPLATE);
    triggerRecruiterTemplateShortcut(runId, shortcutLabel).catch((error) => {
      showToast(error.message || "Could not run recruiter template shortcut.", true);
      logEvent({
        source: "extension.content",
        level: "error",
        event: "linkedin-recruiter-shortcut.exception",
        runId,
        message: error.message || "Unexpected recruiter template shortcut error.",
        link: window.location.href,
        details: {
          action: "focus-template-textbox",
          shortcut: shortcutLabel
        }
      });
    });
    return;
  }

  if (supportedPage && isLinkedInRecruiterContext && isConfiguredLinkedInShortcut(event, LINKEDIN_SHORTCUT_IDS.RECRUITER_SEND)) {
    updateShortcutDiagnostics("recruiterSend");
    debugContentRuntime("linkedin-shortcut-matched", {
      action: "recruiterSend",
      shortcut: getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.RECRUITER_SEND)
    });
    event.preventDefault();
    event.stopPropagation();
    const runId = generateRunId();
    const shortcutLabel = getConfiguredLinkedInShortcutLabel(LINKEDIN_SHORTCUT_IDS.RECRUITER_SEND);
    triggerRecruiterSendShortcut(runId, shortcutLabel).catch((error) => {
      showToast(error.message || "Could not run recruiter send shortcut.", true);
      logEvent({
        source: "extension.content",
        level: "error",
        event: "linkedin-recruiter-shortcut.exception",
        runId,
        message: error.message || "Unexpected recruiter send shortcut error.",
        link: window.location.href,
        details: {
          action: "send",
          shortcut: shortcutLabel
        }
      });
    });
    return;
  }

  if (!cachedSettings) {
    updateShortcutDiagnostics("blocked:no-settings");
    return;
  }

  const shortcut = keyboardEventToShortcut(event);
  if (!shortcut) {
    updateShortcutDiagnostics("blocked:no-shortcut");
    return;
  }
  const actionId = findActionByShortcut(shortcut);
  if (!actionId) {
    updateShortcutDiagnostics("blocked:no-action");
    return;
  }
  if (actionId !== ACTIONS.GEM_ACTIONS && !supportedPage) {
    updateShortcutDiagnostics("blocked:unsupported-page");
    return;
  }

  updateShortcutDiagnostics(`action:${actionId}`);
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
  markContentRuntimeReadyForPage();
  markConfiguredShortcutDiagnosticsForPage();
  if (isLinkedInProfilePage()) {
    debugContentRuntime("linkedin-content-runtime-ready", {
      version: CONTENT_RUNTIME_VERSION
    });
  }
  const bootstrapManagedLinkedIn = isBootstrapManagedLinkedInPage();
  if (!isLinkedInProfilePage()) {
    window.addEventListener("keydown", onKeyDown, true);
    markContentShortcutListenerReadyForPage("global");
  } else if (!bootstrapManagedLinkedIn) {
    window.addEventListener("keydown", onKeyDown, true);
    markContentShortcutListenerReadyForPage("linkedin-direct");
    bindLinkedInPageChangeWatcher();
  }
  if (!bootstrapManagedLinkedIn) {
    startProfileUrlPrefetchWatcher();
  }
  window.addEventListener(
    "load",
    () => {
      if (bootstrapManagedLinkedIn && isLinkedInProfilePage()) {
        return;
      }
      if (!(cachedSettings?.enabled && isSupportedActionPage())) {
        return;
      }
      if (isLinkedInProfilePage()) {
        queueLinkedInPageChange({ force: true, delayMs: 0, forceRefresh: false });
        return;
      }
      lastPrefetchedProfileContextKey = "";
      prefetchPickersForCurrentProfile();
    },
    { passive: true }
  );
  window.addEventListener(
    "focus",
    () => {
      if (bootstrapManagedLinkedIn) {
        return;
      }
      if (!(cachedSettings?.enabled && isLinkedInProfilePage())) {
        return;
      }
      scheduleGemStatusLiveRefresh(0);
      maybeRefreshGemStatusLive({
        context: getProfileContext(),
        force: true,
        forceRefresh: true,
        runId: generateRunId()
      });
    },
    { passive: true }
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      if (bootstrapManagedLinkedIn) {
        return;
      }
      if (!(cachedSettings?.enabled && isLinkedInProfilePage())) {
        return;
      }
      if (document.visibilityState === "visible") {
        scheduleGemStatusLiveRefresh(0);
        maybeRefreshGemStatusLive({
          context: getProfileContext(),
          force: true,
          forceRefresh: true,
          runId: generateRunId()
        });
        return;
      }
      scheduleGemStatusLiveRefresh(getGemStatusLiveRefreshIntervalMs());
    },
    { passive: true }
  );
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "sync" && changes.settings) {
      cachedSettings = deepMerge(DEFAULT_SETTINGS, changes.settings.newValue || {});
      markConfiguredShortcutDiagnosticsForPage();
      if (bootstrapManagedLinkedIn && isLinkedInProfilePage()) {
        return;
      }
      if (cachedSettings?.enabled && isSupportedActionPage()) {
        if (isLinkedInProfilePage()) {
          queueLinkedInPageChange({ force: true, delayMs: 0, forceRefresh: false });
        } else {
          lastPrefetchedProfileContextKey = "";
          prefetchPickersForCurrentProfile();
        }
      } else {
        lastPrefetchedProfileContextKey = "";
        resetGemStatusIndicator();
      }
    }
  });

  try {
    await refreshSettings();
    markConfiguredShortcutDiagnosticsForPage();
  } catch (error) {
    if (isContextInvalidatedError(error?.message || "")) {
      triggerContextRecovery(error.message);
      return;
    }
    // Keep handlers active after transient startup failures.
    cachedSettings = deepMerge(DEFAULT_SETTINGS, {});
    showToast("Could not load extension settings yet. Retrying...", true);
    setTimeout(() => {
      refreshSettings()
        .then(() => {
          markConfiguredShortcutDiagnosticsForPage();
          if (bootstrapManagedLinkedIn && isLinkedInProfilePage()) {
            return;
          }
          if (cachedSettings?.enabled && isSupportedActionPage()) {
            if (isLinkedInProfilePage()) {
              queueLinkedInPageChange({ force: true, delayMs: 0, forceRefresh: false });
            } else {
              lastPrefetchedProfileContextKey = "";
              prefetchPickersForCurrentProfile();
            }
          } else {
            resetGemStatusIndicator();
          }
        })
        .catch(() => {});
    }, 1000);
  }

  if (bootstrapManagedLinkedIn && isLinkedInProfilePage()) {
    resetGemStatusIndicator();
    return;
  }

  if (cachedSettings?.enabled && isSupportedActionPage()) {
    if (isLinkedInProfilePage()) {
      queueLinkedInPageChange({ force: true, delayMs: 0, forceRefresh: false });
    } else {
      lastPrefetchedProfileContextKey = "";
      prefetchPickersForCurrentProfile();
    }
  } else {
    resetGemStatusIndicator();
  }
}

function handleGemStatusChangedSignal(message = {}) {
  if (isBootstrapManagedLinkedInPage()) {
    return;
  }
  if (!(cachedSettings?.enabled && isCurrentGemStatusDisplayEnabled(cachedSettings) && isLinkedInProfilePage())) {
    return;
  }
  const liveContext = getProfileContext();
  const messageContext = message.context && typeof message.context === "object" ? message.context : {};
  if (!doesGemStatusSignalMatchCurrentPage(messageContext, liveContext)) {
    return;
  }
  const hintedCandidateId = String(messageContext.gemCandidateId || "").trim();
  if (hintedCandidateId) {
    rememberGemCandidateIdForCurrentLinkedInPage(hintedCandidateId);
  }
  const context = applyGemCandidateHintToContext({
    ...messageContext,
    ...liveContext,
    pageUrl: liveContext.pageUrl || messageContext.pageUrl || "",
    profileUrl: liveContext.profileUrl || messageContext.profileUrl || "",
    linkedinUrl: liveContext.linkedinUrl || messageContext.linkedinUrl || "",
    linkedInHandle: liveContext.linkedInHandle || messageContext.linkedInHandle || "",
    contactEmail: liveContext.contactEmail || messageContext.contactEmail || "",
    contactEmails:
      Array.isArray(liveContext.contactEmails) && liveContext.contactEmails.length > 0
        ? liveContext.contactEmails
        : Array.isArray(messageContext.contactEmails)
          ? messageContext.contactEmails
          : [],
    gemCandidateId: hintedCandidateId
  });
  applyOptimisticGemStatusSelection(context, messageContext, hintedCandidateId);
  maybeRefreshGemStatusLive({
    context,
    force: true,
    forceRefresh: true,
    runId: message.runId || generateRunId()
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CONTENT_RUNTIME_PING") {
    sendResponse({ ok: true, version: CONTENT_RUNTIME_VERSION });
    return false;
  }

  if (message?.type === "PING") {
    sendResponse({ ok: true, version: CONTENT_RUNTIME_VERSION });
    return false;
  }

  if (isBootstrapManagedLinkedInPage()) {
    if (message?.type === "TRIGGER_ACTION") {
      const runId = message.runId || generateRunId();
      handleAction(message.actionId, message.source || "popup", runId)
        .then((result) =>
          sendResponse(
            result && typeof result === "object"
              ? result
              : { ok: false, message: "Action returned no result.", runId }
          )
        )
        .catch((error) => sendResponse({ ok: false, message: error.message }));
      return true;
    }
    return false;
  }

  if (message?.type === "GEM_STATUS_MAY_HAVE_CHANGED") {
    handleGemStatusChangedSignal(message || {});
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "SETTINGS_UPDATED") {
    cachedSettings = deepMerge(DEFAULT_SETTINGS, message.settings || {});
    if (cachedSettings?.enabled && isSupportedActionPage()) {
      if (isLinkedInProfilePage()) {
        queueLinkedInPageChange({ force: true, delayMs: 0, forceRefresh: false });
      } else {
        lastPrefetchedProfileContextKey = "";
        prefetchPickersForCurrentProfile();
      }
    } else {
      lastPrefetchedProfileContextKey = "";
      resetGemStatusIndicator();
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "GET_CONTEXT_DEBUG") {
    const context = getProfileContext();
    sendResponse({
      ok: true,
      supported: isSupportedActionPage(),
      hasIdentity: contextHasResolvableIdentity(context),
      sourcePlatform: String(context?.sourcePlatform || "").trim().toLowerCase(),
      summary: describeContextSignals(context),
      context: {
        sourcePlatform: String(context?.sourcePlatform || "").trim().toLowerCase(),
        gemCandidateId: String(context?.gemCandidateId || "").trim(),
        gemProfileUrl: String(context?.gemProfileUrl || "").trim(),
        linkedinUrl: String(context?.linkedinUrl || "").trim(),
        linkedInHandle: String(context?.linkedInHandle || "").trim(),
        gmailSubject: String(context?.gmailSubject || "").trim(),
        contactEmail: String(context?.contactEmail || "").trim(),
        contactEmailCount: Array.isArray(context?.contactEmails) ? context.contactEmails.length : 0,
        gmailThreadToken: String(context?.gmailThreadToken || "").trim()
      }
    });
    return false;
  }

  if (message?.type === "GET_ACTION_CONTEXT") {
    const context = getProfileContext();
    sendResponse({
      ok: true,
      supported: isSupportedActionPage(),
      hasIdentity: contextHasResolvableIdentity(context),
      context
    });
    return false;
  }

  if (message?.type === "TRIGGER_ACTION") {
    const runId = message.runId || generateRunId();
    handleAction(message.actionId, message.source || "popup", runId)
      .then((result) =>
        sendResponse(
          result && typeof result === "object"
            ? result
            : { ok: false, message: "Action returned no result.", runId }
        )
      )
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  return false;
});

window.addEventListener("gls:content-runtime-keydown", (event) => {
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  onKeyDown({
    key: String(detail.key || ""),
    code: String(detail.code || ""),
    location: Number(detail.location) || 0,
    repeat: false,
    ctrlKey: Boolean(detail.ctrlKey),
    altKey: Boolean(detail.altKey),
    shiftKey: Boolean(detail.shiftKey),
    metaKey: Boolean(detail.metaKey),
    target: document.activeElement || document.body || document.documentElement,
    preventDefault() {},
    stopPropagation() {}
  });
});

window.addEventListener("gls:linkedin-page-changed", (event) => {
  if (isBootstrapManagedLinkedInPage()) {
    return;
  }
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  if (!isLinkedInProfilePage()) {
    return;
  }
  queueLinkedInPageChange({
    force: true,
    delayMs: 0,
    forceRefresh: Boolean(detail.forceRefresh)
  });
});

window.addEventListener("gls:gem-status-changed", (event) => {
  if (isBootstrapManagedLinkedInPage()) {
    return;
  }
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  handleGemStatusChangedSignal({
    context: detail.context && typeof detail.context === "object" ? detail.context : {},
    runId: detail.runId || ""
  });
});

window.addEventListener("gls:settings-updated", (event) => {
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  if (detail.settings && typeof detail.settings === "object") {
    cachedSettings = deepMerge(DEFAULT_SETTINGS, detail.settings);
  }
  if (isBootstrapManagedLinkedInPage()) {
    return;
  }
  if (cachedSettings?.enabled && isSupportedActionPage()) {
    if (isLinkedInProfilePage()) {
      queueLinkedInPageChange({ force: true, delayMs: 0, forceRefresh: false });
    } else {
      lastPrefetchedProfileContextKey = "";
      prefetchPickersForCurrentProfile();
    }
  } else {
    resetGemStatusIndicator();
  }
});

init();

}
