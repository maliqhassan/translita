/**
 * The route as a screen name: `academy/lesson/[id]`, not the lesson's id, and
 * without the `(group)` folders, so every lesson counts as one screen.
 */
export function screenNameOf(segments: readonly string[]): string {
  const name = segments.filter((segment) => !/^\(.*\)$/.test(segment)).join('/');
  return name || 'home';
}
