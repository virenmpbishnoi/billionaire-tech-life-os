/*
 * 30-badge.engine.js
 * Achievement Badge Intelligence Engine – Billionaire Tech Adaptive Life OS
 *
 * Detects and unlocks badges based on milestone achievements across all domains.
 * Badges serve as visual rewards, motivation signals, and progression markers.
 *
 * Badge categories align with life domains and major milestones:
 *   - Discipline (streaks, consistency)
 *   - Productivity (tasks, missions, targets)
 *   - Wealth (financial goals, savings, wealth index)
 *   - Health (workout, sleep, nutrition)
 *   - Rank (tier promotions)
 *   - Achievement (special events, grand milestones)
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // BADGE DEFINITIONS & CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────

  // Badge tiers correspond to --bt-badge-tier-* variables in CSS
  const BADGE_TIERS = {
    1: { name: 'Bronze',    color: '--bt-badge-tier-1', rarity: 'common' },
    2: { name: 'Silver',    color: '--bt-badge-tier-2', rarity: 'uncommon' },
    3: { name: 'Gold',      color: '--bt-badge-tier-3', rarity: 'rare' },
    4: { name: 'Platinum',  color: '--bt-badge-tier-4', rarity: 'epic' },
    5: { name: 'Diamond',   color: '--bt-badge-tier-5', rarity: 'legendary' }
  };

  // Badge categories (used for grouping & analytics)
  const BADGE_CATEGORIES = {
    DISCIPLINE:   'discipline',
    PRODUCTIVITY: 'productivity',
    WEALTH:       'wealth',
    HEALTH:       'health',
    RANK:         'rank',
    ACHIEVEMENT:  'achievement',
    SPECIAL:      'special'
  };

  // Badge definitions – triggered by specific events or conditions
  const BADGE_DEFINITIONS = [
    // Rank-based badges
    {
      id: 'rank_disciplined',
      name: 'Disciplined Initiate',
      category: BADGE_CATEGORIES.RANK,
      tier: 2,
      condition: { event: 'RANK_PROMOTED', rank: 'DISCIPLINED' },
      description: 'Achieved Disciplined rank'
    },
    {
      id: 'rank_elite',
      name: 'Elite Executor',
      category: BADGE_CATEGORIES.RANK,
      tier: 4,
      condition: { event: 'RANK_PROMOTED', rank: 'ELITE' },
      description: 'Reached Elite rank – top-tier performance'
    },
    {
      id: 'rank_grandmaster',
      name: 'Grandmaster of Life',
      category: BADGE_CATEGORIES.RANK,
      tier: 5,
      condition: { event: 'RANK_PROMOTED', rank: 'GRANDMASTER' },
      description: 'Attained the highest rank – Grandmaster'
    },

    // Discipline & Streak badges
    {
      id: 'streak_30',
      name: '30-Day Consistency Master',
      category: BADGE_CATEGORIES.DISCIPLINE,
      tier: 3,
      condition: { event: 'STREAK_MILESTONE_REACHED', milestone: 30 },
      description: 'Maintained a 30-day streak in any discipline'
    },
    {
      id: 'streak_365',
      name: 'Year of Unbroken Discipline',
      category: BADGE_CATEGORIES.DISCIPLINE,
      tier: 5,
      condition: { event: 'STREAK_MILESTONE_REACHED', milestone: 365 },
      description: 'One full year without breaking a streak'
    },
    {
      id: 'discipline_90',
      name: 'Discipline Virtuoso',
      category: BADGE_CATEGORIES.DISCIPLINE,
      tier: 4,
      condition: { metric: 'disciplineIndex', threshold: 90 },
      description: 'Discipline Index reached 90+'
    },

    // Wealth badges
    {
      id: 'wealth_60',
      name: 'Financial Foundation Builder',
      category: BADGE_CATEGORIES.WEALTH,
      tier: 2,
      condition: { metric: 'wealthIndex', threshold: 60 },
      description: 'Wealth Index reached 60'
    },
    {
      id: 'wealth_90',
      name: 'Wealth Architect',
      category: BADGE_CATEGORIES.WEALTH,
      tier: 5,
      condition: { metric: 'wealthIndex', threshold: 90 },
      description: 'Wealth Index reached 90 – elite financial position'
    },

    // Health & routine badges
    {
      id: 'health_consistent',
      name: 'Vitality Guardian',
      category: BADGE_CATEGORIES.HEALTH,
      tier: 3,
      condition: { event: 'HEALTH_METRICS_UPDATED', sleepQualityAvg: 4.5, workoutDays: 5 },
      description: 'Maintained high sleep quality and weekly workouts'
    },

    // Achievement & special
    {
      id: 'first_mission',
      name: 'Mission Pioneer',
      category: BADGE_CATEGORIES.ACHIEVEMENT,
      tier: 2,
      condition: { event: 'MISSION_COMPLETED', first: true },
      description: 'Completed your first mission'
    },
    {
      id: 'grand_achievement',
      name: 'Life Mastery Initiate',
      category: BADGE_CATEGORIES.ACHIEVEMENT,
      tier: 5,
      condition: { event: 'MULTIPLE_MILESTONES', count: 10 },
      description: 'Unlocked 10+ major milestones across domains'
    }
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE & HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  let unlockedBadges = new Set();  // badgeId → true (prevent duplicates)

  function getBadgeHistoryKey(userId) {
    return `user:${userId}:badges:history`;
  }

  function isBadgeUnlocked(badgeId) {
    return unlockedBadges.has(badgeId);
  }

  function markBadgeUnlocked(badgeId, tier = 1) {
    unlockedBadges.add(badgeId);
    // Could store tier if badges have progression levels
  }

  function getBadgeDefinition(badgeId) {
    return BADGE_DEFINITIONS.find(b => b.id === badgeId);
  }

  function shouldTriggerAlert(badge) {
    // Only alert for tier 3+ or special badges
    return badge.tier >= 3 || badge.category === BADGE_CATEGORIES.ACHIEVEMENT;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC BADGE ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const BadgeEngine = {

    async init() {
      // Load previously unlocked badges
      const user = UserEngine.getCurrentUser();
      if (user?.userId) {
        const history = Storage.read(getBadgeHistoryKey(user.userId)) || [];
        history.forEach(entry => {
          if (entry.badgeId) unlockedBadges.add(entry.badgeId);
        });
      }

      // Listen for milestone events that can unlock badges
      EventBus.on('RANK_PROMOTED', (payload) => this.evaluateRankBadges(payload));
      EventBus.on('STREAK_MILESTONE_REACHED', (payload) => this.evaluateStreakBadges(payload));
      EventBus.on('WEALTH_MILESTONE_REACHED', (payload) => this.evaluateWealthBadges(payload));
      EventBus.on('DISCIPLINE_STREAK_REWARDED', (payload) => this.evaluateDisciplineBadges(payload));
      EventBus.on('MISSION_COMPLETED', (payload) => this.evaluateMissionBadges(payload));

      // Periodic badge progress check (for non-event-based conditions)
      setInterval(() => this.evaluateContinuousConditions(), 6 * 60 * 60 * 1000); // every 6 hours

      console.log('[BadgeEngine] Initialized – monitoring achievement milestones');
    },

    // ─── Evaluate badges triggered by rank promotion ──────────────────────────
    evaluateRankBadges({ newRank }) {
      const matchingBadges = BADGE_DEFINITIONS.filter(b =>
        b.condition?.event === 'RANK_PROMOTED' &&
        b.condition?.rank === newRank
      );

      matchingBadges.forEach(badge => {
        if (!isBadgeUnlocked(badge.id)) {
          this.unlockBadge(badge.id, badge.tier);
        }
      });
    },

    // ─── Evaluate badges triggered by streak milestones ───────────────────────
    evaluateStreakBadges({ milestone }) {
      const matching = BADGE_DEFINITIONS.filter(b =>
        b.condition?.event === 'STREAK_MILESTONE_REACHED' &&
        b.condition?.milestone === milestone
      );

      matching.forEach(badge => {
        if (!isBadgeUnlocked(badge.id)) {
          this.unlockBadge(badge.id, badge.tier);
        }
      });
    },

    // ─── Evaluate wealth-based badges ─────────────────────────────────────────
    evaluateWealthBadges({ level }) {
      const matching = BADGE_DEFINITIONS.filter(b =>
        b.condition?.metric === 'wealthIndex' &&
        b.condition?.threshold === level
      );

      matching.forEach(badge => {
        if (!isBadgeUnlocked(badge.id)) {
          this.unlockBadge(badge.id, badge.tier);
        }
      });
    },

    // ─── Evaluate discipline-based badges ─────────────────────────────────────
    evaluateDisciplineBadges({ level }) {
      // Similar pattern – can expand with discipline-specific milestones
    },

    // ─── Evaluate mission completion badges ───────────────────────────────────
    evaluateMissionBadges({ missionId }) {
      // First mission special case
      const unlocked = Storage.read(`user:${UserEngine.getCurrentUser()?.userId}:badges:history`) || [];
      const hasFirstMission = unlocked.some(e => e.badgeId === 'first_mission');

      if (!hasFirstMission) {
        this.unlockBadge('first_mission', 2);
      }
    },

    // ─── Periodic check for non-event badges (index thresholds, etc.) ─────────
    evaluateContinuousConditions() {
      const disciplineIndex = State.getPath('discipline.disciplineIndex') || 0;
      const wealthIndex     = State.getPath('wealth.wealthIndex') || 0;

      // Discipline 90+
      if (disciplineIndex >= 90) {
        const badge = BADGE_DEFINITIONS.find(b => b.id === 'discipline_90');
        if (badge && !isBadgeUnlocked(badge.id)) {
          this.unlockBadge(badge.id, badge.tier);
        }
      }

      // Wealth 90+
      if (wealthIndex >= 90) {
        const badge = BADGE_DEFINITIONS.find(b => b.id === 'wealth_90');
        if (badge && !isBadgeUnlocked(badge.id)) {
          this.unlockBadge(badge.id, badge.tier);
        }
      }
    },

    // ─── Unlock a specific badge ──────────────────────────────────────────────
    unlockBadge(badgeId, tier = 1) {
      const badge = getBadgeDefinition(badgeId);
      if (!badge) {
        console.warn('[BadgeEngine] Attempted to unlock unknown badge:', badgeId);
        return;
      }

      if (isBadgeUnlocked(badgeId)) {
        console.log('[BadgeEngine] Badge already unlocked:', badgeId);
        return;
      }

      markBadgeUnlocked(badgeId, tier);

      const user = UserEngine.getCurrentUser();
      const entry = {
        badgeId,
        name: badge.name,
        category: badge.category,
        tier,
        unlockedAt: Date.now(),
        userId: user?.userId
      };

      // Save to history
      const historyKey = getBadgeHistoryKey(user?.userId);
      const history = Storage.read(historyKey) || [];
      history.push(entry);
      Storage.write(historyKey, history);

      // Update state (optional – can keep in-memory Set or sync full list)
      const unlockedList = State.getPath('badges.unlocked') || [];
      unlockedList.push(entry);
      State.update('badges.unlocked', unlockedList);

      EventBus.emit('BADGE_UNLOCKED', {
        badgeId,
        name: badge.name,
        category: badge.category,
        tier,
        description: badge.description,
        timestamp: Date.now()
      });

      if (shouldTriggerAlert(badge)) {
        EventBus.emit('NOTIFICATION_PUSH', {
          type: 'badge_unlocked',
          title: `Badge Unlocked: ${badge.name}`,
          message: badge.description,
          badgeId,
          tier
        });
      }

      console.log('[BadgeEngine] Badge unlocked:', badge.name, '(Tier', tier, ')');
    },

    // ─── Get all unlocked badges ──────────────────────────────────────────────
    getUnlockedBadges() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return [];

      const history = Storage.read(getBadgeHistoryKey(user.userId)) || [];
      return history;
    },

    // ─── Get badge statistics ─────────────────────────────────────────────────
    getBadgeStats() {
      const badges = this.getUnlockedBadges();

      const byCategory = badges.reduce((acc, b) => {
        acc[b.category] = (acc[b.category] || 0) + 1;
        return acc;
      }, {});

      const byTier = badges.reduce((acc, b) => {
        acc[b.tier] = (acc[b.tier] || 0) + 1;
        return acc;
      }, {});

      return {
        totalUnlocked: badges.length,
        byCategory,
        byTier,
        mostRecent: badges[badges.length - 1] || null
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.BadgeEngine = BadgeEngine;

  // Auto-init after rank engine
  function tryInit() {
    if (window.RankEngine && window.UserEngine && window.Storage && window.State && window.EventBus) {
      BadgeEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugBadges = {
    unlock: (id) => BadgeEngine.unlockBadge(id),
    list: () => BadgeEngine.getUnlockedBadges(),
    stats: () => BadgeEngine.getBadgeStats()
  };

})();