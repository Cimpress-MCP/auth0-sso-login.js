import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import Auth, { windowInteraction } from '../src/auth0-sso-login';

let sandbox;
beforeEach(() => {
  sandbox = sinon.sandbox.create();
});
afterEach(() => sandbox.restore());

describe('auth.js', () => {
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
        const auth = new Auth({ hooks: { tokenRefreshed: hook.tokenRefreshed } });
        return auth.tokenRefreshed(authResult)
          .then(() => {
            mock.verify();
          });
      });

      it('does not fail when no hook provided', () => {
        const authResult = { unitTestAuthResult: 'unit-test-auth-result' };
        const auth = new Auth();

        // return promise, to ensure it didn't fail
        return auth.tokenRefreshed(authResult);
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
    });
  });

  describe('stayLoggedIn()', () => {
    const testCases = [
      { name: 'never', delay: 60 * 60 * 1000 - 1, callAmount: 0 },
      { name: 'once', delay: 1 * 60 * 60 * 1000, callAmount: 1 },
      { name: 'twice', delay: 2 * 60 * 60 * 1000, callAmount: 2 },
      { name: 'ten times', delay: 10 * 60 * 60 * 1000, callAmount: 10 },
    ];
    testCases.map((testCase) => {
      it(`triggers ensureLoggedIn() ${testCase.name}`, () => {
        const clock = sandbox.useFakeTimers();
        const auth = new Auth();
        const mock = sandbox.mock(auth);
        mock.expects('ensureLoggedIn').exactly(testCase.callAmount);
        auth.stayLoggedIn();
        clock.tick(testCase.delay);
        mock.verify();
      });
    });
  });

  describe('ensureLoggedIn()', () => {
    it('follows correct procedure', () => {
      const clock = sandbox.useFakeTimers();
      const auth = new Auth();
      const mock = sandbox.mock(auth);
      const loginInfo = { idToken: 'unit-test-id-token', sub: 'unit-test-sub' };
      const profile = { sub: loginInfo.sub };
      mock.expects('renewAuth').once().resolves(loginInfo);
      mock.expects('getDetailedProfile').withExactArgs(loginInfo.idToken, loginInfo.sub).once().resolves(profile);
      mock.expects('profileRefreshed').withExactArgs(profile).once().resolves();

      const promise = auth.ensureLoggedIn();
      clock.tick(1000);

      return promise
        .then(() => {
          mock.verify();
        });
    });
  });
});
