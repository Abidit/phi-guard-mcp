import { detectPhi, PhiMatch } from "./patterns.js";

export interface RedactResult {
  original: string;
  redacted: string;
  detected: PhiMatch[];
}

export function redactText(text: string): RedactResult {
  const detected = detectPhi(text);
  let redacted = text;
  for (const match of detected) {
    redacted = redacted.split(match.value).join(`[${match.type.toUpperCase()}]`);
  }
  return { original: text, redacted, detected };
}
