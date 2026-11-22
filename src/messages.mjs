// Application messages. Placeholder values remain opaque user data.
import keys from './translations/ko-source.mjs';
import en from './translations/en.mjs';
import ja from './translations/ja.mjs';
import zh from './translations/zh-CN.mjs';
import es from './translations/es.mjs';
import fr from './translations/fr.mjs';
import de from './translations/de.mjs';
const locales = { en, ja, 'zh-CN': zh, es, fr, de };
export default Object.fromEntries(keys.map(key => [key, Object.fromEntries(Object.entries(locales).map(([locale, values]) => [locale, values[key]]))]));
