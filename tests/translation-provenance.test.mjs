import test from 'node:test';
import assert from 'node:assert/strict';
import messages from '../src/messages.mjs';
import sourceKeys from '../src/translations/ko-source.mjs';
import { checkTranslations } from '../scripts/check-translations.mjs';
import fs from 'node:fs/promises';

test('every shipped locale is covered by the source-only replacement inventory and provenance', async () => {
  const result = await checkTranslations();
  assert.equal(result.locales, 6);
  assert.equal(result.entries, sourceKeys.length);
  assert.deepEqual(Object.keys(messages), sourceKeys);
  for (const locale of ['en', 'ja', 'zh-CN', 'es', 'fr', 'de']) {
    const catalog = (await import('../src/translations/' + locale + '.mjs')).default;
    for (const key of sourceKeys) assert.equal(messages[key][locale], catalog[key], locale + ': ' + key);
  }
  const provenance = JSON.parse(await fs.readFile(new URL('../src/translations/provenance.json', import.meta.url)));
  for (const [filename, record] of Object.entries(provenance.compatibleViews)) {
    const view = (await import('../src/' + filename)).default;
    assert.equal(Object.keys(view).length, record.entries);
    for (const [key, value] of Object.entries(view)) assert.deepEqual(value, messages[key], filename + ': ' + key);
  }
});
