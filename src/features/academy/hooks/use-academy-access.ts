import { useEntitlements } from '@/store';

/**
 * Whether the whole course is open to this user, beyond the free days.
 *
 * The one place the Academy asks, and it asks for the capability, never the
 * plan: Elite includes it today, and whatever sells it tomorrow will too.
 */
export function useAcademyAccess(): boolean {
  return useEntitlements().has('academy');
}
