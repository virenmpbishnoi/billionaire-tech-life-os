/*
 * 40-charts.ui.js
 * Analytics Charts Controller – Billionaire Tech Adaptive Life OS
 *
 * Renders and updates all data visualization charts in the dashboard analytics section.
 * Uses lightweight, offline-compatible Chart.js (assumed bundled or embedded).
 * Charts include:
 *   - Life Score trend (line/area)
 *   - Discipline & Streak progress (bar/line)
 *   - Wealth growth & net worth (area/line)
 *   - Health metrics (multi-line)
 *   - Risk & Burnout levels (gauge/radar)
 *
 * Fully client-side, responsive, theme-aware, and real-time updating.
 *
 * Version: 1.0.0 – March 2026
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────

  const CHART_CONTAINER_ID = 'dashboard-analytics';
  const CHART_THEME_PREFIX = '--bt-chart-';

  // Chart IDs & their configurations
  const CHART_CONFIGS = {
    lifeScoreTrend: {
      id: 'life-score-trend',
      type: 'line',
      title: 'Life Score Trend',
      dataKey: 'scoreHistory',
      datasets: [
        { label: 'Life Score', color: 'primary', fill: true }
      ]
    },
    disciplineTrend: {
      id: 'discipline-trend',
      type: 'line',
      title: 'Discipline Index Trend',
      dataKey: 'disciplineHistory',
      datasets: [
        { label: 'Discipline Index', color: 'success', fill: false }
      ]
    },
    wealthGrowth: {
      id: 'wealth-growth',
      type: 'area',
      title: 'Wealth Growth',
      dataKey: 'wealthHistory',
      datasets: [
        { label: 'Wealth Index', color: 'warning', fill: true }
      ]
    },
    healthMetrics: {
      id: 'health-metrics',
      type: 'radar',
      title: 'Health Overview',
      dataKey: 'health.records',
      datasets: [
        { label: 'Daily Score', color: 'info' },
        { label: 'Sleep Quality', color: 'primary' }
      ]
    },
    riskBurnout: {
      id: 'risk-burnout',
      type: 'gauge',
      title: 'Risk & Burnout Levels',
      dataKey: 'risk.burnout',
      datasets: [
        { label: 'Risk Index', color: 'danger' },
        { label: 'Burnout Index', color: 'warning' }
      ]
    }
  };

  const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 800 },
    plugins: {
      legend: { position: 'top' },
      title: { display: true, padding: { top: 10, bottom: 20 } }
    },
    scales: {
      y: { beginAtZero: true, max: 100 }
    }
  };

  let chartInstances = {};          // chartId → Chart.js instance
  let isInitialized = false;

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  function getAnalyticsContainer() {
    return document.getElementById(CHART_CONTAINER_ID);
  }

  function createChartCanvas(chartId) {
    const container = getAnalyticsContainer();
    if (!container) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'chart-wrapper';
    wrapper.id = `chart-wrapper-${chartId}`;

    const canvas = document.createElement('canvas');
    canvas.id = `chart-${chartId}`;
    wrapper.appendChild(canvas);

    container.appendChild(wrapper);
    return canvas;
  }

  function getChartColors(theme) {
    return {
      primary:   getComputedStyle(document.documentElement).getPropertyValue('--bt-chart-primary').trim(),
      secondary: getComputedStyle(document.documentElement).getPropertyValue('--bt-chart-secondary').trim(),
      success:   getComputedStyle(document.documentElement).getPropertyValue('--bt-color-success').trim(),
      warning:   getComputedStyle(document.documentElement).getPropertyValue('--bt-color-warning').trim(),
      danger:    getComputedStyle(document.documentElement).getPropertyValue('--bt-color-danger').trim(),
      info:      getComputedStyle(document.documentElement).getPropertyValue('--bt-color-info').trim(),
      grid:      getComputedStyle(document.documentElement).getPropertyValue('--bt-chart-grid') || 'rgba(148,163,184,0.1)',
      text:      getComputedStyle(document.documentElement).getPropertyValue('--bt-chart-text') || '#cbd5e1'
    };
  }

  function applyThemeToChart(chartInstance) {
    if (!chartInstance) return;

    const colors = getChartColors();

    chartInstance.data.datasets.forEach((dataset, i) => {
      const colorKeys = ['primary', 'secondary', 'success', 'warning', 'danger', 'info'];
      const color = colors[colorKeys[i % colorKeys.length]];

      dataset.borderColor = color;
      dataset.backgroundColor = `${color}33`; // 20% opacity
    });

    chartInstance.options.scales.x.grid.color = colors.grid;
    chartInstance.options.scales.y.grid.color = colors.grid;
    chartInstance.options.plugins.legend.labels.color = colors.text;

    chartInstance.update();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CHART RENDERING & UPDATING
  // ─────────────────────────────────────────────────────────────────────────────

  function renderChart(chartId) {
    const config = CHART_CONFIGS[chartId];
    if (!config) return;

    const canvas = document.getElementById(`chart-${chartId}`);
    if (!canvas) {
      const newCanvas = createChartCanvas(chartId);
      if (!newCanvas) return;
    }

    const ctx = canvas.getContext('2d');
    const colors = getChartColors();

    const chartData = {
      labels: [],
      datasets: config.datasets.map(ds => ({
        label: ds.label,
        data: [],
        borderColor: colors[ds.color] || colors.primary,
        backgroundColor: `${colors[ds.color] || colors.primary}33`,
        fill: config.type === 'area',
        tension: 0.3
      }))
    };

    const chart = new Chart(ctx, {
      type: config.type === 'gauge' ? 'doughnut' : config.type,
      data: chartData,
      options: {
        ...CHART_DEFAULTS,
        plugins: {
          ...CHART_DEFAULTS.plugins,
          title: { display: true, text: config.title }
        }
      }
    });

    chartInstances[chartId] = chart;

    // Initial data load
    updateChart(chartId);

    EventBus.emit('CHART_RENDERED', { chartId });
  }

  function updateChart(chartId) {
    const chart = chartInstances[chartId];
    if (!chart) return;

    const config = CHART_CONFIGS[chartId];
    const dataKey = config.dataKey;

    let rawData = State.getPath(dataKey) || [];

    // Process data based on chart type
    if (config.type === 'line' || config.type === 'area') {
      // Time-series data expected
      const labels = rawData.map(item => new Date(item.timestamp || item.date).toLocaleDateString());
      chart.data.labels = labels;

      chart.data.datasets.forEach((ds, i) => {
        ds.data = rawData.map(item => item[Object.keys(item)[i + 1]] || 0);
      });
    } else if (config.type === 'radar') {
      // Multi-metric radar
      chart.data.labels = ['Sleep', 'Activity', 'Nutrition', 'Hydration'];
      chart.data.datasets[0].data = [
        State.getPath('health.dailyScore') * 10 || 0,
        // Add more metrics...
      ];
    } else if (config.type === 'gauge') {
      // Simplified gauge for risk/burnout
      const risk = State.getPath('risk.riskIndex') || 0;
      const burnout = State.getPath('burnout.burnoutIndex') || 0;
      chart.data.datasets[0].data = [risk, burnout];
    }

    chart.update();
    EventBus.emit('CHART_UPDATED', { chartId });
  }

  function resizeCharts() {
    Object.values(chartInstances).forEach(chart => {
      if (chart && chart.resize) chart.resize();
    });
    EventBus.emit('CHART_RESIZED');
  }

  function applyThemeToAllCharts() {
    Object.values(chartInstances).forEach(applyThemeToChart);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT SUBSCRIPTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  function subscribeToEvents() {
    EventBus.on('VIEW_RENDERED', ({ view }) => {
      if (view === 'dashboard') {
        // Initialize all charts when dashboard loads
        Object.keys(CHART_CONFIGS).forEach(renderChart);
      }
    });

    // Data update events
    EventBus.on('SCORE_UPDATED', () => updateChart('lifeScoreTrend'));
    EventBus.on('DISCIPLINE_UPDATED', () => updateChart('disciplineTrend'));
    EventBus.on('WEALTH_UPDATED', () => updateChart('wealthGrowth'));
    EventBus.on('HEALTH_METRICS_UPDATED', () => updateChart('healthMetrics'));
    EventBus.on('RISK_UPDATED', () => updateChart('riskBurnout'));
    EventBus.on('BURNOUT_UPDATED', () => updateChart('riskBurnout'));

    // Theme changes
    EventBus.on('THEME_UPDATED', applyThemeToAllCharts);

    // Window resize
    window.addEventListener('resize', resizeCharts);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC CHARTS UI API
  // ─────────────────────────────────────────────────────────────────────────────

  const ChartsUI = {

    init() {
      subscribeToEvents();

      // Initial render if dashboard already active
      if (document.querySelector('#dashboard-analytics')) {
        Object.keys(CHART_CONFIGS).forEach(renderChart);
      }

      console.log('[ChartsUI] Initialized – analytics visualization ready');
    },

    // ─── Force update all charts ──────────────────────────────────────────────
    refreshAll() {
      Object.keys(CHART_CONFIGS).forEach(updateChart);
    },

    // ─── Destroy all charts (cleanup) ─────────────────────────────────────────
    destroyAll() {
      Object.values(chartInstances).forEach(chart => chart?.destroy?.());
      chartInstances = {};
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL EXPOSURE & AUTO-INIT
  // ─────────────────────────────────────────────────────────────────────────────

  window.ChartsUI = ChartsUI;

  // Auto-init after dashboard UI
  function tryInit() {
    if (window.DashboardUI && window.State && window.EventBus) {
      ChartsUI.init();
    } else {
      setTimeout(tryInit, 50);
    }
  }

  tryInit();

  // Debug helpers
  window.__debugCharts = {
    refresh: () => ChartsUI.refreshAll(),
    destroy: () => ChartsUI.destroyAll()
  };

})();