const parsedErrorKey = 'cimpress.io.auth0-sso-login.parsedError';

export default class ErrorHandler {
  /**
   * @constructor create a redirect handler to store the redirect
   * @param {Object} logger
   */
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * @description Save errors in url
   * @return {*|void}
   */
  tryCaptureError() {
    try {
      let parsedUrl = new URL(window.location.href);
      if (parsedUrl.searchParams.get('error') === 'access_denied' && parsedUrl.searchParams.get('error_description').match(/verify.*email/)) {
        this.logger.log({ title: 'Login error found', level: 'WARN', url: window.location.href });
        localStorage.setItem(parsedErrorKey, JSON.stringify({ title: 'Please verify your email address before logging in.', errorCode: 'UnverifiedEmail' }));
      }
    } catch (error) {
      this.logger.log({ title: 'Failed to save Auth0.', error: error });
    }
  }

  /**
   * @description Navigate a redirect if one is stored, otherwise return
   * @return {*_void}
   */
  getCapturedError() {
    try {
      let parsedErrorString = localStorage.getItem(parsedErrorKey);
      localStorage.removeItem(parsedErrorKey);
      let parsedUrl = new URL(window.location.href);
      parsedUrl.searchParams.delete('error');
      parsedUrl.searchParams.delete('error_description');
      history.replaceState(null, null, parsedUrl.toString());
      return JSON.parse(parsedErrorString);
    } catch (error) {
      this.logger.log({ title: 'Failed to get return parsed errored', level: 'WARN', error: error });
    }
  }
}
