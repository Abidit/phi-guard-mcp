import { readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";

export interface CodeFinding {
  file: string;
  line: number;
  severity: "high" | "medium";
  issue: string;
  snippet: string;
}

const SENSITIVE_IDENTIFIERS =
  /\b(patient|diagnosis|dob|ssn|mrn|birthdate|medicalrecord)\b/i;
const RISKY_SINKS =
  /\b(openai|anthropic|bedrock|console\.(log|error|warn)|logger\.|winston|pino|\.track\(|capture)/i;
const SCAN_EXTENSIONS = new Set([".ts", ".js", ".tsx", ".jsx", ".py", ".go"]);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
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
