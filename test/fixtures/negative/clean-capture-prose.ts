// We must never capture patient data in analytics events.
// Route every diagnosis field through the redaction helper before it
// reaches Sentry, and log the correlation id instead of the record itself.
export const ANALYTICS_PHI_POLICY = "redact-before-capture" as const;
