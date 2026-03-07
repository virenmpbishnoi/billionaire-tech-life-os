/*
 * 20-finance.engine.js
 * Financial Intelligence Engine – Billionaire Tech Adaptive Life OS
 *
 * Manages all financial tracking and intelligence:
 *   - Income & expense transactions
 *   - Savings & investment positions
 *   - Monthly summaries & categorization
 *   - Wealth index calculation
 *   - Risk & discipline signals
 *
 * Forms the financial awareness layer — feeds wealth, risk, rank, analytics.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const TRANSACTION_TYPES = {
    income: 'income',
    expense: 'expense',
    investment: 'investment',
    saving: 'saving',
    withdrawal: 'withdrawal'
  };

  const DEFAULT_TRANSACTION = {
    transactionId: null,
    userId: null,
    type: null,
    amount: 0,
    category: 'uncategorized',
    description: '',
    account: 'main',              // e.g. cash, checking, investment
    tags: [],
    timestamp: null,
    recurring: false,
    recurrencePattern: null       // e.g. { type: 'monthly', day: 1 }
  };

  const DEFAULT_INVESTMENT = {
    investmentId: null,
    name: '',
    type: 'stock',                // stock, crypto, real-estate, etc.
    ticker: '',
    amount: 0,
    purchaseDate: null,
    currentValue: 0,
    notes: ''
  };

  const FINANCIAL_CATEGORIES = {
    income: ['salary', 'freelance', 'investment-return', 'other'],
    expense: ['food', 'transport', 'housing', 'utilities', 'entertainment', 'health', 'education', 'misc']
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getTransactionsKey(userId) {
    return `user:${userId}:finance:transactions`;
  }

  function getInvestmentsKey(userId) {
    return `user:${userId}:finance:investments`;
  }

  function generateTransactionId() {
    return 'txn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function generateInvestmentId() {
    return 'inv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function validateTransaction(tx) {
    if (!tx || typeof tx !== 'object') throw new Error('Invalid transaction');
    if (!tx.transactionId || !tx.userId || !tx.type) {
      throw new Error('Transaction missing required fields: transactionId, userId, type');
    }
    if (!Object.values(TRANSACTION_TYPES).includes(tx.type)) {
      throw new Error(`Invalid transaction type: ${tx.type}`);
    }
    if (typeof tx.amount !== 'number' || isNaN(tx.amount)) {
      throw new Error('Amount must be a valid number');
    }
    if (tx.type === TRANSACTION_TYPES.income && tx.amount <= 0) {
      throw new Error('Income amount must be positive');
    }
    if (tx.type === TRANSACTION_TYPES.expense && tx.amount >= 0) {
      throw new Error('Expense amount must be negative or use positive convention');
    }
    // Deeper validation via validation.engine
    return true;
  }

  function calculateNetWorth(transactions, investments) {
    let balance = 0;
    transactions.forEach(tx => {
      balance += tx.amount;
    });

    let invTotal = 0;
    investments.forEach(inv => {
      invTotal += inv.currentValue || inv.amount;
    });

    return balance + invTotal;
  }

  function calculateMonthlySummary(transactions) {
    const now = new Date();
    const currentMonth = now.getFullYear() * 100 + now.getMonth() + 1;

    const monthly = transactions.reduce((acc, tx) => {
      const date = new Date(tx.timestamp);
      const monthKey = date.getFullYear() * 100 + date.getMonth() + 1;

      if (!acc[monthKey]) {
        acc[monthKey] = { income: 0, expense: 0, net: 0 };
      }

      if (tx.type === TRANSACTION_TYPES.income) {
        acc[monthKey].income += tx.amount;
      } else if (tx.type === TRANSACTION_TYPES.expense) {
        acc[monthKey].expense += Math.abs(tx.amount);
      }

      acc[monthKey].net = acc[monthKey].income - acc[monthKey].expense;
      return acc;
    }, {});

    return {
      monthlySummaries: monthly,
      currentMonth: monthly[currentMonth] || { income: 0, expense: 0, net: 0 }
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC FINANCE ENGINE API
  // ─────────────────────────────────────────────────────────────────────────────

  const FinanceEngine = {

    async init() {
      // Load financial data when user is authenticated
      EventBus.on('USER_PROFILE_LOADED', async ({ userId }) => {
        await this.loadFinancialData(userId);
      });

      EventBus.on('SESSION_CREATED', async ({ userId }) => {
        await this.loadFinancialData(userId);
      });

      // Listen for transaction requests from UI
      EventBus.on('FINANCE_ADD_INCOME_REQUEST', (data) => this.addIncome(data));
      EventBus.on('FINANCE_ADD_EXPENSE_REQUEST', (data) => this.addExpense(data));

      // Initial load if already logged in
      if (AuthSession?.isSessionActive()) {
        const userId = AuthSession.getCurrentUserId();
        if (userId) await this.loadFinancialData(userId);
      }

      console.log('[FinanceEngine] Initialized – tracking financial intelligence');
    },

    // ─── Load all financial data for current user ─────────────────────────────
    async loadFinancialData(userId) {
      const txKey = getTransactionsKey(userId);
      const invKey = getInvestmentsKey(userId);

      let transactions = Storage.read(txKey) || [];
      let investments = Storage.read(invKey) || [];

      // Basic validation & normalization
      transactions = transactions.filter(tx => {
        try {
          validateTransaction(tx);
          return true;
        } catch {
          return false;
        }
      });

      investments = investments.map(inv => ({
        ...DEFAULT_INVESTMENT,
        ...inv
      }));

      State.update('finance', {
        transactions,
        investments,
        summary: calculateMonthlySummary(transactions),
        netWorth: calculateNetWorth(transactions, investments)
      });

      EventBus.emit('FINANCE_DATA_LOADED', {
        userId,
        transactionCount: transactions.length,
        investmentCount: investments.length
      });

      Recalculation?.trigger('FINANCE_DATA_LOADED');

      return { transactions, investments };
    },

    // ─── Add income transaction ───────────────────────────────────────────────
    async addIncome(data) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) throw new Error('Authenticated user required');

      const transaction = {
        ...DEFAULT_TRANSACTION,
        ...data,
        transactionId: generateTransactionId(),
        userId: user.userId,
        type: TRANSACTION_TYPES.income,
        amount: Math.abs(data.amount || 0),
        timestamp: Date.now()
      };

      validateTransaction(transaction);

      const finance = State.getPath('finance') || { transactions: [] };
      finance.transactions.push(transaction);

      State.update('finance', {
        ...finance,
        transactions: finance.transactions,
        summary: calculateMonthlySummary(finance.transactions),
        netWorth: calculateNetWorth(finance.transactions, finance.investments || [])
      });

      await this.saveTransactions();

      EventBus.emit('FINANCE_INCOME_ADDED', {
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        category: transaction.category,
        timestamp: transaction.timestamp
      });

      Recalculation?.trigger('FINANCE_INCOME_ADDED');

      return transaction;
    },

    // ─── Add expense transaction ──────────────────────────────────────────────
    async addExpense(data) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) throw new Error('Authenticated user required');

      const transaction = {
        ...DEFAULT_TRANSACTION,
        ...data,
        transactionId: generateTransactionId(),
        userId: user.userId,
        type: TRANSACTION_TYPES.expense,
        amount: -Math.abs(data.amount || 0),  // negative for expenses
        timestamp: Date.now()
      };

      validateTransaction(transaction);

      const finance = State.getPath('finance') || { transactions: [] };
      finance.transactions.push(transaction);

      State.update('finance', {
        ...finance,
        transactions: finance.transactions,
        summary: calculateMonthlySummary(finance.transactions),
        netWorth: calculateNetWorth(finance.transactions, finance.investments || [])
      });

      await this.saveTransactions();

      EventBus.emit('FINANCE_EXPENSE_ADDED', {
        transactionId: transaction.transactionId,
        amount: Math.abs(transaction.amount),
        category: transaction.category,
        timestamp: transaction.timestamp
      });

      Recalculation?.trigger('FINANCE_EXPENSE_ADDED');

      return transaction;
    },

    // ─── Add investment position ──────────────────────────────────────────────
    async addInvestment(data) {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) throw new Error('Authenticated user required');

      const investment = {
        ...DEFAULT_INVESTMENT,
        ...data,
        investmentId: generateInvestmentId(),
        purchaseDate: Date.now()
      };

      const finance = State.getPath('finance') || { investments: [] };
      finance.investments.push(investment);

      State.update('finance', {
        ...finance,
        investments: finance.investments,
        netWorth: calculateNetWorth(finance.transactions || [], finance.investments)
      });

      await this.saveInvestments();

      EventBus.emit('FINANCE_INVESTMENT_ADDED', {
        investmentId: investment.investmentId,
        name: investment.name,
        amount: investment.amount,
        type: investment.type
      });

      Recalculation?.trigger('FINANCE_INVESTMENT_ADDED');

      return investment;
    },

    // ─── Persistence helpers ──────────────────────────────────────────────────
    async saveTransactions() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const transactions = State.getPath('finance.transactions') || [];
      Storage.write(getTransactionsKey(user.userId), transactions);
    },

    async saveInvestments() {
      const user = UserEngine.getCurrentUser();
      if (!user?.userId) return;

      const investments = State.getPath('finance.investments') || [];
      Storage.write(getInvestmentsKey(user.userId), investments);
    },

    // ─── Financial analytics & wealth index ───────────────────────────────────
    calculateWealthIndex() {
      const finance = State.getPath('finance') || {};
      const transactions = finance.transactions || [];
      const investments = finance.investments || [];

      const netWorth = calculateNetWorth(transactions, investments);

      // Simple wealth index (0–1000 scale) – can be expanded
      const monthlyIncome = finance.summary?.currentMonth?.income || 0;
      const savingsRate = monthlyIncome > 0
        ? (finance.summary?.currentMonth?.net / monthlyIncome) * 100
        : 0;

      let index = Math.min(1000, Math.max(0,
        (netWorth / 10000) +                 // net worth component
        (monthlyIncome * 0.1) +              // income flow
        (savingsRate * 5) +                  // savings discipline
        (investments.length * 20)            // diversification
      ));

      return Math.round(index);
    },

    getFinanceStats() {
      const finance = State.getPath('finance') || {};
      const tx = finance.transactions || [];

      const byCategory = tx.reduce((acc, t) => {
        const cat = t.category || 'uncategorized';
        if (!acc[cat]) acc[cat] = { income: 0, expense: 0 };
        if (t.type === TRANSACTION_TYPES.income) acc[cat].income += t.amount;
        if (t.type === TRANSACTION_TYPES.expense) acc[cat].expense += Math.abs(t.amount);
        return acc;
      }, {});

      return {
        netWorth: finance.netWorth || 0,
        wealthIndex: this.calculateWealthIndex(),
        monthlySummary: finance.summary?.currentMonth || { income: 0, expense: 0, net: 0 },
        categoryBreakdown: byCategory,
        transactionCount: tx.length
      };
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.FinanceEngine = FinanceEngine;

  // Auto-init after mission engine (order preserved)
  function tryInit() {
    if (window.MissionEngine && window.UserEngine && window.Storage && window.State && window.EventBus) {
      FinanceEngine.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugFinance = {
    addIncome: (data) => FinanceEngine.addIncome(data),
    addExpense: (data) => FinanceEngine.addExpense(data),
    stats: () => FinanceEngine.getFinanceStats(),
    wealthIndex: () => FinanceEngine.calculateWealthIndex()
  };

})();