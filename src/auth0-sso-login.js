import { WebAuth, Management } from 'auth0-js';
import jwtManager from 'jsonwebtoken';
import windowInteraction from './window-interaction';
import TokenExpiryManager from './token-expiry-manager';
import RedirectHandler from './redirectHandler';
import Logger from './logger';

// authentication class
export default class auth {
  /**
   * @constructor constructs the object with a given configuration
   * @param {Object} config
   */
  constructor(config) {
    this.config = config || {};
    this.authResult = null;
    let logger = new Logger(config);
    this.logger = logger;
    this.tokenExpiryManager = new TokenExpiryManager();
    this.redirectHandler = new RedirectHandler(logger);
    this.renewAuthSequencePromise = Promise.resolve();
  }

  /**
   * @description update the detailed profile with a call to the Auth0 Management API
   * @return {Promise<any>} resolved promise with user profile; rejected promise with error
   */
  refreshProfile() {
    return this.getProfile()
    .then(profile => {
      this.profileRefreshed(profile);
    }, error => {
      this.logger.log({ title: 'Error while retrieving user information after successful authentication', error: error });
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
        throw { title: 'Current idToken or auth0AccessToken is not available.' };
      }

      const managementClient = new Management({
        domain: this.config.domain,
        token: auth0AccessToken
      });
      return new Promise((resolve, reject) => {
        managementClient.getUser(jwt.sub, (error, profile) => {
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
      return idToken && jwtManager.decode(idToken).exp > Math.floor(Date.now() / 1000) ? idToken : null;
    } catch (e) {
      this.logger.log({ title: 'JWTTokenException', invalidToken: idToken, error: e });
      return null;
    }
  }

  /**
   * @description calls a hook once the profile got refreshed
   * @param profile user profile retrieved from auth0 manager
   * @return {Promise<>}
   */
  profileRefreshed(profile) {
    if (this.config.hooks && this.config.hooks.profileRefreshed) {
      return this.config.hooks.profileRefreshed(profile);
    }
    return Promise.resolve();
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
   * @return {Promise<>} empty resolved promise after successful login; rejected promise with error
   *                     otherwise
   */
  ensureLoggedIn(configuration = { enabledHostedLogin: true, forceTokenRefresh: false }) {
    // if there is still a valid token, there is no need to initiate the login process
    const latestAuthResult = this.getIdToken();
    if (!configuration.forceTokenRefresh && latestAuthResult &&
      this.tokenExpiryManager.getRemainingMillisToTokenExpiry() > 0) {
      return Promise.resolve();
    }

    this.redirectHandler.attemptRedirect();

    const authPromise = this.renewAuthSequencePromise
      .then(() => this.renewAuth())
      .catch((e) => {
        // if universal login is not enabled, error out
        if (!configuration.enabledHostedLogin) {
          return Promise.reject(e);
        }

        this.logger.log({ title: 'Renew authorization did not succeed, falling back to Auth0 universal login.', error: e });
        return this.universalAuth(configuration.redirectUri);
      })
      .then(() => {
        this.clearOldNonces();
      })
      .catch((err) => {
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
        if(!key.startsWith('com.auth0.auth')) {
          return;
        }
        localStorage.removeItem(key);
      });
    } catch (erorr) {}
  }

  /**
   * @description uses the hosted login page to login
   * @param redirectUri urlt to return to otherwise `window.location.href` will be used.
   * @return {Promise<any>}
   */
  universalAuth(redirectUri) {
    this.redirectHandler.setRedirect(redirectUri || window.location.href);
    const webAuth = new WebAuth({
      domain: this.config.domain,
      clientID: this.config.clientId,
      scope: 'openid profile email'
    });

    const options = {
      redirectUri: window.location.origin || `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}`,
      audience: this.config.audience,
      responseType: 'code',
      responseMode: 'query'
    };

    return new Promise((resolve, reject) => {
      this.logger.log({ title: 'Redirecting to login page and waiting for result.' });
      webAuth.authorize(options, (error, authResult) => {
        if (error) {
          this.logger.log({ title: 'Redirect to login page failed.', error: error });
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
    const webAuth = new WebAuth({
      domain: this.config.domain,
      clientID: this.config.clientId,
      scope: 'openid profile email'
    });
    const renewOptions = {
      redirectUri: window.location.origin || `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}`,
      audience: this.config.audience,
      responseType: 'id_token token'
    };

    return new Promise((resolve, reject) => {
      webAuth.checkSession(renewOptions, (err, authResult) => {
        if (err) {
          return reject(err);
        }
        if (authResult && authResult.accessToken && authResult.idToken) {
          this.authResult = authResult;
          return this.refreshProfile()
          .then(() => this.tokenRefreshed(authResult))
          .catch(error => {
            this.logger.log({ title: 'Failed to fire "Token Refreshed" event', error: error });
          })
          .then(() => {
            resolve();
          });
        } else {
          return reject({ error: 'no_token_available', errorDescription: 'Failed to get valid token.', authResultError: authResult ? authResult.error : undefined });
        }
      });
    })
    .catch((error) => {
      this.logger.log({ title: 'Failed to update ID token on retry', retry: retries, error: error });
      let fatalErrors = {
        'consent_required': true,
        'login_required': true
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
