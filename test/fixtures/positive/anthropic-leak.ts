// Synthetic leak sample: string concatenation rather than a template literal,
// to prove detection is not template-literal-specific.
interface PatientRecord { id: string; dob: string }

declare const anthropic: { messages: { create(request: unknown): Promise<{ content: unknown }> } };

export async function summarizeCarePlan(record: PatientRecord) {
  const res = await anthropic.messages.create({ model: "claude-opus-4-5", max_tokens: 512, messages: [{ role: "user", content: "Summarize the care plan for a patient born " + record.dob }] });
  return res.content;
}
