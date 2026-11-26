import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Exercise the actual inline enquiry function, without Astro or any network service.
const source = readFileSync(new URL('../src/pages/enquire.astro', import.meta.url), 'utf8');
const logic = source.match(/<script is:inline>\s*([\s\S]*?)\nconst form=/)?.[1];
assert.ok(logic, 'Inline enquiry implementation must be present');
const buildInquiry = runInNewContext(logic + '\nbuildInquiry;', {}, { timeout: 1000 });
const valid = { business: 'Example & Co', email: 'test@example.com', scope: 'New website', timeline: 'Flexible', details: 'A new responsive website.' };
const cases = [
  ['missing business', { business: '' }],
  ['overlong business', { business: 'a'.repeat(101) }],
  ['invalid email', { email: 'invalid' }],
  ['overlong email', { email: 'a'.repeat(151) + '@example.com' }],
  ['invalid scope', { scope: 'Unexpected' }],
  ['invalid timing', { timeline: 'Unexpected' }],
  ['short brief', { details: 'short' }],
  ['overlong brief', { details: 'a'.repeat(601) }],
];
for (const [name, patch] of cases) {
  test(`rejects ${name}`, () => assert.throws(() => buildInquiry({ ...valid, ...patch })));
}
test('valid input creates a draft with fixed recipient and subject', () => {
  const result = buildInquiry(valid);
  const uri = new URL(result.href);
  assert.equal(uri.protocol, 'mailto:');
  assert.equal(uri.pathname, 'aran@northlinedev.net');
  assert.equal(uri.searchParams.get('subject'), 'Website project enquiry');
  assert.equal(uri.searchParams.get('body'), result.body);
  assert.match(result.body, /Example & Co/);
});
test('special characters cannot inject additional mail parameters', () => {
  const result = buildInquiry({ ...valid, details: 'Café &bcc=synthetic@example.com? # text' });
  const uri = new URL(result.href);
  assert.deepEqual([...uri.searchParams.keys()], ['subject', 'body']);
  assert.match(uri.searchParams.get('body'), /Café &bcc=/);
});
test('line breaks in business name stay within the encoded body', () => {
  const result = buildInquiry({ ...valid, business: 'Example\r\nBcc: other@example.com' });
  const uri = new URL(result.href);
  assert.deepEqual([...uri.searchParams.keys()], ['subject', 'body']);
  assert.match(result.body, /Business: Example Bcc: other@example.com/);
});
test('boundary lengths are accepted', () => {
  assert.ok(buildInquiry({ ...valid, business: 'a'.repeat(100), details: 'a'.repeat(600) }).href);
  assert.ok(buildInquiry({ ...valid, details: 'a'.repeat(10) }).href);
});
