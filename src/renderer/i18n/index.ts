/**
 * i18next bootstrap for the renderer.
 *
 * Offline guarantee: locale resources are STATICALLY imported TypeScript
 * modules bundled at build time and handed to i18next via its `resources`
 * option. There is no http-backend and no runtime fetch — nothing here ever
 * touches the network.
 *
 * The active language is persisted to localStorage so it survives reloads,
 * both in the desktop app and the web preview. Changing language goes through
 * {@link setLanguage}, which updates i18next (triggering a re-render through
 * react-i18next) and writes the choice back to storage.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './locales/en';
import { id } from './locales/id';

/** localStorage key holding the user's chosen UI language. */
export const LANG_STORAGE_KEY = 'panelmaker.lang';

/** The languages the UI ships with. */
export const SUPPORTED_LANGUAGES = ['en', 'id'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Default language when nothing is stored (or storage is unavailable). */
const DEFAULT_LANGUAGE: Language = 'en';

/** Read the stored language, falling back to the default. */
function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      return stored as Language;
    }
  } catch {
    // localStorage can throw in locked-down web contexts — ignore and default.
  }
  return DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    id: { translation: id },
  },
  lng: readStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    // React already escapes values, so i18next must not double-escape.
    escapeValue: false,
  },
});

/**
 * Switch the UI language and persist the choice. react-i18next re-renders any
 * component using `useTranslation` when the language changes.
 */
export function setLanguage(lang: Language): void {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Persisting is best-effort; the in-memory switch still applies.
  }
}

/** The currently active language. */
export function getLanguage(): Language {
  return (i18n.resolvedLanguage as Language | undefined) ?? DEFAULT_LANGUAGE;
}

export default i18n;
