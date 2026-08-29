// Clean sample: "patient" and "diagnosis" sit next to a call, but it is an ORM write.
interface PatientRecord { id: string; diagnosis: string }

declare const prisma: { chart: { update(args: unknown): Promise<void> } };

export async function savePatientRecord(patient: PatientRecord) {
  await prisma.chart.update({
    where: { id: patient.id },
    data: { diagnosis: patient.diagnosis, updatedAt: new Date() },
  });
}
