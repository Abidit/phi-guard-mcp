import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { redactPhi } from "./redact.js";

export interface CodeFinding {
  file: string;
  line: number;
  /** Only "high" is emitted today. The scanner has one rule, so it has one
   *  severity; a tier is not invented until a second rule earns it. */
  severity: "high";
  issue: string;
  /** The offending line with any literal PHI masked. Identifier names survive
   *  (that is the useful part); literal values do not. */
  snippet: string;
}

/** Thrown when a scan cannot be completed. A scan either covers every file
 *  under the root or it fails — it never returns silently partial results,
 *  because a short list of findings reads as "clean". */
export class ScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanError";
  }
}

// Only letters block a match, so snake_case and digits are boundaries
// ("patient_name" hits) while "outpatient"/"inpatient" do not.
const SENSITIVE_IDENTIFIERS =
  /(?<![a-zA-Z])(patient|diagnosis|dob|ssn|mrn|birthdate|medicalrecord)(?![a-zA-Z])/i;
const RISKY_SINKS =
  /\b(openai|anthropic|bedrock|console\.(log|error|warn)|logger\.|winston|pino|\.track\(|capture(Exception|Message)?\()/i;
// Heuristic: skips whole-line // and # comments only. Block comments and
// trailing end-of-line comments are a known v1 limitation.
const COMMENT_LINE = /^\s*(\/\/|#)/;
const SCAN_EXTENSIONS = new Set([".ts", ".js", ".tsx", ".jsx", ".py", ".go"]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "out",
  ".next",
  ".turbo",
]);

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    throw new ScanError(
      `Could not read directory "${dir}", so the scan is incomplete and was aborted. ` +
        `Fix the permission or path and re-run. (${reason(error)})`
    );
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (SCAN_EXTENSIONS.has(extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

export async function scanDirectory(rootPath: string): Promise<CodeFinding[]> {
  let rootStat;
  try {
    rootStat = await stat(rootPath);
  } catch (error) {
    throw new ScanError(
      `No such path: "${rootPath}". Pass an absolute path to a directory that ` +
        `exists on the machine running this server. (${reason(error)})`
    );
  }
  if (!rootStat.isDirectory()) {
    throw new ScanError(
      `"${rootPath}" is a file, not a directory. scan_code walks a directory tree; ` +
        `pass the directory that contains the file.`
    );
  }

  const files = await walk(rootPath);
  const findings: CodeFinding[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, "utf-8");
    } catch (error) {
      throw new ScanError(
        `Could not read "${file}", so the scan is incomplete and was aborted. ` +
          `Fix the permission or path and re-run. (${reason(error)})`
      );
    }
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      if (COMMENT_LINE.test(line)) return;
      if (SENSITIVE_IDENTIFIERS.test(line) && RISKY_SINKS.test(line)) {
        findings.push({
          file,
          line: i + 1,
          severity: "high",
          issue:
            "Sensitive-looking identifier passed to a risky sink (LLM call, logger, or analytics)",
          snippet: redactPhi(line.trim()),
        });
      }
    });
  }
  return findings;
}
