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

initGemAutomation();
