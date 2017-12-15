/* eslint-disable no-unused-expressions */
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chai from 'chai';
import Auth, { Auth0LockFactory } from '../src/auth0-sso-login';
import windowInteraction from '../src/window-interaction';

const expect = chai.expect;
chai.use(sinonChai);

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
        const tokenExpiryManager = { scheduleTokenRefresh() {} };
        const tokenExpiryManagerMock = sandbox.mock(tokenExpiryManager);
        tokenExpiryManagerMock.expects('scheduleTokenRefresh').withExactArgs(authResult, sinon.match.func);
        const auth = new Auth({ hooks: { tokenRefreshed: hook.tokenRefreshed } });
        auth.tokenExpiryManager = tokenExpiryManager;
        return auth.tokenRefreshed(authResult)
          .then(() => {
            mock.verify();
            tokenExpiryManagerMock.verify();
          });
      });

      it('does not fail when no hook provided', () => {
        const authResult = { unitTestAuthResult: 'unit-test-auth-result' };
        const tokenExpiryManager = { scheduleTokenRefresh() {} };
        const tokenExpiryManagerMock = sandbox.mock(tokenExpiryManager);
        tokenExpiryManagerMock.expects('scheduleTokenRefresh').withExactArgs(authResult, sinon.match.func);
        const auth = new Auth();
        auth.tokenExpiryManager = tokenExpiryManager;

        // return promise, to ensure it didn't fail
        return auth.tokenRefreshed(authResult)
          .then(() => tokenExpiryManagerMock.verify());
      });
    });

    describe('for logout', () => {
      it('invokes hook', () => {
        const hook = { logout() { } };
        const mock = sandbox.mock(hook);
        mock.expects('logout').once().resolves();
        const tokenExpiryManager = { cancelTokenRefresh() {} };
        const tokenExpiryManagerMock = sandbox.mock(tokenExpiryManager);
        tokenExpiryManagerMock.expects('cancelTokenRefresh').once();
        const windowInteractionMock = sandbox.mock(windowInteraction);
        windowInteractionMock.expects('updateWindow').once();

        const auth = new Auth({ hooks: { logout: hook.logout } });
        auth.tokenExpiryManager = tokenExpiryManager;
        auth.authResult = { testResult: 'unit-test-result' };

        auth.logout();
        expect(auth.getLatestAuthResult()).to.be.null;
        mock.verify();
        windowInteractionMock.verify();
        tokenExpiryManagerMock.verify();
      });

      it('does not fail when no hook provided', () => {
        const tokenExpiryManager = { cancelTokenRefresh() {} };
        const tokenExpiryManagerMock = sandbox.mock(tokenExpiryManager);
        tokenExpiryManagerMock.expects('cancelTokenRefresh').once();
        const windowInteractionMock = sandbox.mock(windowInteraction);
        windowInteractionMock.expects('updateWindow').once();

        const auth = new Auth();
        auth.tokenExpiryManager = tokenExpiryManager;
        auth.authResult = { testResult: 'unit-test-result' };

        auth.logout();
        expect(auth.getLatestAuthResult()).to.be.null;
        windowInteractionMock.verify();
        tokenExpiryManagerMock.verify();
      });
    });

    describe('for remove login', () => {
      it('invokes hook', () => {
        const hook = { removeLogin() { } };
        const mock = sandbox.mock(hook);
        mock.expects('removeLogin').once().resolves();
        const tokenExpiryManager = { cancelTokenRefresh() {} };
        const tokenExpiryManagerMock = sandbox.mock(tokenExpiryManager);
        tokenExpiryManagerMock.expects('cancelTokenRefresh').once();

        const auth = new Auth({ hooks: { removeLogin: hook.removeLogin } });
        auth.tokenExpiryManager = tokenExpiryManager;
        auth.authResult = { testResult: 'unit-test-result' };

        auth.removeLogin();
        expect(auth.getLatestAuthResult()).to.be.null;
        tokenExpiryManagerMock.verify();
        mock.verify();
      });

      it('does not fail when no hook provided', () => {
        const tokenExpiryManager = { cancelTokenRefresh() {} };
        const tokenExpiryManagerMock = sandbox.mock(tokenExpiryManager);
        tokenExpiryManagerMock.expects('cancelTokenRefresh').once();
        const auth = new Auth();
        auth.tokenExpiryManager = tokenExpiryManager;
        auth.authResult = { testResult: 'unit-test-result' };

        auth.removeLogin();
        expect(auth.getLatestAuthResult()).to.be.null;
        tokenExpiryManagerMock.verify();
      });
    });
  });

  describe('ensureLoggedIn()', () => {
    const catchableError = 'catchable-unit-test-error';
    const testLoginInfo = { idToken: 'unit-test-id-token', sub: 'unit-test-sub' };
    const testProfile = { sub: testLoginInfo.sub };
    const testAuthResult = { idToken: testLoginInfo.idToken, accessToken: 'unit-test-access-token' };
    const testCases = [
      {
        name: 'follows login procedure with auth0lock',
        configuration: { enableLockWidget: true },
        setExpectations(auth, authMock, tokenExpiryManagerMock, auth0LockFactoryMock, auth0Lock, auth0LockMock) {
          authMock.expects('renewAuth').once().rejects('error');
          authMock.expects('removeLogin').once();
          authMock.expects('renewAuth').once().resolves(testLoginInfo);
          authMock.expects('getDetailedProfile').withExactArgs(testLoginInfo.idToken, testLoginInfo.sub).once().resolves(testProfile);
          authMock.expects('profileRefreshed').withExactArgs(testProfile).once().resolves();
          auth0LockMock.expects('on').withExactArgs('authenticated', sinon.match.func)
            .callsFake((event, cb) => cb(testAuthResult));
          auth0LockMock.expects('on').withExactArgs('authorization_error', sinon.match.func).once();
          auth0LockMock.expects('getUserInfo').withExactArgs(testAuthResult.accessToken, sinon.match.func)
            .callsFake((accessToken, cb) => cb(null, testProfile));
          auth0LockFactoryMock.expects('createAuth0Lock').once().returns(auth0Lock);
        },
      },
      // add test when auth0 lock fails to login (once we handle that failure)
      {
        name: 'follows login procedure without auth0lock',
        configuration: { enableLockWidget: false },
        setExpectations(auth, authMock) {
          authMock.expects('renewAuth').once().resolves(testLoginInfo);
          authMock.expects('getDetailedProfile').withExactArgs(testLoginInfo.idToken, testLoginInfo.sub).once().resolves(testProfile);
          authMock.expects('profileRefreshed').withExactArgs(testProfile).once().resolves();
        },
      },
      {
        name: 'does not call auth0lock if it is disabled and the sso auth failed',
        configuration: { enableLockWidget: false },
        setExpectations(auth, authMock) {
          authMock.expects('renewAuth').once().rejects(catchableError);
          authMock.expects('removeLogin').once();
        },
      },
      {
        name: 'returns immediately if valid token is available',
        configuration: { enableLockWidget: false },
        setExpectations(auth, authMock, tokenExpiryManagerMock) {
          // eslint-disable-next-line no-param-reassign
          auth.authResult = testAuthResult;
          tokenExpiryManagerMock.expects('getRemainingMillisToTokenExpiry').once().returns(1000);
          authMock.expects('renewAuth').never();
        },
      },
      {
        name: 'follows login procedure if valid token is available but forceTokenRefresh is set',
        configuration: { enableLockWidget: false, forceTokenRefresh: true },
        setExpectations(auth, authMock) {
          // eslint-disable-next-line no-param-reassign
          auth.authResult = testAuthResult;
          authMock.expects('renewAuth').once().resolves(testLoginInfo);
          authMock.expects('getDetailedProfile').withExactArgs(testLoginInfo.idToken, testLoginInfo.sub).once().resolves(testProfile);
          authMock.expects('profileRefreshed').withExactArgs(testProfile).once().resolves();
        },
      },
    ];

    return testCases.map(testCase =>
      it(testCase.name, () => {
        const auth0Lock = { on() {}, show() {}, hide() {}, getUserInfo() {} };
        const auth0LockMock = sandbox.mock(auth0Lock);
        const auth0LockFactoryMock = sandbox.mock(Auth0LockFactory);
        const tokenExpiryManager = { getRemainingMillisToTokenExpiry() {} };
        const tokenExpiryManagerMock = sandbox.mock(tokenExpiryManager);
        const auth = new Auth();
        auth.tokenExpiryManager = tokenExpiryManager;
        const authMock = sandbox.mock(auth);

        testCase.setExpectations(auth, authMock, tokenExpiryManagerMock, auth0LockFactoryMock,
          auth0Lock, auth0LockMock);

        return auth.ensureLoggedIn(testCase.configuration)
          .then(() => {
            authMock.verify();
            auth0LockFactoryMock.verify();
            auth0LockMock.verify();
            tokenExpiryManagerMock.verify();
          })
          .catch((e) => {
            if (e.name !== catchableError) {
              throw e;
            }
          });
      }));
  });
});
