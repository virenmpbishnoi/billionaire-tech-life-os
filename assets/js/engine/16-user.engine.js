/*
 * 16-user.engine.js
 * User Identity & Profile Engine – Billionaire Tech Adaptive Life OS
 *
 * Central authority for all user-related data:
 *   - Profile creation & loading
 *   - Preferences management
 *   - Role & permissions
 *   - Basic statistics aggregation
 *   - Personalization settings
 *
 * All other engines MUST use this module as the single source of truth for user context.
 * Direct access to user storage keys is forbidden.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const DEFAULT_PREFERENCES = {
    theme: 'default',
    notificationsEnabled: true,
    notificationSound: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language || 'en-US',
    compactMode: false,
    reducedMotion: false,
    highContrast: false
  };

  const DEFAULT_STATISTICS = {
    tasksCompleted: 0,
    habitsCompleted: 0,
    missionsCompleted: 0,
    streakDays: 0,
    longestStreak: 0,
    totalFocusMinutes: 0,
    totalScoreEarned: 0,
    lastActive: null
  };

  const SUPPORTED_ROLES = ['user', 'admin'];

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getProfileKey(userId) {
    if (!userId) throw new Error('User ID required');
    return `user:${userId}:profile`;
  }

  function getStatsKey(userId) {
    return `user:${userId}:statistics`;
  }

  function mergePreferences(current, updates) {
    return {
      ...DEFAULT_PREFERENCES,
      ...(current || {}),
      ...updates
    };
  }

  function validateRole(role) {
    if (!SUPPORTED_ROLES.includes(role)) {
      throw new Error(`Invalid role: ${role}. Allowed: ${SUPPORTED_ROLES.join(', ')}`);
    }
    return role;
  }

  function validateProfile(profile) {
    if (!profile || typeof profile !== 'object') {
      throw new Error('Invalid profile structure');
    }
    if (!profile.userId) throw new Error('Profile missing userId');
    if (profile.role) validateRole(profile.role);
    // Delegate deeper schema validation to validation.engine
    // validation.engine.validate('userProfile', profile);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC USER ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const UserEngine = {

    async init() {
      // Listen for authentication events to load profile
      EventBus.on('SESSION_CREATED', async ({ userId }) => {
        await this.loadProfile(userId);
      });

      EventBus.on('SESSION_VALIDATED', ({ valid, sessionId }) => {
        if (valid) {
          const userId = AuthSession.getCurrentUserId();
          if (userId) this.loadProfile(userId);
        }
      });

      EventBus.on('AUTH_LOGOUT_TRIGGERED', () => {
        this.clearCurrentUser();
      });

      // Initial load if already authenticated
      if (AuthSession.isSessionActive()) {
        const userId = AuthSession.getCurrentUserId();
        if (userId) await this.loadProfile(userId);
      }

      console.log('[UserEngine] Initialized – ready to manage user identity');
    },

    // ─── Create new user profile (called after registration/login) ─────────────
    async createProfile(userData) {
      if (!userData || !userData.userId) {
        throw new Error('User ID required for profile creation');
      }

      const now = Date.now();
      const profile = {
        userId: userData.userId,
        username: userData.username || `user_${userData.userId.slice(0, 8)}`,
        email: userData.email || null,
        displayName: userData.displayName || userData.username,
        avatar: userData.avatar || null,
        role: userData.role ? validateRole(userData.role) : 'user',
        createdAt: now,
        lastLogin: now,
        preferences: { ...DEFAULT_PREFERENCES, ...userData.preferences },
        statistics: { ...DEFAULT_STATISTICS, createdAt: now }
      };

      validateProfile(profile);

      const profileKey = getProfileKey(profile.userId);
      Storage.write(profileKey, profile);

      // Also initialize empty statistics if needed
      Storage.write(getStatsKey(profile.userId), profile.statistics);

      State.update('user', profile);

      EventBus.emit('USER_PROFILE_CREATED', {
        userId: profile.userId,
        username: profile.username,
        role: profile.role,
        timestamp: now
      });

      console.log('[UserEngine] Profile created for:', profile.userId);
      return profile;
    },

    // ─── Load existing profile into state ─────────────────────────────────────
    async loadProfile(userId) {
      const profileKey = getProfileKey(userId);
      const profile = Storage.read(profileKey);

      if (!profile) {
        console.warn('[UserEngine] No profile found for user:', userId);
        EventBus.emit('USER_PROFILE_NOT_FOUND', { userId });
        return null;
      }

      try {
        validateProfile(profile);

        // Merge with defaults (in case of schema evolution)
        profile.preferences = mergePreferences(profile.preferences, {});
        profile.statistics = { ...DEFAULT_STATISTICS, ...profile.statistics };

        State.update('user', profile);

        EventBus.emit('USER_PROFILE_LOADED', {
          userId,
          username: profile.username,
          role: profile.role
        });

        return profile;
      } catch (err) {
        console.error('[UserEngine] Profile validation failed:', err);
        EventBus.emit('USER_PROFILE_INVALID', { userId, error: err.message });
        return null;
      }
    },

    // ─── Get current authenticated user (from state) ──────────────────────────
    getCurrentUser() {
      return State.getPath('user') || null;
    },

    // ─── Partial profile update ───────────────────────────────────────────────
    async updateProfile(updates) {
      const current = this.getCurrentUser();
      if (!current?.userId) {
        throw new Error('No authenticated user to update');
      }

      const merged = { ...current, ...updates };
      validateProfile(merged);

      const profileKey = getProfileKey(current.userId);
      Storage.write(profileKey, merged);

      State.update('user', merged);

      EventBus.emit('USER_PROFILE_UPDATED', {
        userId: current.userId,
        changes: updates,
        timestamp: Date.now()
      });

      return merged;
    },

    // ─── Preferences update (specialized partial update) ──────────────────────
    async updatePreferences(newPrefs) {
      const current = this.getCurrentUser();
      if (!current) throw new Error('No authenticated user');

      const updatedPrefs = mergePreferences(current.preferences, newPrefs);

      await this.updateProfile({ preferences: updatedPrefs });

      EventBus.emit('USER_PREFERENCES_UPDATED', {
        userId: current.userId,
        preferences: updatedPrefs,
        changedKeys: Object.keys(newPrefs)
      });

      return updatedPrefs;
    },

    // ─── Role change (restricted – admin only in production) ──────────────────
    async updateRole(newRole) {
      const current = this.getCurrentUser();
      if (!current) throw new Error('No authenticated user');

      validateRole(newRole);

      if (current.role === newRole) return current.role;

      await this.updateProfile({ role: newRole });

      EventBus.emit('USER_ROLE_CHANGED', {
        userId: current.userId,
        from: current.role,
        to: newRole
      });

      return newRole;
    },

    // ─── Statistics increment (called by other engines via events) ────────────
    async incrementStat(key, value = 1) {
      const current = this.getCurrentUser();
      if (!current) return;

      const statsKey = getStatsKey(current.userId);
      const stats = Storage.read(statsKey) || { ...DEFAULT_STATISTICS };

      const newValue = (stats[key] || 0) + value;
      stats[key] = newValue;
      stats.lastUpdated = Date.now();

      Storage.write(statsKey, stats);

      // Update in-memory state
      State.update(`user.statistics.${key}`, newValue);

      EventBus.emit('USER_STATS_UPDATED', {
        userId: current.userId,
        stat: key,
        value: newValue,
        delta: value
      });
    },

    // ─── Full stats refresh (aggregates from other engines if needed) ─────────
    async refreshStatistics() {
      const current = this.getCurrentUser();
      if (!current) return;

      // In production: query other engines or storage aggregates
      // For now: just ensure structure exists
      const stats = { ...DEFAULT_STATISTICS, ...current.statistics };
      await this.updateProfile({ statistics: stats });

      return stats;
    },

    // ─── Delete / reset profile (admin / account deletion) ────────────────────
    async deleteProfile(userId) {
      const current = this.getCurrentUser();
      if (!current || current.userId !== userId) {
        throw new Error('Unauthorized profile deletion');
      }

      Storage.remove(getProfileKey(userId));
      Storage.remove(getStatsKey(userId));

      State.update('user', null);
      EventBus.emit('USER_PROFILE_DELETED', { userId });

      console.warn('[UserEngine] Profile deleted:', userId);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.UserEngine = UserEngine;

  // Auto-init after core dependencies
  function tryInit() {
    if (window.Storage && window.State && window.EventBus) {
      UserEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers (remove/gate in production)
  window.__debugUser = {
    profile: () => UserEngine.getCurrentUser(),
    prefs: () => UserEngine.getCurrentUser()?.preferences,
    stats: () => UserEngine.getCurrentUser()?.statistics,
    updatePref: (key, val) => UserEngine.updatePreferences({ [key]: val })
  };

})();