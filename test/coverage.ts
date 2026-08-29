import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

interface CodeFinding {
  file: string;
  line: number;
  severity: string;
  issue: string;
  snippet: string;
}

interface PhiMatch {
  type: string;
  value: string;
  confidence: number;
}

interface RedactResult {
  original: string;
  redacted: string;
  detected: PhiMatch[];
}

const SCANNABLE = new Set([".ts", ".js", ".tsx", ".jsx", ".py", ".go"]);

const POSITIVE = "test/fixtures/positive";
const NEGATIVE = "test/fixtures/negative";
const KNOWN_LIMITS = "test/fixtures/known-limitations";

const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"] });
const client = new Client({ name: "coverage-test", version: "0.0.1" });
await client.connect(transport);

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ text?: unknown }> }).content;
  const first = content?.[0]?.text;
  if (typeof first !== "string") throw new Error("unexpected tool result shape");
  return first;
}

async function scan(path: string): Promise<CodeFinding[]> {
  return JSON.parse(textOf(await client.callTool({ name: "scan_code", arguments: { path } })));
}

async function redact(text: string): Promise<RedactResult> {
  return JSON.parse(textOf(await client.callTool({ name: "redact_suggest", arguments: { text } })));
}

async function scannableFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && SCANNABLE.has(extname(e.name)))
    .map((e) => join(dir, e.name))
    .sort();
}

let failures = 0;

// --- Part 1: every positive fixture must produce at least one finding ---
console.log("=".repeat(64));
console.log("POSITIVE FIXTURES  (each file must produce >= 1 finding)");
console.log("=".repeat(64));

const positiveFiles = await scannableFiles(POSITIVE);
const positiveFindings = await scan(POSITIVE);
const byFile = new Map<string, CodeFinding[]>();
for (const f of positiveFindings) {
  byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
}

const missedPositives: string[] = [];
for (const file of positiveFiles) {
  const hits = byFile.get(file) ?? [];
  if (hits.length === 0) {
    missedPositives.push(file);
    failures++;
    console.log(`  FAIL  ${file}  -> 0 findings (MISS)`);
  } else {
    console.log(`  PASS  ${file}  -> ${hits.length} finding(s), line ${hits.map((h) => h.line).join(", ")}`);
    for (const h of hits) console.log(`          L${h.line}: ${h.snippet.slice(0, 96)}`);
  }
}
console.log(`\n  Detection rate: ${positiveFiles.length - missedPositives.length}/${positiveFiles.length}`);

// --- Part 2: negative fixtures must produce exactly zero findings ---
console.log("\n" + "=".repeat(64));
console.log("NEGATIVE FIXTURES  (total findings must be exactly 0)");
console.log("=".repeat(64));

const negativeFiles = await scannableFiles(NEGATIVE);
const negativeFindings = await scan(NEGATIVE);

if (negativeFindings.length === 0) {
  console.log(`  PASS  0 false positives across ${negativeFiles.length} clean file(s)`);
  for (const file of negativeFiles) console.log(`          clean: ${file}`);
} else {
  failures++;
  console.log(`  FAIL  ${negativeFindings.length} false positive(s) across ${negativeFiles.length} clean file(s):`);
  for (const f of negativeFindings) {
    console.log(`          ${f.file}:${f.line}  ${f.snippet.slice(0, 96)}`);
  }
}

// --- Part 3: known limitations, informational only ---
console.log("\n" + "=".repeat(64));
console.log("KNOWN LIMITATIONS  (informational, no pass/fail assertion)");
console.log("=".repeat(64));

const limitFiles = await scannableFiles(KNOWN_LIMITS);
const limitFindings = await scan(KNOWN_LIMITS);
console.log(`  ${limitFindings.length} finding(s) across ${limitFiles.length} file(s) (expected 0)`);
for (const file of limitFiles) console.log(`          ${file}`);
for (const f of limitFindings) console.log(`          UNEXPECTED ${f.file}:${f.line}  ${f.snippet.slice(0, 96)}`);
console.log("  Cross-line dataflow is out of scope for the line-based scanner by design.");

// --- Part 4: redact_suggest breadth ---
console.log("\n" + "=".repeat(64));
console.log("REDACT_SUGGEST  (informational)");
console.log("=".repeat(64));

const kitchenSink =
  "Patient John Doe (MRN-12345), DOB: 01/01/1980, SSN 123-45-6789, phone 555-123-4567, email jdoe@example.com";
const sinkResult = await redact(kitchenSink);
const typesFound = [...new Set(sinkResult.detected.map((d) => d.type))].sort();
console.log(`  kitchen sink -> ${sinkResult.detected.length} match(es), types: ${typesFound.join(", ")}`);
console.log(`    redacted: ${sinkResult.redacted}`);
for (const d of sinkResult.detected) {
  console.log(`      ${d.type.padEnd(6)} conf ${d.confidence}  "${d.value}"`);
}

const twoNames = "Patient John Doe was referred by Patient Jane Roe last Tuesday.";
const namesResult = await redact(twoNames);
const nameMatches = namesResult.detected.filter((d) => d.type === "name");
console.log(`\n  two names -> ${nameMatches.length} name match(es): ${nameMatches.map((n) => `"${n.value}"`).join(", ")}`);
console.log(`    redacted: ${namesResult.redacted}`);

// --- Summary ---
console.log("\n" + "=".repeat(64));
console.log(
  failures === 0
    ? "RESULT: all assertions passed"
    : `RESULT: ${failures} assertion group(s) failed`
);
console.log("=".repeat(64));

await client.close();
if (failures > 0) process.exitCode = 1;
