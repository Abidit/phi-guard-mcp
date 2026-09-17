# phi-guard-mcp

[![npm version](https://img.shields.io/npm/v/phi-guard-mcp.svg)](https://www.npmjs.com/package/phi-guard-mcp)
[![npm downloads](https://img.shields.io/npm/dt/phi-guard-mcp.svg)](https://www.npmjs.com/package/phi-guard-mcp)
[![License: MIT](https://img.shields.io/npm/l/phi-guard-mcp.svg)](./LICENSE)

A local-first [MCP](https://modelcontextprotocol.io) server that catches PHI
(protected health information) flowing into LLM prompts, log statements, and
analytics calls — in your source code, before it ships.

The server itself makes no network calls: it runs as a local stdio process and
never uploads your code. What it returns is a different matter. Findings go
back to whatever MCP client launched it, so if that client is a hosted
assistant, the findings enter that model's context. Matched PHI values are
masked out of results by default for exactly this reason — see
[Security boundary](#security-boundary).

## Why

The risky moment in a healthcare codebase is rarely the database. It's the line
where a patient record gets interpolated into a prompt, a `console.log`, or an
analytics event. Those lines look harmless in review and never show up in
infrastructure scanning, because nothing is misconfigured — the code is just
doing what it says.

## Install

Requires **Node.js 22 or newer**. The entrypoint uses JSON import attributes
(`with { type: "json" }`), so older runtimes will not start it. Verified on
Node 22.18.0, 24.2.0, and 26.8.2; Node 20 and below are unsupported and
untested.

### From npm (recommended)

Nothing to clone or build. Your MCP client runs it on demand:

```bash
npx -y phi-guard-mcp --version
```

### From source

```bash
git clone https://github.com/Abidit/phi-guard-mcp.git
cd phi-guard-mcp
npm ci
```

`npm ci` runs the `prepare` script, which builds `dist/`. There is no separate
build step to forget. `npm install` works too; `npm ci` is the reproducible one
because it installs exactly what `package-lock.json` pins.

## MCP configuration

Copy-paste one of the following. The npm form needs no paths and is the one to
hand to someone else.

### Claude Code

One command, project scope:

```bash
claude mcp add phi-guard -- npx -y phi-guard-mcp
```

Or commit a `.mcp.json` at your project root:

```json
{
  "mcpServers": {
    "phi-guard": {
      "command": "npx",
      "args": ["-y", "phi-guard-mcp"]
    }
  }
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS,
`%APPDATA%\Claude\claude_desktop_config.json` on Windows:

```json
{
  "mcpServers": {
    "phi-guard": {
      "command": "npx",
      "args": ["-y", "phi-guard-mcp"]
    }
  }
}
```

### Cursor

`.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` globally:

```json
{
  "mcpServers": {
    "phi-guard": {
      "command": "npx",
      "args": ["-y", "phi-guard-mcp"]
    }
  }
}
```

### Running a local clone instead of the npm release

Point the client at the build output. Use an **absolute path** unless you are
certain your client launches the server with the project root as its working
directory:

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

The `.mcp.json` committed in this repo uses the relative form (`dist/index.js`)
so the repo can dogfood its own server after `npm ci`.

Whichever form you use: restart the client, or run `/mcp` in Claude Code and
reconnect `phi-guard`. A rebuild alone will not reach an already-running stdio
process.

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

`detected` is ordered by pattern, not by position.

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

That table is the complete list. The patterns start deliberately narrow — a
false positive that trains someone to ignore the tool is worse than a missed
match.

### `scan_code`

Walks a directory and flags lines where a sensitive-looking identifier appears
on the same line as a risky sink.

**Sensitive identifiers** — the complete list:

`patient`, `diagnosis`, `dob`, `ssn`, `mrn`, `birthdate`, `medicalrecord`

Matching is case-insensitive and bounded by non-letters, so `patient_name`
matches while `outpatient` and `inpatient` do not.

**Sink categories** — the complete list:

| Category | Matches |
| -------- | ------- |
| LLM providers | `openai`, `anthropic`, `bedrock` |
| Console | `console.log`, `console.error`, `console.warn` |
| Loggers | `logger.`, `winston`, `pino` |
| Analytics | `.track(` |
| Error reporting | `capture(`, `captureException(`, `captureMessage(` |

**Languages scanned** — the complete list:

| Extension | Language |
| --------- | -------- |
| `.ts`, `.tsx` | TypeScript |
| `.js`, `.jsx` | JavaScript |
| `.py` | Python |
| `.go` | Go |

Detection is purely lexical, so language support means "these file extensions
are read". There is no parser and no type information for any of them.

Skips `node_modules`, `dist`, `build`, `coverage`, `out`, `.next`, `.turbo`,
and any dotfile or dot-directory. Whole-line `//` and `#` comments are skipped,
so a file that discusses PHI handling in prose doesn't trip the scanner on its
own documentation.

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

**Output** — excerpt. That directory returns **9** findings in total: 2 from
this file, and 7 from the positive fixtures described under
[Evaluation](#evaluation).

```json
[
  {
    "file": "/abs/path/to/repo/test/fixtures/leaky-example.ts",
    "line": 7,
    "severity": "high",
    "issue": "Sensitive-looking identifier passed to a risky sink (LLM call, logger, or analytics)",
    "snippet": "const prompt = await openai.responses.create({ input: `Patient: ${patient.name}, diagnosis: ${patient.diagnosis}` });"
  },
  {
    "file": "/abs/path/to/repo/test/fixtures/leaky-example.ts",
    "line": 8,
    "severity": "high",
    "issue": "Sensitive-looking identifier passed to a risky sink (LLM call, logger, or analytics)",
    "snippet": "console.log(\"Sending patient prompt to LLM:\", prompt);"
  }
]
```

`file` is built by joining `path` with the entry name, so it comes back in
whatever form you passed in: absolute in, absolute out. `severity` is always
`"high"` — there is one rule, so there is one severity.

`snippet` is the offending line with any literal PHI masked, for the same
reason `redact_suggest` withholds matched values: the finding is going into a
model's context. Identifier names like `patient.diagnosis` are not literal
values, match no PHI pattern, and stay visible — they are the actionable part.

An empty array means every eligible source file discovered under `path` was
read successfully and no line matched both conditions. "Eligible" and
"discovered" are load-bearing: files with an unsupported extension, and
anything under a skipped or dot-prefixed directory, are never opened.

A scan that cannot read a directory or a file **fails** with a named error
rather than returning a shorter list, because a partial result reads as a
clean result:

```
No such path: "/nope". Pass an absolute path to a directory that exists on the
machine running this server. (ENOENT: no such file or directory, stat '/nope')
```

### The same-line rule

Both conditions must hold **on the same physical line**. This is the single
most important thing to understand about the scanner, in both directions.

It is what keeps it quiet. On this repo's own `src/` — which is dense with the
words `patient`, `diagnosis`, `mrn`, and `ssn` inside its pattern definitions —
it reports zero findings.

It is also the main reason it misses things. This leaks and is **not** flagged:

```ts
const value = patient.diagnosis;   // sensitive identifier, no sink
console.log("audit", value);       // sink, no sensitive identifier
```

There is no dataflow analysis, no variable tracking, and no cross-line
correlation. A worked example lives in
[`test/fixtures/known-limitations/split-across-lines.ts`](test/fixtures/known-limitations/split-across-lines.ts),
and the test suite scans it on every run so the gap stays visible rather than
forgotten.

## Evaluation

```bash
npm run verify
```

One command: typecheck (`src/` and `test/` under strict mode), build, then the
fixture suite against the real server over stdio.

The current result:

> **Detected all 7 representative leak fixtures and flagged none of 5 clean
> fixtures.**

Those fixtures are all in [`test/fixtures/`](test/fixtures/), so you can read
them rather than take this on faith.

The 7 leak fixtures cover 5 sink categories (OpenAI, Anthropic, Sentry,
Winston, analytics) and 2 languages (TypeScript, Python). They include
snake_case identifiers (`patient_name`, `patient_diagnosis`), which a naive
word-boundary regex misses and which is the dominant naming convention in
Python and Go, and a hardcoded-literal fixture that verifies `scan_code` masks
literal PHI out of the `snippet` it returns.

The 5 clean fixtures include code that discusses PHI policy in comments and
prose without ever leaking it, and code that legitimately handles patient
records without sending them anywhere risky.

The suite also asserts:

- the README's worked example still produces exactly 2 findings, on lines 7 and 8
- no raw literal PHI appears anywhere in a `scan_code` result
- `redact_suggest` omits every matched value and the original by default
- `includeMatchedValues: true` actually returns them
- a missing path and a file-instead-of-directory each return a named error

**What this number is not.** It is a fixture suite of 12 hand-written files
that this project wrote to exercise its own rules. It is not a detection rate,
not a benchmark, not a false-positive rate, and not external validation. It
says nothing about how the scanner performs on a real healthcare codebase,
where the false-negative rate is unknown and, given the same-line rule above,
certainly not zero. Measuring that would need a labelled corpus this project
does not have.

Other checks:

```bash
npm test          # fixture suite only
npm run typecheck # src/ and test/ under strict mode
npm run test:smoke  # minimal stdio round-trip
```

Or drive it through the official Inspector without a browser:

```bash
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
npx @modelcontextprotocol/inspector --cli node dist/index.js \
  --method tools/call --tool-name redact_suggest \
  --tool-arg text="Patient John Doe (MRN-12345)"
```

The server declares only the `tools` capability, so at the protocol level
`resources/list` and `prompts/list` return `-32601 Method not found`. The
Inspector CLI normalises those into `{"resources": []}` and `{"prompts": []}`,
and the Inspector UI may show them in red. Both are expected, not a fault.

## Troubleshooting

**The server appears to hang when I run it.** That is correct behaviour. It is
a stdio server: it waits for JSON-RPC on stdin and prints nothing on its own.
Run `npx -y phi-guard-mcp --help` or `node dist/index.js --version` if you just
want to confirm it is installed.

**The client shows `phi-guard` as failed or disconnected.** Run the command
from your config by hand and look at stderr — `npx -y phi-guard-mcp --version`,
or `node /absolute/path/to/dist/index.js --version`. If that prints a version,
the problem is the config path, not the server.

**`Cannot find module '.../dist/index.js'`.** You are running from a clone and
`dist/` has not been built. `dist/` is gitignored on purpose. Run `npm ci`.

**`SyntaxError: Unexpected identifier 'assert'` or an import-attribute error on
startup.** Your Node is older than 22. Check with `node --version`. Note
that your MCP client may launch a different Node than your shell does.

**Code changes don't show up.** An already-running stdio process keeps the old
build. Rebuild, then restart the client or reconnect the server (`/mcp` in
Claude Code).

**`scan_code` returns `[]` on a repo I know has leaks.** Three likely causes,
in order: the identifier and the sink are on different lines (see
[the same-line rule](#the-same-line-rule)); the file extension is not in the
supported list; or the directory is skipped (`dist`, `build`, anything
dot-prefixed). Confirm the scanner is alive by pointing it at this repo's
`test/fixtures` directory, which must return 9 findings.

**`scan_code` errors with `No such path`.** The path is resolved on the machine
running the server, and a relative path is resolved against whatever working
directory your MCP client gave the process. Pass an absolute path.

## What this is NOT

- **Not a hosted service.** It is a local stdio process. There is no backend,
  no account, and no telemetry, and the server makes no network calls of its
  own. That is not the same as "nothing leaves your machine": findings are
  returned to the MCP client, which may be a hosted assistant. See
  [Security boundary](#security-boundary).
- **Not a HIPAA certification, audit, or compliance attestation.** Passing a
  `scan_code` run proves nothing to a regulator. It is a linter for a specific
  class of mistake, not evidence of compliance. Treat a clean result as "these
  particular patterns didn't fire", never as "this codebase is HIPAA-safe".
- **Not validated by anyone but its author.** The fixtures were written by this
  project to test this project. There has been no external review, no
  third-party audit, and no evaluation against a real healthcare codebase.
- **Not a competitor to Prowler, AWS Config, or cloud posture tools.** Those
  scan infrastructure and configuration. This reads source code and finds a
  different class of problem. They are complementary; this replaces neither.
- **Not exhaustive.** Regex-based detection has a real and unmeasured
  false-negative rate. It will not catch PHI in a variable it can't name-match,
  or values arriving from an external call.
- **Not able to follow a value across lines.** See
  [the same-line rule](#the-same-line-rule). Real dataflow analysis is out of
  scope; this is a deliberate boundary.
- **Not fully comment-aware.** Only whole-line `//` and `#` comments are
  skipped. Block comments (`/* ... */`) and trailing end-of-line comments are
  still scanned, so a sink keyword sitting inside one of those can produce a
  finding even though nothing executes.
- **Not a secrets scanner, and not a substitute for code review.** It looks for
  one pattern: a sensitive-looking name next to a risky call.

### Security boundary

The server reads any directory it is handed, on the machine it runs on, with
the permissions of the user who started it. It has no sandbox and no allowlist.
Point it at code you are entitled to read.

The server opens no sockets and makes no outbound requests. It does not follow
that your data stays local. A tool result is returned to the MCP client that
launched the server, and if that client is a hosted assistant, the result is
transmitted to and processed by that provider under their terms, not this
project's. Treat every `scan_code` and `redact_suggest` result as content you
are sending to your model provider.

`snippet` and `redact_suggest` results are masked by default specifically so
that what gets transmitted is identifier names and positions rather than PHI
values. The masking is the same regex set described above, so it carries the
same false-negative rate: a value those patterns do not recognise is passed
through unmasked. Do not treat "it was masked" as a guarantee, and do not run
this against production PHI through a hosted client without first satisfying
yourself about that client's data handling.

## Contributing

`npm run verify` must pass. CI runs it on Node 22 and 24.

## License

MIT — see [LICENSE](LICENSE).

## Mcp Server Approved
[![Listed on mcpservers.org](https://mcpservers.org/badge.svg)](https://mcpservers.org/servers/abidit/phi-guard-mcp)
