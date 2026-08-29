// Synthetic leak sample. See sentry-leak.ts for why deps are declared locally.
interface PatientRecord { id: string; diagnosis: string }

declare const analytics: { track(event: string, properties: Record<string, unknown>): void };

export function trackChartOpened(record: PatientRecord) {
  analytics.track("chart_opened", { diagnosis: record.diagnosis, cohort: "oncology" });
}
