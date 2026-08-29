# phi-guard-mcp

A local-first [MCP](https://modelcontextprotocol.io) server that catches PHI
(protected health information) flowing into LLM prompts, log statements, and
analytics calls — in your source code, before it ships.

It runs entirely on your machine over stdio. No code, no snippets, and no
detected values are ever sent anywhere.

## Why

The risky moment in a healthcare codebase is rarely the database. It's the line
where a patient record gets interpolated into a prompt, a `console.log`, or an
analytics event. Those lines look harmless in review and never show up in
infrastructure scanning, because nothing is misconfigured — the code is just
doing what it says.

## Tools

### `redact_suggest`

Takes a raw text snippet — a log line, a prompt, an error message — detects
PHI-shaped values, and returns a redacted version alongside what it found.

**Input**

```json
{ "text": "Patient John Doe (MRN-12345), DOB: 01/01/1980" }
```

**Output**

```json
{
  "original": "Patient John Doe (MRN-12345), DOB: 01/01/1980",
  "redacted": "Patient [NAME] ([MRN]), [DOB]",
  "detected": [
    { "type": "mrn",  "value": "MRN-12345",       "confidence": 0.9  },
    { "type": "dob",  "value": "DOB: 01/01/1980", "confidence": 0.85 },
    { "type": "name", "value": "John Doe",        "confidence": 0.8  }
  ]
}
```

Patterns and their confidence scores:

| Type    | Confidence | Matches |
| ------- | ---------- | ------- |
| `ssn`   | 0.95 | `123-45-6789` |
| `mrn`   | 0.90 | `MRN-12345`, `MRN: 12345` |
| `dob`   | 0.85 | `DOB: 01/01/1980`, `born 3/14/75` |
| `name`  | 0.80 | `Patient John Doe` (captures `John Doe`) |
| `phone` | 0.75 | `555-867-5309`, `(555) 867 5309` |
| `email` | 0.70 | `jane.roe@example.com` |

The patterns start deliberately narrow. A false positive that trains someone to
ignore the tool is worse than a missed match.

### `scan_code`

Walks a directory and flags lines where a sensitive-looking identifier
(`patient`, `diagnosis`, `dob`, `ssn`, `mrn`, `birthdate`, `medicalrecord`)
appears on the same line as a risky sink (`openai`, `anthropic`, `bedrock`,
`console.log/error/warn`, `logger.`, `winston`, `pino`, `.track(`, `capture`).

Given [`test/fixtures/leaky-example.ts`](test/fixtures/leaky-example.ts):

```ts
const prompt = await openai.responses.create({ input: `Patient: ${patient.name}, diagnosis: ${patient.diagnosis}` });
console.log("Sending patient prompt to LLM:", prompt);
```

**Input**

```json
{ "path": "/abs/path/to/repo/test/fixtures" }
```

**Output**

```json
[
  {
    "file": "test/fixtures/leaky-example.ts",
    "line": 1,
    "severity": "high",
    "issue": "Sensitive-looking identifier passed to a risky sink (LLM call, logger, or analytics)",
    "snippet": "const prompt = await openai.responses.create({ input: `Patient: ${patient.name}, diagnosis: ${patient.diagnosis}` });"
  },
  {
    "file": "test/fixtures/leaky-example.ts",
    "line": 2,
    "severity": "high",
    "issue": "Sensitive-looking identifier passed to a risky sink (LLM call, logger, or analytics)",
    "snippet": "console.log(\"Sending patient prompt to LLM:\", prompt);"
  }
]
```

Scans `.ts`, `.js`, `.tsx`, `.jsx`, `.py`, `.go`. Skips `node_modules`, `dist`,
`build`, `coverage`, `out`, `.next`, `.turbo`, and dotfiles.

Both conditions must hold **on the same line**. That is what keeps it quiet: on
this repo's own source — which is dense with the words `patient`, `diagnosis`,
`mrn`, and `ssn` inside its pattern definitions — it reports zero findings.

## What this is NOT

- **Not a hosted service.** It is a local stdio process. There is no backend, no
  account, and no telemetry. Your code never leaves your machine.
- **Not a HIPAA certification, audit, or compliance attestation.** Passing a
  `scan_code` run proves nothing to a regulator. It is a linter for a specific
  class of mistake, not evidence of compliance. Treat a clean result as "these
  particular patterns didn't fire", never as "this codebase is HIPAA-safe".
- **Not a competitor to Prowler, AWS Config, or cloud posture tools.** Those
  scan infrastructure and configuration. This reads source code and finds a
  different class of problem. They are complementary; this replaces neither.
- **Not exhaustive.** Regex-based detection has a real false-negative rate. It
  will not catch PHI in a variable it can't name-match, data assembled across
  multiple lines, or values arriving from an external call.

## Setup

Requires Node.js 18+.

```bash
git clone https://github.com/Abidit/phi-guard-mcp.git
cd phi-guard-mcp
npm install
npm run build
```

`dist/` is gitignored, so `npm run build` is required after cloning — the MCP
config below points at the compiled output.

### Claude Code

Add `.mcp.json` to your project root, using the **absolute path** to your clone:

```json
{
  "mcpServers": {
    "phi-guard": {
      "command": "node",
      "args": ["/absolute/path/to/phi-guard-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Code, or run `/mcp` and reconnect `phi-guard`. A rebuild alone
will not reach an already-running stdio process.

### Verifying

```bash
npx tsx test/smoke.ts
```

Or drive it through the official Inspector without a browser:

```bash
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
npx @modelcontextprotocol/inspector --cli node dist/index.js \
  --method tools/call --tool-name redact_suggest \
  --tool-arg text="Patient John Doe (MRN-12345)"
```

The server declares only the `tools` capability, so `resources/list` and
`prompts/list` correctly return `-32601 Method not found`. The Inspector UI
probes all three regardless and shows those two in red — expected, not a fault.

## License

MIT — see [LICENSE](LICENSE).
