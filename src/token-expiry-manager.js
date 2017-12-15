import windowInteraction from './window-interaction';

export default class tokenExpiryManager {
  constructor() {
    this.tokenExpiresAt = null;
    this.tokenRefreshHandle = null;
  }

  getRemainingMillisToTokenExpiry() {
    if (!this.tokenExpiresAt) {
      return 0;
    }

    return Math.floor((this.tokenExpiresAt - Date.now()) / 3) * 2;
  }

  scheduleTokenRefresh(authResult, refreshFunction) {
    this.tokenExpiresAt = (authResult.expiresIn * 1000) + Date.now();

    if (this.tokenRefreshHandle) {
      windowInteraction.clearTimeout(this.tokenRefreshHandle);
    }

    this.tokenRefreshHandle = windowInteraction.setTimeout(
      refreshFunction,
      this.getRemainingMillisToTokenExpiry());
  }

  cancelTokenRefresh() {
    this.tokenExpiresAt = null;

    if (this.tokenRefreshHandle) {
      windowInteraction.clearTimeout(this.tokenRefreshHandle);
    }
  }
}
