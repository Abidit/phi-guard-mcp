import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFile, readdir } from "node:fs/promises";
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
  confidence: number;
  start: number;
  end: number;
  value?: string;
}

interface RedactResult {
  redacted: string;
  detected: PhiMatch[];
  original?: string;
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

async function redact(text: string, includeMatchedValues = false): Promise<RedactResult> {
  return JSON.parse(
    textOf(
      await client.callTool({
        name: "redact_suggest",
        arguments: { text, includeMatchedValues },
      })
    )
  );
}

// Same call, but keep the raw transport JSON so a test can assert on every
// byte the tool actually hands back, not just on the parsed shape.
async function rawToolJson(name: string, args: Record<string, unknown>): Promise<string> {
  return textOf(await client.callTool({ name, arguments: args }));
}

let failures = 0;

function assert(ok: boolean, label: string, detail = ""): void {
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
}

async function scannableFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && SCANNABLE.has(extname(e.name)))
    .map((e) => join(dir, e.name))
    .sort();
}

// --- Part 1: every positive fixture must produce at least one finding ---
console.log("=".repeat(64));
console.log("REPRESENTATIVE LEAK FIXTURES  (each file must produce >= 1 finding)");
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
console.log(
  `\n  Detected ${positiveFiles.length - missedPositives.length} of ${positiveFiles.length} representative leak fixtures.`
);

// --- Part 2: negative fixtures must produce exactly zero findings ---
console.log("\n" + "=".repeat(64));
console.log("CLEAN FIXTURES  (total findings must be exactly 0)");
console.log("=".repeat(64));

const negativeFiles = await scannableFiles(NEGATIVE);
const negativeFindings = await scan(NEGATIVE);

if (negativeFindings.length === 0) {
  console.log(`  PASS  flagged none of ${negativeFiles.length} clean fixtures`);
  for (const file of negativeFiles) console.log(`          clean: ${file}`);
} else {
  failures++;
  console.log(
    `  FAIL  flagged ${negativeFindings.length} line(s) across ${negativeFiles.length} clean fixtures:`
  );
  for (const f of negativeFindings) {
    console.log(`          ${f.file}:${f.line}  ${f.snippet.slice(0, 96)}`);
  }
}

// --- Part 3: the fixture the README uses as its worked example ---
// It lives at the fixtures root rather than under positive/, so nothing above
// covers it. Assert it here so the README's example cannot drift from reality.
console.log("\n" + "=".repeat(64));
console.log("README WORKED EXAMPLE  (test/fixtures/leaky-example.ts)");
console.log("=".repeat(64));

const WORKED_EXAMPLE = "test/fixtures/leaky-example.ts";
const workedFindings = (await scan("test/fixtures")).filter((f) => f.file === WORKED_EXAMPLE);
assert(
  workedFindings.length === 2,
  `${WORKED_EXAMPLE} produces exactly 2 findings`,
  `got ${workedFindings.length}`
);
assert(
  workedFindings.map((f) => f.line).join(",") === "7,8",
  "the two findings are on lines 7 and 8",
  workedFindings.map((f) => f.line).join(",")
);
for (const f of workedFindings) console.log(`          L${f.line}: ${f.snippet}`);

// --- Part 4: known limitations, informational only ---
console.log("\n" + "=".repeat(64));
console.log("KNOWN LIMITATIONS  (informational, no pass/fail assertion)");
console.log("=".repeat(64));

const limitFiles = await scannableFiles(KNOWN_LIMITS);
const limitFindings = await scan(KNOWN_LIMITS);
console.log(`  ${limitFindings.length} finding(s) across ${limitFiles.length} file(s) (expected 0)`);
for (const file of limitFiles) console.log(`          ${file}`);
for (const f of limitFindings) console.log(`          UNEXPECTED ${f.file}:${f.line}  ${f.snippet.slice(0, 96)}`);
console.log("  Cross-line dataflow is out of scope for the line-based scanner by design.");

// --- Part 5: redact_suggest breadth ---
console.log("\n" + "=".repeat(64));
console.log("REDACT_SUGGEST  (informational)");
console.log("=".repeat(64));

const kitchenSink =
  "Patient John Doe (MRN-12345), DOB: 01/01/1980, SSN 123-45-6789, phone 555-123-4567, email jdoe@example.com";
const sinkResult = await redact(kitchenSink, true);
const typesFound = [...new Set(sinkResult.detected.map((d) => d.type))].sort();
console.log(`  kitchen sink -> ${sinkResult.detected.length} match(es), types: ${typesFound.join(", ")}`);
console.log(`    redacted: ${sinkResult.redacted}`);
for (const d of sinkResult.detected) {
  console.log(`      ${d.type.padEnd(6)} conf ${d.confidence}  "${d.value}"`);
}

const twoNames = "Patient John Doe was referred by Patient Jane Roe last Tuesday.";
const namesResult = await redact(twoNames, true);
const nameMatches = namesResult.detected.filter((d) => d.type === "name");
console.log(`\n  two names -> ${nameMatches.length} name match(es): ${nameMatches.map((n) => `"${n.value}"`).join(", ")}`);
console.log(`    redacted: ${namesResult.redacted}`);

// --- Part 6: tool results must not carry PHI back into the caller's context ---
console.log("\n" + "=".repeat(64));
console.log("PHI LEAK REGRESSION  (results must not contain raw PHI by default)");
console.log("=".repeat(64));

// Literals live in test/fixtures/positive/literal-phi-in-log.ts. All fabricated.
const LITERAL_FIXTURE = join(POSITIVE, "literal-phi-in-log.ts");
const LITERAL_PHI = ["John Doe", "01/01/1980", "MRN-4471902", "123-45-6789"];

const scanJson = await rawToolJson("scan_code", { path: POSITIVE });
const leakedInScan = LITERAL_PHI.filter((v) => scanJson.includes(v));
assert(
  leakedInScan.length === 0,
  "scan_code result contains no raw literal PHI anywhere in its JSON",
  `leaked: ${leakedInScan.join(", ")}`
);

const literalFinding = (JSON.parse(scanJson) as CodeFinding[]).find(
  (f) => f.file === LITERAL_FIXTURE
);
assert(!!literalFinding, `${LITERAL_FIXTURE} still produces a finding`);
if (literalFinding) {
  console.log(`          snippet: ${literalFinding.snippet}`);
  assert(
    ["[NAME]", "[DOB]", "[MRN]", "[SSN]"].every((tag) => literalFinding.snippet.includes(tag)),
    "snippet masks name/dob/mrn/ssn with placeholders",
    literalFinding.snippet
  );
  assert(
    literalFinding.snippet.includes("logger.info") && literalFinding.snippet.includes("Patient:"),
    "snippet keeps the non-PHI context that makes the finding actionable"
  );
}

// A fixture whose PHI is only in identifier names must come back byte-identical.
const identifierOnly = (JSON.parse(scanJson) as CodeFinding[]).find(
  (f) => f.file === join(POSITIVE, "winston-logger-leak.ts")
);
if (identifierOnly) {
  const sourceLine = (await readFile(identifierOnly.file, "utf-8")).split("\n")[
    identifierOnly.line - 1
  ];
  assert(
    identifierOnly.snippet === sourceLine.trim(),
    "identifier-only fixture snippet is unchanged",
    `${identifierOnly.snippet} !== ${sourceLine.trim()}`
  );
}

// redact_suggest, default params: no raw matched substring may survive.
const leakProbe =
  "Patient Jane Roe, SSN 123-45-6789, phone 555-123-4567, jroe@example.com, MRN-9981234, DOB: 02/03/1975";
const RAW_SUBSTRINGS = [
  "Jane Roe",
  "123-45-6789",
  "555-123-4567",
  "jroe@example.com",
  "MRN-9981234",
  "02/03/1975",
];

const defaultJson = await rawToolJson("redact_suggest", { text: leakProbe });
const leakedInRedact = RAW_SUBSTRINGS.filter((v) => defaultJson.includes(v));
console.log(`          default result: ${defaultJson.replace(/\s+/g, " ")}`);
assert(
  leakedInRedact.length === 0,
  "redact_suggest (default) result contains none of the raw matched substrings",
  `leaked: ${leakedInRedact.join(", ")}`
);

const defaultResult = JSON.parse(defaultJson) as RedactResult;
assert(
  defaultResult.detected.length > 0 &&
    defaultResult.detected.every((d) => d.value === undefined),
  `all ${defaultResult.detected.length} detected match(es) omit value by default`
);
assert(
  defaultResult.detected.every(
    (d) => Number.isInteger(d.start) && Number.isInteger(d.end) && d.end > d.start
  ),
  "detected matches still carry usable start/end positions"
);
assert(defaultResult.original === undefined, "default result omits the unredacted original");
assert(
  ["[NAME]", "[SSN]", "[PHONE]", "[EMAIL]", "[MRN]", "[DOB]"].every((t) =>
    defaultResult.redacted.includes(t)
  ),
  "redacted string still shows every type as a masked placeholder",
  defaultResult.redacted
);

// The opt-in must actually work, not just be assumed to.
const optInResult = await redact(leakProbe, true);
const optInValues = optInResult.detected.map((d) => d.value);
// dob has no capture group, so its value carries the keyword ("DOB: 02/03/1975").
// Containment is the right check: the raw PHI comes back, keyword or not.
assert(
  RAW_SUBSTRINGS.every((v) => optInValues.some((val) => val?.includes(v))),
  "includeMatchedValues: true returns every raw matched value",
  `got: ${optInValues.join(", ")}`
);
assert(optInResult.original === leakProbe, "includeMatchedValues: true returns the original text");

// --- Part 7: error behaviour must be explicit, not a raw errno ---
console.log("\n" + "=".repeat(64));
console.log("ERROR BEHAVIOUR  (bad input fails loudly and legibly)");
console.log("=".repeat(64));

async function errorTextOf(args: Record<string, unknown>): Promise<string> {
  const result = (await client.callTool({ name: "scan_code", arguments: args })) as {
    isError?: boolean;
    content?: Array<{ text?: unknown }>;
  };
  if (!result.isError) throw new Error("expected an error result");
  const text = result.content?.[0]?.text;
  return typeof text === "string" ? text : "";
}

const missingPathError = await errorTextOf({ path: "/nonexistent/phi-guard-probe" });
console.log(`          ${missingPathError}`);
assert(
  missingPathError.includes("No such path") &&
    missingPathError.includes("/nonexistent/phi-guard-probe"),
  "a missing path returns a named, actionable error"
);

const notADirError = await errorTextOf({ path: "package.json" });
console.log(`          ${notADirError}`);
assert(
  notADirError.includes("is a file, not a directory"),
  "pointing at a file returns a named, actionable error"
);

// --- Summary ---
console.log("\n" + "=".repeat(64));
if (failures === 0) {
  console.log("RESULT: all assertions passed");
  console.log(
    `Detected all ${positiveFiles.length} representative leak fixtures and ` +
      `flagged none of ${negativeFiles.length} clean fixtures.`
  );
  console.log(
    "This is a fixture suite, not a benchmark: it says nothing about detection\n" +
      "rates on real codebases, and is not a compliance result."
  );
} else {
  console.log(`RESULT: ${failures} assertion group(s) failed`);
}
console.log("=".repeat(64));

await client.close();
if (failures > 0) process.exitCode = 1;
