/**
 * Whether the whole course is open to this user, beyond the free days.
 *
 * The one place the Academy asks. The Elite plan that answers yes arrives with
 * the Academy paywall; until then only the free days open, for everyone.
 */
export function useAcademyAccess(): boolean {
  return false;
}
