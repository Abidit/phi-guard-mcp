const prompt = await openai.responses.create({ input: `Patient: ${patient.name}, diagnosis: ${patient.diagnosis}` });
console.log("Sending patient prompt to LLM:", prompt);
