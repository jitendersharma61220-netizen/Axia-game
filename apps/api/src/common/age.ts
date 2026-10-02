import { AgeMode } from '@prisma/client';

export const MIN_AGE = 14;
export const ADULT_AGE = 19;

/**
 * Self-declared age → experience. Pending legal review (Phase 0):
 * 14–18 get the separate free experience, 19+ the commercial one, <14 are blocked.
 */
export function ageModeForBirthYear(birthYear: number, now = new Date()): AgeMode | null {
  const age = now.getFullYear() - birthYear;
  if (age < MIN_AGE) return null;
  return age >= ADULT_AGE ? AgeMode.ADULT : AgeMode.TEEN;
}
