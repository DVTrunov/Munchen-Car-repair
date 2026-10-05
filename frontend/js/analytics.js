/**
 * analytics.js — Analytics dashboard (owner only).
 *
 * Shows: total orders, revenue, by-status breakdown,
 * employee workload table, and a daily revenue bar chart
 * drawn on an HTML5 Canvas (no external libraries).
 */

const STATUS_RU = {
  new: 'Новые', in_progress: 'В работе', done: 'Готовы',
  issued: 'Выданы', paid: 'Оплачены'
};

async function renderAnalytics() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const toISO = d => d.toISOString().slice(0, 10);

  App.setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Аналитика</h1>
        <p class="page-subtitle">Сводная статистика для владельца</p>
      </div>
    </div>
    <div class="page-body">
      <div class="filter-bar" style="margin-bottom:24px">
        <label class="text-sm text-muted" style="align-self:center">Период:</label>
        <input type="date" id="an-date-from" class="form-control" style="max-width:160px" value="${toISO(firstDay)}" />
        <span class="text-muted">—</span>
        <input type="date" id="an-date-to" class="form-control" style="max-width:160px" value="${toISO(today)}" />
        <button class="btn btn-primary" id="an-apply">Обновить</button>
        <button class="btn btn-ghost" id="an-all-time">Всё время</button>
      </div>
      <div id="analytics-content">${App.spinner()}</div>
    </div>
  `);

  document.getElementById('an-apply').addEventListener('click', loadAnalytics);
  document.getElementById('an-all-time').addEventListener('click', () => {
    document.getElementById('an-date-from').value = '';
    document.getElementById('an-date-to').value = '';
    loadAnalytics();
  });

  await loadAnalytics();
}

async function loadAnalytics() {
  const wrap = document.getElementById('analytics-content');
  if (!wrap) return;
  wrap.innerHTML = App.spinner();

  const dateFrom = document.getElementById('an-date-from')?.value || '';
  const dateTo   = document.getElementById('an-date-to')?.value || '';

  try {
    const qs = new URLSearchParams();
    if (dateFrom) qs.append('date_from', dateFrom);
    if (dateTo)   qs.append('date_to', dateTo);

    const data = await App.api(`/analytics/summary?${qs.toString()}`);

    const statusColors = {
      new: '#60a5fa', in_progress: '#fbbf24', done: '#34d399',
      issued: '#a78bfa', paid: '#22d3ee'
    };

    wrap.innerHTML = `
      <!-- KPI Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon stat-icon-amber">📋</div>
          <div>
            <div class="stat-label">Всего заказов</div>
            <div class="stat-value">${data.total_orders}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-icon-green">💰</div>
          <div>
            <div class="stat-label">Общая выручка</div>
            <div class="stat-value">${App.formatMoney(data.total_revenue)}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-icon-blue">✅</div>
          <div>
            <div class="stat-label">Оплачено</div>
            <div class="stat-value">${App.formatMoney(data.paid_revenue)}</div>
            <div class="stat-sub">${data.total_revenue > 0 ? Math.round(data.paid_revenue / data.total_revenue * 100) : 0}% от выручки</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-icon-purple">👷</div>
          <div>
            <div class="stat-label">Сотрудников</div>
            <div class="stat-value">${data.employee_stats.length}</div>
          </div>
        </div>
      </div>

      <div class="detail-grid mb-4">
        <!-- Status breakdown -->
        <div class="card">
          <div class="card-header"><span class="card-title">По статусам</span></div>
          <div class="card-body">
            ${Object.keys(STATUS_RU).map(s => {
              const count = data.by_status[s] || 0;
              const pct = data.total_orders > 0 ? Math.round(count / data.total_orders * 100) : 0;
              return `
                <div style="margin-bottom:14px">
                  <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                    <span class="text-sm">${STATUS_RU[s]}</span>
                    <span class="text-sm font-bold">${count} <span class="text-muted">(${pct}%)</span></span>
                  </div>
                  <div style="height:6px;background:var(--border);border-radius:99px;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:${statusColors[s] || '#666'};border-radius:99px;transition:width 0.5s ease"></div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Daily revenue chart -->
        <div class="card">
          <div class="card-header"><span class="card-title">Выручка по дням</span></div>
          <div class="card-body">
            ${data.daily_revenue.length === 0
              ? '<p class="text-muted text-sm">Нет данных за период</p>'
              : '<div class="chart-wrap"><canvas id="revenue-chart"></canvas></div>'}
          </div>
        </div>
      </div>

      <!-- Employee workload table -->
      <div class="card">
        <div class="card-header"><span class="card-title">Загрузка сотрудников</span></div>
        ${data.employee_stats.length === 0
          ? '<div class="empty-state" style="padding:30px"><p class="text-muted">Нет данных о сотрудниках</p></div>'
          : `<div class="table-wrap" style="border:none">
              <table>
                <thead>
                  <tr>
                    <th>Сотрудник</th>
                    <th>Должность</th>
                    <th>Работ</th>
                    <th>Сумма работ</th>
                    <th>К выплате</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${data.employee_stats.map(e => `
                    <tr>
                      <td class="td-primary">${App.escHtml(e.full_name)}</td>
                      <td>${App.statusBadge(e.role)}</td>
                      <td>${e.items_count}</td>
                      <td class="font-bold">${App.formatMoney(e.total_amount)}</td>
                      <td class="font-bold text-success">${App.formatMoney(e.estimated_salary)}</td>
                      <td>
                        <a href="#/employees/${e.id}" class="btn btn-sm btn-secondary">Подробнее</a>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`}
      </div>
    `;

    // Draw chart after DOM update
    if (data.daily_revenue.length > 0) {
      requestAnimationFrame(() => drawRevenueChart(data.daily_revenue));
    }

  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><p class="text-danger">Ошибка: ${App.escHtml(err.message)}</p></div>`;
  }
}

/**
 * Draws a simple bar chart on <canvas id="revenue-chart">.
 * Pure canvas — no Chart.js or other dependencies.
 */
function drawRevenueChart(dailyData) {
  const canvas = document.getElementById('revenue-chart');
  if (!canvas) return;

  const container = canvas.parentElement;
  canvas.width  = container.clientWidth;
  canvas.height = container.clientHeight || 180;

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = { top: 10, right: 10, bottom: 36, left: 56 };

  const values = dailyData.map(d => d.amount);
  const maxVal = Math.max(...values, 1);
  const barW = Math.max(4, Math.floor((W - PAD.left - PAD.right) / dailyData.length) - 3);

  ctx.clearRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = '#2a3045';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (H - PAD.top - PAD.bottom) * (1 - i / 4);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();
    // Label
    ctx.fillStyle = '#4a5568';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 0 }).format(maxVal * i / 4),
      PAD.left - 6, y + 4
    );
  }

  // Bars
  dailyData.forEach((d, i) => {
    const x = PAD.left + i * ((W - PAD.left - PAD.right) / dailyData.length);
    const barH = (d.amount / maxVal) * (H - PAD.top - PAD.bottom);
    const y = H - PAD.bottom - barH;

    // Gradient bar
    const grad = ctx.createLinearGradient(0, y, 0, H - PAD.bottom);
    grad.addColorStop(0, '#f59e0b');
    grad.addColorStop(1, 'rgba(245,158,11,0.3)');
    ctx.fillStyle = grad;

    const r = Math.min(3, barW / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + barW - r, y);
    ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
    ctx.lineTo(x + barW, H - PAD.bottom);
    ctx.lineTo(x, H - PAD.bottom);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.fill();

    // Date label (show every Nth to avoid clutter)
    const step = Math.ceil(dailyData.length / 8);
    if (i % step === 0 || i === dailyData.length - 1) {
      const dateParts = d.date.split('-');
      const label = `${dateParts[2]}.${dateParts[1]}`;
      ctx.fillStyle = '#4a5568';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + barW / 2, H - PAD.bottom + 14);
    }
  });
}
