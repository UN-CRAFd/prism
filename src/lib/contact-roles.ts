export const ROLE_SIGNATORY = "Signatory";

export const CONTACT_ROLES = [
  "Primary focal point",
  "Alternate focal point",
  ROLE_SIGNATORY,
  "Applicant",
] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number];
