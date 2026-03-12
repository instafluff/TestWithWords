import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowSponsorMessage, SPONSOR_MESSAGE_INTERVAL } from '../sponsor.js';

describe('shouldShowSponsorMessage', () => {
  it('shows the message on every successful run by default', () => {
    assert.equal(shouldShowSponsorMessage(0), false);
    assert.equal(shouldShowSponsorMessage(SPONSOR_MESSAGE_INTERVAL), true);
    assert.equal(shouldShowSponsorMessage(SPONSOR_MESSAGE_INTERVAL + 1), true);
    assert.equal(shouldShowSponsorMessage(SPONSOR_MESSAGE_INTERVAL * 5), true);
  });

  it('falls back to the default interval when given an invalid interval', () => {
    assert.equal(shouldShowSponsorMessage(1, 0), true);
    assert.equal(shouldShowSponsorMessage(2, -10), true);
  });
});