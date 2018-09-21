import uuid from 'uuid';
import windowInteraction from './window-interaction';

export default class tokenExpiryManager {
  constructor() {
    this.tokenExpiresAt = null;
    this.tokenRefreshHandle = null;
    this.sessionId = null;
  }

  getRemainingMillisToTokenExpiry() {
    return this.tokenExpiresAt ? this.tokenExpiresAt - Date.now() : 0;
  }

  scheduleTokenRefresh(authResult, refreshFunction) {
    const expiresInMs = authResult.expiresIn * 1000;
    const remainingMs = (expiresInMs / 3) * 2;

    this.tokenExpiresAt = remainingMs + Date.now();

    if (this.tokenRefreshHandle) {
      windowInteraction.clearTimeout(this.tokenRefreshHandle);
    }

    this.tokenRefreshHandle = windowInteraction.setTimeout(refreshFunction, remainingMs);
  }

  cancelTokenRefresh() {
    this.sessionId = null;
    this.tokenExpiresAt = null;

    if (this.tokenRefreshHandle) {
      windowInteraction.clearTimeout(this.tokenRefreshHandle);
      this.tokenRefreshHandle = null;
    }
  }

  createSession() {
    this.sessionId = uuid.v4();
  }

  authorizationSessionExists() {
    return !!this.sessionId;
  }
}
