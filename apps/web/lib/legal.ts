/**
 * Business details used by the Terms, Privacy and Refund pages.
 * Fill these in once (with your lawyer) — every page picks them up.
 * Values still in [square brackets] are shown highlighted as "to fill" on the site.
 */
export const LEGAL = {
  brand: 'Axia',
  companyName: '[Company legal name, e.g. Axia Games Private Limited]',
  companyAddress: '[Registered office address]',
  supportEmail: '[support@yourdomain.in]',
  grievanceOfficerName: '[Grievance Officer name]',
  grievanceOfficerEmail: '[grievance@yourdomain.in]',
  jurisdictionCity: '[City, e.g. New Delhi]',
  hostingProvider: '[Hosting provider, e.g. DigitalOcean]',
  hostingRegion: '[Server location, e.g. Bangalore, India]',
  effectiveDate: '[Effective date]',
  /** Flip to false only after a lawyer has reviewed and approved the text. */
  isDraft: true,
} as const;

export const isPlaceholder = (v: string) => v.startsWith('[') && v.endsWith(']');
