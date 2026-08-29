// Clean sample: a Patient type is referenced, but the only sink logs a duration.
interface Patient { id: string }

export function handleRequest(startedAt: number, record: Patient) {
  const duration = Date.now() - startedAt;
  console.log(`request completed in ${duration}ms`);
  return record.id;
}
