import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'src', 'translations');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const placeholders = value => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort().join('|');

export async function checkTranslations() {
  const sourceBytes = await fs.readFile(path.join(directory, 'ko-source.mjs'));
  const keys = (await import(pathToFileURL(path.join(directory, 'ko-source.mjs')))).default;
  const provenance = JSON.parse(await fs.readFile(path.join(directory, 'provenance.json'), 'utf8'));
  if (provenance.format !== 'pixel-mat-translation-provenance' || provenance.version !== 1 || provenance.sourceSHA256 !== sha256(sourceBytes)) throw Error('Translation source fingerprint differs from provenance');
  if (!Array.isArray(keys) || keys.some(key => typeof key !== 'string' || !key.trim()) || new Set(keys).size !== keys.length || provenance.entries !== keys.length) throw Error('Invalid source message inventory');
  const locales = ['en', 'ja', 'zh-CN', 'es', 'fr', 'de'];
  if (JSON.stringify(Object.keys(provenance.locales).sort()) !== JSON.stringify([...locales].sort())) throw Error('Incomplete translation provenance');
  for (const locale of locales) {
    const filename = locale + '.mjs';
    const bytes = await fs.readFile(path.join(directory, filename));
    const record = provenance.locales[locale];
    if (record.file !== filename || record.sha256 !== sha256(bytes) || record.entries !== keys.length || record.source !== 'korean-source-only-host-authoring') throw Error('Translation fingerprint or authoring record differs: ' + locale);
    const values = (await import(pathToFileURL(path.join(directory, filename)))).default;
    if (Array.isArray(values) || Object.keys(values).length !== keys.length) throw Error('Incomplete keyed translation catalog: ' + locale);
    for (const key of keys) {
      const value = values[key];
      if (typeof value !== 'string' || !value.trim() || value.includes('\uFFFD') || placeholders(value) !== placeholders(key)) throw Error('Invalid translation or placeholders: ' + locale + ': ' + key);
    }
  }
  for (const [filename, record] of Object.entries(provenance.compatibleViews || {})) {
    if (!/^[\w-]+-messages\.mjs$/.test(filename)) throw Error('Invalid catalog view path');
    const bytes = await fs.readFile(path.join(root, 'src', filename));
    if (sha256(bytes) !== record.sha256) throw Error('Catalog compatibility view differs: ' + filename);
  }
  return { entries: keys.length, locales: locales.length, translatedValues: keys.length * locales.length, sourceSHA256: provenance.sourceSHA256 };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
  console.log(JSON.stringify(await checkTranslations()));
