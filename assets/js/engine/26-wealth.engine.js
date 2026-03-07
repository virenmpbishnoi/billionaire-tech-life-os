/*
 * 26-wealth.engine.js
 * Wealth Intelligence Engine – Billionaire Tech Adaptive Life OS
 *
 * Interprets raw financial data into actionable wealth intelligence:
 *   - Wealth Index (0–100) reflecting long-term financial strength
 *   - Income stability, savings rate, expense efficiency, investment growth
 *   - Trend analysis, decline detection, milestone rewards
 *
 * Feeds overall life score, risk engine, rank progression, analytics, and motivation.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & WEIGHTING MODEL
  // ─────────────────────────────────────────────────────────────────────────────

  const WEALTH_RANGES = {
    min: 0,
    max: 100,
    excellent: 90,
    strong: 75,
    moderate: 50,
    weak: 30,
    critical: 15
  };

  // Core component weights for Wealth Index (total = 1.0)
  const WEALTH_WEIGHTS = {
    incomeStability:   0.30,
    savingsRate:       0.25,
    expenseEfficiency: 0.20,
    investmentGrowth:  0.25
  };

  // Sub-weights within each component (total = 1.0 per category)
  const INCOME_STABILITY_WEIGHTS = {
    consistency: 0.50,      // low variance in monthly income
    growthTrend: 0.30,      // upward income trajectory
    diversification: 0.20   // multiple income sources
  };

  const SAVINGS_RATE_WEIGHTS = {
    rate: 0.60,             // net savings / income
    consistency: 0.40       // savings rate stability
  };

  const EXPENSE_EFFICIENCY_WEIGHTS = {
    essentialRatio: 0.50,   // essential vs total expenses
    volatility: 0.30,       // low spending fluctuations
    discretionaryControl: 0.20
  };

  const INVESTMENT_GROWTH_WEIGHTS = {
    returnRate: 0.50,
    diversification: 0.30,
    consistency: 0.20
  };

  const WEALTH_HISTORY_LIMIT = 90;     // Keep last 90 days
  const DECLINE_THRESHOLD = 10;        // % drop triggers warning
  const MILESTONE_LEVELS = [60, 75, 90];

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL STATE & HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function clampScore(value) {
    return Math.max(WEALTH_RANGES.min, Math.min(WEALTH_RANGES.max, Math.round(value)));
  }

  function weightedAverage(components, weights) {
    let total = 0;
    let weightSum = 0;

    Object.keys(components).forEach(key => {
      const value = components[key];
      const weight = weights[key] || 0;
      if (weight > 0 && typeof value === 'number' && !isNaN(value)) {
        total += value * weight;
        weightSum += weight;
      }
    });

    return weightSum > 0 ? total / weightSum : 0;
  }

  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function normalizeHistory(history) {
    const today = getTodayKey();
    const cleaned = { ...history };

    Object.keys(cleaned).sort().reverse().slice(WEALTH_HISTORY_LIMIT).forEach(date => {
      delete cleaned[date];
    });

    if (!cleaned[today]) {
      cleaned[today] = { wealthIndex: 0, timestamp: Date.now() };
    }

    return cleaned;
  }

  function calculateIncomeStability(finance) {
    const monthly = finance.summary?.monthlySummaries || {};
    const months = Object.keys(monthly).sort();

    if (months.length < 3) return 50; // neutral with insufficient data

    const incomes = months.map(m => monthly[m].income || 0);
    const avgIncome = incomes.reduce((sum, i) => sum + i, 0) / incomes.length;

    // Variance penalty
    const variance = incomes.reduce((sum, i) => sum + Math.pow(i - avgIncome, 2), 0) / incomes.length;
    const stability = Math.max(0, 100 - Math.sqrt(variance) / avgIncome * 100);

    // Growth trend
    const growthRate = months.length > 1
      ? ((incomes[incomes.length-1] - incomes[0]) / incomes[0]) * 100
      : 0;

    return weightedAverage(
      { stability, growthRate: Math.min(100, Math.max(0, growthRate + 50)) },
      INCOME_STABILITY_WEIGHTS
    );
  }

  function calculateSavingsRate(finance) {
    const current = finance.summary?.currentMonth || { income: 0, expense: 0 };
    if (current.income <= 0) return 0;

    const savings = current.income - current.expense;
    const rate = (savings / current.income) * 100;

    return Math.min(100, Math.max(0, rate * 2)); // 50% savings = 100 score
  }

  function calculateExpenseEfficiency(finance) {
    const current = finance.summary?.currentMonth || { expense: 0 };
    if (current.expense <= 0) return 100;

    // Placeholder essential vs discretionary ratio (would require category tagging)
    const volatility = 80; // mock - in real: std dev of daily expenses

    return clampScore(volatility);
  }

  function calculateInvestmentGrowth(finance) {
    const investments = finance.investments || [];
    if (investments.length === 0) return 50;

    const totalInvested = investments.reduce((sum, i) => sum + i.amount, 0);
    const currentValue = investments.reduce((sum, i) => sum + (i.currentValue || i.amount), 0);

    const growth = totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0;

    return clampScore(50 + growth * 2); // 25% growth = 100 score
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC WEALTH ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const WealthEngine = {

    async init() {
      // Recalculate on finance events via recalculation orchestrator
      EventBus.on('RECALCULATION_COMPLETED', () => {
        this.recalculateWealth();
      });

      // Load history when user logs in
      EventBus.on('USER_PROFILE_LOADED', async () => {
        await this.loadWealthHistory();
        this.recalculateWealth();
      });

      EventBus.on('SESSION_CREATED', async () => {
        await this.loadWealthHistory();
        this.recalculateWealth();
      });

      // Initial calculation if authenticated
      if (AuthSession?.isSessionActive()) {
        await this.loadWealthHistory();
        this.recalculateWealth();
      }

      console.log('[WealthEngine] Initialized – evaluating financial strength');
    },

    // ─── Load wealth history from storage ─────────────────────────────────────
    async loadWealthHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const historyKey = `user:${user.userId}:wealth:history`;
      let history = Storage.read(historyKey) || {};

      history = normalizeHistory(history);

      State.update('wealthHistory', history);
      State.update('wealth', history[getTodayKey()] || { wealthIndex: 0 });

      EventBus.emit('WEALTH_HISTORY_LOADED', {
        daysStored: Object.keys(history).length
      });
    },

    // ─── Save current wealth metrics to history ───────────────────────────────
    async saveWealthHistory() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const today = getTodayKey();
      const current = State.getPath('wealth') || {};
      const history = State.getPath('wealthHistory') || {};

      history[today] = {
        ...current,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      const normalized = normalizeHistory(history);
      State.update('wealthHistory', normalized);

      Storage.write(`user:${user.userId}:wealth:history`, normalized);
    },

    // ─── Core recalculation – aggregates financial intelligence ───────────────
    recalculateWealth() {
      try {
        const finance = State.getPath('finance') || {};

        const incomeStability   = calculateIncomeStability(finance);
        const savingsRate       = calculateSavingsRate(finance);
        const expenseEfficiency = calculateExpenseEfficiency(finance);
        const investmentGrowth  = calculateInvestmentGrowth(finance);

        const wealthIndex = clampScore(
          weightedAverage(
            {
              incomeStability,
              savingsRate,
              expenseEfficiency,
              investmentGrowth
            },
            WEALTH_WEIGHTS
          )
        );

        const previousIndex = State.getPath('wealth.wealthIndex') || wealthIndex;
        const change = wealthIndex - previousIndex;

        const metrics = {
          wealthIndex,
          incomeStability: clampScore(incomeStability),
          savingsRate: clampScore(savingsRate),
          expenseEfficiency: clampScore(expenseEfficiency),
          investmentGrowth: clampScore(investmentGrowth),
          change,
          trend: change > 0 ? 'growing' : change < 0 ? 'declining' : 'stable',
          updatedAt: Date.now()
        };

        State.update('wealth', metrics);

        this.saveWealthHistory();

        EventBus.emit('WEALTH_UPDATED', metrics);
        EventBus.emit('WEALTH_INDEX_UPDATED', { index: wealthIndex });

        // Decline detection
        if (change <= -DECLINE_THRESHOLD) {
          EventBus.emit('WEALTH_DECLINE_DETECTED', {
            previous: previousIndex,
            current: wealthIndex,
            drop: Math.abs(change)
          });
        }

        // Milestone rewards
        MILESTONE_LEVELS.forEach(level => {
          if (wealthIndex >= level && previousIndex < level) {
            EventBus.emit('WEALTH_MILESTONE_REACHED', { level });
          }
        });

        return metrics;
      } catch (err) {
        console.error('[WealthEngine] Recalculation failed:', err);
        EventBus.emit('WEALTH_ENGINE_ERROR', { error: err.message });
        return null;
      }
    },

    // ─── Get current wealth metrics ───────────────────────────────────────────
    getWealthMetrics() {
      return State.getPath('wealth') || {
        wealthIndex: 0,
        incomeStability: 0,
        savingsRate: 0,
        expenseEfficiency: 0,
        investmentGrowth: 0,
        updatedAt: Date.now()
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.WealthEngine = WealthEngine;

  // Auto-init after discipline engine
  function tryInit() {
    if (window.DisciplineEngine && window.FinanceEngine && window.UserEngine && window.State && window.EventBus) {
      WealthEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugWealth = {
    recalculate: () => WealthEngine.recalculateWealth(),
    metrics: () => WealthEngine.getWealthMetrics()
  };

})();