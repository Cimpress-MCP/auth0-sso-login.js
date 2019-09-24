# Auth0 SSO Login

[![Build Status](https://travis-ci.org/Cimpress-MCP/auth0-sso-login.js.svg?branch=master)](https://travis-ci.org/Cimpress-MCP/auth0-sso-login.js)
[![npm version](https://badge.fury.io/js/auth0-sso-login.svg)](https://www.npmjs.com/package/auth0-sso-login)

The Auth0 SSO Login provides an easy to use library for single-sign on web pages that are leveraging [Auth0](https://auth0.com/).

## Using this library

### Setup the Auth0 Client configuration.
Select the following options:
* Main settings:
  * Client Type: `Single Page Application`
  * Allowed Callback URLs: `http://localhost:PORT,https://*.root.domain`
  * Allowed Web Origins: `http://localhost:PORT,https://example.root.domain,https://tst-example.root.domain`
  * Allowed Logout URLS: `http://localhost:PORT/#/logout,https://*.root.domain/#/logout`
  * Allowed Origins (CORS): `http://localhost:PORT,https://*.root.domain`
* Advanced Settings:
  * OAuth: `RS256` and OIDC: `on`
  * Grant Types: `Implicit, Authorization Code, Password / Password Realm`

### Install the library.

```bash
npm install auth0-sso-login
```

Use the library.

```javascript
// import library
import Auth from 'auth0-sso-login';

// create an instance of Auth
let config = { /* ... */ };
let auth = new Auth(config);
let defaultConfiguration = {
  enabledHostedLogin: true,  // if Auth0's SSO fails, use the hosted login screen
  forceTokenRefresh: false // force refresh even if there is a valid token available
  redirectUri: window.location.href, // specify an override
  explicitConnection: null // specify an explicit connection to use for this instance of calling ensureLoggedIn, will override the global configuration value
};
// Logs the user in and returns a promise, when succeeded, the user is logged in
// and a valid JWT was provided (via tokenRefreshed hook).
// Schedules automatic background renewal of JWT based on its expiry time.
// (it will be refresh in the 2/3 of the current token lifetime)
try {
  let result = await auth.ensureLoggedIn(defaultConfiguration)
  console.log('user is logged in, if a previous redirect was saved direct the user to the redirect location');
  // The redirect saved in the configuration passed in will not be correct, as it was generated in "this" session instead of the session which created the correct redirect.
  if (result.redirectUri) {
    window.location.replace(result.redirectUri);
  }
} catch (error) {
    console.error('an unexpected error occurred while logging in');
    // perform application specific steps to handle this situation
    // this should happen only rarely, since the user will either
    // be logged in automatically through Auth0's SSO feature, or
    // the Universal Hosted Login page, and only succeed after the
    // user successfully logged in.  In the case of the redirect,
    // the redirectUri will be loaded
});
```

After the login process, the token is retrieved via `tokenRefreshed` hook, described in the
configuration options bellow. The library also exposes its latest idToken result, which may or
may not be set (depends on the success/failure of login process). This method can be used as
a token provider for HTTP clients.
```javascript
let idToken = auth.getIdToken();
``` 

The profile is exposed as well, as a promise.
```javascript
let profilePromise = auth.getProfile();
```
Several configuration options and hooks are provided to interact with the library.

```javascript
let config = {
  // the auth0 client ID to be used - see https://auth0.com/docs/api-auth/tutorials/client-credentials
  clientId: 'specify the auth0 client ID',

  // the auth0 domain to login - see https://auth0.com/docs/api-auth/tutorials/client-credentials
  domain: 'specify the auth0 domain, usually something like <youraccount>.auth0.com',

  // the auth0 audience - see https://auth0.com/docs/api-auth/tutorials/client-credentials
  audience: 'specify the auth0 audience, as agreed for the set of applications with the same audience',

  // the logout URL, which should be accessible by a non-authenticated user, default is `window.location.href`
  logoutRedirectUri: `${window.location.origin}/#/logout`,

  // specify an explicit connection to use, which allows bypassing the lock widget
  explicitConnection: null,

  // hooks to get callback calls into the login/logout workflow
  hooks: {
    // before the redirect to the redirectUri happens (with fallback to logoutRedirectUri and then to window.location.href)
    // if the user information is stored in a backend store, it's best to clean that before the redirect happens
    logout(redirectUri) {
      // implement what should happen at logout
      // a typical use case is to remove the auth token from your storage (memory, cookie, local store), or perform other cleanup tasks
    },
    // the profile was retrieved, this is an option to store the profile, or update the user interface
    profileRefreshed(profile) {
      // once the profile is refreshed, which includes the auth0 sub and other meta data
      // a typical use case is to show the username on screen
      // or use getProfile()
    },
    // the auth token was retrieved, this is an option to store the token for later use
    tokenRefreshed() {
      // once a new token was retrieved from auth0, this happens right before expiry.  When using getIdToken(), it may be an unnecessary hook.
    },
    // called before logout or when there's a problem with the current user, for example an invalid token
    // this gives implementors the option to remove the current user's details from the store if saved
    removeLogin() {
      // typical use case it to provide the same method as for logout
    },
    // allows to override log messages; defaults to log to the console
    log(messageObject) {
      // some debug message objects from the library; can be overridden to not log to the console
    }
  }
};
```
## Auth0 Login Flow

![Sequence Diagram](https://www.websequencediagrams.com/cgi-bin/cdraw?lz=dGl0bGUgQXV0aGVudGljYXRpb24gU2VxdWVuY2UgKG5vIHRva2VuIHNhdmVkKQoKQXBwIE1haW4gU2NyZWVuIC0-IFJlcXVlc3RlZAANBzogVXNlciBOYXZpZwBLBQoAEhAgLT4AbgUwOiBSZW5ld0F1dGgKAAwFADoWABUGbG9naW5fcmVxdWlyZWQAOxouY29tOiBTdG9yZSBjdXJyZW50IGxvAIFUByYmAIEYBkxvZ2luAG4GLmNvbQCBDQUAgU0OOiA_aWRfAIF5BT1KV1QAgVQmbGlicmFyeSBjYXB0dXJlcwCCNwdhbmQgcmVkaXJlY3RzCgpub3RlIHJpZ2h0IG9mAGYSVW5zdWNjZXNzZnVsIEZsb3cAgQiBb2Vycm9yPVNvbWVFcnJvcgCCQzcAQQUAgmsPAIJ0BWxlZgCCcwUAhSYSQwCDMAYgdGhlADgHZnJvbQAKBQCDUQhhbmQgbG9nIGl0AIRhIElmIHRoZXJlIGlzIGFuAIEEC2l0IGlzIGNhdWdodABWBm9naW4gcHJvY2VzcyB3aWxsIHJlcGVhdC4KCg&s=magazine)

## Contribution

We value your input as part of direct feedback to us, by filing issues, or preferably by directly contributing improvements:

1. Fork this repository
1. Create a branch
1. Contribute
1. Pull request
