import { detectPhi, PhiMatch } from "./patterns.js";

// Positions let a caller locate a match without the raw substring being
// echoed back into whatever LLM context this result lands in.
export interface DetectedPhi {
  type: string;
  confidence: number;
  start: number;
  end: number;
  /** Raw matched text. Only present when the caller opts in. */
  value?: string;
}

export interface RedactResult {
  redacted: string;
  detected: DetectedPhi[];
  /** Unredacted input. Only present when the caller opts in. */
  original?: string;
}

function applyRedactions(text: string, matches: PhiMatch[]): string {
  let redacted = text;
  for (const match of matches) {
    redacted = redacted.split(match.value).join(`[${match.type.toUpperCase()}]`);
  }
  return redacted;
}

/** Mask every PHI-shaped substring in `text`. Used wherever a value has to be
 *  shown back to a caller but must not carry PHI with it. */
export function redactPhi(text: string): string {
  return applyRedactions(text, detectPhi(text));
}

export function redactText(text: string, includeMatchedValues = false): RedactResult {
  const matches = detectPhi(text);
  const detected: DetectedPhi[] = matches.map((m) => ({
    type: m.type,
    confidence: m.confidence,
    start: m.start,
    end: m.end,
    ...(includeMatchedValues ? { value: m.value } : {}),
  }));
  return {
    redacted: applyRedactions(text, matches),
    detected,
    ...(includeMatchedValues ? { original: text } : {}),
  };
}
