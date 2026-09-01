#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pkg from "../package.json" with { type: "json" };
import { redactText } from "./redact.js";
import { scanDirectory } from "./scanCode.js";

const server = new McpServer({ name: "phi-guard", version: pkg.version });

server.tool(
  "redact_suggest",
  "Given a raw text snippet (a log line, a prompt, an error message), detect PHI-shaped values and return a redacted version.",
  {
    text: z.string().describe("Raw text that may contain PHI"),
    includeMatchedValues: z
      .boolean()
      .optional()
      .describe(
        "Echo the raw matched PHI values and the original text back in the result. Off by default: the result flows into the calling model's context."
      ),
  },
  async ({ text, includeMatchedValues }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(redactText(text, includeMatchedValues ?? false), null, 2),
      },
    ],
  })
);

server.tool(
  "scan_code",
  "Scan a local directory of source files for sensitive identifiers (patient, diagnosis, dob, ssn, mrn) flowing into risky sinks (LLM calls, logging, analytics) before they ship.",
  { path: z.string().describe("Absolute path to the directory or repo to scan") },
  async ({ path }) => ({
    content: [{ type: "text", text: JSON.stringify(await scanDirectory(path), null, 2) }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
