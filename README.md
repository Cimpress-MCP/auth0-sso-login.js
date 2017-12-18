# Auth0 SSO Login

[![Build Status](https://travis-ci.org/Cimpress-MCP/auth0-sso-login.js.svg?branch=master)](https://travis-ci.org/Cimpress-MCP/auth0-sso-login.js)
[![npm version](https://badge.fury.io/js/auth0-sso-login.svg)](https://www.npmjs.com/package/auth0-sso-login)

The Auth0 SSO Login provides an easy to use library for single-sign on web pages that are leveraging [Auth0](https://auth0.com/) and related [Auth0 Lock](https://auth0.com/lock).

## Using this library

Install the library.

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
  enableLockWidget: true,  // if Auth0's SSO fails, use Auth0Lock
  forceTokenRefresh: false // force refresh even if there is a valid token available
};
// Logs the user in and returns a promise, when succeeded, the user is logged in
// and a valid JWT was provided (via tokenRefreshed hook).
// Schedules automatic background renewal of JWT based on its expiry time.
// (it will be refresh in the 2/3 of the current token lifetime)
auth.ensureLoggedIn(defaultConfiguration)
.then(() => console.log('user is logged in'))
.catch(error => {
    console.error('an unexpected error occurred while logging in');
    // perform application specific steps to handle this situation
    // this should happen only rarely, since the user will either
    // be logged in automatically through Auth0's SSO feature, or
    // the Auth0Lock will handle the login, and only succeed after
    // the user successfully logged in.
});
```

After the login process, the token is retrieved via `tokenRefreshed` hook, described in the
configuration options bellow. The library also exposes its latest authorization result, which may or
may not be set (depends on the success/failure of login process). This method can be used as
a token provider for HTTP clients.
```javascript
let authResult = auth.getLatestAuthResult();
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

  // the URL where the auth0 hidden login should redirect. this is preferably a small page that will be loaded as an iframe
  // see example as part of the package, but also copied below
  loginRedirectUri: `${window.location.origin}/silent-callback.html`,

  // the logout URL, which should be accessible by a non-authenticated user
  logoutRedirectUri: `${window.location.origin}/#/logout`,

  // the Auth0 Lock options that are merged into base options. Worthwhile additions are title or icon
  // for full options, see https://auth0.com/docs/libraries/lock/v10/customization
  auth0LockOptions: {},

  // hooks to get callback calls into the login/logout workflow
  hooks: {
    // before the redirect to the logoutRedirectUri happens
    // if the user information is stored in a backend store, it's best to clean that before the redirect happens
    logout() {
      // implement what should happen at logout
      // a typical use case is to remove the auth token from your storage (memory, cookie, local store), or perform other cleanup tasks
    },
    // the profile was retrieved, this is an option to store the profile, or update the user interface
    profileRefreshed(profile) {
      // once the profile is refreshed, which includes the auth0 sub and other meta data
      // a typical use case is to show the username on screen
    },
    // the auth token was retrieved, this is an option to store the token for later use
    tokenRefreshed(authResult) {
      // once a new token was retrieved from auth0
      // a typical use case is to store the token for calling other services
    },
    // called before logout or when there's a problem with the current user, for example an invalid token
    // this gives implementors the option to remove the current user's details from the store if saved
    removeLogin() {
      // typical use case it to provide the same method as for logout
    },
    // allows to override log messages; defaults to log to the console
    log(msg) {
      // some debug logs from the library; can be overridden to not log to the console
    }
  }
};
```

The page where `config.loginRedirectUrl` is customizable by the package's developer. However, since it loads in an invisible iFrame, it's recommended to keep it small without additional dependencies. The page needs to make a callback to its parent. For example, it could look like this:

```html
<!DOCTYPE html>
<html>

<head>
  <script src="https://cdn.auth0.com/js/auth0/8.9.3/auth0.min.js"></script>
  <script type="text/javascript">
    var webAuth = new auth0.WebAuth({
      domain: 'my-domain',
      clientID: 'my-client-id',
      audience: 'my-audience',
      leeway: 10
    });
    var options = {
      hash: window.location.hash
    };
    var result = webAuth.parseHash(options, function (err, data) {
      parent.postMessage(err || data, window.location.origin);
    });
  </script>
</head>

<body>
  <!-- see https://auth0.com/docs/libraries/auth0js#using-renewauth-to-acquire-new-tokens -->
</body>

</html>
```

# Contribution

We value your input as part of direct feedback to us, by filing issues, or preferably by directly contributing improvements:

1. Fork this repository
1. Create a branch
1. Contribute
1. Pull request
