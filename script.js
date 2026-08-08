const GA_MEASUREMENT_ID = 'G-4DPCVB9L73';
const ANALYTICS_CONSENT_KEY = 'qa-dashboard-analytics-consent';
const RECENT_ACTIVITY_LIMIT = 12;
let liveRunRecords = [];

function loadGoogleAnalytics() {
  if (window.gtagLoaded) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);
  window.gtagLoaded = true;
}

function setAnalyticsConsent(choice) {
  localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
  document.querySelector('.cookie-banner')?.setAttribute('hidden', '');

  if (choice === 'accepted') {
    loadGoogleAnalytics();
  }
}

function initAnalyticsConsent() {
  const savedChoice = localStorage.getItem(ANALYTICS_CONSENT_KEY);
  const banner = document.querySelector('.cookie-banner');

  if (savedChoice === 'accepted') {
    loadGoogleAnalytics();
  } else if (!savedChoice && banner) {
    banner.removeAttribute('hidden');
  }

  document.querySelectorAll('[data-cookie-choice]').forEach(button => {
    button.addEventListener('click', () => {
      setAnalyticsConsent(button.dataset.cookieChoice);
    });
  });

  document.querySelectorAll('[data-reset-cookie-choice]').forEach(button => {
    button.addEventListener('click', () => {
      localStorage.removeItem(ANALYTICS_CONSENT_KEY);
      banner?.removeAttribute('hidden');
    });
  });
}

async function initLiveDashboard() {
  try {
    const cacheKey = Date.now();
    const [runResponse, appResponse, coverageResponse] = await Promise.all([
      fetch(`data/runs.json?updated=${cacheKey}`, { cache: 'no-store' }),
      fetch(`data/apps.json?updated=${cacheKey}`, { cache: 'no-store' }),
      fetch(`data/coverage.json?updated=${cacheKey}`, { cache: 'no-store' })
    ]);
    if (!runResponse.ok || !appResponse.ok) throw new Error(`HTTP ${runResponse.status}/${appResponse.status}`);

    const [records, apps, coverage] = await Promise.all([
      runResponse.json(),
      appResponse.json(),
      coverageResponse.ok ? coverageResponse.json() : null
    ]);
    renderCoverageMetrics(coverage);
    renderApplications(Array.isArray(apps) ? apps : [], Array.isArray(records) ? records : [], coverage);
    if (Array.isArray(records) && records.length) renderLiveDashboard(records, coverage);
  } catch (error) {
    const updated = document.querySelector('#live-runs-updated');
    if (updated) updated.textContent = 'Live telemetry is temporarily unavailable.';
    console.warn('Could not load live dashboard data.', error);
  }
}

function renderLiveDashboard(records, coverage) {
  const sorted = [...records].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  const chronological = [...sorted].reverse();
  liveRunRecords = sorted;

  const latest = sorted[0];
  const passed = numberValue(latest.testSummary?.passed);
  const failed = numberValue(latest.testSummary?.failed);
  setText('#latest-status-title', latest.suiteName || 'Latest agent run');
  setText('#latest-status-summary', `${passed} passed, ${failed} failed. Published ${relativeTime(latest.finishedAt || latest.startedAt)}.`);
  setStatusClass(document.querySelector('#latest-status-dot'), latest.status);

  const coveragePoints = (coverage?.history || []).map(snapshot => ({ value: numberValue(snapshot.weightedPercent) }));
  const repairs = repairEffectivenessPoints(chronological);
  const flaky = rollingFlakyRatePoints(chronological);

  renderTrend('#trend-coverage-chart', '#trend-coverage-label', coveragePoints, '%', 'coverage');
  renderTrend('#trend-repairs-chart', '#trend-repairs-label', repairs, '%', 'repairs');
  renderTrend('#trend-flaky-chart', '#trend-flaky-label', flaky, '%', 'flaky');

  const updated = document.querySelector('#live-runs-updated');
  if (updated) updated.textContent = `${sorted.length} published runs. Updated ${relativeTime(latest.finishedAt || latest.startedAt)}.`;

  renderHealthSummary(sorted);
  renderProjectHealth(sorted);
  renderRecentActivity('all');
}

function renderCoverageMetrics(coverage) {
  const container = document.querySelector('#project-coverage-metrics');
  if (!container || !Array.isArray(coverage?.projects)) return;

  container.innerHTML = coverage.projects.map(project => {
    const covered = numberValue(project.coverage?.coveredScenarios);
    const total = numberValue(project.coverage?.totalScenarios);
    const stable = Boolean(project.stability?.stable);
    const blockers = Array.isArray(project.blockers) ? project.blockers.length : 0;

    return `<article class="${stable ? 'stable' : 'unstable'}">
      <span class="metric-project">${escapeHtml(project.appName || project.appId)}</span>
      <strong>${numberValue(project.coverage?.weightedPercent)}%</strong>
      <span>${covered}/${total} scenarios · ${stable ? 'Stable' : 'Not stable'}</span>
      <span class="metric-blockers">${blockers} completion blocker${blockers === 1 ? '' : 's'}</span>
    </article>`;
  }).join('');

  setText('#coverage-portfolio-summary', `Portfolio: ${numberValue(coverage.overall?.weightedPercent)}% weighted coverage · ${numberValue(coverage.overall?.coveredScenarios)}/${numberValue(coverage.overall?.totalScenarios)} scenarios · ${numberValue(coverage.overall?.stableProjects)}/${numberValue(coverage.overall?.totalProjects)} projects stable`);
}

function renderHealthSummary(records) {
  const committed = records.filter(record => record.runType === 'committed');
  const generated = records.filter(record => record.runType === 'generated');
  const repaired = records.filter(record => numberValue(record.repairsApplied) > 0);
  const regression = testOutcome(committed);

  setText('#health-regression-rate', formatRate(regression.passed, regression.executed));
  setText('#health-candidate-rate', formatRate(generated.filter(record => record.status === 'passed').length, generated.length));
  setText('#health-repair-rate', formatRate(repaired.filter(record => record.status === 'passed').length, repaired.length));
  setText('#health-timeouts', records.filter(record => record.testSummary?.timedOut).length);
}

function renderProjectHealth(records) {
  const body = document.querySelector('#health-projects');
  if (!body) return;

  const projects = [...new Map(records.filter(record => record.appId).map(record => [record.appId, record.appName || record.appId])).entries()];
  body.innerHTML = projects.map(([appId, appName]) => {
    const appRuns = records.filter(record => record.appId === appId);
    const committed = appRuns.filter(record => record.runType === 'committed');
    const generated = appRuns.filter(record => record.runType === 'generated');
    const regression = testOutcome(committed);
    const latest = appRuns[0];
    const timeoutCount = appRuns.filter(record => record.testSummary?.timedOut).length;

    return `<tr>
      <th scope="row">${escapeHtml(appName)}</th>
      <td><strong>${formatRate(regression.passed, regression.executed)}</strong><span>${regression.passed}/${regression.executed} tests</span></td>
      <td><strong>${formatRate(generated.filter(record => record.status === 'passed').length, generated.length)}</strong><span>${generated.length} candidates</span></td>
      <td><strong>${timeoutCount}</strong><span>published runs</span></td>
      <td><span class="badge ${escapeHtml(latest?.status || 'generated')}">${escapeHtml(latest?.status || 'unknown')}</span><span>${escapeHtml(relativeTime(latest?.finishedAt || latest?.startedAt))}</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="5">No application-attributed runs published yet.</td></tr>';
}

function renderRecentActivity(filter) {
  const matching = liveRunRecords.filter(record => {
    if (filter === 'failed') return record.status === 'failed' || record.testSummary?.timedOut;
    if (filter === 'committed') return record.runType === 'committed';
    if (filter === 'generated') return record.runType === 'generated';
    return true;
  });
  const visible = matching.slice(0, RECENT_ACTIVITY_LIMIT);
  const list = document.querySelector('#live-run-list');
  const summary = document.querySelector('#activity-summary');

  if (summary) summary.textContent = `Showing ${visible.length} of ${matching.length} matching runs`;
  if (list) {
    list.innerHTML = visible.length
      ? visible.map(renderRunCard).join('')
      : '<article class="run-card empty-run"><h3>No matching runs</h3><p>Try another activity filter.</p></article>';
  }
}

function renderRunCard(record) {
  const status = ['passed', 'failed', 'generated'].includes(record.status) ? record.status : 'generated';
  const passed = numberValue(record.testSummary?.passed);
  const failed = numberValue(record.testSummary?.failed);
  const duration = Math.max(0, Math.round(numberValue(record.durationMs) / 1000));
  const host = safeHost(record.url);
  const sourceLink = record.sourceRunUrl
    ? `<a class="run-link" href="${escapeHtml(record.sourceRunUrl)}" target="_blank" rel="noreferrer">Open public GitHub run</a>`
    : '';
  const runType = ['generated', 'committed', 'repair'].includes(record.runType) ? record.runType : 'generated';

  return `<article class="run-card ${status}">
    <div class="run-topline">
      <span class="badge ${status}">${escapeHtml(status)}</span>
      <span>${escapeHtml(formatDate(record.startedAt))}</span>
    </div>
    <h3>${escapeHtml(record.suiteName || host || 'Agent run')}</h3>
    <p>${escapeHtml(record.appName || host || record.url || 'Public demo target')} · ${escapeHtml(runType)}</p>
    <div class="run-meta">
      <span>${passed} passed / ${failed} failed</span>
      <span>${numberValue(record.generatedTests)} generated</span>
      <span>${numberValue(record.repairsApplied)} repairs</span>
      <span>${duration}s</span>
    </div>
    ${sourceLink}
  </article>`;
}

function renderApplications(apps, records, coverage) {
  const list = document.querySelector('#app-list');
  if (!list) return;

  list.innerHTML = apps.map(app => {
    const appRuns = records
      .filter(record => record.appId === app.id || (!record.appId && safeHost(record.url) === safeHost(app.url)))
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    const latest = appRuns[0];
    const status = latest?.status || 'generated';
    const committedTests = appRuns
      .filter(record => record.runType === 'committed')
      .reduce((max, record) => Math.max(max, numberValue(record.testSummary?.passed) + numberValue(record.testSummary?.failed)), 0);
    const latestAgent = appRuns.find(record => record.runType === 'generated' || !record.runType);
    const flowTags = (app.flows || []).map(flow => `<span>${escapeHtml(flow)}</span>`).join('');
    const latestText = latest ? relativeTime(latest.finishedAt || latest.startedAt) : 'Awaiting first run';
    const agentText = latestAgent ? relativeTime(latestAgent.finishedAt || latestAgent.startedAt) : 'No agent run yet';
    const projectCoverage = coverage?.projects?.find(project => project.appId === app.id);
    const coverageText = projectCoverage ? `${projectCoverage.coverage.weightedPercent}%` : 'Awaiting report';
    const stabilityText = projectCoverage?.stability?.stable ? 'Stable' : 'Not stable';
    const doneText = projectCoverage?.done ? 'Done' : `${projectCoverage?.blockers?.length || 0} blockers`;

    return `<article class="app-card">
      <a class="app-image-link" href="${escapeHtml(app.url)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(app.name)}">
        <img class="app-image" src="${escapeHtml(app.image)}" alt="${escapeHtml(app.name)} main screen">
      </a>
      <div class="app-content">
        <div class="card-topline">
          <span class="badge ${escapeHtml(status)}">${escapeHtml(latest ? status : 'tracked')}</span>
          <span>${appRuns.length} run${appRuns.length === 1 ? '' : 's'} / 30d</span>
        </div>
        <h3>${escapeHtml(app.name)}</h3>
        <p>${escapeHtml(app.description)}</p>
        <div class="flow-tags">${flowTags}</div>
        <dl class="app-stats">
          <div><dt>Functional coverage</dt><dd>${escapeHtml(coverageText)}</dd></div>
          <div><dt>Stability</dt><dd>${escapeHtml(stabilityText)}</dd></div>
          <div><dt>Completion</dt><dd>${escapeHtml(doneText)}</dd></div>
          <div><dt>Permanent tests</dt><dd>${committedTests || 'Publishing next run'}</dd></div>
          <div><dt>Latest result</dt><dd>${escapeHtml(latestText)}</dd></div>
          <div><dt>Latest agent work</dt><dd>${escapeHtml(agentText)}</dd></div>
        </dl>
      </div>
    </article>`;
  }).join('');
}

function renderTrend(chartSelector, labelSelector, points, suffix, colorClass) {
  const chart = document.querySelector(chartSelector);
  const label = document.querySelector(labelSelector);
  const first = points[0]?.value ?? 0;
  const last = points.at(-1)?.value ?? 0;

  if (label) label.textContent = points.length > 1 ? `${first}${suffix} -> ${last}${suffix}` : `${last}${suffix}`;
  if (!chart || points.length === 0) return;

  const width = 520;
  const height = 180;
  const padding = 28;
  const max = Math.max(1, ...points.map(point => point.value));
  const coords = points.map((point, index) => ({
    x: points.length === 1 ? width / 2 : padding + (index / (points.length - 1)) * (width - padding * 2),
    y: height - padding - (point.value / max) * (height - padding * 2)
  }));
  const line = coords.map((point, index) => `${index ? 'L' : 'M'}${round(point.x)} ${round(point.y)}`).join(' ');
  const area = `${line} L${round(coords.at(-1).x)} ${height - padding} L${round(coords[0].x)} ${height - padding} Z`;
  const circles = coords.map(point => `<circle cx="${round(point.x)}" cy="${round(point.y)}" r="5"></circle>`).join('');

  chart.innerHTML = `
    <line class="chart-grid-line" x1="28" y1="32" x2="492" y2="32"></line>
    <line class="chart-grid-line" x1="28" y1="88" x2="492" y2="88"></line>
    <line class="chart-grid-line" x1="28" y1="144" x2="492" y2="144"></line>
    <path class="chart-area ${colorClass}" d="${area}"></path>
    <path class="chart-line ${colorClass}" d="${line}"></path>
    ${circles}`;
}

function repairEffectivenessPoints(records) {
  let repaired = 0;
  let passed = 0;
  return records.map(record => {
    if (numberValue(record.repairsApplied) > 0) {
      repaired += 1;
      if (record.status === 'passed') passed += 1;
    }
    return { value: repaired ? round((passed / repaired) * 100) : 0 };
  });
}

function rollingFlakyRatePoints(records) {
  return records.map((record, index) => {
    const recent = records.slice(Math.max(0, index - 9), index + 1);
    const executed = recent.reduce((total, item) => total + numberValue(item.testSummary?.passed) + numberValue(item.testSummary?.failed), 0);
    const flaky = recent.reduce((total, item) => total + numberValue(item.testSummary?.flaky), 0);
    return { value: executed ? round((flaky / executed) * 100) : 0 };
  });
}

function testOutcome(records) {
  const passed = records.reduce((total, record) => total + numberValue(record.testSummary?.passed), 0);
  const failed = records.reduce((total, record) => total + numberValue(record.testSummary?.failed), 0);
  return { passed, failed, executed: passed + failed };
}

function formatRate(numerator, denominator) {
  return denominator ? `${Math.round((numerator / denominator) * 1_000) / 10}%` : '--';
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = String(value);
}

function setStatusClass(element, status) {
  if (!element) return;
  element.classList.remove('passed', 'failed', 'generated');
  element.classList.add(['passed', 'failed', 'generated'].includes(status) ? status : 'generated');
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function safeHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return '';
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

function relativeTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'recently';

  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  initAnalyticsConsent();
  initLiveDashboard();
  document.querySelectorAll('[data-run-filter]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-run-filter]').forEach(candidate => {
        const active = candidate === button;
        candidate.classList.toggle('active', active);
        candidate.setAttribute('aria-pressed', String(active));
      });
      renderRecentActivity(button.dataset.runFilter);
    });
  });
});
