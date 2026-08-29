export interface PhiMatch {
  type: string;
  value: string;
  confidence: number;
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
    regex: /\bPatient[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)\b/g,
    confidence: 0.8,
  },
];

export function detectPhi(text: string): PhiMatch[] {
  const matches: PhiMatch[] = [];
  for (const pattern of PATTERNS) {
    for (const m of text.matchAll(pattern.regex)) {
      matches.push({
        type: pattern.type,
        value: m[0],
        confidence: pattern.confidence,
      });
    }
  }
  return matches;
}
