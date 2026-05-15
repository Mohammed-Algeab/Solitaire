// ===== ZeroGate SDK v1.0.0 =====
class ZeroGateSDKError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ZeroGateSDKError';
    }
}

class ZeroGateTimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ZeroGateTimeoutError';
    }
}

class ZeroGateSDK {
    constructor(config) {
        this.gameId = config.gameId || 'solitaire-game';
        this.debug = config.debug || false;
        this.timeout = config.timeout || 10000;
        this.autoReady = config.autoReady !== false;
        this.version = '1.0.0';
        this.isInitialized = false;
        this.isReady = false;
        this.currentSessionId = null;
        this.messageHandlers = new Map();
        this.nonceCounter = 0;
    }

    _log(...args) {
        if (this.debug) console.log('[ZeroGate]', ...args);
    }

    _generateNonce() {
        return `nonce_${Date.now()}_${++this.nonceCounter}`;
    }

    async _sendMessage(type, payload) {
        return new Promise((resolve, reject) => {
            const nonce = this._generateNonce();
            const message = {
                type,
                gameId: this.gameId,
                sessionId: this.currentSessionId,
                timestamp: Date.now(),
                nonce,
                payload,
                version: this.version,
                messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };

            const timeoutId = setTimeout(() => {
                this.messageHandlers.delete(nonce);
                reject(new ZeroGateTimeoutError('Request timed out'));
            }, this.timeout);

            this.messageHandlers.set(nonce, (response) => {
                clearTimeout(timeoutId);
                if (response.error) {
                    reject(new ZeroGateSDKError(response.error.code, response.error.message));
                } else {
                    resolve(response.payload);
                }
            });

            // Try parent window (ZeroGate iframe parent)
            if (window.parent !== window) {
                window.parent.postMessage(message, '*');
            }

            // Also try opener
            if (window.opener) {
                window.opener.postMessage(message, '*');
            }

            // Fallback: simulate success for standalone mode
            setTimeout(() => {
                if (this.messageHandlers.has(nonce)) {
                    this.messageHandlers.delete(nonce);
                    resolve({ accepted: true, newBest: false, xpEarned: 0, saved: true, unlocked: false, alreadyHad: false });
                }
            }, 500);
        });
    }

    async init() {
        if (this.isInitialized) {
            return { sessionId: this.currentSessionId, userId: 'standalone', isAuthenticated: false };
        }

        window.addEventListener('message', (event) => {
            if (event.data && event.data.nonce && this.messageHandlers.has(event.data.nonce)) {
                const handler = this.messageHandlers.get(event.data.nonce);
                this.messageHandlers.delete(event.data.nonce);
                handler(event.data);
            }
        });

        this.isInitialized = true;
        this.currentSessionId = `session_${Date.now()}`;

        if (this.autoReady) {
            await this.ready();
        }

        return { sessionId: this.currentSessionId, userId: 'standalone', isAuthenticated: false };
    }

    async ready() {
        if (this.isReady) return;
        this.isReady = true;
        this._log('Game ready');
        try {
            await this._sendMessage('READY', {
                gameVersion: '1.0.0',
                sdkVersion: '1.0.0',
                capabilities: ['scores', 'achievements', 'cloud_save', 'fullscreen']
            });
        } catch (e) {
            this._log('Ready failed (standalone mode)', e.message);
        }
    }

    async submitScore(score, metadata = {}) {
        this._log('Submitting score:', score, metadata);
        try {
            const result = await this._sendMessage('SUBMIT_SCORE', { score, metadata });
            return result || { accepted: true, newBest: false, xpEarned: 0 };
        } catch (e) {
            this._log('Score submit failed:', e.message);
            return { accepted: false, newBest: false, xpEarned: 0 };
        }
    }

    async unlockAchievement(achievementKey) {
        this._log('Unlocking achievement:', achievementKey);
        try {
            const result = await this._sendMessage('UNLOCK_ACHIEVEMENT', { achievementKey });
            return result || { unlocked: true, alreadyHad: false, xpEarned: 0 };
        } catch (e) {
            this._log('Achievement unlock failed:', e.message);
            return { unlocked: false, alreadyHad: false, xpEarned: 0 };
        }
    }

    async saveData(key, data) {
        this._log('Saving data:', key);
        try {
            const result = await this._sendMessage('SAVE_DATA', { key, data });
            try {
                localStorage.setItem(`zg_${this.gameId}_${key}`, JSON.stringify(data));
            } catch (e) {}
            return result || { saved: true, sizeBytes: JSON.stringify(data).length };
        } catch (e) {
            try {
                localStorage.setItem(`zg_${this.gameId}_${key}`, JSON.stringify(data));
                return { saved: true, sizeBytes: JSON.stringify(data).length };
            } catch (le) {
                return { saved: false, sizeBytes: 0 };
            }
        }
    }

    async loadData(key) {
        this._log('Loading data:', key);
        try {
            const result = await this._sendMessage('LOAD_DATA', { key });
            if (result && result.data) return result.data;
        } catch (e) {
            this._log('Cloud load failed, trying localStorage');
        }
        try {
            const local = localStorage.getItem(`zg_${this.gameId}_${key}`);
            return local ? JSON.parse(local) : null;
        } catch (e) {
            return null;
        }
    }

    async requestFullscreen(enabled) {
        try {
            await this._sendMessage('REQUEST_FULLSCREEN', { enabled });
        } catch (e) {
            if (enabled) {
                document.documentElement.requestFullscreen?.();
            } else {
                document.exitFullscreen?.();
            }
        }
    }

    async requestOrientation(orientation) {
        try {
            await this._sendMessage('REQUEST_ORIENTATION', { orientation });
        } catch (e) {}
    }

    logError(message, options = {}) {
        this._log('Error:', message, options);
        try {
            this._sendMessage('ERROR_LOG', { message, ...options });
        } catch (e) {}
    }

    destroy() {
        this.messageHandlers.clear();
        this.isInitialized = false;
        this.isReady = false;
    }
}
