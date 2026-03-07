/*
 * 31-theme.engine.js
 * Dynamic Theme Intelligence Engine – Billionaire Tech Adaptive Life OS
 *
 * Dynamically controls visual appearance of the entire UI based on:
 *   - Current user rank (unlocks premium accents & palettes)
 *   - Risk level (warning / critical overrides)
 *   - Burnout state (calming / recovery tones)
 *   - Lockdown mode (strict focus UI)
 *   - User personalization preferences
 *
 * All theme changes update CSS variables in :root via state synchronization.
 * No direct DOM manipulation — changes propagate through CSS cascade.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & MAPPINGS
  // ─────────────────────────────────────────────────────────────────────────────

  // Rank → primary theme accent mapping
  // Values reference --bt-rank-* variables defined in 01-variables.css
  const RANK_THEME_MAPPING = {
    'BEGINNER':     { accent: '--bt-rank-beginner',     theme: 'default' },
    'DISCIPLINED':  { accent: '--bt-rank-disciplined',  theme: 'slate' },
    'PERFORMER':    { accent: '--bt-rank-performer',    theme: 'blue' },
    'ACHIEVER':     { accent: '--bt-rank-achiever',     theme: 'violet' },
    'EXECUTOR':     { accent: '--bt-rank-executor',     theme: 'magenta' },
    'ELITE':        { accent: '--bt-rank-elite',        theme: 'gold' },
    'CHAMPION':     { accent: '--bt-rank-champion',     theme: 'bright-gold' },
    'LEGEND':       { accent: '--bt-rank-legend',       theme: 'amber-prestige' },
    'GRANDMASTER':  { accent: '--bt-rank-grandmaster',  theme: 'legendary-prestige' }
  };

  // Risk level → visual override
  const RISK_THEME_OVERRIDES = {
    'low':     { accent: '--bt-risk-low',     intensity: 'subtle' },
    'medium':  { accent: '--bt-risk-medium',  intensity: 'moderate' },
    'high':    { accent: '--bt-risk-high',    intensity: 'strong' },
    'critical':{ accent: '--bt-risk-critical', intensity: 'emergency' }
  };

  // Burnout level → calming/recovery theme adjustment
  const BURNOUT_THEME_ADJUSTMENTS = {
    'low':     { tone: 'vibrant',   saturation: 1.0 },
    'moderate':{ tone: 'muted',     saturation: 0.7 },
    'high':    { tone: 'calm',      saturation: 0.4, brightness: 1.1 },
    'critical':{ tone: 'recovery',  saturation: 0.3, brightness: 1.2 }
  };

  // Lockdown mode – highest priority override
  const LOCKDOWN_THEME = {
    bg: '--bt-lockdown-bg',
    border: '--bt-lockdown-border',
    text: '--bt-lockdown-text',
    accent: '--bt-lockdown-accent',
    banner: '--bt-lockdown-banner'
  };

  const DEFAULT_THEME = 'default';
  const DEFAULT_ACCENT = '--bt-color-primary';

  const THEME_HISTORY_LIMIT = 90; // days

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE & HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  let currentTheme = {
    active: DEFAULT_THEME,
    rankAccent: DEFAULT_ACCENT,
    riskOverride: null,
    burnoutAdjustment: null,
    lockdownActive: false,
    userPreference: DEFAULT_THEME,
    updatedAt: Date.now()
  };

  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function normalizeThemeHistory(history) {
    const today = getTodayKey();
    const cleaned = { ...history };

    Object.keys(cleaned).sort().reverse().slice(THEME_HISTORY_LIMIT).forEach(date => {
      delete cleaned[date];
    });

    if (!cleaned[today]) {
      cleaned[today] = { ...currentTheme, timestamp: Date.now() };
    }

    return cleaned;
  }

  function applyThemeToState() {
    State.update('theme', { ...currentTheme });
  }

  function shouldNotifyThemeChange(oldTheme, newTheme) {
    return oldTheme.active !== newTheme.active ||
           oldTheme.rankAccent !== newTheme.rankAccent ||
           oldTheme.riskOverride !== newTheme.riskOverride ||
           oldTheme.burnoutAdjustment !== newTheme.burnoutAdjustment ||
           oldTheme.lockdownActive !== newTheme.lockdownActive;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC THEME ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const ThemeEngine = {

    async init() {
      // Load user theme preference
      const user = UserEngine.getCurrentUser();
      if (user?.userId) {
        const prefKey = `user:${user.userId}:theme:preferences`;
        const prefs = Storage.read(prefKey) || {};
        currentTheme.userPreference = prefs.preferredTheme || DEFAULT_THEME;
      }

      // Load theme history
      await this.loadThemeHistory();

      // Listen for state changes that affect theme
      EventBus.on('RECALCULATION_COMPLETED', () => {
        this.evaluateCurrentTheme();
      });

      EventBus.on('RANK_UPDATED', () => this.evaluateRankTheme());
      EventBus.on('RANK_PROMOTED', () => this.evaluateRankTheme());

      EventBus.on('RISK_UPDATED', () => this.evaluateRiskOverride());
      EventBus.on('RISK_WARNING_DETECTED', () => this.evaluateRiskOverride());
      EventBus.on('RISK_CRITICAL_DETECTED', () => this.evaluateRiskOverride());

      EventBus.on('BURNOUT_UPDATED', () => this.evaluateBurnoutAdjustment());

      EventBus.on('LOCKDOWN_ACTIVATED', () => this.applyLockdownMode(true));
      EventBus.on('LOCKDOWN_DEACTIVATED', () => this.applyLockdownMode(false));

      // User preference changes
      EventBus.on('USER_PREFERENCES_UPDATED', (payload) => {
        if (payload.preferences?.theme) {
          this.applyUserThemePreference(payload.preferences.theme);
        }
      });

      // Initial evaluation
      this.evaluateCurrentTheme();

      console.log('[ThemeEngine] Initialized – dynamic visual intelligence active');
    },

    // ─── Load theme history from storage ──────────────────────────────────────
    async loadThemeHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const historyKey = `user:${user.userId}:theme:history`;
      let history = Storage.read(historyKey) || {};

      history = normalizeThemeHistory(history);

      State.update('themeHistory', history);

      EventBus.emit('THEME_HISTORY_LOADED', {
        daysStored: Object.keys(history).length
      });
    },

    // ─── Save current theme state to history ──────────────────────────────────
    async saveThemeHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const today = getTodayKey();
      const history = State.getPath('themeHistory') || {};

      history[today] = {
        ...currentTheme,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      const normalized = normalizeThemeHistory(history);
      State.update('themeHistory', normalized);

      Storage.write(`user:${user.userId}:theme:history`, normalized);
    },

    // ─── Save user theme preference ───────────────────────────────────────────
    async saveThemePreference(preferredTheme) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const prefKey = `user:${user.userId}:theme:preferences`;
      Storage.write(prefKey, { preferredTheme });

      currentTheme.userPreference = preferredTheme;
      applyThemeToState();

      EventBus.emit('THEME_PERSONALIZED', { theme: preferredTheme });
    },

    // ─── Core theme evaluation – determines final active theme ────────────────
    evaluateCurrentTheme() {
      const previousTheme = { ...currentTheme };

      // 1. Base theme from user preference or default
      currentTheme.active = currentTheme.userPreference || DEFAULT_THEME;

      // 2. Rank-based accent (highest visual priority after user pref)
      this.evaluateRankTheme();

      // 3. Risk override (overrides accent if high/critical)
      this.evaluateRiskOverride();

      // 4. Burnout adjustment (calming tones when high)
      this.evaluateBurnoutAdjustment();

      // 5. Lockdown mode (absolute override when active)
      // Handled separately via LOCKDOWN_* events

      applyThemeToState();

      if (shouldNotifyThemeChange(previousTheme, currentTheme)) {
        EventBus.emit('THEME_UPDATED', currentTheme);
        this.saveThemeHistory();
      }
    },

    // ─── Evaluate rank-based theme accent ─────────────────────────────────────
    evaluateRankTheme() {
      const rank = State.getPath('rank.current') || 'BEGINNER';
      const rankTheme = RANK_THEME_MAPPING[rank] || RANK_THEME_MAPPING.BEGINNER;

      currentTheme.rankAccent = rankTheme.accent;
      currentTheme.active = rankTheme.theme || currentTheme.active;

      EventBus.emit('THEME_RANK_APPLIED', { rank, accent: rankTheme.accent });
    },

    // ─── Evaluate risk-based UI override ──────────────────────────────────────
    evaluateRiskOverride() {
      const risk = State.getPath('risk') || {};
      const index = risk.riskIndex || 0;
      const severity = risk.severity || 'LOW';

      if (index >= RISK_RANGES.medium) {
        const override = RISK_THEME_OVERRIDES[severity.toLowerCase()] || RISK_THEME_OVERRIDES.low;
        currentTheme.riskOverride = override.accent;
        currentTheme.active = 'warning'; // reduced saturation or alert mode

        EventBus.emit('THEME_OVERRIDE_APPLIED', {
          type: 'risk',
          severity,
          accent: override.accent
        });
      } else {
        currentTheme.riskOverride = null;
      }
    },

    // ─── Evaluate burnout-based UI adjustment ─────────────────────────────────
    evaluateBurnoutAdjustment() {
      const burnout = State.getPath('burnout') || {};
      const index = burnout.burnoutIndex || 0;
      const severity = burnout.severity || 'LOW';

      if (index >= 50) {
        const adjustment = BURNOUT_THEME_ADJUSTMENTS[severity.toLowerCase()] || BURNOUT_THEME_ADJUSTMENTS.low;
        currentTheme.burnoutAdjustment = adjustment.tone;
        currentTheme.active = 'recovery'; // softer palette

        EventBus.emit('THEME_OVERRIDE_APPLIED', {
          type: 'burnout',
          severity,
          tone: adjustment.tone
        });
      } else {
        currentTheme.burnoutAdjustment = null;
      }
    },

    // ─── Lockdown mode – strict focus override ────────────────────────────────
    applyLockdownMode(active) {
      currentTheme.lockdownActive = active;

      if (active) {
        // Apply lockdown theme tokens
        currentTheme.active = 'lockdown';
        currentTheme.rankAccent = LOCKDOWN_THEME.accent;
        currentTheme.riskOverride = null; // lockdown supersedes risk
        currentTheme.burnoutAdjustment = null;

        EventBus.emit('THEME_LOCKDOWN_ACTIVATED', {
          active: true,
          accent: LOCKDOWN_THEME.accent
        });
      } else {
        // Re-evaluate normal theme
        this.evaluateCurrentTheme();
        EventBus.emit('THEME_LOCKDOWN_ACTIVATED', { active: false });
      }

      applyThemeToState();
    },

    // ─── Apply user-selected theme preference ─────────────────────────────────
    applyUserThemePreference(themeId) {
      if (!themeId || themeId === currentTheme.active) return;

      currentTheme.userPreference = themeId;
      currentTheme.active = themeId;

      // User preference overrides rank/risk/burnout unless lockdown active
      if (!currentTheme.lockdownActive) {
        currentTheme.rankAccent = DEFAULT_ACCENT;
        currentTheme.riskOverride = null;
        currentTheme.burnoutAdjustment = null;
      }

      applyThemeToState();
      this.saveThemePreference(themeId);

      EventBus.emit('THEME_PERSONALIZED', { theme: themeId });
    },

    // ─── Get current theme state ──────────────────────────────────────────────
    getActiveTheme() {
      return { ...currentTheme };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.ThemeEngine = ThemeEngine;

  // Auto-init after badge engine
  function tryInit() {
    if (window.BadgeEngine && window.RankEngine && window.UserEngine && window.State && window.EventBus) {
      ThemeEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugTheme = {
    current: () => ThemeEngine.getActiveTheme(),
    lockdown: (active) => ThemeEngine.applyLockdownMode(active),
    setPref: (theme) => ThemeEngine.applyUserThemePreference(theme)
  };

})();