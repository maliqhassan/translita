import type { Href } from 'expo-router';

/**
 * The Academy's routes that are reached by name.
 *
 * Constants with a cast, because typed routes list them only after the
 * generator has run; every one of them is a file under `app/academy/`.
 */
export const ACADEMY_ELITE = '/academy/elite' as Href;
export const ACADEMY_FINAL = '/academy/final' as Href;
export const ACADEMY_REPORT = '/academy/report' as Href;
export const ACADEMY_PRACTICE = '/academy/practice' as Href;
