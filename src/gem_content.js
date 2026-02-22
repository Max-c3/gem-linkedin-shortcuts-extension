"use strict";

const GEM_AUTOMATION_PARAMS = ["glsAction", "glsRunId", "glsCandidateId", "glsSequenceId", "glsSequenceName"];
const GEM_ACTION_OPEN_SEQUENCE_FOR_CANDIDATE = "openSequenceForCandidate";

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isVisible(element) {
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

function getElementText(element) {
  if (!element) {
    return "";
  }
  return [
    element.textContent || "",
    element.getAttribute("aria-label") || "",
    element.getAttribute("title") || ""
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getClickableElements(root = document) {
  const selectors = [
    "button",
    "a",
    "a[role='button']",
    "[role='button']",
    "[role='menuitem']",
    "[role='option']",
    "li",
    ".Select-option"
  ];
  return Array.from(root.querySelectorAll(selectors.join(","))).filter((element) => {
    if (!isVisible(element)) {
      return false;
    }
    const disabled =
      element.getAttribute("disabled") !== null ||
      element.getAttribute("aria-disabled") === "true" ||
      element.classList.contains("disabled");
    return !disabled;
  });
}

function findVisibleElementByText(matcher, root = document) {
  const candidates = getClickableElements(root);
  return candidates.find((candidate) => matcher(normalizeText(getElementText(candidate))));
}

function findAllVisibleElementsByText(matcher, root = document) {
  const candidates = getClickableElements(root);
  return candidates.filter((candidate) => matcher(normalizeText(getElementText(candidate))));
}

function triggerKey(target, key) {
  if (!target) {
    return;
  }
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
}

function toTextSample(value, max = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}...`;
}

function closestClickable(element) {
  if (!element) {
    return null;
  }
  const selector = "button, a, [role='button'], [role='menuitem'], [role='option'], li, [tabindex]";
  const closest = element.closest(selector);
  if (closest && isVisible(closest)) {
    return closest;
  }
  let current = element.parentElement;
  let depth = 0;
  while (current && depth < 8) {
    if (isVisible(current) && current.matches(selector)) {
      return current;
    }
    current = current.parentElement;
    depth += 1;
  }
  return isVisible(element) ? element : null;
}

function findVisibleElementByTextDeep(phrase, root = document) {
  const expected = normalizeText(phrase);
  if (!expected) {
    return null;
  }
  const nodes = Array.from(root.querySelectorAll("*")).filter(isVisible);
  const matches = [];
  for (const node of nodes) {
    const text = normalizeText(node.textContent || "");
    if (!text) {
      continue;
    }
    if (text === expected || text.includes(expected)) {
      matches.push(node);
    }
  }
  matches.sort((a, b) => normalizeText(a.textContent || "").length - normalizeText(b.textContent || "").length);
  for (const match of matches) {
    const clickable = closestClickable(match);
    if (clickable) {
      return clickable;
    }
  }
  return null;
}

function getVisibleOverlayRoots() {
  return Array.from(
    document.querySelectorAll(
      "[role='dialog'], .ReactModal__Content, .artdeco-modal, [role='menu'], [role='listbox'], .dropdown-menu, .Select-menu-outer, .Select-menu"
    )
  ).filter(isVisible);
}

function getProfileActionBarRoot() {
  const candidates = Array.from(document.querySelectorAll("div, section, header")).filter(isVisible);
  for (const candidate of candidates) {
    const text = normalizeText(candidate.textContent || "");
    if (!text.includes("linkedin") || !text.includes("message") || !text.includes("actions")) {
      continue;
    }
    const buttons = candidate.querySelectorAll("button, [role='button'], a[role='button']");
    if (buttons.length >= 3) {
      return candidate;
    }
  }
  return document;
}

function clickElement(element) {
  if (!element) {
    return false;
  }
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  element.click();
  return true;
}

function activateElement(element) {
  if (!element) {
    return false;
  }
  const targets = [element, element.closest("[role='menuitem']"), element.closest("li"), element.closest("button"), element.closest("a")].filter(
    Boolean
  );
  const unique = [];
  const seen = new Set();
  for (const target of targets) {
    if (seen.has(target)) {
      continue;
    }
    seen.add(target);
    unique.push(target);
  }
  for (const target of unique) {
    clickElement(target);
  }
  const focusTarget = unique[0];
  if (focusTarget && typeof focusTarget.focus === "function") {
    focusTarget.focus();
    focusTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    focusTarget.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
  }
  return true;
}

function setNativeInputValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
  if (descriptor && typeof descriptor.set === "function") {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function findSequenceSearchInput(scopeRoot) {
  const roots = [];
  if (scopeRoot && isVisible(scopeRoot)) {
    roots.push(scopeRoot);
  }
  roots.push(...getVisibleOverlayRoots());

  for (const root of roots) {
    const input = root.querySelector(
      "input[placeholder*='Search sequence'], input[placeholder*='Search sequences'], input[aria-autocomplete='list'], [role='combobox'] input, .Select-input input"
    );
    if (input && isVisible(input)) {
      return input;
    }
  }
  return null;
}

function findChooseSequenceModal() {
  const candidates = Array.from(
    document.querySelectorAll("[role='dialog'], .ReactModal__Content, .artdeco-modal, .modal, .Modal, .overlay")
  ).filter(isVisible);
  for (const candidate of candidates) {
    const text = normalizeText(getElementText(candidate));
    if (
      text.includes("choose sequence for 1 person") ||
      text.includes("add candidate to sequence") ||
      (text.includes("choose sequence") && text.includes("add to sequence"))
    ) {
      return candidate;
    }
  }
  return null;
}

function collectSequenceOptionsFromSelect(selectElement) {
  if (!selectElement) {
    return [];
  }
  return Array.from(selectElement.options || []).map((option) => ({
    value: String(option.value || ""),
    label: String(option.textContent || "").trim()
  }));
}

function findModalSequencePickerTrigger(root) {
  if (!root) {
    return null;
  }
  const direct = root.querySelector("[role='combobox'], .Select-control, [aria-haspopup='listbox']");
  if (direct && isVisible(direct)) {
    return direct;
  }
  const byText = findVisibleElementByTextDeep("Choose Sequence", root);
  if (byText) {
    return byText;
  }
  return null;
}

function collectVisibleListboxOptions() {
  const roots = Array.from(document.querySelectorAll("[role='listbox'], .Select-menu-outer, .Select-menu, .dropdown-menu")).filter(isVisible);
  const options = [];
  for (const root of roots) {
    const optionNodes = Array.from(root.querySelectorAll("[role='option'], li, .Select-option, [role='menuitem']")).filter(isVisible);
    for (const node of optionNodes) {
      const label = toTextSample(getElementText(node), 160);
      if (!label) {
        continue;
      }
      options.push({
        label,
        node
      });
    }
  }
  return options;
}

function pickSelectOption(selectElement, sequenceName, sequenceId) {
  if (!selectElement) {
    return false;
  }
  const options = Array.from(selectElement.options || []);
  if (options.length === 0) {
    return false;
  }
  const normalizedName = normalizeText(sequenceName);
  const normalizedId = normalizeText(sequenceId);
  const findOption = (matcher) => options.find((option) => matcher(normalizeText(option.textContent || ""), normalizeText(option.value || "")));

  const exactName = findOption((text) => Boolean(normalizedName) && text === normalizedName);
  const containsName = findOption((text) => Boolean(normalizedName) && text.includes(normalizedName));
  const byValueId = findOption((_, value) => Boolean(normalizedId) && value.includes(normalizedId));
  const byTextId = findOption((text) => Boolean(normalizedId) && text.includes(normalizedId));
  const chosen = exactName || containsName || byValueId || byTextId;
  if (!chosen) {
    return false;
  }
  setNativeInputValue(selectElement, chosen.value);
  selectElement.value = chosen.value;
  selectElement.dispatchEvent(new Event("input", { bubbles: true }));
  selectElement.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function findAddToSequenceSubmitButton(root) {
  if (!root) {
    return null;
  }
  const buttons = Array.from(root.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']")).filter(isVisible);
  const byText = buttons.find((button) => {
    const text = normalizeText(getElementText(button));
    return text === "add to sequence" || text.includes("add to sequence");
  });
  return byText || null;
}

function isDisabledButton(button) {
  if (!button) {
    return true;
  }
  const disabledAttr = button.getAttribute("disabled") !== null || button.getAttribute("aria-disabled") === "true";
  return disabledAttr || button.disabled === true;
}

function findSequenceOption(sequenceName, sequenceId, scopeRoot) {
  const normalizedName = normalizeText(sequenceName);
  const normalizedId = normalizeText(sequenceId);
  const roots = [];
  if (scopeRoot && isVisible(scopeRoot)) {
    roots.push(scopeRoot);
  }
  roots.push(...getVisibleOverlayRoots());
  for (const root of roots) {
    const candidates = getClickableElements(root);

    const exact = candidates.find((candidate) => normalizeText(getElementText(candidate)) === normalizedName);
    if (exact) {
      return exact;
    }

    const containsName = candidates.find((candidate) => {
      const text = normalizeText(getElementText(candidate));
      return Boolean(normalizedName) && text.includes(normalizedName);
    });
    if (containsName) {
      return containsName;
    }

    const containsId = candidates.find((candidate) => {
      const text = normalizeText(getElementText(candidate));
      return Boolean(normalizedId) && text.includes(normalizedId);
    });
    if (containsId) {
      return containsId;
    }
  }

  return null;
}

async function waitForElement(matcher, timeoutMs = 12000, intervalMs = 120) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const element = matcher();
    if (element) {
      return element;
    }
    await delay(intervalMs);
  }
  return null;
}

function findAddToSequenceOption(root = document) {
  return (
    findVisibleElementByText(
      (text) => text === "add to sequence" || text.startsWith("add to sequence ") || text.includes("add to sequence"),
      root
    ) ||
    findVisibleElementByTextDeep("Add to sequence", root) ||
    findVisibleElementByTextDeep("Add to sequence", document)
  );
}

function collectAddToSequenceCandidates(root = document) {
  const candidates = [];
  const byClickable = findAllVisibleElementsByText(
    (text) => text === "add to sequence" || text.startsWith("add to sequence ") || text.includes("add to sequence"),
    root
  );
  for (const item of byClickable) {
    candidates.push(item);
  }
  const deep = findVisibleElementByTextDeep("Add to sequence", root);
  if (deep) {
    candidates.push(deep);
  }
  return candidates;
}

function getMessageMenuTriggers() {
  const actionRoot = getProfileActionBarRoot();
  const exact = findAllVisibleElementsByText((text) => text === "message", actionRoot);
  const starts = findAllVisibleElementsByText((text) => text.startsWith("message "), actionRoot);
  const contains = findAllVisibleElementsByText((text) => text.includes(" message ") || text.includes("message"), actionRoot);
  if (exact.length === 0 && starts.length === 0 && contains.length === 0) {
    const fallbackExact = findAllVisibleElementsByText((text) => text === "message");
    const fallbackStarts = findAllVisibleElementsByText((text) => text.startsWith("message "));
    const fallbackContains = findAllVisibleElementsByText((text) => text.includes(" message ") || text.includes("message"));
    const fallbackOrdered = [...fallbackExact, ...fallbackStarts, ...fallbackContains];
    const fallbackSeen = new Set();
    const fallbackDeduped = [];
    for (const item of fallbackOrdered) {
      if (!item || fallbackSeen.has(item)) {
        continue;
      }
      fallbackSeen.add(item);
      fallbackDeduped.push(item);
    }
    return fallbackDeduped.slice(0, 8);
  }
  const ordered = [...exact, ...starts, ...contains];
  const deduped = [];
  const seen = new Set();
  for (const item of ordered) {
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    deduped.push(item);
  }
  const menuCapable = deduped.filter((item) => {
    const hasPopup = item.getAttribute("aria-haspopup");
    const role = String(item.getAttribute("role") || "").toLowerCase();
    if (hasPopup === "menu" || role === "button") {
      return true;
    }
    const text = normalizeText(getElementText(item));
    return text === "message" || text.startsWith("message ");
  });
  return (menuCapable.length > 0 ? menuCapable : deduped).slice(0, 8);
}

async function openMessageMenuAndFindAddToSequence() {
  const triggers = getMessageMenuTriggers();
  for (const trigger of triggers) {
    clickElement(trigger);
    if (typeof trigger.focus === "function") {
      trigger.focus();
    }
    await delay(120);
    const directMenuRootId = String(trigger.getAttribute("aria-controls") || "").trim();
    if (directMenuRootId) {
      const directMenuRoot = document.getElementById(directMenuRootId);
      if (directMenuRoot && isVisible(directMenuRoot)) {
        const directOption = await waitForElement(() => findAddToSequenceOption(directMenuRoot), 1800, 90);
        if (directOption) {
          return directOption;
        }
      }
    }

    const fromVisibleMenus = await waitForElement(() => {
      const roots = getVisibleOverlayRoots();
      for (const root of roots) {
        const option = findAddToSequenceOption(root);
        if (option) {
          return option;
        }
      }
      return null;
    }, 1800, 90);
    if (fromVisibleMenus) {
      return fromVisibleMenus;
    }

    const directFromDocument = await waitForElement(() => findAddToSequenceOption(document), 1200, 90);
    if (directFromDocument) {
      return directFromDocument;
    }

    // Overlay can be portal/shadow-like; navigate menu via keyboard as fallback.
    if (typeof trigger.focus === "function") {
      trigger.focus();
    }
    triggerKey(trigger, "ArrowDown");
    await delay(80);
    triggerKey(trigger, "ArrowDown");
    await delay(80);
    triggerKey(trigger, "Enter");
    await delay(220);

    const postKeyboard = await waitForElement(() => {
      return (
        findAddToSequenceOption(document) ||
        findNextEditStagesButton(document) ||
        (window.location.href.includes("/edit/recipients") ? { alreadyOpened: true } : null)
      );
    }, 1400, 100);
    if (postKeyboard) {
      return postKeyboard.alreadyOpened ? postKeyboard : postKeyboard;
    }
  }

  return null;
}

function collectDebugSnapshot() {
  const messageTriggers = getMessageMenuTriggers().map((item) => toTextSample(getElementText(item), 80));
  const actionRoot = getProfileActionBarRoot();
  const overlayRoots = getVisibleOverlayRoots().slice(0, 8).map((root) => toTextSample(getElementText(root), 160));
  const addCandidates = collectAddToSequenceCandidates(document).slice(0, 8).map((item) => toTextSample(getElementText(item), 120));
  const nextCandidates = findAllVisibleElementsByText((text) => text.includes("next: edit stages") || text === "next: edit stages")
    .slice(0, 8)
    .map((item) => toTextSample(getElementText(item), 120));
  return {
    url: window.location.href,
    actionRootSample: toTextSample(getElementText(actionRoot), 220),
    messageTriggers,
    overlayRoots,
    addCandidates,
    nextCandidates,
    hasNextEditStagesButtonStrict: Boolean(findNextEditStagesButtonStrict(document)),
    hasEditStagesEditor: isEditStagesEditorVisible(),
    hasEditStagesUrl: isEditStagesUrl(window.location.href)
  };
}

function isEditStagesUrl(url = window.location.href) {
  try {
    const parsed = new URL(url, window.location.origin);
    return /\/edit\/stages(?:\/|$)/.test(parsed.pathname);
  } catch (_error) {
    return /\/edit\/stages(?:\/|$)/.test(String(url || ""));
  }
}

function isEditStagesEditorVisible(root = document) {
  const hasNextReview = Boolean(
    findVisibleElementByText(
      (text) =>
        text === "next: review and configure" ||
        text.startsWith("next: review and configure") ||
        text.includes("next: review and configure"),
      root
    )
  );
  if (hasNextReview) {
    return true;
  }
  const hasEditingForRecipients = Boolean(findVisibleElementByTextDeep("Editing for all recipients", root));
  const hasStageHeader = Boolean(findVisibleElementByTextDeep("Stage 1", root));
  return hasEditingForRecipients && hasStageHeader;
}

function findNextEditStagesButtonStrict(root = document) {
  const selectors = "button, [role='button'], a[role='button'], input[type='button'], input[type='submit']";
  const candidates = Array.from(root.querySelectorAll(selectors)).filter(isVisible);
  for (const candidate of candidates) {
    const text = normalizeText(getElementText(candidate));
    if (!text || !text.includes("next") || !text.includes("edit stages")) {
      continue;
    }
    return candidate;
  }
  return null;
}

function findNextEditStagesButton(root = document) {
  return findNextEditStagesButtonStrict(root);
}

async function waitForEditStagesReached(timeoutMs = 20000, intervalMs = 120) {
  return waitForElement(() => {
    if (isEditStagesUrl(window.location.href)) {
      return { matchedBy: "url" };
    }
    if (isEditStagesEditorVisible(document)) {
      return { matchedBy: "dom_marker" };
    }
    return null;
  }, timeoutMs, intervalMs);
}

async function navigateToEditStages(runId = "", maxRetries = 3) {
  const immediate = await waitForEditStagesReached(1200, 120);
  if (immediate) {
    return {
      ok: true,
      matchedBy: immediate.matchedBy,
      retries: 0
    };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const nextButton = await waitForElement(() => findNextEditStagesButtonStrict(document), 7000, 120);
    if (!nextButton) {
      await sendLog({
        level: "warn",
        event: "gem.sequence_automation.next_edit_stages.retry",
        runId,
        message: `Could not find 'Next: Edit stages' on attempt ${attempt}.`,
        details: {
          attempt,
          reason: "button_not_found",
          snapshot: collectDebugSnapshot()
        }
      });
      await delay(500);
      continue;
    }

    await sendLog({
      event: "gem.sequence_automation.next_edit_stages.found",
      runId,
      message: "Found 'Next: Edit stages' button.",
      details: {
        attempt,
        buttonText: toTextSample(getElementText(nextButton), 120),
        disabled: isDisabledButton(nextButton),
        url: window.location.href
      }
    });

    if (isDisabledButton(nextButton)) {
      await sendLog({
        level: "warn",
        event: "gem.sequence_automation.next_edit_stages.retry",
        runId,
        message: `'Next: Edit stages' is disabled on attempt ${attempt}.`,
        details: {
          attempt,
          reason: "button_disabled",
          snapshot: collectDebugSnapshot()
        }
      });
      await delay(500);
      continue;
    }

    if (typeof nextButton.scrollIntoView === "function") {
      nextButton.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    }
    clickElement(nextButton);
    if (typeof nextButton.focus === "function") {
      nextButton.focus();
      triggerKey(nextButton, "Enter");
    }

    await sendLog({
      event: "gem.sequence_automation.next_edit_stages.clicked",
      runId,
      message: "Clicked 'Next: Edit stages'.",
      details: {
        attempt,
        url: window.location.href
      }
    });

    const reached = await waitForEditStagesReached(7000, 120);
    if (reached) {
      return {
        ok: true,
        matchedBy: reached.matchedBy,
        retries: attempt - 1
      };
    }

    await sendLog({
      level: "warn",
      event: "gem.sequence_automation.next_edit_stages.retry",
      runId,
      message: `Did not reach edit stages after click on attempt ${attempt}.`,
      details: {
        attempt,
        reason: "navigation_not_reached",
        url: window.location.href,
        snapshot: collectDebugSnapshot()
      }
    });
    await delay(500);
  }

  await sendLog({
    level: "error",
    event: "gem.sequence_automation.next_edit_stages.failed",
    runId,
    message: "Failed to navigate to Edit stages after retries.",
    details: {
      retries: maxRetries,
      url: window.location.href,
      snapshot: collectDebugSnapshot()
    }
  });

  return {
    ok: false,
    matchedBy: "",
    retries: maxRetries
  };
}

function findPersonalizeButtonStrict(root = document) {
  const scopedContainers = Array.from(root.querySelectorAll("div, nav, header, section")).filter((node) => {
    if (!isVisible(node)) {
      return false;
    }
    const text = normalizeText(getElementText(node));
    return text.includes("personalize") && text.includes("editing for all recipients");
  });
  for (const container of scopedContainers) {
    const scoped = findVisibleElementByText((text) => text === "personalize" || text.startsWith("personalize "), container);
    if (scoped && !isDisabledButton(scoped)) {
      return scoped;
    }
  }

  const selectors = "button, [role='button'], [role='tab'], a[role='button'], a";
  const candidates = Array.from(root.querySelectorAll(selectors)).filter(isVisible);
  for (const candidate of candidates) {
    if (isDisabledButton(candidate)) {
      continue;
    }
    const text = normalizeText(getElementText(candidate));
    if (text === "personalize" || text.startsWith("personalize ") || text.includes(" personalize")) {
      return candidate;
    }
  }
  return null;
}

function isEditingForAllRecipientsVisible(root = document) {
  return Boolean(findVisibleElementByTextDeep("Editing for all recipients", root));
}

function isPersonalizeModeActive(root = document) {
  if (isEditingForAllRecipientsVisible(root)) {
    return false;
  }

  const editingForCandidate = findVisibleElementByText((text) => {
    if (!text.startsWith("editing for")) {
      return false;
    }
    return !text.includes("all recipients");
  }, root);
  if (editingForCandidate) {
    return true;
  }

  const selectors = "button, [role='button'], [role='tab'], a[role='button'], a";
  const candidates = Array.from(root.querySelectorAll(selectors)).filter(isVisible);
  for (const candidate of candidates) {
    const text = normalizeText(getElementText(candidate));
    if (!(text === "personalize" || text.startsWith("personalize ") || text.includes(" personalize"))) {
      continue;
    }
    const ariaSelected = String(candidate.getAttribute("aria-selected") || "").toLowerCase() === "true";
    const ariaPressed = String(candidate.getAttribute("aria-pressed") || "").toLowerCase() === "true";
    if (ariaSelected || ariaPressed) {
      return true;
    }
  }
  return false;
}

async function activatePersonalizeMode(runId = "", maxRetries = 3) {
  if (isPersonalizeModeActive(document)) {
    await sendLog({
      event: "gem.sequence_automation.personalize.found",
      runId,
      message: "Personalize mode already active.",
      details: {
        attempt: 0,
        alreadyActive: true,
        url: window.location.href
      }
    });
    return { ok: true, retries: 0, alreadyActive: true };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const personalizeButton = await waitForElement(() => findPersonalizeButtonStrict(document), 7000, 120);
    if (!personalizeButton) {
      await sendLog({
        level: "warn",
        event: "gem.sequence_automation.personalize.retry",
        runId,
        message: `Could not find 'Personalize' on attempt ${attempt}.`,
        details: {
          attempt,
          reason: "button_not_found",
          snapshot: collectDebugSnapshot(),
          url: window.location.href
        }
      });
      await delay(500);
      continue;
    }

    await sendLog({
      event: "gem.sequence_automation.personalize.found",
      runId,
      message: "Found 'Personalize' control.",
      details: {
        attempt,
        buttonText: toTextSample(getElementText(personalizeButton), 120),
        url: window.location.href
      }
    });

    if (typeof personalizeButton.scrollIntoView === "function") {
      personalizeButton.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    }
    clickElement(personalizeButton);
    if (typeof personalizeButton.focus === "function") {
      personalizeButton.focus();
      triggerKey(personalizeButton, "Enter");
    }

    await sendLog({
      event: "gem.sequence_automation.personalize.clicked",
      runId,
      message: "Clicked 'Personalize'.",
      details: {
        attempt,
        url: window.location.href
      }
    });

    const activated = await waitForElement(() => (isPersonalizeModeActive(document) ? { active: true } : null), 5000, 120);
    if (activated) {
      return { ok: true, retries: attempt - 1, alreadyActive: false };
    }

    await sendLog({
      level: "warn",
      event: "gem.sequence_automation.personalize.retry",
      runId,
      message: `Personalize was not active after click on attempt ${attempt}.`,
      details: {
        attempt,
        reason: "not_active_after_click",
        snapshot: collectDebugSnapshot(),
        url: window.location.href
      }
    });
    await delay(500);
  }

  await sendLog({
    level: "error",
    event: "gem.sequence_automation.personalize.failed",
    runId,
    message: "Failed to activate 'Personalize' after retries.",
    details: {
      retries: maxRetries,
      snapshot: collectDebugSnapshot(),
      url: window.location.href
    }
  });
  return { ok: false, retries: maxRetries, alreadyActive: false };
}

async function findSequenceSelectionScope() {
  const scope = await waitForElement(() => {
    const chooseModal = findChooseSequenceModal();
    if (chooseModal) {
      return chooseModal;
    }
    const roots = getVisibleOverlayRoots();
    for (const root of roots) {
      const text = normalizeText(getElementText(root));
      const hasOptions = Boolean(root.querySelector("[role='option'], .Select-option, [role='listbox'], .Select-menu"));
      const hasSelect = Boolean(root.querySelector("select"));
      const hasSearchInput = Boolean(
        root.querySelector(
          "input[placeholder*='Search sequence'], input[placeholder*='Search sequences'], input[aria-autocomplete='list'], [role='combobox'] input, .Select-input input"
        )
      );
      const hasFlowText = text.includes("add to sequence") || text.includes("sequence");
      const hasNext = Boolean(findNextEditStagesButton(root));
      if ((hasSearchInput || hasOptions || hasSelect) && (hasFlowText || hasNext)) {
        return root;
      }
    }
    return null;
  }, 8000, 120);
  return scope || null;
}

async function openAddToSequenceFlowFromMessage(runId = "") {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const addToSequence = await openMessageMenuAndFindAddToSequence();
    if (!addToSequence) {
      await sendLog({
        level: "warn",
        event: "gem.sequence_automation.debug.add_not_found_attempt",
        runId,
        message: `Add to sequence not found on attempt ${attempt}.`,
        details: collectDebugSnapshot()
      });
      await delay(180);
      continue;
    }
    if (!addToSequence.alreadyOpened) {
      activateElement(addToSequence);
    }

    const opened = await waitForElement(
      () =>
        Boolean(findNextEditStagesButton(document)) ||
        Boolean(window.location.href.includes("/edit/recipients")) ||
        Boolean(window.location.href.includes("/edit/stages")) ||
        Boolean(document.querySelector("[role='dialog'], .ReactModal__Content, .artdeco-modal")),
      2500,
      120
    );
    if (opened) {
      return true;
    }
    await delay(220);
  }
  return false;
}

function readAutomationParams() {
  const parsed = new URL(window.location.href);
  return {
    action: parsed.searchParams.get("glsAction") || "",
    runId: parsed.searchParams.get("glsRunId") || "",
    candidateId: parsed.searchParams.get("glsCandidateId") || "",
    sequenceId: parsed.searchParams.get("glsSequenceId") || "",
    sequenceName: parsed.searchParams.get("glsSequenceName") || ""
  };
}

function clearAutomationParamsFromUrl() {
  const parsed = new URL(window.location.href);
  let changed = false;
  for (const key of GEM_AUTOMATION_PARAMS) {
    if (parsed.searchParams.has(key)) {
      parsed.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  const next = `${parsed.pathname}${parsed.search ? parsed.search : ""}${parsed.hash ? parsed.hash : ""}`;
  window.history.replaceState({}, "", next);
}

function sendLog(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "LOG_EVENT",
        payload: {
          source: "extension.gem_content",
          actionId: ACTIONS.SEND_SEQUENCE,
          ...payload
        }
      },
      () => resolve()
    );
  });
}

async function selectSequence(params, scopeRoot) {
  const sequenceName = String(params.sequenceName || "").trim();
  const sequenceId = String(params.sequenceId || "").trim();
  const chooseModal = findChooseSequenceModal();
  const sequenceModal = chooseModal && scopeRoot && (chooseModal === scopeRoot || chooseModal.contains(scopeRoot)) ? chooseModal : null;
  if (sequenceModal) {
    const nativeSelect = sequenceModal.querySelector("select");
    if (nativeSelect) {
      const picked = pickSelectOption(nativeSelect, sequenceName, sequenceId);
      if (picked) {
        const submitButton = findAddToSequenceSubmitButton(sequenceModal);
        if (submitButton && !isDisabledButton(submitButton)) {
          return true;
        }
        const enabled = await waitForElement(() => {
          const button = findAddToSequenceSubmitButton(sequenceModal);
          return button && !isDisabledButton(button) ? button : null;
        }, 3000, 120);
        if (enabled) {
          return true;
        }
      } else {
        await sendLog({
          level: "warn",
          event: "gem.sequence_automation.debug.modal_select_not_found",
          runId: params.runId,
          message: "Sequence option not found in modal native select.",
          details: {
            sequenceName,
            sequenceId,
            options: collectSequenceOptionsFromSelect(nativeSelect).slice(0, 250)
          }
        });
      }
    }

    const pickerTrigger = findModalSequencePickerTrigger(sequenceModal);
    if (pickerTrigger) {
      clickElement(pickerTrigger);
      await delay(120);
      const input = findSequenceSearchInput(sequenceModal);
      if (input && sequenceName) {
        input.focus();
        setNativeInputValue(input, sequenceName);
      }

      const pickedFromList = await waitForElement(() => {
        const normalizedName = normalizeText(sequenceName);
        const normalizedId = normalizeText(sequenceId);
        const options = collectVisibleListboxOptions();
        const exactName = options.find((option) => normalizeText(option.label) === normalizedName);
        const containsName = options.find((option) => Boolean(normalizedName) && normalizeText(option.label).includes(normalizedName));
        const containsId = options.find((option) => Boolean(normalizedId) && normalizeText(option.label).includes(normalizedId));
        return (exactName || containsName || containsId || null)?.node || null;
      }, 3500, 120);

      if (pickedFromList) {
        clickElement(pickedFromList);
        const submitButton = await waitForElement(() => {
          const button = findAddToSequenceSubmitButton(sequenceModal);
          return button && !isDisabledButton(button) ? button : null;
        }, 3000, 120);
        if (submitButton) {
          return true;
        }
      } else {
        await sendLog({
          level: "warn",
          event: "gem.sequence_automation.debug.modal_listbox_option_not_found",
          runId: params.runId,
          message: "Could not match sequence in modal listbox options.",
          details: {
            sequenceName,
            sequenceId,
            options: collectVisibleListboxOptions()
              .slice(0, 250)
              .map((item) => item.label)
          }
        });
      }
    }
  }

  const startedAt = Date.now();
  let searchTypedAt = 0;

  while (Date.now() - startedAt < 15000) {
    const option = findSequenceOption(sequenceName, sequenceId, scopeRoot);
    if (option) {
      clickElement(option);
      return true;
    }

    const input = findSequenceSearchInput(scopeRoot);
    if (input && sequenceName && Date.now() - searchTypedAt > 600) {
      input.focus();
      setNativeInputValue(input, sequenceName);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      searchTypedAt = Date.now();
    }

    await delay(120);
  }
  await sendLog({
    level: "warn",
    event: "gem.sequence_automation.debug.sequence_not_selected",
    runId: params.runId,
    message: "Could not select sequence within scope.",
    details: {
      sequenceName,
      sequenceId,
      scopeTextSample: toTextSample(getElementText(scopeRoot), 220),
      scopeHasInput: Boolean(findSequenceSearchInput(scopeRoot)),
      scopeOptionSamples: getClickableElements(scopeRoot)
        .slice(0, 24)
        .map((item) => toTextSample(getElementText(item), 90))
    }
  });
  return false;
}

async function submitAddToSequence(scopeRoot) {
  const chooseModal = findChooseSequenceModal();
  const targetRoot = chooseModal && scopeRoot && (chooseModal === scopeRoot || chooseModal.contains(scopeRoot)) ? chooseModal : scopeRoot;
  if (!targetRoot) {
    return false;
  }
  const addButton = await waitForElement(() => {
    const button = findAddToSequenceSubmitButton(targetRoot);
    return button && !isDisabledButton(button) ? button : null;
  }, 10000, 120);
  if (!addButton) {
    return false;
  }
  clickElement(addButton);
  return true;
}

async function runOpenSequenceForCandidateFlow(params) {
  await sendLog({
    event: "gem.sequence_automation.started",
    runId: params.runId,
    message: "Starting candidate-specific sequence automation in Gem.",
    link: window.location.href,
    details: {
      candidateId: params.candidateId,
      sequenceId: params.sequenceId,
      sequenceName: params.sequenceName
    }
  });

  const messageTrigger = await waitForElement(() => getMessageMenuTriggers()[0] || null, 20000, 120);
  if (!messageTrigger) {
    throw new Error("Could not find the Message menu in Gem.");
  }

  const addToSequenceOpened = await openAddToSequenceFlowFromMessage(params.runId || "");
  if (!addToSequenceOpened) {
    await sendLog({
      level: "error",
      event: "gem.sequence_automation.debug.final_snapshot",
      runId: params.runId,
      message: "Final DOM snapshot before failing add-to-sequence.",
      details: collectDebugSnapshot()
    });
    throw new Error("Could not find 'Add to sequence' in Gem Message menu.");
  }

  const sequenceScope = await findSequenceSelectionScope();
  if (!sequenceScope) {
    throw new Error("Could not find the sequence selection popup.");
  }

  const selected = await selectSequence(params, sequenceScope);
  if (!selected) {
    throw new Error(`Could not select sequence '${params.sequenceName || params.sequenceId}'.`);
  }

  const submitted = await submitAddToSequence(sequenceScope);
  if (!submitted) {
    throw new Error("Could not submit 'Add to sequence' after selecting sequence.");
  }

  const editStagesResult = await navigateToEditStages(params.runId || "", 3);
  if (!editStagesResult.ok) {
    throw new Error(`Gem did not navigate to Edit stages after clicking 'Next: Edit stages'. URL: ${window.location.href}`);
  }

  const personalizeResult = await activatePersonalizeMode(params.runId || "", 3);
  if (!personalizeResult.ok) {
    throw new Error(`Gem reached Edit stages but failed to activate 'Personalize'. URL: ${window.location.href}`);
  }

  await sendLog({
    event: "gem.sequence_automation.succeeded",
    runId: params.runId,
    message: "Candidate-specific sequence edit opened in Gem.",
    link: window.location.href,
    details: {
      candidateId: params.candidateId,
      sequenceId: params.sequenceId,
      sequenceName: params.sequenceName,
      finalUrl: window.location.href,
      editStagesMatchedBy: editStagesResult.matchedBy || "",
      editStagesRetries: editStagesResult.retries,
      personalizeRetries: personalizeResult.retries,
      personalizeAlreadyActive: Boolean(personalizeResult.alreadyActive)
    }
  });
}

function alreadyRan(runId) {
  if (!runId) {
    return false;
  }
  const key = `gem_linkedin_shortcuts_run_${runId}`;
  if (window.sessionStorage.getItem(key) === "1") {
    return true;
  }
  window.sessionStorage.setItem(key, "1");
  return false;
}

async function initGemAutomation() {
  const params = readAutomationParams();
  if (params.action !== GEM_ACTION_OPEN_SEQUENCE_FOR_CANDIDATE) {
    return;
  }
  if (alreadyRan(params.runId)) {
    clearAutomationParamsFromUrl();
    return;
  }

  clearAutomationParamsFromUrl();
  try {
    await runOpenSequenceForCandidateFlow(params);
  } catch (error) {
    await sendLog({
      level: "error",
      event: "gem.sequence_automation.failed",
      runId: params.runId,
      message: error?.message || "Gem sequence automation failed.",
      link: window.location.href,
      details: {
        candidateId: params.candidateId,
        sequenceId: params.sequenceId,
        sequenceName: params.sequenceName
      }
    });
  }
}

let gemActionSettings = null;
let gemActionToastContainer = null;
let gemActionRecoveryTriggered = false;
const GEM_ASHBY_JOB_PICKER_RENDER_LIMIT = 100;

function generateGemRunId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isGemCandidateProfilePage() {
  return /^https:\/\/(www|app)\.gem\.com\/candidate\/[^/?#]+/.test(window.location.href);
}

function decodeBase64Text(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return "";
  }
  try {
    return atob(text);
  } catch (_error) {
    // URL-safe base64 fallback.
    try {
      const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
      return atob(padded);
    } catch (_nestedError) {
      return "";
    }
  }
}

function encodeBase64Text(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return "";
  }
  try {
    return btoa(text);
  } catch (_error) {
    return "";
  }
}

function normalizeGemCandidateId(rawId) {
  const raw = String(rawId || "").trim();
  if (!raw) {
    return "";
  }
  const decoded = decodeBase64Text(raw);
  if (!decoded) {
    return raw;
  }
  const personMatch = decoded.match(/^Person:(\d+)$/i);
  if (personMatch) {
    const encoded = encodeBase64Text(`candidates:${personMatch[1]}`);
    return encoded || raw;
  }
  const candidateMatch = decoded.match(/^candidates:(\d+)$/i);
  if (candidateMatch) {
    const encoded = encodeBase64Text(`candidates:${candidateMatch[1]}`);
    return encoded || raw;
  }
  return raw;
}

function getGemCandidateIdFromUrl() {
  try {
    const parsed = new URL(window.location.href);
    const match = parsed.pathname.match(/^\/candidate\/([^/?#]+)/);
    const raw = match ? decodeURIComponent(match[1]) : "";
    return normalizeGemCandidateId(raw);
  } catch (_error) {
    return "";
  }
}

function getGemProfileNameFromDom() {
  const heading = document.querySelector("h1");
  return heading ? String(heading.textContent || "").trim() : "";
}

function getGemLinkedInUrlFromDom() {
  const anchors = Array.from(document.querySelectorAll("a[href*='linkedin.com/in/'], a[href*='linkedin.com/pub/']"));
  for (const anchor of anchors) {
    const href = String(anchor.getAttribute("href") || "").trim();
    if (href) {
      return href;
    }
  }
  return "";
}

function getGemActionContext() {
  return {
    gemCandidateId: getGemCandidateIdFromUrl(),
    profileName: getGemProfileNameFromDom(),
    linkedinUrl: getGemLinkedInUrlFromDom(),
    gemProfileUrl: window.location.href
  };
}

function isEditableTarget(target) {
  if (!target) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = String(target.tagName || "").toLowerCase();
  if (tag === "textarea") {
    return true;
  }
  if (tag === "input") {
    const type = String(target.type || "").toLowerCase();
    if (
      type === "" ||
      type === "text" ||
      type === "search" ||
      type === "email" ||
      type === "number" ||
      type === "password" ||
      type === "tel" ||
      type === "url"
    ) {
      return true;
    }
  }
  return false;
}

function isGemRuntimeError(message) {
  return /Extension context invalidated|Receiving end does not exist|message port closed/i.test(String(message || ""));
}

function isGemRuntimeResponseError(response) {
  return isGemRuntimeError(String(response?.message || ""));
}

function recoverGemContext(message) {
  if (gemActionRecoveryTriggered) {
    return;
  }
  gemActionRecoveryTriggered = true;
  showGemActionToast("Extension was updated. Reloading this Gem tab...", true);
  setTimeout(() => {
    window.location.reload();
  }, 800);
  logGemAction({
    level: "warn",
    event: "context.invalidated",
    message: message || "Extension context invalidated.",
    link: window.location.href
  }).catch(() => {});
}

function ensureGemActionToastContainer() {
  if (gemActionToastContainer) {
    return gemActionToastContainer;
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
  gemActionToastContainer = container;
  return container;
}

function showGemActionToast(text, isError = false) {
  const container = ensureGemActionToastContainer();
  const toast = document.createElement("div");
  toast.textContent = text;
  toast.style.background = isError ? "#a61d24" : "#196c2e";
  toast.style.color = "#fff";
  toast.style.padding = "10px 12px";
  toast.style.borderRadius = "6px";
  toast.style.fontSize = "13px";
  toast.style.fontFamily = "-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
  toast.style.maxWidth = "360px";
  toast.style.wordBreak = "break-word";
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function showGemAshbyUploadResultCard(url, message = "") {
  const container = ensureGemActionToastContainer();
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

  const cleanup = () => {
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

  setTimeout(cleanup, 12000);
}

function sendRuntimeMessageFromGem(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || "Runtime message failed.";
        if (isGemRuntimeError(msg)) {
          recoverGemContext(msg);
          reject(new Error("Extension updated. Reloading page."));
          return;
        }
        reject(new Error(msg));
        return;
      }
      resolve(response);
    });
  });
}

async function logGemAction(payload) {
  await sendRuntimeMessageFromGem({
    type: "LOG_EVENT",
    payload: {
      source: "extension.gem_content",
      ...payload
    }
  });
}

async function loadGemActionSettings(force = false) {
  if (gemActionSettings && !force) {
    return gemActionSettings;
  }
  const response = await sendRuntimeMessageFromGem({ type: "GET_SETTINGS" });
  if (!response?.ok) {
    throw new Error(response?.message || "Could not load settings");
  }
  gemActionSettings = deepMerge(DEFAULT_SETTINGS, response.settings || {});
  return gemActionSettings;
}

function findGemActionByShortcut(shortcut) {
  if (!gemActionSettings) {
    return "";
  }
  const mapping = gemActionSettings.shortcuts || {};
  return Object.keys(mapping).find((actionId) => normalizeShortcut(mapping[actionId]) === shortcut) || "";
}

async function listAshbyJobsFromGem(query, runId) {
  const response = await sendRuntimeMessageFromGem({
    type: "LIST_ASHBY_JOBS",
    query: String(query || ""),
    limit: 0,
    runId: runId || ""
  });
  if (!response?.ok) {
    if (isGemRuntimeResponseError(response)) {
      recoverGemContext(response?.message || "Extension context invalidated.");
      throw new Error("Extension updated. Reloading page.");
    }
    throw new Error(response?.message || "Could not load Ashby jobs");
  }
  return Array.isArray(response.jobs) ? response.jobs : [];
}

async function runGemAction(actionId, context) {
  return sendRuntimeMessageFromGem({
    type: "RUN_ACTION",
    actionId,
    context,
    meta: {
      source: context.source || "gem",
      runId: context.runId || ""
    }
  });
}

function createGemAshbyJobPickerStyles() {
  if (document.getElementById("gls-ashby-job-picker-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "gls-ashby-job-picker-style";
  style.textContent = `
    #gls-ashby-job-picker-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #gls-ashby-job-picker-modal {
      width: min(680px, 100%);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: #1f2328;
      position: relative;
    }
    #gls-ashby-job-picker-brand {
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
    #gls-ashby-job-picker-brand-dot {
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
    #gls-ashby-job-picker-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    #gls-ashby-job-picker-subtitle {
      font-size: 13px;
      color: #4f5358;
      margin-bottom: 12px;
    }
    #gls-ashby-job-picker-input {
      width: 100%;
      border: 1px solid #b6beca;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      margin-bottom: 10px;
    }
    #gls-ashby-job-picker-results {
      border: 1px solid #d4dae3;
      border-radius: 8px;
      max-height: 280px;
      overflow: auto;
      background: #fff;
    }
    .gls-ashby-job-picker-item {
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid #eff2f7;
      font-size: 14px;
      line-height: 1.3;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .gls-ashby-job-picker-item:last-child {
      border-bottom: none;
    }
    .gls-ashby-job-picker-item.active {
      background: #eaf2fe;
    }
    .gls-ashby-job-picker-item-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1;
    }
    .gls-ashby-job-picker-item-key {
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
    .gls-ashby-job-picker-item-name {
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gls-ashby-job-picker-item-status {
      font-size: 12px;
      color: #5b6168;
      white-space: nowrap;
    }
    .gls-ashby-job-picker-hint {
      margin-top: 10px;
      font-size: 12px;
      color: #5b6168;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .gls-ashby-job-picker-empty {
      padding: 12px;
      font-size: 13px;
      color: #5b6168;
    }
    #gls-ashby-job-picker-confirm-mask {
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
    #gls-ashby-job-picker-confirm-mask.visible {
      display: flex;
    }
    #gls-ashby-job-picker-confirm-card {
      width: min(440px, 100%);
      border: 1px solid #d4dae3;
      border-radius: 10px;
      padding: 16px;
      background: #fff;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
    }
    #gls-ashby-job-picker-confirm-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2328;
      margin-bottom: 8px;
    }
    #gls-ashby-job-picker-confirm-body {
      font-size: 14px;
      color: #32363c;
      margin-bottom: 14px;
      word-break: break-word;
    }
    #gls-ashby-job-picker-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .gls-ashby-job-picker-confirm-btn {
      border-radius: 7px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    #gls-ashby-job-picker-confirm-cancel {
      border-color: #c4cbd7;
      background: #fff;
      color: #1f2328;
    }
    #gls-ashby-job-picker-confirm-ok {
      border-color: #4b3fa8;
      background: #4b3fa8;
      color: #fff;
    }
  `;
  document.documentElement.appendChild(style);
}

async function showGemAshbyJobPicker(runId, profileUrl) {
  createGemAshbyJobPickerStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "gls-ashby-job-picker-overlay";

    const modal = document.createElement("div");
    modal.id = "gls-ashby-job-picker-modal";

    const brand = document.createElement("div");
    brand.id = "gls-ashby-job-picker-brand";
    const brandDot = document.createElement("span");
    brandDot.id = "gls-ashby-job-picker-brand-dot";
    brandDot.textContent = "A";
    const brandText = document.createElement("span");
    brandText.textContent = "Ashby";
    brand.appendChild(brandDot);
    brand.appendChild(brandText);

    const title = document.createElement("div");
    title.id = "gls-ashby-job-picker-title";
    title.textContent = "Upload Candidate to Ashby";

    const subtitle = document.createElement("div");
    subtitle.id = "gls-ashby-job-picker-subtitle";
    subtitle.textContent = "Type job name, use arrow keys to choose, then upload candidate.";

    const input = document.createElement("input");
    input.id = "gls-ashby-job-picker-input";
    input.type = "text";
    input.placeholder = "Search jobs by name...";
    input.autocomplete = "off";

    const results = document.createElement("div");
    results.id = "gls-ashby-job-picker-results";

    const hint = document.createElement("div");
    hint.className = "gls-ashby-job-picker-hint";
    const hintText = document.createElement("span");
    hintText.textContent = "Click a job or press Enter to continue. Esc to cancel.";
    hint.appendChild(hintText);

    const confirmMask = document.createElement("div");
    confirmMask.id = "gls-ashby-job-picker-confirm-mask";
    const confirmCard = document.createElement("div");
    confirmCard.id = "gls-ashby-job-picker-confirm-card";
    const confirmTitle = document.createElement("div");
    confirmTitle.id = "gls-ashby-job-picker-confirm-title";
    confirmTitle.textContent = "Confirm Upload";
    const confirmBody = document.createElement("div");
    confirmBody.id = "gls-ashby-job-picker-confirm-body";
    const confirmActions = document.createElement("div");
    confirmActions.id = "gls-ashby-job-picker-confirm-actions";
    const confirmCancelBtn = document.createElement("button");
    confirmCancelBtn.id = "gls-ashby-job-picker-confirm-cancel";
    confirmCancelBtn.className = "gls-ashby-job-picker-confirm-btn";
    confirmCancelBtn.type = "button";
    confirmCancelBtn.textContent = "Cancel";
    const confirmOkBtn = document.createElement("button");
    confirmOkBtn.id = "gls-ashby-job-picker-confirm-ok";
    confirmOkBtn.className = "gls-ashby-job-picker-confirm-btn";
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
        return base.slice(0, GEM_ASHBY_JOB_PICKER_RENDER_LIMIT);
      }
      return base
        .filter((job) => String(job?.name || "").toLowerCase().includes(normalized))
        .slice(0, GEM_ASHBY_JOB_PICKER_RENDER_LIMIT);
    }

    function selectJob(job) {
      if (!job) {
        return;
      }
      logGemAction({
        event: "ashby_job_picker.selected",
        actionId: ACTIONS.UPLOAD_TO_ASHBY,
        runId,
        message: `Selected Ashby job ${job.name || job.id}.`,
        link: profileUrl,
        details: {
          jobId: job.id || "",
          jobName: job.name || "",
          jobStatus: job.status || ""
        }
      }).catch(() => {});
      finish({
        id: job.id || "",
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
        loadingNode.className = "gls-ashby-job-picker-empty";
        loadingNode.textContent = "Loading jobs...";
        results.appendChild(loadingNode);
        return;
      }
      if (loadError) {
        const errorNode = document.createElement("div");
        errorNode.className = "gls-ashby-job-picker-empty";
        errorNode.textContent = `Could not load jobs: ${loadError}`;
        results.appendChild(errorNode);
        return;
      }
      if (filteredJobs.length === 0) {
        const empty = document.createElement("div");
        empty.className = "gls-ashby-job-picker-empty";
        empty.textContent = "No matching jobs.";
        results.appendChild(empty);
        return;
      }

      filteredJobs.forEach((job, index) => {
        const item = document.createElement("div");
        const jobId = String(job.id || "");
        item.className = `gls-ashby-job-picker-item${jobId === selectedJobId ? " active" : ""}`;
        const left = document.createElement("span");
        left.className = "gls-ashby-job-picker-item-left";
        const key = document.createElement("span");
        key.className = "gls-ashby-job-picker-item-key";
        key.textContent = String(index + 1);
        const name = document.createElement("span");
        name.className = "gls-ashby-job-picker-item-name";
        name.textContent = job.name || job.id;
        left.appendChild(key);
        left.appendChild(name);
        const status = document.createElement("span");
        status.className = "gls-ashby-job-picker-item-status";
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
      logGemAction({
        level: "warn",
        event: "ashby_job_picker.cancelled",
        actionId: ACTIONS.UPLOAD_TO_ASHBY,
        runId,
        message,
        link: profileUrl
      }).catch(() => {});
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

    logGemAction({
      event: "ashby_job_picker.opened",
      actionId: ACTIONS.UPLOAD_TO_ASHBY,
      runId,
      message: "Ashby job picker opened.",
      link: profileUrl
    }).catch(() => {});

    listAshbyJobsFromGem("", runId)
      .then(async (jobs) => {
        allJobs = jobs.filter((job) => isOpenAshbyJob(job) && !job.isArchived);
        loading = false;
        loadError = "";
        renderList();
        await logGemAction({
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
        loadError = error?.message || "Failed to load Ashby jobs.";
        renderList();
        showGemActionToast(loadError, true);
        await logGemAction({
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

async function handleGemUploadToAshby(source = "keyboard", runId = "") {
  const effectiveRunId = runId || generateGemRunId();
  const context = getGemActionContext();
  const profileLink = context.linkedinUrl || context.gemProfileUrl || window.location.href;

  if (!isGemCandidateProfilePage()) {
    showGemActionToast("Open a Gem candidate profile page to run this action.", true);
    await logGemAction({
      level: "warn",
      event: "action.blocked",
      actionId: ACTIONS.UPLOAD_TO_ASHBY,
      runId: effectiveRunId,
      message: "Action blocked because current page is not a Gem candidate profile.",
      link: window.location.href
    });
    return;
  }

  const settings = gemActionSettings || (await loadGemActionSettings());
  if (!settings.enabled) {
    showGemActionToast("Gem shortcuts are disabled in extension settings.", true);
    await logGemAction({
      level: "warn",
      event: "action.blocked",
      actionId: ACTIONS.UPLOAD_TO_ASHBY,
      runId: effectiveRunId,
      message: "Action blocked because extension is disabled.",
      link: profileLink
    });
    return;
  }

  const job = await showGemAshbyJobPicker(effectiveRunId, profileLink);
  if (!job) {
    showGemActionToast("Action cancelled.", true);
    await logGemAction({
      level: "warn",
      event: "action.cancelled",
      actionId: ACTIONS.UPLOAD_TO_ASHBY,
      runId: effectiveRunId,
      message: "Ashby upload cancelled by user.",
      link: profileLink
    });
    return;
  }

  const payload = {
    ...context,
    ashbyJobId: String(job.id || "").trim(),
    ashbyJobName: String(job.name || "").trim(),
    source,
    runId: effectiveRunId
  };

  await logGemAction({
    event: "action.dispatched",
    actionId: ACTIONS.UPLOAD_TO_ASHBY,
    runId: effectiveRunId,
    message: `Dispatching Ashby upload from ${source}.`,
    link: profileLink,
    details: {
      gemCandidateId: payload.gemCandidateId,
      ashbyJobId: payload.ashbyJobId,
      ashbyJobName: payload.ashbyJobName
    }
  });

  const result = await runGemAction(ACTIONS.UPLOAD_TO_ASHBY, payload);
  if (result?.ok) {
    showGemActionToast(result.message || "Candidate uploaded to Ashby.");
    if (result.link) {
      showGemAshbyUploadResultCard(result.link, result.message || "Candidate uploaded to Ashby.");
    }
    await logGemAction({
      event: "action.result.success",
      actionId: ACTIONS.UPLOAD_TO_ASHBY,
      runId: result.runId || effectiveRunId,
      message: result.message || "Candidate uploaded to Ashby.",
      link: result.link || profileLink
    });
    return;
  }

  showGemActionToast(result?.message || "Action failed.", true);
  await logGemAction({
    level: "error",
    event: "action.result.failed",
    actionId: ACTIONS.UPLOAD_TO_ASHBY,
    runId: result?.runId || effectiveRunId,
    message: result?.message || "Action failed.",
    link: profileLink
  });
}

function onGemProfileKeyDown(event) {
  if (!isGemCandidateProfilePage()) {
    return;
  }
  const isModifierBasedShortcut = Boolean(event.metaKey || event.ctrlKey || event.altKey);
  if (isEditableTarget(event.target) && !isModifierBasedShortcut) {
    return;
  }
  if (!gemActionSettings) {
    return;
  }
  const shortcut = keyboardEventToShortcut(event);
  if (!shortcut) {
    return;
  }
  const actionId = findGemActionByShortcut(shortcut);
  if (actionId !== ACTIONS.UPLOAD_TO_ASHBY) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const runId = generateGemRunId();
  handleGemUploadToAshby("keyboard", runId).catch((error) => {
    showGemActionToast(error?.message || "Ashby upload failed.", true);
    logGemAction({
      level: "error",
      event: "action.exception",
      actionId: ACTIONS.UPLOAD_TO_ASHBY,
      runId,
      message: error?.message || "Unexpected Ashby upload error.",
      link: window.location.href
    }).catch(() => {});
  });
}

function initGemProfileActions() {
  loadGemActionSettings()
    .then(() => {})
    .catch((error) => {
      showGemActionToast(error?.message || "Could not load extension settings.", true);
    });

  window.addEventListener("keydown", onGemProfileKeyDown, true);
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "sync" && changes.settings) {
      gemActionSettings = deepMerge(DEFAULT_SETTINGS, changes.settings.newValue || {});
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SETTINGS_UPDATED") {
      gemActionSettings = deepMerge(DEFAULT_SETTINGS, message.settings || {});
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "TRIGGER_ACTION" && message?.actionId === ACTIONS.UPLOAD_TO_ASHBY) {
      const runId = message.runId || generateGemRunId();
      handleGemUploadToAshby(message.source || "popup", runId)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, message: error.message }));
      return true;
    }

    return false;
  });
}

initGemAutomation();
initGemProfileActions();
