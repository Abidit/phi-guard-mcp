// Clean sample: a sensitive identifier reaches a database call, not a risky sink.
interface PatientRecord { id: string }

declare const db: { query(sql: string, params: unknown[]): Promise<unknown[]> };

export async function findVisits(patient: PatientRecord) {
  return db.query("SELECT id, visit_date FROM visits WHERE visit_owner = $1", [patient.id]);
}
