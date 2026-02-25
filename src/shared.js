"use strict";

const ACTIONS = {
  ADD_PROSPECT: "addProspect",
  ADD_TO_PROJECT: "addToProject",
  ADD_NOTE_TO_CANDIDATE: "addNoteToCandidate",
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

const DEFAULT_SETTINGS = {
  enabled: true,
  backendBaseUrl: "http://localhost:8787",
  backendSharedToken: "",
  createdByUserId: "",
  defaultProjectId: "",
  defaultSequenceId: "",
  customFieldId: "",
  customFieldValue: "",
  activityUrlTemplate: "",
  sequenceComposeUrlTemplate: "https://www.gem.com/sequence/{{sequenceId}}/edit/stages",
  shortcuts: {
    addProspect: "Cmd+Option+1",
    addToProject: "Cmd+Option+2",
    openActivity: "Cmd+Option+3",
    setCustomField: "Cmd+Option+4",
    sendSequence: "Cmd+Option+5",
    addNoteToCandidate: "Cmd+Option+6",
    // Retired for now:
    // viewActivityFeed: "<unassigned>",
    setReminder: "Cmd+Option+7",
    uploadToAshby: "Cmd+Option+8",
    editSequence: "Cmd+Option+9",
    openAshbyProfile: "Cmd+Option+0"
  }
};

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
