/**
 * vehicle-history.js — История обслуживания автомобиля.
 *
 * Отображает все заказ-наряды для выбранного автомобиля:
 *  - карточка автомобиля и клиента
 *  - статистика (кол-во визитов, потрачено всего, последнее ТО)
 *  - хронологический список заказов с датой, пробегом и составом работ/запчастей
 *  - кнопка экспорта в DOCX
 */

async function renderVehicleHistory(vehicleId) {
  App.setContent(App.spinner());

  try {
    const history = await App.api(`/vehicle-history/${vehicleId}`);
    if (!history) return;
    _renderVehicleHistoryHtml(history, vehicleId);
  } catch (err) {
    App.setContent(`<div class="page-body"><p class="text-danger">Ошибка: ${App.escHtml(err.message)}</p></div>`);
  }
}

function _renderVehicleHistoryHtml(history, vehicleId) {
  const vehicleTitle = `${history.brand} ${history.model}`;
  const plateStr = history.plate_number ? ` · ${history.plate_number}` : '';
  const vinStr = history.vin ? `<span class="text-muted text-sm">VIN: ${App.escHtml(history.vin)}</span>` : '';
  const yearStr = history.year ? ` · ${history.year} г.` : '';

  const lastVisit = history.orders.length > 0
    ? App.formatDate(history.orders[0].date)
    : '—';

  // Find last known mileage
  const lastMileageOrder = history.orders.find(o => o.mileage);
  const lastMileageStr = lastMileageOrder
    ? `${lastMileageOrder.mileage.toLocaleString('ru-RU')} км`
    : '—';

  App.setContent(`
    <div class="page-header">
      <div>
        <div class="back-link" onclick="history.back()">
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
          Назад
        </div>
        <h1 class="page-title">История обслуживания</h1>
        <p class="page-subtitle">${App.escHtml(vehicleTitle)}${App.escHtml(plateStr)}${App.escHtml(yearStr)}</p>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-primary" id="btn-export-history">
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
          Скачать отчёт (DOCX)
        </button>
      </div>
    </div>

    <div class="page-body">

      <!-- Vehicle + Client Info Card -->
      <div class="card mb-4">
        <div class="card-header">
          <span class="card-title">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style="opacity:.7;vertical-align:middle;margin-right:6px">
              <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
              <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-5h1a1 1 0 00.8-.4l3-4A1 1 0 0015 4H3z"/>
            </svg>
            ${App.escHtml(vehicleTitle)}
          </span>
        </div>
        <div class="card-body">
          <div class="detail-grid" style="grid-template-columns: 1fr 1fr; gap:12px">
            <div>
              <div class="info-row"><span class="info-label">Марка / Модель</span><span class="info-value">${App.escHtml(history.brand)} ${App.escHtml(history.model)}</span></div>
              <div class="info-row"><span class="info-label">Гос. номер</span><span class="info-value">${App.escHtml(history.plate_number || '—')}</span></div>
              <div class="info-row"><span class="info-label">VIN</span><span class="info-value" style="font-family:monospace">${App.escHtml(history.vin || '—')}</span></div>
              <div class="info-row"><span class="info-label">Год выпуска</span><span class="info-value">${history.year || '—'}</span></div>
            </div>
            <div>
              <div class="info-row"><span class="info-label">Клиент</span><span class="info-value">${App.escHtml(history.client_name || '—')}</span></div>
              <div class="info-row"><span class="info-label">Телефон</span><span class="info-value">${App.escHtml(history.client_phone || '—')}</span></div>
              <div class="info-row"><span class="info-label">Последний пробег</span><span class="info-value">${lastMileageStr}</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Row -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
        <div class="card" style="text-align:center;padding:20px">
          <div style="font-size:32px;font-weight:800;color:var(--accent)">${history.total_visits}</div>
          <div class="text-sm text-muted" style="margin-top:4px">Визитов</div>
        </div>
        <div class="card" style="text-align:center;padding:20px">
          <div style="font-size:24px;font-weight:800;color:var(--accent)">${App.formatMoney(history.total_spent)}</div>
          <div class="text-sm text-muted" style="margin-top:4px">Потрачено всего</div>
        </div>
        <div class="card" style="text-align:center;padding:20px">
          <div style="font-size:20px;font-weight:700;color:var(--text-primary)">${lastVisit}</div>
          <div class="text-sm text-muted" style="margin-top:4px">Последний визит</div>
        </div>
      </div>

      <!-- History Timeline -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">История визитов</span>
          <span class="text-sm text-muted">${history.total_visits} записей</span>
        </div>
        <div class="card-body" style="padding:0">
          ${history.orders.length === 0
            ? `<div class="empty-state" style="padding:40px">
                <div class="empty-state-icon">🔧</div>
                <h3>Заказов нет</h3>
                <p>По этому автомобилю ещё не создано ни одного заказ-наряда</p>
              </div>`
            : history.orders.map((order, idx) => _renderHistoryOrderCard(order, idx, history.orders.length)).join('')
          }
        </div>
      </div>

    </div>
  `);

  // Export button
  document.getElementById('btn-export-history')?.addEventListener('click', async () => {
    try {
      const btn = document.getElementById('btn-export-history');
      btn.disabled = true;
      btn.textContent = 'Формирование...';

      const response = await fetch(`/api/vehicle-history/${vehicleId}/export`, {
        headers: { 'Authorization': `Bearer ${App.token}` },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error((data && data.detail) || `Ошибка ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `История_${history.brand}_${history.model}_${history.plate_number || vehicleId}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      App.toast('Отчёт скачан!');
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      const btn = document.getElementById('btn-export-history');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
          Скачать отчёт (DOCX)`;
      }
    }
  });
}

function _renderHistoryOrderCard(order, idx, total) {
  const mileageStr = order.mileage
    ? `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(245,158,11,.15);color:#f59e0b;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600">
        <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11"><path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 2a6 6 0 110 12A6 6 0 0110 4zm0 1a1 1 0 00-1 1v4.586l-2.707 2.707a1 1 0 101.414 1.414L10 12.414V8a1 1 0 00-1-1z"/></svg>
        ${order.mileage.toLocaleString('ru-RU')} км
      </span>`
    : '';

  const worksHtml = order.works.length > 0
    ? `<div style="margin-top:8px">
        <div class="text-sm" style="color:var(--text-muted);margin-bottom:4px;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.5px">Работы</div>
        <ul style="margin:0;padding-left:16px;list-style:none">
          ${order.works.map(w => `<li style="margin-bottom:2px;font-size:13px;display:flex;align-items:center;gap:6px">
            <span style="color:var(--accent);font-size:10px">●</span>
            ${App.escHtml(w)}
          </li>`).join('')}
        </ul>
      </div>`
    : '';

  const partsHtml = order.parts.length > 0
    ? `<div style="margin-top:8px">
        <div class="text-sm" style="color:var(--text-muted);margin-bottom:4px;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.5px">Запчасти</div>
        <ul style="margin:0;padding-left:16px;list-style:none">
          ${order.parts.map(p => `<li style="margin-bottom:2px;font-size:13px;display:flex;align-items:center;gap:6px">
            <span style="color:#6b7280;font-size:10px">●</span>
            ${App.escHtml(p)}
          </li>`).join('')}
        </ul>
      </div>`
    : '';

  const commentHtml = order.comment
    ? `<div style="margin-top:8px;padding:8px 12px;background:rgba(255,255,255,.04);border-left:3px solid rgba(245,158,11,.4);border-radius:0 4px 4px 0;font-size:12px;color:var(--text-muted);font-style:italic">
        ${App.escHtml(order.comment)}
      </div>`
    : '';

  const isLast = idx === total - 1;

  return `
    <div style="display:flex;gap:0;position:relative" class="history-order-row">
      <!-- Timeline dot + line -->
      <div style="display:flex;flex-direction:column;align-items:center;padding:20px 0;flex-shrink:0;width:48px">
        <div style="width:12px;height:12px;border-radius:50%;background:var(--accent);border:2px solid var(--bg-card);box-shadow:0 0 0 2px var(--accent);flex-shrink:0;z-index:1"></div>
        ${!isLast ? `<div style="flex:1;width:2px;background:rgba(245,158,11,.2);margin-top:4px;min-height:20px"></div>` : ''}
      </div>

      <!-- Content -->
      <div style="flex:1;padding:16px 20px 16px 4px;${!isLast ? 'border-bottom:1px solid var(--border)' : ''}">
        <!-- Header row -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <a href="#/orders/${order.order_id}" style="font-weight:700;font-size:14px;color:var(--text-primary);text-decoration:none">
              Заказ-наряд #${order.order_id}
            </a>
            ${App.statusBadge(order.status)}
            ${mileageStr}
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <span class="text-sm text-muted">${App.formatDate(order.date)}</span>
            <span style="font-weight:700;font-size:15px;color:var(--accent)">${App.formatMoney(order.total_amount)}</span>
          </div>
        </div>

        <!-- Breakdown line -->
        ${(order.services_total > 0 || order.parts_total > 0) ? `
          <div style="display:flex;gap:16px;font-size:12px;color:var(--text-muted);margin-bottom:6px">
            ${order.services_total > 0 ? `<span>🔧 Работы: ${App.formatMoney(order.services_total)}</span>` : ''}
            ${order.parts_total > 0 ? `<span>🔩 Запчасти: ${App.formatMoney(order.parts_total)}</span>` : ''}
          </div>
        ` : ''}

        ${worksHtml}
        ${partsHtml}
        ${commentHtml}
      </div>
    </div>
  `;
}

// ─── Vehicle History Index (List & Search) ───────────────────────────────────

async function renderVehicleHistoryIndex() {
  App.setContent(App.spinner());
  try {
    const [vehicles, clients] = await Promise.all([
      App.api('/vehicles/'),
      App.api('/clients/'),
    ]);

    const clientMap = new Map((clients || []).map(c => [c.id, c]));

    const renderRows = (filteredVehicles) => {
      if (!filteredVehicles.length) {
        return `<tr><td colspan="5" class="text-center text-muted" style="padding:40px">Автомобили не найдены</td></tr>`;
      }
      return filteredVehicles.map(v => {
        const client = clientMap.get(v.client_id);
        const clientName = client ? client.full_name : '—';
        const clientPhone = client ? client.phone : '';
        const plate = v.plate_number
          ? `<span class="badge" style="background:rgba(255,255,255,0.08);letter-spacing:1px;font-family:monospace">${App.escHtml(v.plate_number)}</span>`
          : '<span class="text-muted">—</span>';
        const vin = v.vin
          ? `<span style="font-family:monospace;font-size:12px">${App.escHtml(v.vin)}</span>`
          : '<span class="text-muted">—</span>';

        return `
          <tr class="clickable-row" onclick="App.navigate('/vehicle-history/${v.id}')">
            <td>
              <div style="font-weight:700;color:var(--text-primary)">
                ${App.escHtml(v.brand)} ${App.escHtml(v.model)}
              </div>
              ${v.year ? `<div class="text-xs text-muted">${v.year} г.в.</div>` : ''}
            </td>
            <td>${plate}</td>
            <td>${vin}</td>
            <td>
              <div style="font-weight:500">${App.escHtml(clientName)}</div>
              ${clientPhone ? `<div class="text-xs text-muted">${App.escHtml(clientPhone)}</div>` : ''}
            </td>
            <td style="text-align:right" onclick="event.stopPropagation()">
              <div class="flex gap-2" style="justify-content:flex-end">
                <button class="btn btn-sm btn-primary" onclick="App.navigate('/vehicle-history/${v.id}')">
                  📋 История
                </button>
                <button class="btn btn-sm btn-secondary" onclick="exportVehicleDocx(${v.id}, '${App.escHtml(v.brand)}', '${App.escHtml(v.model)}', '${App.escHtml(v.plate_number || '')}')" title="Скачать DOCX">
                  📥 DOCX
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    };

    App.setContent(`
      <div class="page-header">
        <div>
          <h1 class="page-title">История обслуживания автомобилей</h1>
          <p class="page-subtitle">Просмотр истории визитов, динамики пробега и выгрузка отчётов для клиентов</p>
        </div>
      </div>

      <div class="page-body">
        <div class="card mb-4" style="padding:16px 20px">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:240px;position:relative">
              <input
                type="text"
                class="form-control"
                id="search-vehicles-input"
                placeholder="Поиск по марке, модели, госномеру, VIN или клиенту…"
                style="padding-left:36px"
              />
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);opacity:.5">
                <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
              </svg>
            </div>
            <span class="text-sm text-muted" id="vehicles-count-label">Всего авто: ${vehicles.length}</span>
          </div>
        </div>

        <div class="card" style="padding:0;overflow:hidden">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Автомобиль</th>
                  <th>Гос. номер</th>
                  <th>VIN</th>
                  <th>Владелец</th>
                  <th style="text-align:right">Действия</th>
                </tr>
              </thead>
              <tbody id="vehicles-history-tbody">
                ${renderRows(vehicles)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `);

    // Live search filter
    const searchInput = document.getElementById('search-vehicles-input');
    const tbody = document.getElementById('vehicles-history-tbody');
    const countLabel = document.getElementById('vehicles-count-label');

    searchInput?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        tbody.innerHTML = renderRows(vehicles);
        countLabel.textContent = `Всего авто: ${vehicles.length}`;
        return;
      }
      const filtered = vehicles.filter(v => {
        const client = clientMap.get(v.client_id);
        const cName = client ? client.full_name.toLowerCase() : '';
        const cPhone = client ? client.phone.toLowerCase() : '';
        const brand = (v.brand || '').toLowerCase();
        const model = (v.model || '').toLowerCase();
        const plate = (v.plate_number || '').toLowerCase();
        const vin = (v.vin || '').toLowerCase();
        return brand.includes(q) || model.includes(q) || plate.includes(q) || vin.includes(q) || cName.includes(q) || cPhone.includes(q);
      });
      tbody.innerHTML = renderRows(filtered);
      countLabel.textContent = `Найдено: ${filtered.length}`;
    });

  } catch (err) {
    App.setContent(`<div class="page-body"><p class="text-danger">Ошибка: ${App.escHtml(err.message)}</p></div>`);
  }
}

async function exportVehicleDocx(vehicleId, brand, model, plate) {
  try {
    App.toast('Формирование отчёта...');
    const response = await fetch(`/api/vehicle-history/${vehicleId}/export`, {
      headers: { 'Authorization': `Bearer ${App.token}` },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error((data && data.detail) || `Ошибка ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `История_${brand}_${model}_${plate || vehicleId}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    App.toast('Отчёт скачан!');
  } catch (err) {
    App.toast(err.message, 'error');
  }
}
