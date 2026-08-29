import { readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";

export interface CodeFinding {
  file: string;
  line: number;
  severity: "high" | "medium";
  issue: string;
  snippet: string;
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

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
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
  const files = await walk(rootPath);
  const findings: CodeFinding[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf-8");
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
          snippet: line.trim(),
        });
      }
    });
  }
  return findings;
}
