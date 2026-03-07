/*
 * 29-rank.engine.js
 * Rank Progression Intelligence Engine – Billionaire Tech Adaptive Life OS
 *
 * Determines user's current performance rank and progression path based on aggregated life metrics.
 * Ranks serve as motivational tiers and visual identity markers in the UI.
 *
 * Progression is primarily driven by Life Score, with secondary signals from discipline, wealth, streaks, etc.
 * Supports promotion celebrations, demotion warnings (rare), and milestone tracking.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // RANK HIERARCHY & THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────────

  const RANKS = [
    { name: 'BEGINNER',     minScore: 0,   color: '--bt-rank-beginner',     icon: 'seedling' },
    { name: 'DISCIPLINED',  minScore: 30,  color: '--bt-rank-disciplined',  icon: 'dumbbell' },
    { name: 'PERFORMER',    minScore: 45,  color: '--bt-rank-performer',    icon: 'running' },
    { name: 'ACHIEVER',     minScore: 60,  color: '--bt-rank-achiever',     icon: 'trophy' },
    { name: 'EXECUTOR',     minScore: 70,  color: '--bt-rank-executor',     icon: 'bolt' },
    { name: 'ELITE',        minScore: 80,  color: '--bt-rank-elite',        icon: 'star' },
    { name: 'CHAMPION',     minScore: 90,  color: '--bt-rank-champion',     icon: 'crown' },
    { name: 'LEGEND',       minScore: 95,  color: '--bt-rank-legend',       icon: 'fire' },
    { name: 'GRANDMASTER',  minScore: 98,  color: '--bt-rank-grandmaster',  icon: 'chess-king' }
  ];

  const DEMOTION_TOLERANCE = 5;           // Points below threshold before demotion
  const PROMOTION_COOLDOWN_DAYS = 3;      // Minimum days between promotions
  const HISTORY_LIMIT = 180;              // Keep last 180 days of rank history

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE & HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  let lastPromotionDate = null;

  function getRankForScore(score) {
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (score >= RANKS[i].minScore) {
        return RANKS[i];
      }
    }
    return RANKS[0]; // fallback to BEGINNER
  }

  function calculateProgressToNext(currentScore) {
    const currentRank = getRankForScore(currentScore);
    const currentIndex = RANKS.findIndex(r => r.name === currentRank.name);

    if (currentIndex >= RANKS.length - 1) {
      return { progress: 100, nextRank: null }; // already at top
    }

    const nextRank = RANKS[currentIndex + 1];
    const range = nextRank.minScore - currentRank.minScore;
    const progress = Math.min(100, Math.round(((currentScore - currentRank.minScore) / range) * 100));

    return { progress, nextRank };
  }

  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function normalizeHistory(history) {
    const today = getTodayKey();
    const cleaned = { ...history };

    Object.keys(cleaned).sort().reverse().slice(HISTORY_LIMIT).forEach(date => {
      delete cleaned[date];
    });

    return cleaned;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC RANK ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const RankEngine = {

    async init() {
      // Recalculate on major score updates
      EventBus.on('RECALCULATION_COMPLETED', () => {
        this.recalculateRank();
      });

      EventBus.on('SCORE_UPDATED', () => {
        this.recalculateRank();
      });

      // Load history on login
      EventBus.on('USER_PROFILE_LOADED', async () => {
        await this.loadRankHistory();
        this.recalculateRank();
      });

      EventBus.on('SESSION_CREATED', async () => {
        await this.loadRankHistory();
        this.recalculateRank();
      });

      // Initial calculation if authenticated
      if (AuthSession?.isSessionActive()) {
        await this.loadRankHistory();
        this.recalculateRank();
      }

      // Periodic rank stability check (daily)
      setInterval(() => this.recalculateRank(), 24 * 60 * 60 * 1000);

      console.log('[RankEngine] Initialized – tracking performance hierarchy progression');
    },

    // ─── Load rank history from storage ───────────────────────────────────────
    async loadRankHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const historyKey = `user:${user.userId}:rank:history`;
      let history = Storage.read(historyKey) || {};

      history = normalizeHistory(history);

      State.update('rankHistory', history);

      EventBus.emit('RANK_HISTORY_LOADED', {
        daysStored: Object.keys(history).length
      });
    },

    // ─── Save current rank to history ─────────────────────────────────────────
    async saveRankHistory(currentRank) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const today = getTodayKey();
      const history = State.getPath('rankHistory') || {};

      history[today] = {
        rank: currentRank.name,
        lifeScore: State.getPath('scores.lifeScore') || 0,
        disciplineIndex: State.getPath('discipline.disciplineIndex') || 0,
        wealthIndex: State.getPath('wealth.wealthIndex') || 0,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      const normalized = normalizeHistory(history);
      State.update('rankHistory', normalized);

      Storage.write(`user:${user.userId}:rank:history`, normalized);
    },

    // ─── Core rank recalculation ──────────────────────────────────────────────
    recalculateRank() {
      try {
        const lifeScore = State.getPath('scores.lifeScore') || 0;
        const currentUserRank = State.getPath('rank.current') || RANKS[0].name;

        const newRank = getRankForScore(lifeScore);
        const { progress, nextRank } = calculateProgressToNext(lifeScore);

        const previousRank = currentUserRank;
        const isPromotion = RANKS.findIndex(r => r.name === newRank.name) >
                            RANKS.findIndex(r => r.name === previousRank);
        const isDemotion = RANKS.findIndex(r => r.name === newRank.name) <
                           RANKS.findIndex(r => r.name === previousRank);

        // Promotion cooldown check
        if (isPromotion && lastPromotionDate) {
          const daysSinceLast = (Date.now() - lastPromotionDate) / (24 * 60 * 60 * 1000);
          if (daysSinceLast < PROMOTION_COOLDOWN_DAYS) {
            // Delay promotion until cooldown passes
            return;
          }
        }

        const metrics = {
          current: newRank.name,
          previous: previousRank,
          progressToNext: progress,
          nextRank: nextRank ? nextRank.name : null,
          lifeScore,
          updatedAt: Date.now()
        };

        State.update('rank', metrics);

        this.saveRankHistory(newRank);

        EventBus.emit('RANK_UPDATED', metrics);

        if (isPromotion) {
          lastPromotionDate = Date.now();
          EventBus.emit('RANK_PROMOTED', {
            newRank: newRank.name,
            previousRank,
            lifeScore,
            timestamp: Date.now()
          });
        } else if (isDemotion && lifeScore < (RANKS.find(r => r.name === previousRank).minScore - DEMOTION_TOLERANCE)) {
          EventBus.emit('RANK_DEMOTED', {
            newRank: newRank.name,
            previousRank,
            lifeScore,
            timestamp: Date.now()
          });
        }

        EventBus.emit('RANK_PROGRESS_UPDATED', {
          progress,
          nextRank: nextRank?.name
        });

        return metrics;
      } catch (err) {
        console.error('[RankEngine] Recalculation failed:', err);
        EventBus.emit('RANK_ENGINE_ERROR', { error: err.message });
        return null;
      }
    },

    // ─── Get current rank information ─────────────────────────────────────────
    getCurrentRank() {
      const rankState = State.getPath('rank') || {};
      const rankObj = RANKS.find(r => r.name === rankState.current) || RANKS[0];

      return {
        name: rankState.current || 'BEGINNER',
        color: rankObj.color,
        icon: rankObj.icon,
        progressToNext: rankState.progressToNext || 0,
        nextRank: rankState.nextRank || null,
        lifeScore: State.getPath('scores.lifeScore') || 0
      };
    },

    // ─── Manual rank promotion (admin/debug) ──────────────────────────────────
    forcePromote() {
      const current = this.getCurrentRank();
      const index = RANKS.findIndex(r => r.name === current.name);
      if (index >= RANKS.length - 1) return;

      const nextRank = RANKS[index + 1];
      State.update('rank.current', nextRank.name);
      lastPromotionDate = Date.now();

      EventBus.emit('RANK_PROMOTED', {
        newRank: nextRank.name,
        previousRank: current.name,
        forced: true
      });

      this.recalculateRank();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.RankEngine = RankEngine;

  // Auto-init after burnout engine
  function tryInit() {
    if (window.BurnoutEngine && window.ScoreEngine && window.UserEngine && window.State && window.EventBus) {
      RankEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugRank = {
    recalculate: () => RankEngine.recalculateRank(),
    current: () => RankEngine.getCurrentRank(),
    promote: () => RankEngine.forcePromote()
  };

})();