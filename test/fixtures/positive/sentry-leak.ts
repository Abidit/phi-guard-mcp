// Synthetic leak sample. Dependencies are declared locally so the fixture
// type-checks without installing the real SDKs. Never imported or executed.
interface PatientRecord { id: string; ssn: string }

declare const Sentry: { captureException(error: Error, context?: unknown): void };

export function reportBillingFailure(record: PatientRecord, cause: unknown) {
  Sentry.captureException(new Error(`Billing sync failed for SSN ${record.ssn}`), { extra: { cause } });
}
