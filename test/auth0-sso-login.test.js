/* eslint-disable no-unused-expressions */
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chai from 'chai';
import Auth, { windowInteraction, localStorageInteraction, tokenExpiresAtKey } from '../src/auth0-sso-login';

const expect = chai.expect;
chai.use(sinonChai);

let sandbox;
beforeEach(() => {
  sandbox = sinon.sandbox.create();
  sandbox.stub(localStorageInteraction, 'getItem').returns(undefined);
});
afterEach(() => sandbox.restore());

describe('auth.js', () => {
  describe('constructor', () => {
    it('does not schedule token renewal if expiry time is not available', () => {
      const auth = new Auth();
      expect(auth.tokenRefreshHandle).to.be.null;
    });

    it('does schedule token renewal if expiry time is present', () => {
      const testHandle = 'unit-test-handle';
      const dateNow = 20000;
      const expectedExpiresAt = JSON.stringify(35000);
      // refresh in 2/3 of token lifetime
      const expectedRefreshDelay = 10000;

      const dateMock = sandbox.mock(Date);
      dateMock.expects('now').once().returns(dateNow);
      // unwrap the default method stub
      localStorageInteraction.getItem.restore();
      const localStorageInteractionMock = sandbox.mock(localStorageInteraction);
      localStorageInteractionMock.expects('getItem').withExactArgs(tokenExpiresAtKey).returns(expectedExpiresAt);

      const windowInteractionMock = sandbox.mock(windowInteraction);
      windowInteractionMock.expects('setTimeout').withExactArgs(sinon.match.func, expectedRefreshDelay).returns(testHandle);

      const auth = new Auth();
      expect(auth.tokenRefreshHandle).to.equal(testHandle);
      localStorageInteractionMock.verify();
      windowInteractionMock.verify();
      dateMock.verify();
    });
  });

  describe('when notifying hooks', () => {
    describe('for logging', () => {
      it('logs to provided log function', () => {
        const logObj = { log() { } };
        const mock = sandbox.mock(logObj);
        const logMsg = 'unit-test-log-message';
        mock.expects('log').withExactArgs(logMsg).once().resolves();
        const auth = new Auth({ hooks: { log: logObj.log } });
        auth.log(logMsg);
        mock.verify();
      });

      it('logs to console by default', () => {
        const mock = sandbox.mock(console);
        const logMsg = 'unit-test-log-message';
        mock.expects('log').withExactArgs(logMsg).once().resolves();
        const auth = new Auth();
        auth.log(logMsg);
        mock.verify();
      });
    });

    describe('for profile refresh', () => {
      it('invokes hook', () => {
        const hook = { profileRefreshed() { } };
        const mock = sandbox.mock(hook);
        const profile = { unitTestProfile: 'unit-test-log-message' };
        mock.expects('profileRefreshed').withExactArgs(profile).once().resolves();
        const auth = new Auth({ hooks: { profileRefreshed: hook.profileRefreshed } });
        return auth.profileRefreshed(profile)
          .then(() => {
            mock.verify();
          });
      });

      it('does not fail when no hook provided', () => {
        const profile = { unitTestProfile: 'unit-test-profile' };
        const auth = new Auth();

        // return promise, to ensure it didn't fail
        return auth.profileRefreshed(profile);
      });
    });

    describe('for token refresh', () => {
      it('invokes hook', () => {
        const hook = { tokenRefreshed() { } };
        const mock = sandbox.mock(hook);
        const authResult = { unitTestAuthResult: 'unit-test-auth-result' };
        mock.expects('tokenRefreshed').withExactArgs(authResult).once().resolves();
        sandbox.stub(localStorageInteraction, 'setItem');
        const auth = new Auth({ hooks: { tokenRefreshed: hook.tokenRefreshed } });
        return auth.tokenRefreshed(authResult)
          .then(() => {
            mock.verify();
          });
      });

      it('does not fail when no hook provided', () => {
        const authResult = { unitTestAuthResult: 'unit-test-auth-result' };
        sandbox.stub(localStorageInteraction, 'setItem');
        const auth = new Auth();

        // return promise, to ensure it didn't fail
        return auth.tokenRefreshed(authResult);
      });

      it('stores token expiry time', () => {
        const expiresIn = 15000;
        const dateNow = 20000;
        const expectedExpiresAt = JSON.stringify(35000);

        const authResult = { unitTestAuthResult: 'unit-test-auth-result', expiresIn: expiresIn / 1000 };
        const auth = new Auth();

        const dateMock = sandbox.mock(Date);
        dateMock.expects('now').once().returns(dateNow);

        // unwrap the default method stub
        localStorageInteraction.getItem.restore();
        const localStorageInteractionMock = sandbox.mock(localStorageInteraction);
        localStorageInteractionMock.expects('setItem').withExactArgs(tokenExpiresAtKey, expectedExpiresAt).once();
        localStorageInteractionMock.expects('getItem').withExactArgs(tokenExpiresAtKey).returns(undefined);

        auth.tokenRefreshed(authResult);
        expect(auth.tokenRefreshHandle).to.equal(null);
        localStorageInteractionMock.verify();
        dateMock.verify();
      });

      it('removes scheduled token refresh and schedules new refresh time', () => {
        const expiresIn = 15000;
        const dateNow = 20000;
        const expectedExpiresAt = JSON.stringify(35000);
        // refresh in 2/3 of token lifetime
        const expectedRefreshDelay = 10000;

        const authResult = { unitTestAuthResult: 'unit-test-auth-result', expiresIn: expiresIn / 1000 };
        const auth = new Auth();

        const dateMock = sandbox.mock(Date);
        dateMock.expects('now').twice().returns(dateNow);

        const previousHandle = 'previous-handle';
        const newHandle = 'new-handle';
        const windowInteractionMock = sandbox.mock(windowInteraction);
        windowInteractionMock.expects('clearTimeout').withExactArgs(previousHandle);
        windowInteractionMock.expects('setTimeout').withExactArgs(sinon.match.func, expectedRefreshDelay).once().returns(newHandle);

        // unwrap the default method stub
        localStorageInteraction.getItem.restore();
        const localStorageInteractionMock = sandbox.mock(localStorageInteraction);
        localStorageInteractionMock.expects('setItem').withExactArgs(tokenExpiresAtKey, expectedExpiresAt).once();
        localStorageInteractionMock.expects('getItem').withExactArgs(tokenExpiresAtKey).returns(expectedExpiresAt);

        auth.tokenRefreshHandle = previousHandle;
        auth.tokenRefreshed(authResult);
        expect(auth.tokenRefreshHandle).to.equal(newHandle);
        localStorageInteractionMock.verify();
        dateMock.verify();
        windowInteractionMock.verify();
      });
    });

    describe('for logout', () => {
      it('invokes hook', () => {
        const hook = { logout() { } };
        const mock = sandbox.mock(hook);
        mock.expects('logout').once().resolves();
        const auth = new Auth({ hooks: { logout: hook.logout } });
        const windowInteractionMock = sandbox.mock(windowInteraction);
        windowInteractionMock.expects('updateWindow').once();
        auth.logout();
        mock.verify();
        windowInteractionMock.verify();
      });

      it('does not fail when no hook provided', () => {
        const auth = new Auth();
        // const authMock = sandbox.mock(auth);
        const windowInteractionMock = sandbox.mock(windowInteraction);
        windowInteractionMock.expects('updateWindow').once();
        auth.logout();
        windowInteractionMock.verify();
      });

      it('clears stored token expiry time and stops automatic refresh', () => {
        const auth = new Auth();
        auth.tokenRefreshHandle = 'unit-test-handle';
        const windowInteractionMock = sandbox.mock(windowInteraction);
        windowInteractionMock.expects('updateWindow').once();
        windowInteractionMock.expects('clearTimeout').withExactArgs('unit-test-handle').once();
        const localStorageInteractionMock = sandbox.mock(localStorageInteraction);
        localStorageInteractionMock.expects('removeItem').withExactArgs(tokenExpiresAtKey).once();
        auth.logout();
        windowInteractionMock.verify();
        localStorageInteractionMock.verify();
      });
    });

    describe('for remove login', () => {
      it('invokes hook', () => {
        const hook = { removeLogin() { } };
        const mock = sandbox.mock(hook);
        mock.expects('removeLogin').once().resolves();
        const auth = new Auth({ hooks: { removeLogin: hook.removeLogin } });
        auth.removeLogin();
        mock.verify();
      });

      it('does not fail when no hook provided', () => {
        const auth = new Auth();
        auth.removeLogin();
      });

      it('clears stored token expiry time and stops automatic refresh', () => {
        const auth = new Auth();
        auth.tokenRefreshHandle = 'unit-test-handle';
        const windowInteractionMock = sandbox.mock(windowInteraction);
        windowInteractionMock.expects('clearTimeout').withExactArgs('unit-test-handle').once();
        const localStorageInteractionMock = sandbox.mock(localStorageInteraction);
        localStorageInteractionMock.expects('removeItem').withExactArgs(tokenExpiresAtKey).once();
        auth.removeLogin();
        windowInteractionMock.verify();
        localStorageInteractionMock.verify();
      });
    });
  });

  describe('ensureLoggedIn()', () => {
    it('follows correct procedure', () => {
      const auth = new Auth();
      const mock = sandbox.mock(auth);
      const loginInfo = { idToken: 'unit-test-id-token', sub: 'unit-test-sub' };
      const profile = { sub: loginInfo.sub };
      mock.expects('renewAuth').once().resolves(loginInfo);
      mock.expects('getDetailedProfile').withExactArgs(loginInfo.idToken, loginInfo.sub).once().resolves(profile);
      mock.expects('profileRefreshed').withExactArgs(profile).once().resolves();

      const promise = auth.ensureLoggedIn();

      return promise
        .then(() => {
          mock.verify();
        });
    });
  });
});
