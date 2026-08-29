// Documented limitation: the sensitive value is bound on one line and reaches
// the sink on another. The line-based scanner cannot span that by design.
interface PatientRecord { diagnosis: string }

export function auditVisit(patient: PatientRecord) {
  const value = patient.diagnosis;
  const label = "audit";
  console.log(label, value);
}
