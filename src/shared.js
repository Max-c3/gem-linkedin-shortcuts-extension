"use strict";

globalThis.__GLS_SHARED_RUNTIME_READY__ = true;
const CONTENT_RUNTIME_VERSION = "2026-03-23-8";

const ACTIONS = {
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
  // Retired for now:
  // VIEW_ACTIVITY_FEED: "viewActivityFeed"
};

const LINKEDIN_NATIVE_SHORTCUT_IDS = [
  "linkedinConnect",
  "linkedinInviteSendWithoutNote",
  "linkedinInviteAddNote",
  "linkedinViewInRecruiter",
  "linkedinMessageProfile",
  "linkedinContactInfo",
  "linkedinExpandSeeMore",
  "linkedinRecruiterTemplate",
  "linkedinRecruiterSend"
];

const ALLOWED_BACKEND_ORIGINS = Object.freeze([
  "https://gem-linkedin-shortcuts-extension.onrender.com",
  "http://localhost",
  "http://127.0.0.1",
  "https://localhost",
  "https://127.0.0.1"
]);

const GEM_STATUS_DISPLAY_MODES = Object.freeze({
  STATUS_ONLY: "statusOnly",
  OFF: "off"
});

const DEFAULT_SETTINGS = {
  enabled: true,
  showGemStatusBadge: true,
  gemStatusDisplayMode: GEM_STATUS_DISPLAY_MODES.STATUS_ONLY,
  backendBaseUrl: "http://localhost:8787",
  backendSharedToken: "",
  createdByUserId: "",
  createdByUserEmail: "",
  defaultProjectId: "",
  defaultSequenceId: "",
  customFieldId: "",
  customFieldValue: "",
  activityUrlTemplate: "",
  sequenceComposeUrlTemplate: "https://www.gem.com/sequence/{{sequenceId}}/edit/stages",
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
    // Retired for now:
    // viewActivityFeed: "<unassigned>",
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
};

function normalizeGemStatusDisplayMode(rawValue, fallbackEnabled = true) {
  const value = String(rawValue || "").trim();
  if (value === "frameAndStatus" || value === GEM_STATUS_DISPLAY_MODES.STATUS_ONLY) {
    return GEM_STATUS_DISPLAY_MODES.STATUS_ONLY;
  }
  if (value === GEM_STATUS_DISPLAY_MODES.OFF) {
    return GEM_STATUS_DISPLAY_MODES.OFF;
  }
  if (rawValue === false) {
    return GEM_STATUS_DISPLAY_MODES.OFF;
  }
  return fallbackEnabled ? GEM_STATUS_DISPLAY_MODES.STATUS_ONLY : GEM_STATUS_DISPLAY_MODES.OFF;
}

function isGemStatusDisplayEnabled(mode, fallbackEnabled = true) {
  return normalizeGemStatusDisplayMode(mode, fallbackEnabled) !== GEM_STATUS_DISPLAY_MODES.OFF;
}

function cycleGemStatusDisplayMode(mode, fallbackEnabled = true) {
  const normalized = normalizeGemStatusDisplayMode(mode, fallbackEnabled);
  if (normalized === GEM_STATUS_DISPLAY_MODES.STATUS_ONLY) {
    return GEM_STATUS_DISPLAY_MODES.OFF;
  }
  return GEM_STATUS_DISPLAY_MODES.STATUS_ONLY;
}

function formatGemStatusDisplayModeLabel(mode, fallbackEnabled = true) {
  const normalized = normalizeGemStatusDisplayMode(mode, fallbackEnabled);
  if (normalized === GEM_STATUS_DISPLAY_MODES.STATUS_ONLY) {
    return "Status banner";
  }
  return "Off";
}

function shortcutCanOmitModifier(shortcutId) {
  return LINKEDIN_NATIVE_SHORTCUT_IDS.includes(String(shortcutId || "").trim());
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(base)) {
    return override;
  }

  const output = { ...base };
  if (!isPlainObject(override)) {
    return output;
  }

  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key], value);
      continue;
    }
    output[key] = value;
  }

  return output;
}

function normalizeShortcut(raw) {
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

function getEventKeyToken(event) {
  const code = event.code || "";
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  if (code === "Space") {
    return "Space";
  }
  if (/^Arrow(Up|Down|Left|Right)$/.test(code)) {
    return code;
  }
  if (/^F([1-9]|1[0-2])$/.test(code)) {
    return code;
  }

  let key = event.key || "";
  if (key === " ") {
    return "Space";
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  if (key === "Esc") {
    return "Escape";
  }
  return key;
}

function keyboardEventToShortcut(event) {
  const ordered = [];
  if (event.metaKey) {
    ordered.push("Meta");
  }
  if (event.ctrlKey) {
    ordered.push("Ctrl");
  }
  if (event.shiftKey) {
    ordered.push("Shift");
  }
  if (event.altKey) {
    ordered.push("Alt");
  }

  const key = getEventKeyToken(event);
  if (key && !["Control", "Alt", "Shift", "Meta"].includes(key)) {
    ordered.push(key);
  }

  if (ordered.length === 0 || ordered.length === (event.metaKey + event.ctrlKey + event.shiftKey + event.altKey)) {
    return "";
  }

  return ordered.join("+");
}

function shortcutHasModifier(shortcut) {
  const normalized = normalizeShortcut(shortcut);
  return normalized.includes("Meta+") || normalized.includes("Ctrl+") || normalized.includes("Shift+") || normalized.includes("Alt+");
}

function formatShortcutForMac(shortcut) {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) {
    return "";
  }
  return normalized
    .split("+")
    .map((part) => {
      if (part === "Meta") {
        return "Cmd";
      }
      if (part === "Alt") {
        return "Option";
      }
      if (part === "Ctrl") {
        return "Control";
      }
      return part;
    })
    .join("+");
}

function getBackendOrigin(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }
  try {
    return new URL(value).origin;
  } catch (_error) {
    return "";
  }
}

function isLoopbackBackendOrigin(origin) {
  const value = String(origin || "").trim();
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    const hostname = String(parsed.hostname || "").toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch (_error) {
    return false;
  }
}

function isAllowedBackendBaseUrl(rawValue) {
  const origin = getBackendOrigin(rawValue);
  if (!origin) {
    return false;
  }
  if (ALLOWED_BACKEND_ORIGINS.includes(origin)) {
    return true;
  }
  return isLoopbackBackendOrigin(origin) && ALLOWED_BACKEND_ORIGINS.some((allowedOrigin) => isLoopbackBackendOrigin(allowedOrigin));
}

function formatAllowedBackendOriginsForDisplay() {
  return ALLOWED_BACKEND_ORIGINS.join(", ");
}

function glsIsLinkedInHost(hostname) {
  return /(^|\.)linkedin\.com$/i.test(String(hostname || ""));
}

function glsIsLinkedInPublicProfilePath(pathname) {
  return /^\/(?:in|pub)\/[^/]+(?:\/.*)?$/.test(String(pathname || ""));
}

function glsNormalizeLinkedInIdentifier(value) {
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

function glsToCanonicalLinkedInPublicProfileUrl(rawUrl, urlBase = globalThis.location?.origin || "https://www.linkedin.com") {
  const input = String(rawUrl || "").trim();
  if (!input) {
    return "";
  }
  try {
    const parsed = new URL(input, urlBase);
    if (!glsIsLinkedInHost(parsed.hostname) || !glsIsLinkedInPublicProfilePath(parsed.pathname)) {
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

function glsGetLinkedInHandle(url, urlBase = globalThis.location?.origin || "https://www.linkedin.com") {
  try {
    const parsed = new URL(url, urlBase);
    const match = parsed.pathname.match(/^\/(?:in|pub)\/([^/]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  } catch (_error) {
    return "";
  }
}

function glsFindLinkedInPublicProfileUrlInInlineScripts(options = {}) {
  const doc = options.document || globalThis.document;
  if (!doc) {
    return "";
  }
  const profileUrlPattern = /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9%._-]+/i;
  const identifierPatterns = [
    /"publicIdentifier"\s*:\s*"([^"]+)"/i,
    /"public_identifier"\s*:\s*"([^"]+)"/i,
    /"vanityName"\s*:\s*"([^"]+)"/i
  ];
  const signalPattern = /(linkedin\.com\/(?:in|pub)\/|publicIdentifier|public_identifier|vanityName)/i;
  const scripts = Array.from(doc.scripts || []).filter((script) => script && !script.src);
  const maxScriptCount = Number(options.maxScriptCount);
  const limitedScripts =
    Number.isFinite(maxScriptCount) && maxScriptCount > 0 ? scripts.slice(0, Math.trunc(maxScriptCount)) : scripts;
  const maxScriptTextLength = Number(options.maxScriptTextLength);
  const textLengthLimit =
    Number.isFinite(maxScriptTextLength) && maxScriptTextLength > 0 ? Math.trunc(maxScriptTextLength) : 0;
  const urlBase = options.urlBase || globalThis.location?.origin || "https://www.linkedin.com";

  for (const script of limitedScripts) {
    const text = String(script?.textContent || "");
    if (!text) {
      continue;
    }
    if (textLengthLimit > 0 && text.length > textLengthLimit) {
      continue;
    }
    if (options.requireSignalPattern !== false && !signalPattern.test(text)) {
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
      const identifier = glsNormalizeLinkedInIdentifier(identifierMatch[1]);
      if (identifier) {
        return `https://www.linkedin.com/in/${encodeURIComponent(identifier)}`;
      }
    }
  }

  return "";
}

function glsFindLinkedInPublicProfileUrlInDom(options = {}) {
  const doc = options.document || globalThis.document;
  const winLocationHref = options.locationHref || globalThis.location?.href || "";
  const urlBase = options.urlBase || globalThis.location?.origin || "https://www.linkedin.com";
  if (!doc) {
    return "";
  }

  const currentUrl = String(winLocationHref || "").trim();
  const canonicalHref = String(doc.querySelector("link[rel='canonical']")?.getAttribute("href") || "").trim();
  const ogUrl = String(
    doc.querySelector("meta[property='og:url'], meta[name='og:url']")?.getAttribute("content") || ""
  ).trim();
  const candidates = [currentUrl, canonicalHref, ogUrl];
  const inlineScriptOrder = String(options.inlineScriptOrder || "beforeAnchors").trim();

  if (inlineScriptOrder === "beforeAnchors" && options.allowInlineScript !== false) {
    candidates.push(
      glsFindLinkedInPublicProfileUrlInInlineScripts({
        ...options.inlineScriptOptions,
        document: doc,
        urlBase
      })
    );
  }

  for (const candidate of candidates) {
    const canonical = glsToCanonicalLinkedInPublicProfileUrl(candidate, urlBase);
    if (canonical) {
      return canonical;
    }
  }

  if (options.allowAnchorScan !== false) {
    const anchors = Array.from(
      doc.querySelectorAll("a[href*='/in/'], a[href*='linkedin.com/in/'], a[href*='/pub/'], a[href*='linkedin.com/pub/']")
    );
    const maxAnchorScan = Number(options.anchorScanLimit);
    const limitedAnchors =
      Number.isFinite(maxAnchorScan) && maxAnchorScan > 0 ? anchors.slice(0, Math.trunc(maxAnchorScan)) : anchors;
    for (const anchor of limitedAnchors) {
      const href = String(anchor.getAttribute("href") || anchor.href || "").trim();
      const canonical = glsToCanonicalLinkedInPublicProfileUrl(href, urlBase);
      if (canonical) {
        return canonical;
      }
    }
  }

  if (inlineScriptOrder === "afterAnchors" && options.allowInlineScript !== false) {
    const inlineScriptUrl = glsFindLinkedInPublicProfileUrlInInlineScripts({
      ...options.inlineScriptOptions,
      document: doc,
      urlBase
    });
    return glsToCanonicalLinkedInPublicProfileUrl(inlineScriptUrl, urlBase);
  }

  return "";
}

globalThis.__GLS_LINKEDIN_IDENTITY_HELPERS__ = Object.freeze({
  toCanonicalPublicProfileUrl: glsToCanonicalLinkedInPublicProfileUrl,
  getLinkedInHandle: glsGetLinkedInHandle,
  findLinkedInPublicProfileUrlInInlineScripts: glsFindLinkedInPublicProfileUrlInInlineScripts,
  findLinkedInPublicProfileUrlInDom: glsFindLinkedInPublicProfileUrlInDom
});

function isEditableElement(target) {
  if (!target) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = (target.tagName || "").toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}
