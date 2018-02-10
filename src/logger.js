export default class Logger {
  /**
   * @constructor create a logger with configuration
   * @param {Object} config configuration to wrap
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * @description logs the message to the console, or to a provided hook
   * @param message to log
   * @return {*|void}
   */
  log(message) {
    const logFunc = (this.config && this.config.hooks && this.config.hooks.log) || console.log;
    return logFunc(message);
  }
}
