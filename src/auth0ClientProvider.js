import { WebAuth, Management } from 'auth0-js';

export default class Auth0ClientProvider {
  /**
   * @constructor the auth0Manager
   * @param {Object} config
   */
  constructor(config) {
    this.config = config;
    this.webAuth = null;
    this.managementClient = null;
  }

  /**
   * @description Get the Auth0 client
   * @return {*|void}
   */
  getClient() {
    return this.webAuth || (this.webAuth = new WebAuth({
      domain: this.config.domain,
      clientID: this.config.clientId,
      scope: 'openid profile email'
    }));
  }

  getManagementClient(auth0AccessToken) {
    return this.managementClient || (this.managementClient = new Management({
      domain: this.config.domain,
      token: auth0AccessToken
    }));
  }
}
