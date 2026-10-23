import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWaitlist } from '../lib/waitlist.js';

test('wachtlijst: e-mail verplicht, standaard particulier zonder nieuwsbrief', () => {
  const r = validateWaitlist({ email: ' jan@voorbeeld.nl ' });
  assert.deepEqual(r, { ok: true, value: { email: 'jan@voorbeeld.nl', segment: 'particulier', newsletter: false } });
  assert.equal(validateWaitlist({ email: 'geen-adres' }).ok, false);
  assert.equal(validateWaitlist({}).ok, false);
  assert.equal(validateWaitlist(null).ok, false);
});

test('wachtlijst: segment alleen particulier of zakelijk', () => {
  assert.equal(validateWaitlist({ email: 'a@b.nl', segment: 'zakelijk' }).value.segment, 'zakelijk');
  assert.equal(validateWaitlist({ email: 'a@b.nl', segment: 'horeca' }).ok, false);
});

test('wachtlijst: nieuwsbriefvakje als boolean of als formulierwaarde', () => {
  for (const n of [true, 'on', 'true', '1']) assert.equal(validateWaitlist({ email: 'a@b.nl', newsletter: n }).value.newsletter, true);
  for (const n of [false, undefined, '', 'off', 'nee']) assert.equal(validateWaitlist({ email: 'a@b.nl', newsletter: n }).value.newsletter, false);
});
