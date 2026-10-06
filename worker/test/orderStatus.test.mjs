import test from 'node:test';
import assert from 'node:assert/strict';
import { canChange, canCancel, nextStep, previousSteps, mailFor, isBackward } from '../lib/orderStatus.js';

test('de hoofdstappen volgen elkaar op', () => {
  assert.equal(nextStep('nieuw').to, 'klaargemaakt');
  assert.equal(nextStep('klaargemaakt').to, 'onderweg');
  assert.equal(nextStep('onderweg').to, 'bezorgd');
  assert.equal(nextStep('bezorgd'), null);
  assert.equal(nextStep('geannuleerd'), null);
});

test('vooruit mag ook een stap overslaan, dezelfde status is geen wijziging', () => {
  assert.equal(canChange('nieuw', 'onderweg'), true);
  assert.equal(canChange('klaargemaakt', 'bezorgd'), true);
  assert.equal(canChange('nieuw', 'nieuw'), false);
});

test('terugzetten kan binnen de hoofdstappen', () => {
  assert.equal(canChange('bezorgd', 'onderweg'), true);
  assert.equal(canChange('onderweg', 'nieuw'), true);
  assert.deepEqual(previousSteps('onderweg'), ['nieuw', 'klaargemaakt']);
  assert.deepEqual(previousSteps('nieuw'), []);
  assert.equal(isBackward('bezorgd', 'onderweg'), true);
  assert.equal(isBackward('nieuw', 'onderweg'), false);
});

test('annuleren kan tot en met onderweg, daarna niet meer; geannuleerd blijft geannuleerd', () => {
  assert.equal(canCancel('nieuw'), true);
  assert.equal(canCancel('onderweg'), true);
  assert.equal(canCancel('bezorgd'), false);
  assert.equal(canCancel('geannuleerd'), false);
  assert.equal(canChange('onderweg', 'geannuleerd'), true);
  assert.equal(canChange('bezorgd', 'geannuleerd'), false);
  assert.equal(canChange('geannuleerd', 'nieuw'), false);
});

test('onbekende statussen worden geweigerd', () => {
  assert.equal(canChange('nieuw', 'verzonden'), false);
  assert.equal(canChange('verzonden', 'bezorgd'), false);
  assert.equal(canChange(undefined, 'nieuw'), false);
});

test('mails: alleen bij vooruitgang naar onderweg of bezorgd, nooit bij terugzetten', () => {
  assert.equal(mailFor('nieuw', 'klaargemaakt'), null);
  assert.equal(mailFor('klaargemaakt', 'onderweg'), 'onderweg');
  assert.equal(mailFor('nieuw', 'onderweg'), 'onderweg');
  assert.equal(mailFor('onderweg', 'bezorgd'), 'bezorgd');
  assert.equal(mailFor('klaargemaakt', 'bezorgd'), 'bezorgd');
  assert.equal(mailFor('bezorgd', 'onderweg'), null);
  assert.equal(mailFor('onderweg', 'klaargemaakt'), null);
});

test('annuleringsmail alleen als dat is aangevinkt', () => {
  assert.equal(mailFor('nieuw', 'geannuleerd'), null);
  assert.equal(mailFor('nieuw', 'geannuleerd', { sendCancelMail: true }), 'geannuleerd');
});
