import jwtManager from 'jsonwebtoken';

import windowInteraction from './window-interaction';
import TokenExpiryManager from './token-expiry-manager';
import RedirectHandler from './redirectHandler';
import Logger from './logger';
import Auth0ClientProvider from './auth0ClientProvider';

// authentication class
export default class auth {
  /**
   * @constructor constructs the object with a given configuration
   * @param {Object} config
   * @param {string} config.clientId the auth0 client ID to be used - see https://auth0.com/docs/api-auth/tutorials/client-credentials
   * @param {string} config.domain the auth0 domain to login - see https://auth0.com/docs/api-auth/tutorials/client-credentials
   * @param {string} config.audience the auth0 audience - see https://auth0.com/docs/api-auth/tutorials/client-credentials
   * @param {string} [config.timeout=5000] timeout in milliseconds attempting to call auth0 - this can fail when the auth0 domain is blocked
   * @param {string} [config.logoutRedirectUri=${window.location.origin}/#/logout] the logout URL, which should be accessible by a non-authenticated user, default is `window.location.href`
   * @param {string} [config.applicationRoot=/] the application root, by default the redirect from universal lock will redirect here before replacing history with the specified redirect.
   * @param {string} [config.explicitConnection] specify an explicit connection to use, which allows bypassing the lock widget
   * @param {Object} hooks hooks to get callback calls into the login/logout workflow
   * @param {Function} config.logout (redirectUri) before the redirect to the redirectUri happens (with fallback to logoutRedirectUri and then to window.location.href)
   * @param {Function} config.profileRefreshed (profile) the profile was retrieved, this is an option to store the profile, or update the user interface
   * @param {Function} config.tokenRefreshed the auth token was retrieved, this is an option to store the token for later use
   * @param {Function} config.removeLogin called before logout or when there's a problem with the current user, for example an invalid token
   * @param {Function} config.log (messageObject) allows to override log messages; defaults to log to the console
   */
  constructor(config) {
    this.config = config || {};
    this.authResult = null;
    let logger = new Logger(config);
    this.logger = logger;
    this.tokenExpiryManager = new TokenExpiryManager();
    this.redirectHandler = new RedirectHandler(logger);
    this.renewAuthSequencePromise = Promise.resolve();
    this.auth0ClientProvider = new Auth0ClientProvider(config);
  }

  /**
   * @description update the detailed profile with a call to the Auth0 Management API
   * @return {Promise<any>} resolved promise with user profile; rejected promise with error
   */
  refreshProfile() {
    // If there is no hook defined preemptively looking up the profile doesn't do any good.
    if (!this.config.hooks || !this.config.hooks.profileRefreshed) {
      return Promise.resolve();
    }
    return this.getProfile()
    .then(profile => {
      this.config.hooks.profileRefreshed(profile);
    }, error => {
      this.logger.log({ title: 'Error while retrieving user information after successful authentication', errorCode: 'ProfileError', error: error });
    });
  }

  /**
   * @description Get the latest available profile
   * @return {null|Object} profile if the user was already logged in; null otherwise
   */
  getProfile() {
    return Promise.resolve()
    .then(() => {
      let idToken = this.getIdToken();
      let jwt = jwtManager.decode(idToken);
      let auth0AccessToken = this.authResult && this.authResult.idToken;
      if (!jwt || !jwt.sub || !auth0AccessToken) {
        throw Error('Current idToken or auth0AccessToken is not available.');
      }

      return new Promise((resolve, reject) => {
        this.auth0ClientProvider.getManagementClient(auth0AccessToken).getUser(jwt.sub, (error, profile) => {
          return error ? reject({ title: 'Failed to get profile', error: error }) : resolve(profile);
        });
      });
    });
  }

  /**
   * @description Get the latest available idToken
   * @return {null|String} idToken if the user was already logged in; null otherwise
   */
  getIdToken() {
    let idToken = this.authResult && this.authResult.accessToken;
    try {
      let validToken = idToken && jwtManager.decode(idToken).exp > Math.floor(Date.now() / 1000) ? idToken : null;
      if (validToken) {
        this.tokenExpiryManager.createSession();
      }
      return validToken;
    } catch (e) {
      this.logger.log({ title: 'JWTTokenException', errorCode: 'JWTTokenException', invalidToken: idToken, error: e });
      return null;
    }
  }

  /**
   * @description Calls a hook once the token got refreshed
   * @param authResult authorization result returned by auth0
   * @return {Promise<>}
   */
  tokenRefreshed(authResult) {
    this.authResult = authResult;
    this.tokenExpiryManager.scheduleTokenRefresh(authResult,
      () => this.ensureLoggedIn({ enabledHostedLogin: true, forceTokenRefresh: true }));

    if (this.config.hooks && this.config.hooks.tokenRefreshed) {
      return this.config.hooks.tokenRefreshed();
    }
    return Promise.resolve();
  }

  /**
   * Calls a hook once the login should be removed
   * @return {Promise<>}
   */
  removeLogin() {
    this.tokenExpiryManager.cancelTokenRefresh();
    this.authResult = null;

    if (this.config.hooks && this.config.hooks.removeLogin) {
      return this.config.hooks.removeLogin();
    }
    return Promise.resolve();
  }

  /**
   * @description Calls a hook to removeLogin and logout the user, and then interacts with Auth0 to
   * actually log the user out.
   * @param redirectUriOverride Override redirect location after logout.
   */
  logout(redirectUriOverride) {
    this.tokenExpiryManager.cancelTokenRefresh();
    this.authResult = null;

    if (this.config) {
      if (this.config.hooks && this.config.hooks.removeLogin) {
        this.config.hooks.removeLogin();
      }
      if (this.config.hooks && this.config.hooks.logout) {
        this.config.hooks.logout();
      }
      const redirectUri = encodeURIComponent(redirectUriOverride || this.config.logoutRedirectUri || window.location.href);
      windowInteraction.updateWindow(`https://${this.config.domain}/v2/logout?returnTo=${redirectUri}&client_id=${this.config.clientId}`);
    }
  }

  /**
   * @description Ensure user is logged in:
   * 1. Check if there is an existing, valid token.
   * 2. Try logging in using an existing SSO session.
   * 3. If universal login is not explicitly disabled, try logging in via the hosted login
   *
   * @param {Object}     configuration object
   * @param {Boolean}    configuration.enabledHostedLogin whether the universal login should open when SSO
   *                     session is invalid; default = true
   * @param {Boolean}    configuration.forceTokenRefresh if token should be refreshed even if it may
   *                     be still valid; default = false
   * @param {String}     configuration.redirectUri Override redirect location after universal login.
   * @param {String}     configuration.explicitConnection Override specified connection for universal login.
   * @param {Boolean}    configuration.requireValidSession Require that a valid token was retrieved once before, if not returns immediately, no token will be created.
   *                     Token validation will still be required.
   * @return {Promise<Object>} optional redirectUri on successful login if a redirect needs to still happen; otherwise rejected promise with error
   */
  async ensureLoggedIn(configuration = { enabledHostedLogin: true, forceTokenRefresh: false, requireValidSession: false }) {
    // if there is still a valid token, there is no need to initiate the login process
    const latestAuthResult = this.getIdToken();
    if (!configuration.forceTokenRefresh && latestAuthResult && this.tokenExpiryManager.getRemainingMillisToTokenExpiry() > 0) {
      return Promise.resolve();
    }

    // When a valid session is required and a token is requested and there is no session, fail silently.
    // This should be silent because it is the expectation that a valid token will be checked subsequently.
    if (configuration.requireValidSession && !this.tokenExpiryManager.authorizationSessionExists()) {
      return Promise.resolve();
    }

    let redirectFromAuth0Result;
    try {
      redirectFromAuth0Result = await new Promise((resolve, reject) =>
        this.auth0ClientProvider.getClient().parseHash({}, (error, authResult) => error ? reject(error) : resolve(authResult)));
    } catch (auth0Error) {
      let errorCode = auth0Error.error;
      if (auth0Error.error === 'access_denied' && auth0Error.errorDescription === 'Please verify your email before logging in.') {
        errorCode = 'UnverifiedEmail';
      }
      this.logger.log({ title: 'Login error found', level: 'WARN', url: window.location.href, error: auth0Error, errorCode, description: auth0Error.errorDescription });

      // In the case of an invalid token, skip throwing the error here and fallback to fetching a valid token directly from Auth0. This can happen if state or nonce was attempted to be hijacked.
      // Instead of telling the user or forcing them to login again manually, defeat the CSRF or replay-attack by automatically authing with Auth0 directly. This will happen in `renewAuth`.
      if (auth0Error.error !== 'invalid_token') {
        const updatedError = { details: auth0Error.errorDescription, errorCode };
        throw updatedError;
      }
    }
    let containsToken = redirectFromAuth0Result && redirectFromAuth0Result.idToken && redirectFromAuth0Result.accessToken;
    if (containsToken) {
      this.authResult = redirectFromAuth0Result;
      try {
        await this.refreshProfile();
        await this.tokenRefreshed(this.authResult);
      } catch (error) {
        this.logger.log({ title: 'Failed to fire "Token Refreshed" event', errorCode: 'TokenRefreshFailed', error: error });
      }

      let redirectUri = this.redirectHandler.attemptRedirect();
      return { redirectUri };
    }

    const authPromise = this.renewAuthSequencePromise
    .then(() => this.renewAuth())
    .catch(e => {
      // if universal login is not enabled, error out
      if (!configuration.enabledHostedLogin) {
        throw e;
      }

      this.logger.log({ title: 'Renew authorization did not succeed, falling back to Auth0 universal login.', errorCode: 'RenewAuthorizationFailure', error: e });
      return this.universalAuth(configuration.redirectUri, configuration.explicitConnection);
    })
    .then(() => {
      this.clearOldNonces();
    })
    .catch(err => {
      this.removeLogin();
      throw err;
    });

    this.renewAuthSequencePromise = authPromise.catch(() => { /* ignore since renewAuthSequcne may never be a rejected promise to have successful continuations */ });

    return authPromise;
  }

  /** unfortunate, but localStorage can fill up if this isn't called.
   * should only be called after successful authentication has completed to avoid
   * removing in process nonces
   * https://github.com/auth0/auth0.js/issues/402
   * @description Cleanup old auth0 localstorage
   */
  clearOldNonces() {
    try {
      Object.keys(localStorage).forEach(key => {
        if (!key.startsWith('com.auth0.auth')) {
          return;
        }
        localStorage.removeItem(key);
      });
    } catch (erorr) { /* */ }
  }

  /**
   * @description uses the hosted login page to login
   * @param redirectUri url to return to otherwise `window.location.href` will be used.
   * @param explicitConnection connection to force using for the universal login, will bypass showing auth0 lock widget.
   * @return {Promise<any>}
   */
  universalAuth(redirectUri, explicitConnection) {
    this.redirectHandler.setRedirect(redirectUri || window.location.href);
    const redirectUriRoot = window.location.origin || `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}`;
    const options = {
      redirectUri: `${redirectUriRoot}${this.config.applicationRoot || ''}`,
      audience: this.config.audience,
      responseType: 'id_token token',
      connection: explicitConnection || this.config.explicitConnection,
      prompt: (explicitConnection || this.config.explicitConnection) ? 'select_account' : 'none'
    };

    return new Promise((resolve, reject) => {
      this.logger.log({ title: 'Redirecting to login page and waiting for result.' });
      this.auth0ClientProvider.getClient().authorize(options, (error, authResult) => {
        if (error) {
          this.logger.log({ title: 'Redirect to login page failed.', errorCode: 'RedirectFailed', error: error });
          return reject(error);
        }
        return resolve(authResult);
      });
    });
  }

  /**
   * @description renews the authentication
   * @param {Number} retries current retry attempt number
   * @return {Promise<any>}
   */
  renewAuth(retries = 0) {
    const redirectUriRoot = window.location.origin || `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}`;
    const renewOptions = {
      redirectUri: `${redirectUriRoot}${this.config.applicationRoot || ''}`,
      audience: this.config.audience,
      responseType: 'id_token token',
      timeout: this.config.timeout || 5000
    };

    return new Promise((resolve, reject) => {
      this.auth0ClientProvider.getClient().checkSession(renewOptions, (err, authResult) => {
        if (err) {
          return reject(err);
        }
        if (authResult && authResult.accessToken && authResult.idToken) {
          this.authResult = authResult;
          return this.refreshProfile()
          .then(() => this.tokenRefreshed(authResult))
          .catch(error => {
            this.logger.log({ title: 'Failed to fire "Token Refreshed" event', errorCode: 'TokenRefreshFailed', error: error });
          })
          .then(() => {
            resolve();
          });
        }
        return reject({ error: 'no_token_available', errorDescription: 'Failed to get valid token.', authResultError: authResult ? authResult.error : undefined });
      });
    })
    .catch(error => {
      this.logger.log({ title: 'Failed to update ID token on retry', errorCode: 'IdTokenUpdateFailed', retry: retries, error: error });
      let fatalErrors = {
        consent_required: true,
        login_required: true
      };
      if (fatalErrors[error.error]) {
        throw error;
      }

      if (retries < 4 && error.authResultError === undefined) {
        return new Promise(resolve => setTimeout(() => resolve(), 1000))
        .then(() => this.renewAuth(retries + 1));
      }
      throw error;
    });
  }
}
