// Synthetic leak sample: hardcoded literal PHI on a risky-sink line. All values
// are fabricated. The scanner must flag the line AND mask the literals out of
// the snippet it returns, since that snippet flows back into an LLM's context.
declare const logger: { info(message: string): void };

export function auditDemoRecord() {
  logger.info(`Patient: John Doe, DOB: 01/01/1980, MRN-4471902, SSN 123-45-6789`);
}
