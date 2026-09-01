export interface PhiMatch {
  type: string;
  value: string;
  confidence: number;
  start: number;
  end: number;
}

interface PhiPattern {
  type: string;
  regex: RegExp;
  confidence: number;
}

// Start narrow. A false positive that annoys someone into ignoring
// the tool is worse than a missed match. Tighten/loosen based on
// real test results, not guesses.
const PATTERNS: PhiPattern[] = [
  { type: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g, confidence: 0.95 },
  { type: "mrn", regex: /\bMRN[-:\s]?\d{4,10}\b/gi, confidence: 0.9 },
  {
    type: "phone",
    regex: /\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
    confidence: 0.75,
  },
  { type: "email", regex: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, confidence: 0.7 },
  {
    type: "dob",
    regex: /\b(?:DOB|born|birth date)[:\s]+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
    confidence: 0.85,
  },
  // Heuristic: "Patient <Capitalized Word> <Capitalized Word>"
  {
    type: "name",
    regex: /\b[Pp]atient[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)\b/g,
    confidence: 0.8,
  },
];

export function detectPhi(text: string): PhiMatch[] {
  const matches: PhiMatch[] = [];
  for (const pattern of PATTERNS) {
    for (const m of text.matchAll(pattern.regex)) {
      const value = m[1] ?? m[0];
      // Offset the capture group inside the full match so start/end point at
      // the value itself, not at the keyword that anchored it.
      const start = m[1] === undefined ? m.index : m.index + m[0].indexOf(m[1]);
      matches.push({
        type: pattern.type,
        value,
        confidence: pattern.confidence,
        start,
        end: start + value.length,
      });
    }
  }
  return matches;
}
