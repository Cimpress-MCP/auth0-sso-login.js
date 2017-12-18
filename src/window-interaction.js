// static window interaction, mostly wrapped for enabling easier mocking through unit tests
export default class windowInteraction {
  static updateWindow(url) {
    window.location = url;
  }

  static setTimeout(func, delay) {
    return window.setTimeout(func, delay);
  }

  static clearTimeout(timeoutId) {
    window.clearTimeout(timeoutId);
  }
}
