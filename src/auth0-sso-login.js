import { WebAuth, Management } from 'auth0-js';
import jwtManager from 'jsonwebtoken';
import windowInteraction from './window-interaction';
import auth0LockFactory from './auth0-lock-factory';
import TokenExpiryManager from './token-expiry-manager';

// authentication class
export default class auth {
  /**
   * @constructor constructs the object with a given configuration
   * @param {Object} config
   */
  constructor(config) {
    this.config = config || {};
    this.authResult = null;
    this.tokenExpiryManager = new TokenExpiryManager();
    this.renewAuthSequencePromise = Promise.resolve();
  }

  /**
   * @description logs the message to the console, or to a provided hook
   * @param message to log
   * @return {*|void}
   */
  log(message) {
    const logFunc = (this.config.hooks ? this.config.hooks.log : undefined) || console.log;
    return logFunc(message);
  }

  /**
   * @description update the detailed profile with a call to the Auth0 Management API
   * @param idToken the jwt for a user
   * @return {Promise<any>} resolved promise with user profile; rejected promise with error
   */
  refreshProfile() {
    return this.getProfile()
    .then(profile => {
      this.profileRefreshed(profile);
    }, error => {
      this.log({ title: 'Error while retrieving user information after successful Auth0Lock authentication', error: error });
    });
  }

  /**
   * @description Get the latest available profile
   * @return {null|Object} profile if the user was already logged in; null otherwise
   */
  getProfile() {
    let idToken = this.authResult.idToken;
    let jwt = jwtManager.decode(idToken);

    const managementClient = new Management({
      domain: this.config.domain,
      token: idToken
    });
    return new Promise((resolve, reject) => {
      managementClient.getUser(jwt.sub, (error, profile) => {
        return error ? reject(error) : resolve(profile);
      });
    });
  }

  /**
   * @description Get the latest available idToken
   * @return {null|Object} idToken if the user was already logged in; null otherwise
   */
  getIdToken() {
    return this.authResult && this.authResult.accessToken;
  }

  /**
   * @description calls a hook once the profile got refreshed
   * @param profile user profile retrieved from auth0 manager
   * @return {*}
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
   * @return {*}
   */
  tokenRefreshed(authResult) {
    this.authResult = authResult;
    this.tokenExpiryManager.scheduleTokenRefresh(authResult,
      () => this.ensureLoggedIn({ enableLockWidget: true, forceTokenRefresh: true }));

    if (this.config.hooks && this.config.hooks.tokenRefreshed) {
      return this.config.hooks.tokenRefreshed();
    }
    return Promise.resolve();
  }

  /**
   * Calls a hook once the login should be removed
   * @return {*}
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
   */
  logout() {
    this.tokenExpiryManager.cancelTokenRefresh();
    this.authResult = null;

    if (this.config) {
      if (this.config.hooks && this.config.hooks.removeLogin) {
        this.config.hooks.removeLogin();
      }
      if (this.config.hooks && this.config.hooks.logout) {
        this.config.hooks.logout();
      }
      const redirectUri = encodeURIComponent(this.config.logoutRedirectUri);
      windowInteraction.updateWindow(`https://${this.config.domain}/v2/logout?returnTo=${redirectUri}&client_id=${this.config.clientId}`);
    }
  }

  /**
   * @description Ensure user is logged in:
   * 1. Check if there is an existing, valid token.
   * 2. Try logging in using an existing SSO session.
   * 3. If auth0 lock widget is not explicitly disabled, try logging in using auth0 lock.
   *
   * @param {Object}     configuration object
   * @param {Boolean}    configuration.enableLockWidget whether auth0 lock should open when SSO
   *                     session is invalid; default = true
   * @param {Boolean}    configuration.forceTokenRefresh if token should be refreshed even if it may
   *                     be still valid; default = false
   * @return {Promise<>} empty resolved promise after successful login; rejected promise with error
   *                     otherwise
   */
  ensureLoggedIn(configuration = { enableLockWidget: true, forceTokenRefresh: false }) {
    // if there is still a valid token, there is no need to initiate the login process
    const latestAuthResult = this.getIdToken();
    if (!configuration.forceTokenRefresh && latestAuthResult &&
      this.tokenExpiryManager.getRemainingMillisToTokenExpiry() > 0) {
      return Promise.resolve();
    }

    const authPromise = this.renewAuthSequencePromise
      .then(() => this.renewAuth())
      .catch((e) => {
        // if auth0 lock is not enabled, error out
        if (!configuration.enableLockWidget) {
          return Promise.reject(e);
        }

        this.log({ title: 'Renew authorization did not succeed, falling back to login widget', error: e });
        return this.lockAuth();
      })
      .catch((err) => {
        this.removeLogin();
        throw err;
      });

    this.renewAuthSequencePromise = authPromise.catch(() => { /* ignore since renewAuthSequcne may never be a rejected promise to have successful continuations */ });

    return authPromise;
  }


  /**
   * @description uses the auth0 lock to login
   * @return {Promise<any>}
   */
  lockAuth() {
    let options = {
      auth: {
        sso: true,
        audience: this.config.audience,
        responseType: 'id_token token',
        params: {
          scope: 'openid profile email'
        },
        redirect: false,
      },
      closable: false,
    };
    if (this.config.auth0LockOptions) {
      options = Object.assign(options, this.config.auth0LockOptions);
    }

    const lock = auth0LockFactory.createAuth0Lock(this.config.clientId, this.config.domain, options);
    return new Promise((resolve, reject) => {
      lock.on('authenticated', authResult => {
        resolve(authResult);
      });

      lock.on('authorization_error', (error) => {
        this.log({ title: 'Auth0Lock Widget Error', error: error });
        reject(error);
      });

      lock.show();
    })
    .then(authResult => {
      this.authResult = authResult;
      return this.refreshProfile()
      .catch(() => {})
      .then(() => {
        // On successful login hide the lock widget no matter what
        lock.hide();
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
            this.log({ title: 'Failed to fire "Token Refreshed" event', error: error });
          })
          .finally(() => {
            resolve();
          });
        } else {
          return reject({ error: 'no_token_available', errorDescription: 'Failed to get valid token.', authResultError: authResult ? authResult.error : undefined });
        }
      });
    })
    .catch((error) => {
      this.log({ title: 'Failed to update ID token on retry', retry: retries, error: error });
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
