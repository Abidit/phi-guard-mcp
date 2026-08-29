/**
 * Patient data handling notes.
 *
 * Every field on a patient record counts as PHI under HIPAA, including the
 * diagnosis field and any free-text clinician note. Before a value leaves
 * this service it must pass through the redaction helper first. See the
 * compliance runbook for the review process and the list of approved
 * downstream systems.
 */

export const PHI_REVIEW_REQUIRED = true;
