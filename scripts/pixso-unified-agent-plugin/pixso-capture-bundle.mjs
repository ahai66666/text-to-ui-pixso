#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CAPTURE_BUNDLE_SCHEMA_VERSION = 1;
export const CAPTURE_BUNDLE_KIND = "text-to-ui-pixso-capture-bundle";

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    if (key === "help" || !argv[index + 1] || argv[index + 1].startsWith("--")) result[key] = true;
    else result[key] = argv[++index];
  }
  return result;
}

function samePath(left, right) {
  return path.resolve(left) === path.resolve(right);
}

export function digestFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 24);
}

export function readPngDimensions(file) {
  const input = path.resolve(file);
  const bytes = fs.readFileSync(input);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error(`Capture screenshot must be a PNG: ${input}`);
  }
  if (bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error(`Capture screenshot has no PNG IHDR header: ${input}`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Capture screenshot has invalid dimensions: ${input}`);
  }
  return { width, height };
}

function readJsonIfPresent(file) {
  if (!file || !fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (_) { return null; }
}

function captureBundlePath(runManifest) {
  return runManifest?.artifacts?.captureBundle
    ? path.resolve(runManifest.artifacts.captureBundle)
    : null;
}

function expectedCaptureArtifacts(runManifest) {
  return {
    screenshot: runManifest?.artifacts?.htmlScreenshot ? path.resolve(runManifest.artifacts.htmlScreenshot) : null,
    visualManifest: runManifest?.artifacts?.visualManifest ? path.resolve(runManifest.artifacts.visualManifest) : null,
  };
}

function validateVisualManifest({ runManifest, visualManifest, visualManifestPath, failures }) {
  const viewport = runManifest?.viewport ?? {};
  if (!visualManifest || typeof visualManifest !== "object") {
    failures.push("capture visual manifest is missing or invalid JSON");
    return;
  }
  if (visualManifest.kind !== "text-to-ui-html-visual-manifest" || Number(visualManifest.schemaVersion ?? 0) < 3) {
    failures.push("capture visual manifest must use text-to-ui schemaVersion 3 or newer");
  }
  if (visualManifest.source !== "browser-computed-visual-manifest") failures.push("capture visual manifest is not browser computed");
  if (visualManifest.runId !== runManifest?.runId) failures.push("capture visual manifest runId mismatch");
  if (visualManifest.htmlSourceFingerprint !== runManifest?.source?.htmlSourceFingerprint) failures.push("capture visual manifest HTML fingerprint mismatch");
  if (visualManifest.stateId !== viewport.stateId) failures.push("capture visual manifest stateId mismatch");
  if (Number(visualManifest?.viewport?.width) !== Number(viewport.width) || Number(visualManifest?.viewport?.height) !== Number(viewport.height)) {
    failures.push(`capture visual manifest viewport ${visualManifest?.viewport?.width ?? "?"}x${visualManifest?.viewport?.height ?? "?"} does not match ${viewport.width}x${viewport.height}`);
  }
  if (Math.abs(Number(visualManifest?.viewport?.zoom ?? 0) - Number(viewport.zoom ?? 1)) > 0.01) failures.push("capture visual manifest zoom mismatch");
  if (!visualManifestPath || !fs.existsSync(visualManifestPath)) failures.push("capture visual manifest file is missing");
}

export function validateCaptureBundle({ runManifest, visualManifest = null, bundle = null, bundlePath = null } = {}) {
  const failures = [];
  const warnings = [];
  const required = runManifest?.executionPolicy?.captureBundle === "required";
  const expected = expectedCaptureArtifacts(runManifest);
  const resolvedBundlePath = bundlePath ? path.resolve(bundlePath) : captureBundlePath(runManifest);
  if (!required && !bundle && !resolvedBundlePath) return { ok: true, required: false, failures, warnings, bundle: null };
  if (!resolvedBundlePath) {
    failures.push("run manifest has no capture bundle artifact path");
    return { ok: false, required, failures, warnings, bundle: null };
  }
  const resolvedBundle = bundle ?? readJsonIfPresent(resolvedBundlePath);
  if (!resolvedBundle) {
    failures.push("capture bundle is missing or invalid JSON");
    return { ok: false, required, failures, warnings, bundle: null, bundlePath: resolvedBundlePath };
  }
  if (resolvedBundle.kind !== CAPTURE_BUNDLE_KIND || Number(resolvedBundle.schemaVersion) !== CAPTURE_BUNDLE_SCHEMA_VERSION) {
    failures.push("capture bundle schema is invalid");
  }
  if (resolvedBundle.runId !== runManifest?.runId) failures.push("capture bundle runId mismatch");
  if (resolvedBundle.htmlSourceFingerprint !== runManifest?.source?.htmlSourceFingerprint) failures.push("capture bundle HTML fingerprint mismatch");
  if (resolvedBundle.stateId !== runManifest?.viewport?.stateId) failures.push("capture bundle stateId mismatch");
  const bundleViewport = resolvedBundle.cssViewport ?? {};
  if (Number(bundleViewport.width) !== Number(runManifest?.viewport?.width) || Number(bundleViewport.height) !== Number(runManifest?.viewport?.height)) {
    failures.push("capture bundle CSS viewport mismatch");
  }
  if (Math.abs(Number(bundleViewport.zoom ?? 0) - Number(runManifest?.viewport?.zoom ?? 1)) > 0.01) failures.push("capture bundle zoom mismatch");
  const bundleScreenshot = resolvedBundle.artifacts?.screenshot ?? {};
  const bundleVisualManifest = resolvedBundle.artifacts?.visualManifest ?? {};
  if (!expected.screenshot || !bundleScreenshot.path || !samePath(expected.screenshot, bundleScreenshot.path)) failures.push("capture bundle screenshot path is not the current run artifact");
  if (!expected.visualManifest || !bundleVisualManifest.path || !samePath(expected.visualManifest, bundleVisualManifest.path)) failures.push("capture bundle visual manifest path is not the current run artifact");
  if (expected.screenshot && fs.existsSync(expected.screenshot)) {
    try {
      const screenshot = readPngDimensions(expected.screenshot);
      if (screenshot.width !== Number(runManifest?.viewport?.width) || screenshot.height !== Number(runManifest?.viewport?.height)) {
        failures.push(`capture screenshot dimensions ${screenshot.width}x${screenshot.height} do not match ${runManifest?.viewport?.width}x${runManifest?.viewport?.height}`);
      }
      if (Number(bundleScreenshot.width) !== screenshot.width || Number(bundleScreenshot.height) !== screenshot.height) failures.push("capture bundle screenshot dimensions do not match the PNG");
      if (bundleScreenshot.sha256 !== digestFile(expected.screenshot)) failures.push("capture screenshot changed after bundle validation");
    } catch (error) {
      failures.push(error.message);
    }
  } else {
    failures.push("capture screenshot file is missing");
  }
  const actualVisualManifest = visualManifest ?? (expected.visualManifest ? readJsonIfPresent(expected.visualManifest) : null);
  validateVisualManifest({ runManifest, visualManifest: actualVisualManifest, visualManifestPath: expected.visualManifest, failures });
  if (expected.visualManifest && fs.existsSync(expected.visualManifest)) {
    if (bundleVisualManifest.sha256 !== digestFile(expected.visualManifest)) failures.push("capture visual manifest changed after bundle validation");
  }
  const devicePixelRatio = Number(actualVisualManifest?.viewport?.devicePixelRatio ?? 0);
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) failures.push("capture visual manifest has no valid devicePixelRatio");
  if (Number(resolvedBundle.browser?.devicePixelRatio) !== devicePixelRatio) failures.push("capture bundle devicePixelRatio mismatch");
  if (Number(resolvedBundle.browser?.innerWidth) !== Number(runManifest?.viewport?.width) || Number(resolvedBundle.browser?.innerHeight) !== Number(runManifest?.viewport?.height)) {
    failures.push("capture bundle browser CSS viewport was not calibrated");
  }
  if (Math.abs(Number(resolvedBundle.browser?.zoom ?? 0) - Number(runManifest?.viewport?.zoom ?? 1)) > 0.01) failures.push("capture bundle browser zoom was not calibrated");
  return { ok: failures.length === 0, required, failures, warnings, bundle: resolvedBundle, bundlePath: resolvedBundlePath };
}

export function commitCaptureBundle({ runManifestPath, visualManifestPath = null, screenshotPath = null, bundlePath = null } = {}) {
  const manifestPath = path.resolve(runManifestPath);
  const runManifest = readJson(manifestPath);
  const expected = expectedCaptureArtifacts(runManifest);
  const resolvedVisualManifestPath = path.resolve(visualManifestPath ?? expected.visualManifest ?? "");
  const resolvedScreenshotPath = path.resolve(screenshotPath ?? expected.screenshot ?? "");
  const resolvedBundlePath = path.resolve(bundlePath ?? captureBundlePath(runManifest) ?? "");
  if (!expected.visualManifest || !samePath(resolvedVisualManifestPath, expected.visualManifest)) throw new Error("Capture visual manifest must be written to the current run artifact path");
  if (!expected.screenshot || !samePath(resolvedScreenshotPath, expected.screenshot)) throw new Error("Capture screenshot must be written to the current run artifact path");
  if (!captureBundlePath(runManifest) || !samePath(resolvedBundlePath, captureBundlePath(runManifest))) throw new Error("Capture bundle must be written to the current run artifact path");
  const visualManifest = readJson(resolvedVisualManifestPath);
  const screenshot = readPngDimensions(resolvedScreenshotPath);
  const bundle = {
    schemaVersion: CAPTURE_BUNDLE_SCHEMA_VERSION,
    kind: CAPTURE_BUNDLE_KIND,
    runId: runManifest.runId,
    htmlSourceFingerprint: runManifest.source?.htmlSourceFingerprint ?? null,
    stateId: runManifest.viewport?.stateId ?? "default-visible",
    sourceUrl: runManifest.source?.url ?? null,
    cssViewport: {
      width: Number(runManifest.viewport?.width),
      height: Number(runManifest.viewport?.height),
      zoom: Number(runManifest.viewport?.zoom ?? 1),
    },
    browser: {
      innerWidth: Number(visualManifest.viewport?.width),
      innerHeight: Number(visualManifest.viewport?.height),
      devicePixelRatio: Number(visualManifest.viewport?.devicePixelRatio),
      zoom: Number(visualManifest.viewport?.zoom),
    },
    artifacts: {
      visualManifest: { path: resolvedVisualManifestPath, sha256: digestFile(resolvedVisualManifestPath) },
      screenshot: { path: resolvedScreenshotPath, sha256: digestFile(resolvedScreenshotPath), width: screenshot.width, height: screenshot.height, format: "png" },
    },
    createdAt: new Date().toISOString(),
  };
  const report = validateCaptureBundle({ runManifest, visualManifest, bundle, bundlePath: resolvedBundlePath });
  if (!report.ok) throw new Error(`Capture bundle validation failed: ${report.failures.join("; ")}`);
  fs.mkdirSync(path.dirname(resolvedBundlePath), { recursive: true });
  const temporary = `${resolvedBundlePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(bundle, null, 2)}\n`);
    fs.renameSync(temporary, resolvedBundlePath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return { ok: true, runId: runManifest.runId, bundle: resolvedBundlePath, screenshot: bundle.artifacts.screenshot, visualManifest: bundle.artifacts.visualManifest };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const usage = "Usage: pixso-capture-bundle.mjs --run-manifest <json> [--visual-manifest <json>] [--html-screenshot <png>] [--verify]";
  if (args.help || !args["run-manifest"]) {
    if (!args.help) console.error(usage);
    process.exit(args.help ? 0 : 2);
  }
  if (args.verify) {
    const runManifest = readJson(args["run-manifest"]);
    const report = validateCaptureBundle({ runManifest, bundlePath: runManifest.artifacts?.captureBundle });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exit(1);
  } else {
    const result = commitCaptureBundle({
      runManifestPath: args["run-manifest"],
      visualManifestPath: args["visual-manifest"],
      screenshotPath: args["html-screenshot"],
    });
    console.log(JSON.stringify(result, null, 2));
  }
}
