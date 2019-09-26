/* eslint-disable no-unused-expressions */
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import chai from 'chai';
import Auth from '../src/auth0-sso-login';
import windowInteraction from '../src/window-interaction';
import 'url-polyfill';

import Auth0ClientProvider from '../src/auth0ClientProvider';

const expect = chai.expect;
chai.use(sinonChai);

let sandbox;
beforeEach(() => {
  sandbox = sinon.createSandbox();
});
afterEach(() => sandbox.restore());

describe('auth0-sso-login.js', () => {
  describe('when notifying hooks', () => {
    describe('for logging', () => {
      it('logs to provided log function', () => {
        const logObj = { log() { } };
        const mock = sandbox.mock(logObj);
        const logMsg = 'unit-test-log-message';
        mock.expects('log').withExactArgs(logMsg).once().resolves();
        const auth = new Auth({ hooks: { log: logObj.log } });
        auth.logger.log(logMsg);
        mock.verify();
      });

      it('logs to console by default', () => {
        const mock = sandbox.mock(console);
        const logMsg = 'unit-test-log-message';
        mock.expects('log').withExactArgs(logMsg).once().resolves();
        const auth = new Auth();
        auth.logger.log(logMsg);
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
        const mockAuthed = sandbox.mock(auth);
        mockAuthed.expects('getProfile').resolves(profile);
        return auth.refreshProfile(profile)
        .then(() => {
          mock.verify();
        });
      });

      it('does not fail when no hook provided', () => {
        const profile = { unitTestProfile: 'unit-test-profile' };
        const auth = new Auth();

        // return promise, to ensure it didn't fail
        return auth.refreshProfile(profile);
      });
    });

    describe('for token refresh', () => {
      it('invokes hook', () => {
        const hook = { tokenRefreshed() { } };
        const mock = sandbox.mock(hook);
        const authResult = { unitTestAuthResult: 'unit-test-auth-result' };
        mock.expects('tokenRefreshed').withExactArgs().once().resolves();
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
        const logoutHook = sandbox.stub();
        const removeLoginHook = sandbox.stub();
        const tokenExpiryManager = { cancelTokenRefresh() {} };
        const tokenExpiryManagerMock = sandbox.mock(tokenExpiryManager);
        tokenExpiryManagerMock.expects('cancelTokenRefresh').once();
        const windowInteractionMock = sandbox.mock(windowInteraction);
        windowInteractionMock.expects('updateWindow').once();

        const auth = new Auth({ hooks: { logout: logoutHook, removeLogin: removeLoginHook } });
        auth.tokenExpiryManager = tokenExpiryManager;
        auth.authResult = { testResult: 'unit-test-result' };

        auth.logout('redirectUri');
        expect(auth.getIdToken()).to.be.null;
        expect(logoutHook.calledOnce).to.be.true;
        expect(removeLoginHook.calledOnce).to.be.true;
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

        auth.logout('redirectUri');
        expect(auth.getIdToken()).to.be.null;
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
        expect(auth.getIdToken()).to.be.null;
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
        expect(auth.getIdToken()).to.be.null;
        tokenExpiryManagerMock.verify();
      });
    });
  });

  describe('ensureLoggedIn()', () => {
    const catchableError = 'catchable-unit-test-error';
    const testLoginInfo = { idToken: 'unit-test-id-token', sub: 'unit-test-sub' };
    const testProfile = { sub: testLoginInfo.sub };
    const redirectUri = 'http://unit-test-redirect';
    const testCases = [
      {
        name: 'follows login procedure with universal login',
        configuration: { enabledHostedLogin: true, redirectUri: redirectUri },
        setExpectations(objects) {
          objects.authMock.expects('getIdToken').once().resolves();
          objects.authMock.expects('renewAuth').once().rejects('error');
          objects.loggerMock.expects('log');
          objects.authMock.expects('universalAuth').withExactArgs(redirectUri, undefined).once().resolves(testProfile);
        }
      },
      {
        name: 'follows login procedure with universal login with login rejection',
        configuration: { enabledHostedLogin: true, redirectUri: redirectUri },
        setExpectations(objects) {
          objects.authMock.expects('renewAuth').once().rejects('error');
          objects.authMock.expects('universalAuth').withExactArgs(redirectUri, undefined).once().rejects(catchableError);
          objects.loggerMock.expects('log');
          objects.authMock.expects('removeLogin').withExactArgs().once();
        }
      },
      {
        name: 'follows login procedure without universal login',
        configuration: { enabledHostedLogin: false },
        setExpectations(objects) {
          objects.authMock.expects('renewAuth').once().resolves(testLoginInfo);
        }
      },
      {
        name: 'does not call universal login if it is disabled and the sso auth failed',
        configuration: { enabledHostedLogin: false },
        setExpectations(objects) {
          objects.authMock.expects('renewAuth').once().rejects(catchableError);
          objects.loggerMock.expects('log');
          objects.authMock.expects('removeLogin').once();
        }
      },
      {
        name: 'returns immediately if valid token is available',
        configuration: { enabledHostedLogin: false },
        setExpectations(objects) {
          objects.authMock.expects('getIdToken').once().resolves();
          objects.tokenExpiryManagerMock.expects('getRemainingMillisToTokenExpiry').once().returns(1000);
          objects.authMock.expects('renewAuth').never();
        }
      },
      {
        name: 'follows login procedure if valid token is available but forceTokenRefresh is set',
        configuration: { enabledHostedLogin: false, forceTokenRefresh: true },
        setExpectations(objects) {
          objects.authMock.expects('getIdToken').once().resolves();
          objects.authMock.expects('renewAuth').once().resolves(testLoginInfo);
        }
      }
    ];

    return testCases.map(testCase =>
      it(testCase.name, () => {
        const tokenExpiryManager = { getRemainingMillisToTokenExpiry() {} };
        const tokenExpiryManagerMock = sandbox.mock(tokenExpiryManager);
        const auth = new Auth({ hook: { log() {} } });
        auth.tokenExpiryManager = tokenExpiryManager;

        const auth0Client = { parseHash() {} };
        const auth0ClientMock = sandbox.mock(auth0Client);
        auth0ClientMock.expects('parseHash').once().callsFake((_, r) => r(null, {}));
        const auth0ClientProviderMock = sandbox.mock(Auth0ClientProvider.prototype);
        auth0ClientProviderMock.expects('getClient').once().returns(auth0Client);
        auth.auth0ClientProvider = new Auth0ClientProvider();
        const authMock = sandbox.mock(auth);

        const redirectHandler = { attemptRedirect() {} };
        const redirectHandlerMock = sandbox.mock(redirectHandler);
        redirectHandlerMock.expects('attemptRedirect').once();
        auth.redirectHandler = redirectHandler;

        const errorHandler = { tryCaptureError() {}, getCapturedError() {} };
        const errorHandlerMock = sandbox.mock(errorHandler);
        errorHandlerMock.expects('tryCaptureError').once();
        errorHandlerMock.expects('getCapturedError').once();
        auth.errorHandler = errorHandler;

        const logger = { log() {} };
        auth.logger = logger;
        let loggerMock = sandbox.mock(logger);

        testCase.setExpectations(
          { auth, authMock, tokenExpiryManagerMock, loggerMock }
        );

        return auth.ensureLoggedIn(testCase.configuration)
        .then(() => {
          authMock.verify();
          tokenExpiryManagerMock.verify();
        })
        .catch(e => {
          if (e.name !== catchableError) {
            throw e;
          }
        });
      }));
  });
});
