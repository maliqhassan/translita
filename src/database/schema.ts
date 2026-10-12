/**
 * Local database shape. Declared on Day 1 so features can be written against a
 * stable schema; the SQLite implementation is added on the persistence day.
 */

export const TABLES = {
  translations: 'translations',
  favorites: 'favorites',
  languagePacks: 'language_packs',
  preferences: 'preferences',
  academyEnrollment: 'academy_enrollment',
  academyLessons: 'academy_lesson_progress',
  academyItems: 'academy_item_stats',
  academyPosition: 'academy_position',
  academyResults: 'academy_results',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

/** Row shapes use snake_case to mirror the SQL columns exactly. */
export type TranslationRow = {
  id: string;
  source_text: string;
  translated_text: string;
  source_language: string;
  detected_language: string | null;
  target_language: string;
  engine: string;
  origin: string;
  is_favorite: number;
  created_at: number;
};

export type LanguagePackRow = {
  id: string;
  source_language: string;
  target_language: string;
  version: string;
  status: string;
  size_bytes: number;
  installed_at: number | null;
};

export type PreferenceRow = {
  key: string;
  value: string;
};
