import Auth0Lock from 'auth0-lock';

// static class making unit testing possible
export default class auth0LockFactory {
  static createAuth0Lock(clientId, domain, options) {
    return new Auth0Lock(clientId, domain, options);
  }
}
