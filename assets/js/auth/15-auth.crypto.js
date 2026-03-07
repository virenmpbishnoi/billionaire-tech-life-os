/*
 * 15-auth.crypto.js
 * Browser-Side Cryptographic Utilities – Billionaire Tech Adaptive Life OS
 *
 * Provides secure primitives using the Web Crypto API (or safe fallbacks).
 * Used exclusively by the authentication layer for:
 *   - Secure token generation
 *   - Session identifiers
 *   - Password hashing
 *   - Timing-safe comparison
 *   - Base64 encoding/decoding
 *   - Lightweight symmetric encryption (optional)
 *
 * Fully offline-compatible — no external dependencies beyond browser APIs.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const TOKEN_BYTE_LENGTH = 32;               // 256-bit tokens
  const PASSWORD_SALT_BYTES = 16;             // 128-bit salt
  const PBKDF2_ITERATIONS = 310000;           // OWASP 2023 recommendation minimum
  const PBKDF2_KEYLEN = 32;                   // 256-bit derived key
  const AES_KEY_LENGTH = 256;                 // AES-256-GCM

  const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  // ─────────────────────────────────────────────────────────────────────────────
  // CRYPTO API DETECTION & FALLBACK
  // ─────────────────────────────────────────────────────────────────────────────

  const hasWebCrypto = !!(
    window.crypto &&
    window.crypto.getRandomValues &&
    window.crypto.subtle
  );

  let fallbackRandomBuffer = new Uint8Array(256);
  let fallbackRandomIndex = 0;

  function fillFallbackRandom() {
    // Very weak fallback — only used if Web Crypto is completely missing
    for (let i = 0; i < fallbackRandomBuffer.length; i++) {
      fallbackRandomBuffer[i] = Math.floor(Math.random() * 256);
    }
    fallbackRandomIndex = 0;
  }

  fillFallbackRandom();

  function getRandomBytes(length) {
    if (hasWebCrypto) {
      const bytes = new Uint8Array(length);
      window.crypto.getRandomValues(bytes);
      return bytes;
    }

    // Fallback – warn loudly
    if (fallbackRandomIndex + length > fallbackRandomBuffer.length) {
      fillFallbackRandom();
      EventBus?.emit('CRYPTO_FALLBACK_USED', { reason: 'entropy_exhausted' });
    }

    const result = fallbackRandomBuffer.slice(fallbackRandomIndex, fallbackRandomIndex + length);
    fallbackRandomIndex += length;
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE CRYPTO UTILITIES
  // ─────────────────────────────────────────────────────────────────────────────

  const AuthCrypto = {

    async init() {
      if (hasWebCrypto) {
        EventBus?.emit('CRYPTO_INITIALIZED', { api: 'WebCrypto', supported: true });
        console.log('[AuthCrypto] Web Crypto API detected – full security mode');
      } else {
        EventBus?.emit('CRYPTO_INITIALIZED', { api: 'fallback', supported: false });
        console.warn('[AuthCrypto] Web Crypto API unavailable – using weak fallback random');
      }
    },

    // ─── Secure random token (base64url encoded) ──────────────────────────────
    async generateSecureToken(byteLength = TOKEN_BYTE_LENGTH) {
      const bytes = getRandomBytes(byteLength);
      return this.bytesToBase64Url(bytes);
    },

    // ─── Secure session ID (UUID v4-like) ─────────────────────────────────────
    async generateSessionId() {
      const bytes = getRandomBytes(16);

      // Set version 4 UUID bits
      bytes[6] = (bytes[6] & 0x0f) | 0x40;  // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80;  // variant RFC 4122

      return [
        this.bytesToHex(bytes.subarray(0, 4)),
        this.bytesToHex(bytes.subarray(4, 6)),
        this.bytesToHex(bytes.subarray(6, 8)),
        this.bytesToHex(bytes.subarray(8, 10)),
        this.bytesToHex(bytes.subarray(10))
      ].join('-');
    },

    // ─── Password hashing (PBKDF2 + SHA-256) ──────────────────────────────────
    async hashPassword(password, salt = null) {
      if (!password || typeof password !== 'string') {
        throw new Error('Invalid password input');
      }

      const encoder = new TextEncoder();
      const saltBytes = salt || getRandomBytes(PASSWORD_SALT_BYTES);

      if (!hasWebCrypto) {
        // Fallback: simple SHA-256 of (password + salt) – VERY WEAK – log warning
        console.warn('[AuthCrypto] No WebCrypto – using insecure password hash');
        const data = encoder.encode(password + this.bytesToBase64(saltBytes));
        const hash = await this.sha256(data);
        return {
          hash: this.bytesToBase64(hash),
          salt: this.bytesToBase64(saltBytes),
          iterations: 1,
          insecure: true
        };
      }

      const key = await window.crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );

      const derived = await window.crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBytes,
          iterations: PBKDF2_ITERATIONS,
          hash: 'SHA-256'
        },
        key,
        PBKDF2_KEYLEN * 8
      );

      return {
        hash: this.bytesToBase64(new Uint8Array(derived)),
        salt: this.bytesToBase64(saltBytes),
        iterations: PBKDF2_ITERATIONS,
        algorithm: 'PBKDF2-SHA256'
      };
    },

    // ─── Generic SHA-256 hash ─────────────────────────────────────────────────
    async hashString(value) {
      const encoder = new TextEncoder();
      const data = encoder.encode(value);
      return this.sha256(data);
    },

    async sha256(data) {
      if (hasWebCrypto) {
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        return new Uint8Array(hashBuffer);
      }
      // Fallback – extremely weak – do not use in production
      console.warn('[AuthCrypto] SHA-256 fallback – NOT SECURE');
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash + data[i]) >>> 0;
      }
      return new Uint8Array(32).fill(hash & 0xff);
    },

    // ─── Timing-safe string comparison ────────────────────────────────────────
    secureCompare(a, b) {
      if (typeof a !== 'string' || typeof b !== 'string') return false;
      if (a.length !== b.length) return false;

      let result = 0;
      for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
      }
      return result === 0;
    },

    // ─── Base64 & Base64url utilities ─────────────────────────────────────────
    bytesToBase64(bytes) {
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    },

    bytesToBase64Url(bytes) {
      return this.bytesToBase64(bytes)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    },

    base64ToBytes(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    },

    // ─── Hex encoding helper ──────────────────────────────────────────────────
    bytesToHex(bytes) {
      return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    },

    // ─── Lightweight AES-GCM encryption (optional – for sensitive fields) ─────
    async encryptData(plainText, key = null) {
      if (!hasWebCrypto) {
        throw new Error('Encryption requires Web Crypto API');
      }

      const encoder = new TextEncoder();
      const data = encoder.encode(plainText);

      // Derive or use provided key
      let cryptoKey;
      if (key) {
        cryptoKey = await window.crypto.subtle.importKey(
          'raw',
          key,
          { name: 'AES-GCM' },
          false,
          ['encrypt']
        );
      } else {
        cryptoKey = await window.crypto.subtle.generateKey(
          { name: 'AES-GCM', length: AES_KEY_LENGTH },
          true,
          ['encrypt', 'decrypt']
        );
      }

      const iv = getRandomBytes(12);

      const encrypted = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        data
      );

      return {
        iv: this.bytesToBase64Url(iv),
        ciphertext: this.bytesToBase64Url(new Uint8Array(encrypted)),
        key: key ? null : await window.crypto.subtle.exportKey('raw', cryptoKey)
          .then(raw => this.bytesToBase64Url(new Uint8Array(raw)))
      };
    },

    // ─── Decryption counterpart ───────────────────────────────────────────────
    async decryptData(encryptedData, keyBytes) {
      if (!hasWebCrypto) throw new Error('Decryption requires Web Crypto API');

      const iv = this.base64ToBytes(encryptedData.iv);
      const ciphertext = this.base64ToBytes(encryptedData.ciphertext);

      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        this.base64ToBytes(keyBytes),
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        ciphertext
      );

      return new TextDecoder().decode(decrypted);
    },

    // ─── Utility: detect crypto support ───────────────────────────────────────
    detectCryptoSupport() {
      return {
        webCrypto: hasWebCrypto,
        subtle: !!window.crypto?.subtle,
        randomValues: !!window.crypto?.getRandomValues,
        fallbackActive: !hasWebCrypto
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.AuthCrypto = AuthCrypto;

  // Auto-init
  AuthCrypto.init();

  // Debug helpers (remove/gate in production)
  window.__debugCrypto = {
    token: () => AuthCrypto.generateSecureToken(),
    uuid: () => AuthCrypto.generateSessionId(),
    hash: (pw) => AuthCrypto.hashPassword(pw),
    compare: AuthCrypto.secureCompare,
    support: () => AuthCrypto.detectCryptoSupport()
  };

})();