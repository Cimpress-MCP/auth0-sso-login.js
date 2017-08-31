const Auth0Lock = require('auth0-lock').default;
const auth0 = require('auth0-js');

const auth = function (config) {
  this.config = config || {};
};

auth.prototype.configure = function (config) {
  this.config = config || {};
};

auth.prototype.log = function (message) {
  const logFunc = (this.config.hooks ? this.config.hooks.log : undefined) || console.log;
  return logFunc(message);
};

auth.prototype.getDetailedProfile = function (idToken, sub) {
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
};

auth.prototype.profileRefreshed = function (profile) {
  if (this.config.hooks && this.config.hooks.profileRefreshed) {
    return this.config.hooks.profileRefreshed(profile);
  }
  return Promise.resolve();
};

auth.prototype.tokenRefreshed = function (authResult) {
  if (this.config.hooks && this.config.hooks.tokenRefreshed) {
    return this.config.hooks.tokenRefreshed(authResult);
  }
  return Promise.resolve();
};

auth.prototype.removeLogin = function () {
  if (this.config.hooks && this.config.hooks.removeLogin) {
    return this.config.hooks.removeLogin();
  }
  return Promise.resolve();
};

auth.prototype.logout = function () {
  if (this.config) {
    if (this.config.hooks && this.config.hooks.logout) {
      this.config.hooks.logout();
    }
    const redirectUri = encodeURIComponent(this.config.logoutRedirectUri);
    this.updateWindow(`https://${this.config.domain}/v2/logout?returnTo=${redirectUri}&client_id=${this.config.clientId}`);
  }
};

auth.prototype.updateWindow = function (url) {
  window.location = url;
};

auth.prototype.ensureLoggedIn = function () {
  let options = {
    auth: {
      params: {
        audience: this.config.audience,
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
  return new Promise(resolve => setTimeout(() => resolve(), 1000))
    .then(() => this.renewAuth())
    .catch((e) => {
      this.log('Renew authorization did not succeed, falling back to login widget', e);
      return new Promise((resolve, reject) => {
        const lock = new Auth0Lock(this.config.clientId, this.config.domain, options);
        lock.on('authenticated', (authResult) => {
          this.tokenRefreshed(authResult);
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

        lock.on('authorization_error', (error) => {
          this.log(error);
          reject(error);
        });

        lock.show();
      });
    })
    .then(loginInfo => this.getDetailedProfile(loginInfo.idToken, loginInfo.sub))
    .then(profile => this.profileRefreshed(profile));
};

auth.prototype.stayLoggedIn = function () {
  const hour = 1000 * 60 * 60;
  setInterval(() => this.ensureLoggedIn(), hour);
};

auth.prototype.renewAuth = function (retries = 0) {
  const webAuth = new auth0.WebAuth({
    domain: this.config.domain,
    clientID: this.config.clientId,
  });
  const renewOptions = {
    redirectUri: this.config.loginRedirectUri,
    usePostMessage: true,
    audience: this.config.audience,
    responseType: 'id_token token',
  };

  return new Promise((resolve, reject) => {
    webAuth.renewAuth(renewOptions, (err, authResult) => {
      if (err) {
        this.log(`Failed to update ID token on retry ${retries}: ${JSON.stringify(err)}`);
        if (err.error === 'login_required') {
          this.removeLogin();
        }
        reject(err);
        return;
      }
      if (authResult.accessToken && authResult.idToken) {
        this.tokenRefreshed(authResult);
        resolve({
          idToken: authResult.idToken,
          sub: authResult.idTokenPayload.sub,
        });
      } else {
        reject({ error: 'no_token_available', errorDescription: 'Failed to get valid token.', authResultError: authResult.error });
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
};

module.exports = auth;
