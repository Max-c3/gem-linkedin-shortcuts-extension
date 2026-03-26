#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const HARNESS_DIR = path.join(ROOT_DIR, ".gls-live-harness");
const USER_DATA_DIR = path.join(HARNESS_DIR, "chrome-user-data");
const ARTIFACTS_DIR = path.join(HARNESS_DIR, "artifacts");
const HARNESS_META_PATH = path.join(HARNESS_DIR, "meta.json");
const DEFAULT_PROFILE_URL = process.env.GLS_HARNESS_PROFILE_URL || "https://www.linkedin.com/in/adammainz/";
const DEFAULT_TIMEOUT_MS = 45_000;

function log(message, details) {
  if (details === undefined) {
    console.log(`[harness] ${message}`);
    return;
  }
  console.log(`[harness] ${message}`, details);
}

function fail(message) {
  console.error(`[harness] ${message}`);
  process.exit(1);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const trimmed = token.slice(2);
    if (!trimmed) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex >= 0) {
      args[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[trimmed] = next;
      index += 1;
      continue;
    }
    args[trimmed] = true;
  }
  return args;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toPlaywrightShortcut(shortcut) {
  const normalized = String(shortcut || "").trim();
  if (!normalized) {
    return "";
  }
  const parts = normalized.split("+").filter(Boolean);
  const key = parts.pop() || "";
  const mappedParts = parts.map((part) => {
    if (part === "Meta") {
      return "Meta";
    }
    if (part === "Ctrl") {
      return "Control";
    }
    if (part === "Alt") {
      return "Alt";
    }
    if (part === "Shift") {
      return "Shift";
    }
    return part;
  });
  let mappedKey = key;
  if (/^[A-Z]$/.test(key)) {
    mappedKey = `Key${key}`;
  } else if (/^[0-9]$/.test(key)) {
    mappedKey = `Digit${key}`;
  } else if (key === "Space") {
    mappedKey = "Space";
  }
  return [...mappedParts, mappedKey].join("+");
}

async function getHarnessMeta() {
  if (!(await pathExists(HARNESS_META_PATH))) {
    return null;
  }
  try {
    return await readJson(HARNESS_META_PATH);
  } catch (_error) {
    return null;
  }
}

async function writeHarnessMeta(meta) {
  await ensureDir(HARNESS_DIR);
  await writeJson(HARNESS_META_PATH, meta);
}

async function bootstrapProfile({ reset = false } = {}) {
  await ensureDir(HARNESS_DIR);
  await ensureDir(ARTIFACTS_DIR);

  if (reset) {
    await fs.rm(USER_DATA_DIR, { recursive: true, force: true });
  }

  await ensureDir(USER_DATA_DIR);

  const meta = {
    bootstrappedAt: new Date().toISOString(),
    userDataDir: USER_DATA_DIR,
    browserEngine: "playwright-chromium",
    securityMode: "clean-dedicated-profile",
    note:
      "This harness intentionally uses a clean dedicated browser profile and does not read cookies, session storage, or another browser profile."
  };
  await writeHarnessMeta(meta);
  return meta;
}

async function launchHarnessBrowser({ profileUrl = DEFAULT_PROFILE_URL } = {}) {
  const meta = (await bootstrapProfile()) || {};
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,
    channel: "chromium",
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      "--profile-directory=Default",
      "--no-first-run",
      "--no-default-browser-check",
      "--start-maximized",
      `--disable-extensions-except=${ROOT_DIR}`,
      `--load-extension=${ROOT_DIR}`
    ]
  });

  const serviceWorker =
    context.serviceWorkers().find((worker) => worker.url().startsWith("chrome-extension://")) ||
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }).catch(() => null));
  const extensionId = serviceWorker ? new URL(serviceWorker.url()).hostname : "";

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT_MS });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  return { context, page, extensionId, meta };
}

async function collectDiagnostics(page) {
  return page.evaluate(() => {
    const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const visible = (element) => {
      if (!element || typeof element.getBoundingClientRect !== "function") {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const controls = [...document.querySelectorAll("button,a,[role='button'],[role='menuitem']")]
      .filter(visible)
      .map((element) => ({
        text: norm(
          [
            element.getAttribute("aria-label"),
            element.getAttribute("title"),
            element.getAttribute("data-control-name"),
            element.innerText,
            element.textContent
          ]
            .filter(Boolean)
            .join(" | ")
        ).slice(0, 180),
        tag: element.tagName,
        cls: norm(String(element.className || "")).slice(0, 120)
      }))
      .filter((entry) =>
        /connect|message|add note|without a note|send|contact info|recruiter|menu|more|follow|pending|sign in|join now/i.test(
          `${entry.text} ${entry.cls}`
        )
      )
      .slice(0, 30);

    const root = document.documentElement;
    const pageText = norm(document.body?.innerText || "");
    const controlText = controls.map((entry) => entry.text).join(" ");
    const authWallLike = /sign in \| linkedin|sign up \| linkedin/i.test(document.title) || /linkedin\.com\/authwall/i.test(location.href);
    const loggedInSignal =
      Boolean(document.querySelector("header.global-nav, nav.global-nav, .global-nav, [data-test-global-nav-link='notifications']")) ||
      /notifications|recruiter|view in recruiter|contact info|message/i.test(controlText);
    return {
      url: location.href,
      title: document.title,
      content: root.getAttribute("data-gls-content-runtime"),
      keydown: root.getAttribute("data-gls-keydown-runtime"),
      source: root.getAttribute("data-gls-keydown-source"),
      configuredConnect: root.getAttribute("data-gls-shortcut-linkedin-connect"),
      configuredMessage: root.getAttribute("data-gls-shortcut-linkedin-message"),
      lastShortcut: root.getAttribute("data-gls-last-shortcut"),
      lastKey: root.getAttribute("data-gls-last-shortcut-key"),
      lastCode: root.getAttribute("data-gls-last-shortcut-code"),
      lastTarget: root.getAttribute("data-gls-last-shortcut-target"),
      lastMatch: root.getAttribute("data-gls-last-shortcut-match"),
      lastLinkedInAction: root.getAttribute("data-gls-last-linkedin-action"),
      lastLinkedInActionStage: root.getAttribute("data-gls-last-linkedin-action-stage"),
      lastLinkedInActionShortcut: root.getAttribute("data-gls-last-linkedin-action-shortcut"),
      lastLinkedInActionClicked: root.getAttribute("data-gls-last-linkedin-action-clicked"),
      lastLinkedInActionHeading: root.getAttribute("data-gls-last-linkedin-action-heading"),
      lastLinkedInActionTopCardRoot: root.getAttribute("data-gls-last-linkedin-action-top-card-root"),
      lastLinkedInActionSearchRoots: root.getAttribute("data-gls-last-linkedin-action-search-roots"),
      loggedIn: loggedInSignal && !authWallLike,
      loginPromptVisible: /sign in|join now/.test(pageText),
      toastTexts: [...document.querySelectorAll("#gls-bootstrap-toast-root div")].map((element) => norm(element.textContent)).filter(Boolean),
      inviteDialogVisible: Boolean(
        [...document.querySelectorAll("button, [role='button'], [role='dialog'], [role='menuitem']")]
          .filter(visible)
          .some((element) =>
            /add note|without a note|send without a note|invitation|invite/i.test(
              norm(
                [
                  element.getAttribute("aria-label"),
                  element.getAttribute("title"),
                  element.innerText,
                  element.textContent
                ]
                  .filter(Boolean)
                  .join(" ")
              )
            )
          )
      ),
      messageUiVisible: Boolean(
        [...document.querySelectorAll("textarea,input,[contenteditable='true'],[role='textbox']")]
          .filter(visible)
          .some((element) =>
            /message|write a message|compose/i.test(
              norm(
                [
                  element.getAttribute("aria-label"),
                  element.getAttribute("placeholder"),
                  element.getAttribute("title"),
                  element.textContent
                ]
                  .filter(Boolean)
                  .join(" ")
              )
            )
          )
      ),
      controls
    };
  });
}

async function pressShortcut(page, shortcut) {
  const playwrightShortcut = toPlaywrightShortcut(shortcut);
  if (!playwrightShortcut) {
    throw new Error(`Shortcut is empty: ${shortcut}`);
  }
  await page.keyboard.press(playwrightShortcut);
  await page.waitForTimeout(2200);
  return playwrightShortcut;
}

async function saveScreenshot(page, name) {
  await ensureDir(ARTIFACTS_DIR);
  const filePath = path.join(ARTIFACTS_DIR, `${timestamp()}-${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function saveReport(name, payload) {
  await ensureDir(ARTIFACTS_DIR);
  const filePath = path.join(ARTIFACTS_DIR, `${timestamp()}-${name}.json`);
  await writeJson(filePath, payload);
  return filePath;
}

async function waitForExtensionMarkers(page) {
  await page.waitForFunction(
    () => {
      const root = document.documentElement;
      const keydownReady = root.getAttribute("data-gls-keydown-runtime") === "ready";
      const contentReady = root.getAttribute("data-gls-content-runtime") === "ready";
      const configuredShortcut = Boolean(root.getAttribute("data-gls-shortcut-linkedin-connect"));
      return keydownReady && (contentReady || configuredShortcut);
    },
    undefined,
    { timeout: 20_000 }
  );
}

async function collectHarnessState(context, page, extensionId) {
  const serviceWorkers = context
    .serviceWorkers()
    .map((worker) => worker.url())
    .filter(Boolean);
  return {
    extensionId,
    pageUrl: page.url(),
    pageTitle: await page.title().catch(() => ""),
    serviceWorkers,
    pageCount: context.pages().length
  };
}

function isLinkedInLoginWallState(harnessState = {}, diagnostics = {}) {
  const pageUrl = String(harnessState?.pageUrl || diagnostics?.url || "");
  const pageTitle = String(harnessState?.pageTitle || diagnostics?.title || "");
  return /linkedin\.com\/(?:authwall|login)/i.test(pageUrl) || /sign up \| linkedin|sign in \| linkedin/i.test(pageTitle);
}

async function commandDoctor() {
  const report = {
    browserEngine: "playwright-chromium",
    harnessMeta: await getHarnessMeta(),
    userDataDirExists: await pathExists(USER_DATA_DIR),
    securityMode: "clean-dedicated-profile"
  };
  console.log(JSON.stringify(report, null, 2));
}

async function commandBootstrap(args) {
  const meta = await bootstrapProfile({ reset: Boolean(args.reset || args.force) });
  console.log(JSON.stringify(meta, null, 2));
}

async function commandOpen(args) {
  const profileUrl = String(args.url || DEFAULT_PROFILE_URL).trim() || DEFAULT_PROFILE_URL;
  const reset = Boolean(args.reset);
  if (reset) {
    await bootstrapProfile({ reset: true });
  } else {
    await bootstrapProfile();
  }

  const { context, extensionId, meta } = await launchHarnessBrowser({ profileUrl });
  log(`Chrome launched with extension ${extensionId || "<unknown>"}`);
  log(`Using clean dedicated profile at ${meta.userDataDir}`);
  log("This harness does not inspect cookies or another Chrome profile.");
  log("Keep this process running while you use the harness browser. Press Ctrl+C to close it.");
  const shutdown = async () => {
    await context.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await new Promise(() => {});
}

async function runSmoke(profileUrl) {
  const { context, page, extensionId, meta } = await launchHarnessBrowser({ profileUrl });
  try {
    const launchHarnessState = await collectHarnessState(context, page, extensionId).catch(() => null);
    const launchDiagnostics = await collectDiagnostics(page).catch(() => null);
    if (isLinkedInLoginWallState(launchHarnessState, launchDiagnostics)) {
      const screenshot = await saveScreenshot(page, "login-required").catch(() => "");
      const report = {
        generatedAt: new Date().toISOString(),
        profileUrl,
        securityMode: meta.securityMode,
        blocked: "login-required",
        harnessState: launchHarnessState,
        diagnostics: launchDiagnostics,
        screenshot
      };
      const reportPath = await saveReport("login-required", report);
      console.log(JSON.stringify({ ...report, reportPath }, null, 2));
      return report;
    }

    try {
      await waitForExtensionMarkers(page);
    } catch (error) {
      const preMarkerDiagnostics = await collectDiagnostics(page).catch(() => null);
      const harnessState = await collectHarnessState(context, page, extensionId).catch(() => null);
      const screenshot = await saveScreenshot(page, "extension-not-ready").catch(() => "");
      const report = {
        generatedAt: new Date().toISOString(),
        profileUrl,
        securityMode: meta.securityMode,
        blocked: "extension-not-ready",
        error: error.message || String(error),
        harnessState,
        diagnostics: preMarkerDiagnostics,
        screenshot
      };
      const reportPath = await saveReport("extension-not-ready", report);
      console.log(JSON.stringify({ ...report, reportPath }, null, 2));
      throw error;
    }
    const initial = await collectDiagnostics(page);
    const postMarkerHarnessState = await collectHarnessState(context, page, extensionId).catch(() => null);
    if (isLinkedInLoginWallState(postMarkerHarnessState, initial)) {
      const loginScreenshot = await saveScreenshot(page, "login-required");
      const report = {
        generatedAt: new Date().toISOString(),
        extensionId,
        profileUrl,
        securityMode: meta.securityMode,
        blocked: "login-required",
        harnessState: postMarkerHarnessState,
        initial,
        screenshot: loginScreenshot
      };
      const reportPath = await saveReport("login-required", report);
      console.log(JSON.stringify({ ...report, reportPath }, null, 2));
      return report;
    }

    const connectShortcut = initial.configuredConnect || "Meta+Alt+Z";
    const connectPressedAs = await pressShortcut(page, connectShortcut);
    const afterConnect = await collectDiagnostics(page);
    const connectScreenshot = await saveScreenshot(page, "connect");

    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);

    const messageShortcut = initial.configuredMessage || "M";
    const messagePressedAs = await pressShortcut(page, messageShortcut);
    const afterMessage = await collectDiagnostics(page);
    const messageScreenshot = await saveScreenshot(page, "message");

    const report = {
      generatedAt: new Date().toISOString(),
      extensionId,
      profileUrl,
      securityMode: meta.securityMode,
      initial,
      connect: {
        shortcut: connectShortcut,
        playwrightShortcut: connectPressedAs,
        diagnostics: afterConnect,
        screenshot: connectScreenshot
      },
      message: {
        shortcut: messageShortcut,
        playwrightShortcut: messagePressedAs,
        diagnostics: afterMessage,
        screenshot: messageScreenshot
      }
    };
    const reportPath = await saveReport("smoke", report);
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    return report;
  } finally {
    await context.close().catch(() => {});
  }
}

async function commandSmoke(args) {
  const profileUrl = String(args.url || DEFAULT_PROFILE_URL).trim() || DEFAULT_PROFILE_URL;
  await runSmoke(profileUrl);
}

async function commandLoop(args) {
  const profileUrl = String(args.url || DEFAULT_PROFILE_URL).trim() || DEFAULT_PROFILE_URL;
  const intervalMs = Math.max(0, Number.parseInt(String(args.interval || "5000"), 10) || 5000);
  const iterations = Math.max(1, Number.parseInt(String(args.iterations || "999999"), 10) || 999999);
  for (let index = 1; index <= iterations; index += 1) {
    log(`Starting smoke iteration ${index}`);
    try {
      await runSmoke(profileUrl);
      log(`Completed smoke iteration ${index}`);
    } catch (error) {
      log(`Smoke iteration ${index} failed: ${error.message || error}`);
    }
    if (index < iterations) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = String(args._[0] || "doctor").trim().toLowerCase();

  if (command === "doctor") {
    await commandDoctor();
    return;
  }
  if (command === "bootstrap") {
    await commandBootstrap(args);
    return;
  }
  if (command === "open") {
    await commandOpen(args);
    return;
  }
  if (command === "smoke") {
    await commandSmoke(args);
    return;
  }
  if (command === "loop") {
    await commandLoop(args);
    return;
  }

  fail(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
