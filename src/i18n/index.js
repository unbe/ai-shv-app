import { de } from './de.js';
import { fr } from './fr.js';
import { it } from './it.js';
import { en } from './en.js';

const translations = { de, fr, it, en };

export function getTranslation(lang = 'de') {
  return translations[lang] || translations.de;
}

export { de, fr, it, en };
