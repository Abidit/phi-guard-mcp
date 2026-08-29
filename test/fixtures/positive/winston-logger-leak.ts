// Synthetic leak sample: winston-style logger, declared locally.
interface PatientRecord { id: string; mrn: string }

declare const logger: { error(message: string): void };

export function onReconcileFailure(record: PatientRecord) {
  logger.error(`Failed to reconcile chart for MRN ${record.mrn}`);
}
