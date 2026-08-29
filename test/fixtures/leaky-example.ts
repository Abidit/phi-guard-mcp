// Original smoke fixture. Deps declared locally so it type-checks standalone.
interface Patient { name: string; diagnosis: string }

declare const patient: Patient;
declare const openai: { responses: { create(request: unknown): Promise<string> } };

const prompt = await openai.responses.create({ input: `Patient: ${patient.name}, diagnosis: ${patient.diagnosis}` });
console.log("Sending patient prompt to LLM:", prompt);

export {};
