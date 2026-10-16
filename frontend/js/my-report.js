/** my-report.js — Отчёт сотрудника по выработке за выбранный период. */

function _isoDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function _monthRange(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = offset === 0 ? now : new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: _isoDate(first), to: _isoDate(last) };
}

async function renderMyReport() {
  const { from, to } = _monthRange(0);

  App.setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Моя выработка</h1>
        <p class="page-subtitle">Выполненные работы и заработок за период</p>
      </div>
    </div>
    <div class="page-body">
      <div class="filter-bar" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <input type="date" class="form-control" id="report-date-from" style="max-width:160px" value="${from}" title="Дата с" />
        <input type="date" class="form-control" id="report-date-to" style="max-width:160px" value="${to}" title="Дата по" />
        <button class="btn btn-primary" onclick="loadMyReport()">Показать</button>
        <button class="btn btn-ghost" onclick="setMyReportPeriod(0)">Текущий месяц</button>
        <button class="btn btn-ghost" onclick="setMyReportPeriod(-1)">Прошлый месяц</button>
      </div>
      <div id="my-report-wrap">${App.spinner()}</div>
    </div>
  `);

  await loadMyReport();
}

function setMyReportPeriod(offset) {
  const { from, to } = _monthRange(offset);
  document.getElementById('report-date-from').value = from;
  document.getElementById('report-date-to').value = to;
  loadMyReport();
}

async function loadMyReport() {
  const wrap = document.getElementById('my-report-wrap');
  if (!wrap) return;
  wrap.innerHTML = App.spinner();

  const qs = new URLSearchParams();
  const from = document.getElementById('report-date-from').value;
  const to = document.getElementById('report-date-to').value;
  if (from) qs.append('date_from', from);
  if (to) qs.append('date_to', to);

  try {
    const data = await App.api(`/employees/${App.user.employee_id}/report?${qs.toString()}`);
    if (!data) return;
    wrap.innerHTML = _renderMyReport(data);
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><p class="text-danger">Ошибка: ${App.escHtml(err.message)}</p></div>`;
  }
}

function _renderMyReport(data) {
  const emp = data.employee;
  const isPercent = emp.rate_type === 'percent';
  const period = `${App.formatDateOnly(data.date_from)} — ${App.formatDateOnly(data.date_to)}`;

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon stat-icon-amber">🔧</div>
        <div>
          <div class="stat-label">Выполнено работ</div>
          <div class="stat-value">${data.works_count}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-green">💰</div>
        <div>
          <div class="stat-label">На сумму</div>
          <div class="stat-value">${App.formatMoney(data.total_amount)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-blue">💳</div>
        <div>
          <div class="stat-label">${isPercent ? 'Вы получите' : 'Оклад'}</div>
          <div class="stat-value">${App.formatMoney(data.salary)}</div>
          <div class="stat-sub">${isPercent ? `${emp.rate_value}% от суммы работ` : 'Фиксированная ставка в месяц'}</div>
        </div>
      </div>
    </div>

    ${data.unfinished_count ? `
      <p class="text-muted text-sm mb-4">
        Ещё не выполнено: ${data.unfinished_count} ${_worksWord(data.unfinished_count)} на ${App.formatMoney(data.unfinished_amount)} —
        попадут в отчёт, когда вы отметите их «Выполнено».
      </p>` : ''}

    <div class="card">
      <div class="card-header">
        <span class="card-title">Выполненные работы · ${period}</span>
      </div>
      ${data.items.length === 0 ? `
        <div class="empty-state" style="padding:40px">
          <p class="text-muted">За этот период выполненных работ нет</p>
        </div>` : `
        <div class="mobile-only order-items-cards-list">
          ${data.items.map(i => `
            <div class="order-item-card" onclick="App.navigate('/orders/${i.order_id}')" style="cursor:pointer">
              <div class="order-item-card-header">
                <span class="order-item-card-title">${App.escHtml(i.work_name)}</span>
                <span class="order-item-card-price">${App.formatMoney(i.price)}</span>
              </div>
              <div class="order-item-card-meta">
                <span>№${i.order_id} · ${App.formatDateOnly(i.completed_at)}${i.vehicle ? ` · ${App.escHtml(i.vehicle)}` : ''}</span>
                ${isPercent ? `<span>Ваши: <strong>${App.formatMoney(i.earning)}</strong></span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="desktop-only table-wrap" style="border:none">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Заказ</th>
                <th>Автомобиль</th>
                <th>Работа</th>
                <th>Сумма</th>
                ${isPercent ? '<th>Ваш заработок</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${data.items.map(i => `
                <tr class="clickable-row" onclick="App.navigate('/orders/${i.order_id}')">
                  <td class="text-sm">${App.formatDateOnly(i.completed_at)}</td>
                  <td><a href="#/orders/${i.order_id}" style="color:var(--accent)">№${i.order_id}</a></td>
                  <td class="text-sm">${i.vehicle ? App.escHtml(i.vehicle) : '<span class="text-muted">—</span>'}</td>
                  <td class="td-primary">${App.escHtml(i.work_name)}</td>
                  <td class="font-bold">${App.formatMoney(i.price)}</td>
                  ${isPercent ? `<td class="font-bold">${App.formatMoney(i.earning)}</td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
    </div>
  `;
}

function _worksWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'работа';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'работы';
  return 'работ';
}
