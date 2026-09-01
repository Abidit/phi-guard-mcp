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
  "redacted": "Patient [NAME] ([MRN]), [DOB]",
  "detected": [
    { "type": "mrn",  "confidence": 0.9,  "start": 18, "end": 27 },
    { "type": "dob",  "confidence": 0.85, "start": 30, "end": 45 },
    { "type": "name", "confidence": 0.8,  "start": 8,  "end": 16 }
  ]
}
```

The matched values are **not** echoed back by default, and neither is the
unredacted `original`. A tool result flows straight into the context of
whatever model called it, so repeating the raw PHI there would undo the point
of the tool. `start`/`end` are offsets into the original text, which is enough
to locate a match without restating it.

Pass `includeMatchedValues: true` when you genuinely need the raw values (a
local CLI, a test harness) and `detected[].value` plus `original` come back:

```json
{ "text": "Patient John Doe (MRN-12345)", "includeMatchedValues": true }
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
`console.log/error/warn`, `logger.`, `winston`, `pino`, `.track(`, and
`capture(` / `captureException(` / `captureMessage(`).

Whole-line `//` and `#` comments are skipped, so a file that discusses PHI
handling in prose doesn't trip the scanner on its own documentation.

Given the operative lines of
[`test/fixtures/leaky-example.ts`](test/fixtures/leaky-example.ts):

```ts
const prompt = await openai.responses.create({ input: `Patient: ${patient.name}, diagnosis: ${patient.diagnosis}` });
console.log("Sending patient prompt to LLM:", prompt);
```

**Input**

```json
{ "path": "/abs/path/to/repo/test/fixtures" }
```

**Output** — excerpt. The full fixtures directory returns 8 findings, because
it also holds the positive fixtures described under
[Tested against](#tested-against).

```json
[
  {
    "file": "test/fixtures/leaky-example.ts",
    "line": 7,
    "severity": "high",
    "issue": "Sensitive-looking identifier passed to a risky sink (LLM call, logger, or analytics)",
    "snippet": "const prompt = await openai.responses.create({ input: `Patient: ${patient.name}, diagnosis: ${patient.diagnosis}` });"
  },
  {
    "file": "test/fixtures/leaky-example.ts",
    "line": 8,
    "severity": "high",
    "issue": "Sensitive-looking identifier passed to a risky sink (LLM call, logger, or analytics)",
    "snippet": "console.log(\"Sending patient prompt to LLM:\", prompt);"
  }
]
```

Scans `.ts`, `.js`, `.tsx`, `.jsx`, `.py`, `.go`. Skips `node_modules`, `dist`,
`build`, `coverage`, `out`, `.next`, `.turbo`, and dotfiles.

`snippet` is the offending line with any literal PHI masked, for the same
reason `redact_suggest` withholds matched values: the finding is going into a
model's context. Identifier names like `patient.diagnosis` are not literal
values, match no PHI pattern, and stay visible — they are the actionable part.

Both conditions must hold **on the same line**. That is what keeps it quiet: on
this repo's own source — which is dense with the words `patient`, `diagnosis`,
`mrn`, and `ssn` inside its pattern definitions — it reports zero findings.

## Tested against

**7 out of 7 real leak patterns detected**, across 5 different sinks (OpenAI,
Anthropic, Sentry, Winston, PostHog/analytics) and 2 languages (TypeScript,
Python) — including snake_case identifiers (`patient_name`,
`patient_diagnosis`), which a naive word-boundary regex misses and which is the
dominant naming convention in Python and Go, and a hardcoded-literal fixture
that verifies `scan_code` masks literal PHI out of the `snippet` it returns.

**0 false positives across 5 clean-code fixtures**, including code that
discusses PHI policy in comments and prose without ever leaking it, and code
that legitimately handles patient records without sending them anywhere risky.

**1 documented limitation:** detection is line-based, so a sensitive value
assigned on one line and used in a risky call several lines later isn't
currently caught. This is a known scope boundary, not a bug — see
[What this is NOT](#what-this-is-not) below.

Full test fixtures live in [`test/fixtures/`](test/fixtures/) if you want to
verify any of this yourself rather than take it on faith:

```bash
npm test
```

The suite asserts both directions: every file under `positive/` must produce at
least one finding, and `negative/` must produce exactly zero. A miss on either
side fails the run.

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
  will not catch PHI in a variable it can't name-match, or values arriving from
  an external call.
- **Not able to follow a value across lines.** The identifier and the sink have
  to appear on the same line. Assigning `patient.diagnosis` to a local variable
  and logging that variable three lines later produces no finding — there is a
  worked example in
  [`test/fixtures/known-limitations/`](test/fixtures/known-limitations/). Real
  dataflow analysis is out of scope for v1; this is a deliberate boundary, and
  the fixture exists so the gap stays visible rather than forgotten.
- **Not fully comment-aware.** Only whole-line `//` and `#` comments are
  skipped. Block comments (`/* ... */`) and trailing end-of-line comments are
  still scanned, so a sink keyword sitting inside one of those can produce a
  finding even though nothing executes.

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
npm test          # fixture suite: positive, negative, known limitations
npm run typecheck # src/ and test/ under strict mode
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

## Mcp Server Approved
[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/abidit/phi-guard-mcp)
