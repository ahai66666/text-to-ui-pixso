#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, writeJson } from "./pixso-native-scene-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const usage = "Usage: compare-pixso-screenshots.mjs --reference <html.png> --actual <pixso.png> --out <visual-diff.json> [--run-manifest <json>] [--pixel-threshold 20] [--max-different-ratio 0.005]";
if (args.help || !args.reference || !args.actual || !args.out) {
  if (!args.help) console.error(usage);
  process.exit(args.help ? 0 : 2);
}

const referencePath = path.resolve(args.reference);
const actualPath = path.resolve(args.actual);
const outputPath = path.resolve(args.out);
const pixelThreshold = Number(args["pixel-threshold"] ?? 20);
const maxDifferentRatio = Number(args["max-different-ratio"] ?? 0.005);
if (!fs.existsSync(referencePath) || !fs.existsSync(actualPath)) throw new Error("Both reference and actual screenshots must exist");
if (!Number.isFinite(pixelThreshold) || pixelThreshold < 0 || pixelThreshold > 255) throw new Error("--pixel-threshold must be between 0 and 255");
if (!Number.isFinite(maxDifferentRatio) || maxDifferentRatio < 0 || maxDifferentRatio > 1) throw new Error("--max-different-ratio must be between 0 and 1");

const manifestPath = args["run-manifest"] ? path.resolve(args["run-manifest"]) : null;
const scripts = path.dirname(fileURLToPath(import.meta.url));
function update(status, detail, metrics = null) {
  if (!manifestPath) return;
  const updateArgs = [path.join(scripts, "update-pixso-import-run.mjs"), "--manifest", manifestPath, "--stage", "diff", "--status", status, "--detail", detail];
  if (metrics) updateArgs.push("--metrics", JSON.stringify(metrics));
  const result = spawnSync(process.execPath, updateArgs, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Unable to update diff stage");
}

function convertToBmp(source, destination) {
  const result = spawnSync("/usr/bin/sips", ["-s", "format", "bmp", source, "--out", destination], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Unable to decode screenshot with sips: ${result.stderr || result.stdout}`);
}

function readBmp(file) {
  const data = fs.readFileSync(file);
  if (data.toString("ascii", 0, 2) !== "BM") throw new Error(`Unsupported bitmap: ${file}`);
  const pixelOffset = data.readUInt32LE(10);
  const width = data.readInt32LE(18);
  const signedHeight = data.readInt32LE(22);
  const bitsPerPixel = data.readUInt16LE(28);
  const compression = data.readUInt32LE(30);
  const supported = (bitsPerPixel === 24 && compression === 0) || (bitsPerPixel === 32 && [0, 3].includes(compression));
  if (width <= 0 || signedHeight === 0 || !supported) throw new Error(`Expected 24-bit RGB or 32-bit RGBA BMP, received ${width}x${signedHeight} ${bitsPerPixel}bpp compression=${compression}`);
  const height = Math.abs(signedHeight);
  const topDown = signedHeight < 0;
  const bytesPerPixel = bitsPerPixel / 8;
  const rowStride = Math.ceil((width * bytesPerPixel) / 4) * 4;
  return { data, pixelOffset, width, height, topDown, rowStride, bytesPerPixel };
}

function channelAt(bitmap, x, y, channel) {
  const sourceY = bitmap.topDown ? y : bitmap.height - y - 1;
  const offset = bitmap.pixelOffset + sourceY * bitmap.rowStride + x * bitmap.bytesPerPixel;
  const source = bitmap.data[offset + (channel === 0 ? 2 : channel === 1 ? 1 : 0)];
  if (bitmap.bytesPerPixel !== 4) return source;
  const alpha = bitmap.data[offset + 3] / 255;
  return Math.round(source * alpha + 255 * (1 - alpha));
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "text-to-ui-pixel-diff-"));
const startedAt = Date.now();
let report;
try {
  update("start", "compare current Pixso screenshot with the current HTML reference using a real pixel gate");
  const referenceBmp = path.join(temporary, "reference.bmp");
  const actualBmp = path.join(temporary, "actual.bmp");
  convertToBmp(referencePath, referenceBmp);
  convertToBmp(actualPath, actualBmp);
  const reference = readBmp(referenceBmp);
  const actual = readBmp(actualBmp);
  const sameDimensions = reference.width === actual.width && reference.height === actual.height;
  let absoluteError = 0;
  let squaredError = 0;
  let differentPixels = 0;
  const pixelCount = sameDimensions ? reference.width * reference.height : 0;
  if (sameDimensions) {
    for (let y = 0; y < reference.height; y += 1) {
      for (let x = 0; x < reference.width; x += 1) {
        let maxChannelDifference = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          const difference = Math.abs(channelAt(reference, x, y, channel) - channelAt(actual, x, y, channel));
          absoluteError += difference;
          squaredError += difference * difference;
          if (difference > maxChannelDifference) maxChannelDifference = difference;
        }
        if (maxChannelDifference > pixelThreshold) differentPixels += 1;
      }
    }
  }
  const differentRatio = pixelCount ? differentPixels / pixelCount : 1;
  const channelCount = pixelCount * 3;
  const metrics = {
    actualWorkMs: Date.now() - startedAt,
    width: reference.width,
    height: reference.height,
    actualWidth: actual.width,
    actualHeight: actual.height,
    pixelThreshold,
    maxDifferentRatio,
    differentPixels,
    differentRatio,
    mae: channelCount ? absoluteError / channelCount : null,
    rmse: channelCount ? Math.sqrt(squaredError / channelCount) : null,
  };
  report = {
    schemaVersion: 1,
    kind: "text-to-ui-pixso-visual-diff",
    ok: sameDimensions && differentRatio <= maxDifferentRatio,
    source: "pixel-comparison",
    reference: referencePath,
    actual: actualPath,
    sameDimensions,
    metrics,
    failures: [
      ...(!sameDimensions ? [`screenshot dimensions differ: ${reference.width}x${reference.height} vs ${actual.width}x${actual.height}`] : []),
      ...(sameDimensions && differentRatio > maxDifferentRatio ? [`different pixel ratio ${(differentRatio * 100).toFixed(3)}% exceeds ${(maxDifferentRatio * 100).toFixed(3)}%`] : []),
    ],
  };
  writeJson(outputPath, report);
  update(report.ok ? "passed" : "failed", report.ok ? "real pixel parity gate passed" : report.failures.join("; "), metrics);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
