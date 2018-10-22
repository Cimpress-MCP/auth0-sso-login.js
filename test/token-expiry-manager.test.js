/* eslint-disable no-unused-expressions */
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chai from 'chai';
import windowInteraction from '../src/window-interaction';
import TokenExpiryManager from '../src/token-expiry-manager';

const expect = chai.expect;
chai.use(sinonChai);

let sandbox;
beforeEach(() => {
  sandbox = sinon.sandbox.create();
});
afterEach(() => sandbox.restore());

describe('token-expiry-manager.js', () => {
  describe('getRemainingMillisToTokenExpiry()', () => {
    it('returns 0 if there is no token expiry date stored', () => {
      const tokenExpiryManager = new TokenExpiryManager();
      expect(tokenExpiryManager.getRemainingMillisToTokenExpiry()).to.equal(0);
    });

    it('returns number of miliseconds remaining to token expiry', () => {
      const expiresAt = 15000;
      const dateNow = 10000;
      const expectedRemainingMs = 5000;

      const dateMock = sandbox.mock(Date);
      dateMock.expects('now').returns(dateNow);
      const tokenExpiryManager = new TokenExpiryManager();
      tokenExpiryManager.tokenExpiresAt = expiresAt;

      expect(tokenExpiryManager.getRemainingMillisToTokenExpiry()).to.equal(expectedRemainingMs);
      dateMock.verify();
    });
  });

  describe('scheduleTokenRefresh()', () => {
    it('schedules token refresh at 2/3 of its lifetime', () => {
      const expiresIn = 15000;
      const dateNow = 10000;
      const expectedExpiresAt = 20000;
      const expectedRefreshDelay = 10000;
      const expectedRefreshHandle = 'test-handle';
      const expectedRefreshFunction = () => {};

      const dateMock = sandbox.mock(Date);
      dateMock.expects('now').returns(dateNow);
      const windowInteractionMock = sandbox.mock(windowInteraction);
      windowInteractionMock.expects('setTimeout')
      .withExactArgs(expectedRefreshFunction, expectedRefreshDelay).returns(expectedRefreshHandle);

      const tokenExpiryManager = new TokenExpiryManager();
      tokenExpiryManager.scheduleTokenRefresh({ expiresIn: expiresIn / 1000 }, expectedRefreshFunction);

      expect(tokenExpiryManager.tokenExpiresAt).to.equal(expectedExpiresAt);
      expect(tokenExpiryManager.tokenRefreshHandle).to.equal(expectedRefreshHandle);
      dateMock.verify();
      windowInteractionMock.verify();
    });

    it('clears old and schedules new token refresh', () => {
      const expiresIn = 15000;
      const dateNow = 10000;
      const oldRefreshHandle = 'old-handle';
      const newRefreshHandle = 'new-handle';

      const dateMock = sandbox.mock(Date);
      dateMock.expects('now').returns(dateNow);
      const windowInteractionMock = sandbox.mock(windowInteraction);
      windowInteractionMock.expects('clearTimeout').withExactArgs(oldRefreshHandle);
      windowInteractionMock.expects('setTimeout')
      .withExactArgs(sinon.match.func, sinon.match.number).returns(newRefreshHandle);

      const tokenExpiryManager = new TokenExpiryManager();
      tokenExpiryManager.tokenRefreshHandle = oldRefreshHandle;
      tokenExpiryManager.scheduleTokenRefresh({ expiresIn: expiresIn / 1000 }, () => {});

      expect(tokenExpiryManager.tokenRefreshHandle).to.equal(newRefreshHandle);
      dateMock.verify();
      windowInteractionMock.verify();
    });
  });

  describe('cancelTokenRefresh()', () => {
    it('clears stored token expiry and cancels token refresh', () => {
      const existingHandle = 'existing-handle';
      const windowInteractionMock = sandbox.mock(windowInteraction);
      windowInteractionMock.expects('clearTimeout').withExactArgs(existingHandle);

      const tokenExpiryManager = new TokenExpiryManager();
      tokenExpiryManager.tokenExpiresAt = 'token-expiry-time';
      tokenExpiryManager.tokenRefreshHandle = existingHandle;

      tokenExpiryManager.cancelTokenRefresh();
      expect(tokenExpiryManager.tokenExpiresAt).to.be.null;
      expect(tokenExpiryManager.tokenRefreshHandle).to.be.null;
      windowInteractionMock.verify();
    });
  });
});
