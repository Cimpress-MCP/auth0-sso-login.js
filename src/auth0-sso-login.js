import auth0 from 'auth0-js';
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
   * @description gets the detailed profile with a call to the Auth0 Management API
   * @param idToken
   * @param sub
   * @return {Promise<any>} resolved promise with user profile; rejected promise with error
   */
  getDetailedProfile(idToken, sub) {
    return new Promise((resolve, reject) => {
      const auth0Manager = new auth0.Management({
        domain: this.config.domain,
        token: idToken,
      });
      auth0Manager.getUser(sub, (error, profile) => {
        if (error) {
          reject(error);
        } else {
          resolve(profile);
        }
      });
    });
  }

  /**
   * @description the latest authorization result with access token
   * @return {null|Object} authResult if the user was already logged in; null otherwise
   */
  getLatestAuthResult() {
    return this.authResult;
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
      return this.config.hooks.tokenRefreshed(authResult);
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
    const latestAuthResult = this.getLatestAuthResult();
    if (!configuration.forceTokenRefresh && latestAuthResult &&
      this.tokenExpiryManager.getRemainingMillisToTokenExpiry() > 0) {
      return Promise.resolve();
    }

    let options = {
      auth: {
        params: {
          responseType: 'id_token token',
        },
        redirect: false,
      },
      closable: false,
    };
    if (this.config.auth0LockOptions) {
      options = Object.assign(options, this.config.auth0LockOptions);
    }

    // The 1000ms here is guarantee that the websocket is finished loading
    return this.renewAuth()
      .catch((e) => {
        this.removeLogin();
        // if auth0 lock is not enabled, error out
        if (!configuration.enableLockWidget) {
          return Promise.reject(e);
        }
        this.log('Renew authorization did not succeed, falling back to login widget', e);
        return new Promise((resolve, reject) => {
          const lock = auth0LockFactory.createAuth0Lock(this.config.clientId, this.config.domain,
            options);
          lock.on('authenticated', (authResult) => {
            this.renewAuth()
              .then(() => {
                lock.getUserInfo(authResult.accessToken, (error, profile) => {
                  lock.hide();
                  if (error) {
                    this.log(error);
                    reject(error);
                  } else {
                    resolve({
                      idToken: authResult.idToken,
                      sub: profile.sub,
                    });
                  }
                });
              });
          });

          lock.on('authorization_error', (error) => {
            this.log(error);
            reject(error);
          });

          lock.show();
        });
      })
      .then(loginInfo => this.getDetailedProfile(loginInfo.idToken, loginInfo.sub))
      .then(profile => this.profileRefreshed(profile));
  }

  /**
   * @description renews the authentication
   * @param {Number} retries current retry attempt number
   * @return {Promise<any>}
   */
  renewAuth(retries = 0) {
    const webAuth = new auth0.WebAuth({
      domain: this.config.domain,
      clientID: this.config.clientId,
    });
    const renewOptions = {
      redirectUri: this.config.loginRedirectUri,
      usePostMessage: true,
      audience: this.config.audience,
      responseType: 'id_token token',
      postMessageOrigin: window.location.origin ||
          `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}`,
    };

    return new Promise((resolve, reject) => {
      webAuth.renewAuth(renewOptions, (err, authResult) => {
        if (err) {
          this.log(`Failed to update ID token on retry ${retries}: ${JSON.stringify(err)}`);
          reject(err);
          return;
        }
        if (authResult && authResult.accessToken && authResult.idToken) {
          this.tokenRefreshed(authResult)
            .then(() => {
              resolve({
                idToken: authResult.idToken,
                sub: authResult.idTokenPayload.sub,
              });
            });
        } else {
          reject({ error: 'no_token_available', errorDescription: 'Failed to get valid token.', authResultError: authResult ? authResult.error : undefined });
        }
      });
    })
      .catch((error) => {
        if (retries < 4 && error.authResultError === undefined) {
          return new Promise(resolve => setTimeout(() => resolve(), 1000))
            .then(() => this.renewAuth(retries + 1));
        }
        throw error;
      });
  }
}
