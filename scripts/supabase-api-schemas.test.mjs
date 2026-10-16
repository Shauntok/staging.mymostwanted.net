import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function readApiSchemas(toml) {
  const lines = toml.split(/\r?\n/);
  const apiStart = lines.indexOf('[api]');

  if (apiStart === -1) {
    throw new Error('Supabase config is missing the [api] section');
  }

  const nextSection = lines.findIndex(
    (line, index) => index > apiStart && /^\[[^\]]+\]$/.test(line),
  );
  const apiLines = lines.slice(apiStart + 1, nextSection === -1 ? undefined : nextSection);
  const schemasLine = apiLines.find((line) => /^\s*schemas\s*=/.test(line));
  const schemasMatch = schemasLine?.match(/^\s*schemas\s*=\s*\[([^\]]*)\]\s*(?:#.*)?$/);

  if (!schemasMatch) {
    throw new Error('Supabase [api] section is missing a valid schemas array');
  }

  return Array.from(schemasMatch[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
}

function assertPrivateSchemaIsNotExposed(toml) {
  assert.ok(
    !readApiSchemas(toml).includes('private'),
    'the Supabase Data API must not expose the private schema',
  );
}

test('private schema does not appear in the local Data API exposed schemas', async () => {
  const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  const exposedSchemas = readApiSchemas(config);

  assert.ok(exposedSchemas.includes('public'));
  assert.ok(exposedSchemas.includes('graphql_public'));
  assertPrivateSchemaIsNotExposed(config);
});

test('reads only the [api] schemas array, not extra search path values', () => {
  const config = [
    '[api]',
    'schemas = ["public", "graphql_public"]',
    'extra_search_path = ["public", "extensions", "private"]',
    '',
    '[db]',
    'schemas = ["private"]',
  ].join('\n');

  assert.deepEqual(readApiSchemas(config), ['public', 'graphql_public']);
});

test('fails if a config adds the private schema to the Data API', () => {
  const config = '[api]\nschemas = ["public", "private"]';

  assert.throws(() => assertPrivateSchemaIsNotExposed(config), /must not expose the private schema/);
});
