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
      let error = parsedUrl.searchParams.get('error');
      let errorCode = error;
      let errorDescription = parsedUrl.searchParams.get('error_description');
      if (error) {
        if (error === 'access_denied' && errorDescription === 'Please verify your email before logging in.') {
          errorCode = 'UnverifiedEmail';
        }
        this.logger.log({ title: 'Login error found', level: 'WARN', url: window.location.href, error: error, errorCode: errorCode, description: errorDescription });
        localStorage.setItem(parsedErrorKey, JSON.stringify({ title: 'Auth0 Login Error', details: errorDescription, errorCode: errorCode }));
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
      return null;
    }
  }
}
