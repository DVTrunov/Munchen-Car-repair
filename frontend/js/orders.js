/**
 * orders.js — Orders list, order detail, parts, comments, and print form.
 * Tabs: Работы / Запчасти и материалы
 * Drawer: Комментарии / Дефектовка (chat-style with images)
 * Print: DOCX template upload & generation
 */

const ORDER_STATUSES = [
  { value: 'new', label: 'Новый' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Готов' },
  { value: 'issued', label: 'Выдан' },
  { value: 'paid', label: 'Оплачен' },
];

const ITEM_STATUSES = [
  { value: 'pending', label: 'Ожидает' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Выполнено' },
];

// ─── Orders List ──────────────────────────────────────────────────────────────
async function renderOrders() {
  const hash = window.location.hash.slice(1);
  const qIdx = hash.indexOf('?');
  const params = new URLSearchParams(qIdx >= 0 ? hash.slice(qIdx + 1) : '');

  const initialFilters = {
    status: params.get('status') || '',
    date_from: params.get('date_from') || '',
    date_to: params.get('date_to') || '',
    client_id: params.get('client_id') || '',
  };
  const scoped = Permissions.isOrderScoped();

  App.setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Заказ-наряды</h1>
        <p class="page-subtitle">${scoped ? 'Заказ-наряды, в которых вы исполнитель' : 'Все работы вашего автосервиса'}</p>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary filter-toggle-btn" id="btn-toggle-filters" onclick="toggleOrderFilters()">
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/>
          </svg>
          <span>Фильтры</span>
          <span id="filters-badge" class="badge-filter-count hidden">0</span>
        </button>
        ${scoped ? '' : `
        <button class="btn btn-primary" id="btn-new-order">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          + Новый заказ
        </button>`}
      </div>
    </div>
    <div class="page-body">
      <div class="filter-bar filter-collapse" id="orders-filter-bar">
        <select class="form-control filter-select" id="filter-status">
          <option value="">Все статусы</option>
          ${ORDER_STATUSES.map(s => `<option value="${s.value}" ${params.get('status') === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
        <input type="date" class="form-control" id="filter-date-from" style="max-width:160px"
          value="${params.get('date_from') || ''}" title="Дата с" />
        <input type="date" class="form-control" id="filter-date-to" style="max-width:160px"
          value="${params.get('date_to') || ''}" title="Дата по" />
        <button class="btn btn-secondary" id="btn-filter-apply">Применить</button>
        <button class="btn btn-ghost" id="btn-filter-reset">Сбросить</button>
      </div>
      <div id="orders-table-wrap">${App.spinner()}</div>
    </div>
  `);

  document.getElementById('btn-new-order')?.addEventListener('click', createInstantOrder);
  document.getElementById('btn-filter-apply').addEventListener('click', applyOrderFilters);
  document.getElementById('btn-filter-reset').addEventListener('click', () => {
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-date-from').value = '';
    document.getElementById('filter-date-to').value = '';
    App.setQuery({});
    loadOrders({});
  });

  await loadOrders(initialFilters);
}

function toggleOrderFilters() {
  const bar = document.getElementById('orders-filter-bar');
  if (bar) bar.classList.toggle('show');
}

function updateFilterBadge(filters) {
  let count = 0;
  if (filters.status) count++;
  if (filters.date_from) count++;
  if (filters.date_to) count++;
  const badge = document.getElementById('filters-badge');
  if (badge) {
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  }
}

/** Instantly creates an empty draft order and opens its page */
async function createInstantOrder() {
  try {
    const newOrder = await App.api('/orders/', {
      method: 'POST',
      body: { client_id: null, vehicle_id: null, comment: '' },
    });
    App.toast('Новый заказ-наряд создан!');
    App.navigate(`/orders/${newOrder.id}`);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

function applyOrderFilters() {
  const status = document.getElementById('filter-status').value;
  const date_from = document.getElementById('filter-date-from').value;
  const date_to = document.getElementById('filter-date-to').value;
  const client_id = new URLSearchParams(window.location.hash.split('?')[1] || '').get('client_id') || '';
  // Фильтры запоминаем в адресе — после «Назад» из заказа список откроется с ними же
  App.setQuery({ status, date_from, date_to, client_id });
  loadOrders({ status, date_from, date_to, client_id });
}

async function loadOrders(filters = {}) {
  const wrap = document.getElementById('orders-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = App.spinner();

  updateFilterBadge(filters);

  try {
    const qs = new URLSearchParams();
    if (filters.status) qs.append('status', filters.status);
    if (filters.date_from) qs.append('date_from', filters.date_from);
    if (filters.date_to) qs.append('date_to', filters.date_to);
    if (filters.client_id) qs.append('client_id', filters.client_id);

    const orders = await App.api(`/orders/?${qs.toString()}`);
    const scoped = Permissions.isOrderScoped();

    if (!orders || orders.length === 0) {
      wrap.innerHTML = scoped ? `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h3>Заказ-нарядов нет</h3>
          <p>Пока нет заказ-нарядов, где вы назначены исполнителем</p>
        </div>` : `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h3>Заказ-нарядов нет</h3>
          <p>Создайте первый заказ-наряд или измените фильтры</p>
          <button class="btn btn-primary" onclick="createInstantOrder()">+ Новый заказ</button>
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>Дата</th>
              <th>Клиент</th>
              <th>Автомобиль</th>
              <th>Статус</th>
              <th>${scoped ? 'Сумма ваших работ' : 'Сумма'}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => {
      const hasClient = !!o.client;
      const hasVehicle = !!o.vehicle;
      const isDraft = !hasClient || !hasVehicle;

      return `
                <tr class="clickable-row ${isDraft ? 'is-draft' : ''}" onclick="App.navigate('/orders/${o.id}')">
                  <td class="td-primary">#${o.id}</td>
                  <td class="text-sm">${App.formatDate(o.created_at)}</td>
                  <td>
                    ${hasClient ? `
                      <div style="font-weight:600;color:var(--text-primary)">
                        ${App.escHtml(o.client.full_name)}
                      </div>
                      <div class="text-muted text-sm">${App.escHtml(o.client.phone)}</div>
                    ` : '<span class="badge badge-danger" style="background:rgba(239,68,68,0.2);color:#fca5a5">⚠️ Выберите клиента</span>'}
                  </td>
                  <td class="text-sm">
                    ${hasVehicle ? `
                      <div>${App.vehicleLabel(o.vehicle)}</div>
                      ${o.mileage ? `<div class="text-xs text-muted" style="margin-top:2px">🛣️ ${o.mileage.toLocaleString('ru-RU')} км</div>` : ''}
                    ` : '<span class="badge badge-danger" style="background:rgba(239,68,68,0.2);color:#fca5a5">⚠️ Выберите авто</span>'}
                  </td>
                  <td>${App.statusBadge(o.status)}</td>
                  <td class="td-primary font-bold">${App.formatMoney(o.total_amount)}</td>
                  <td>
                    <button class="btn btn-sm ${isDraft ? 'btn-primary' : 'btn-secondary'}">
                      ${isDraft ? 'Заполнить' : 'Открыть'}
                    </button>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><p class="text-danger">Ошибка: ${App.escHtml(err.message)}</p></div>`;
  }
}

// ─── Order Detail / Form ──────────────────────────────────────────────────────
async function renderOrderDetail(id) {
  App.setContent(App.spinner());
  try {
    const [order, clients, employees] = await Promise.all([
      App.api(`/orders/${id}`),
      App.api('/clients/'),
      App.api('/employees/'),
    ]);
    if (!order) return;

    let clientVehicles = [];
    if (order.client_id) {
      clientVehicles = await App.api(`/vehicles/?client_id=${order.client_id}`).catch(() => []);
    }

    _renderOrderDetailHtml(order, clients, clientVehicles, employees);
  } catch (err) {
    App.setContent(`<div class="page-body"><p class="text-danger">Ошибка: ${App.escHtml(err.message)}</p></div>`);
  }
}

function _renderOrderDetailHtml(order, clients, vehicles, employees) {
  const empMap = {};
  (employees || []).forEach(e => empMap[e.id] = e);

  const needsClient = !order.client_id;
  const needsVehicle = !order.vehicle_id;
  const isUnassigned = needsClient || needsVehicle;

  const servicesTotal = order.services_total ?? order.items.reduce((s, i) => s + i.price, 0);
  const partsTotal = order.parts_total ?? (order.parts || []).reduce((s, p) => s + p.price * p.qty, 0);
  const totalAmount = order.total_amount ?? (servicesTotal + partsTotal);
  // В заказ-наряд и суммы идут только согласованные позиции; дефектовка — отдельная вкладка
  const works = order.items.filter(i => i.approval === 'approved');
  const approvedParts = (order.parts || []).filter(p => p.approval === 'approved');
  const defectItems = order.items.filter(i => i.is_defect);
  const proposedCount = defectItems.filter(i => i.approval === 'proposed').length;
  const discountTotal = Math.round(
    works.reduce((s, i) => s + i.price - i.amount, 0)
    + approvedParts.reduce((s, p) => s + p.price * p.qty - p.amount, 0)
  );
  const activeTab = _activeOrderTab.orderId === order.id ? _activeOrderTab.tab
    : (works.length === 0 && defectItems.length > 0 ? 'defect' : 'works');
  _activeOrderTab = { orderId: order.id, tab: activeTab };
  const tabArgs = `${order.id}, '${order.vehicle?.brand || ''}', '${order.vehicle?.model || ''}'`;

  App.setContent(`
    <div class="page-header">
      <div>
        <div class="back-link" onclick="App.goBack('/orders')">
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
          Все заказ-наряды
        </div>
        <h1 class="page-title">Заказ-наряд #${order.id}</h1>
        <p class="page-subtitle">Создан ${App.formatDate(order.created_at)}</p>
      </div>
      <div class="flex gap-2 order-header-actions">
        ${Permissions.can(App.user?.role, 'order.comments') ? `
        <button class="btn btn-sm btn-secondary" id="btn-comments" onclick="openCommentsDrawer(${order.id})">
          💬 Комментарии${(order.comments && order.comments.length > 0) ? ` <span style="background:var(--accent);color:#000;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:4px">${order.comments.length}</span>` : ''}
        </button>` : ''}
        <button class="btn btn-sm btn-secondary" id="btn-print" onclick="openPrintModal(${order.id})">
          🖨 Печать
        </button>
        ${Permissions.can(App.user?.role, 'order.share') && !order.scoped ? `
        <button class="btn btn-sm btn-secondary" id="btn-share" onclick="shareOrder(${order.id})" title="Поделиться с клиентом">
          🔗 Поделиться
        </button>` : ''}
        ${Permissions.can(App.user?.role, 'order.delete') ? `
        <button class="btn btn-danger btn-sm" onclick="deleteOrder(${order.id})">Удалить заказ</button>` : ''}
      </div>
    </div>

    <div class="page-body">

      <!-- Prominent Warning Banner if Client or Vehicle is missing -->
      ${isUnassigned ? `
        <div style="background:rgba(239,68,68,0.15);border:2px dashed #ef4444;border-radius:var(--radius-md);padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:16px">
          <div class="flex items-center gap-3">
            <span style="font-size:24px">⚠️</span>
            <div>
              <strong style="color:#fca5a5;font-size:15px">Внимание! Необходимо привязать Клиента и Автомобиль</strong>
              <div class="text-sm text-muted" style="margin-top:2px">Для полноценной работы с заказом выберите клиента и его авто из списка или создайте их прямо здесь.</div>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="detail-grid">
        <!-- Left Column -->
        <div>

          <!-- Order Settings Card -->
          <div class="card mb-4" style="${isUnassigned ? 'border-color:#ef4444;box-shadow:0 0 0 2px rgba(239,68,68,0.2)' : ''}">
            <div class="card-header">
              <span class="card-title">Данные клиента и автомобиля</span>
              <div class="flex gap-2 align-items-center order-status-wrapper">
                <span class="text-sm">Статус:</span>
                <select class="form-control" id="order-status-select" style="width:auto;padding:6px 12px">
                  ${ORDER_STATUSES.map(s => `
                    <option value="${s.value}" ${order.status === s.value ? 'selected' : ''}>${s.label}</option>
                  `).join('')}
                </select>
                <button class="btn btn-sm btn-primary" id="btn-save-status">Сменить</button>
              </div>
            </div>

            <div class="card-body">
              <!-- Client Selection -->
              <div class="form-group mb-4" style="${needsClient ? 'background:rgba(239,68,68,0.1);padding:12px;border-radius:var(--radius-sm);border:1px solid rgba(239,68,68,0.3)' : ''}">
                <label>
                  Клиент <span class="required">*</span>
                  ${needsClient ? '<span style="color:#fca5a5;margin-left:6px;font-weight:700">(Выберите или создайте нового)</span>' : ''}
                </label>
                <div class="flex gap-2">
                  <select class="form-control" id="select-order-client" onchange="onOrderClientChanged(${order.id}, this.value)">
                    <option value="">— Выберите клиента —</option>
                    ${clients.map(c => `
                      <option value="${c.id}" ${order.client_id === c.id ? 'selected' : ''}>
                        ${App.escHtml(c.full_name)} (${App.escHtml(c.phone)})
                      </option>
                    `).join('')}
                  </select>
                  <button class="btn btn-secondary" onclick="inlineCreateClient(${order.id})" style="flex-shrink:0">
                    + Новый клиент
                  </button>
                </div>
              </div>

              <!-- Vehicle Selection -->
              <div class="form-group mb-4" style="${needsVehicle ? 'background:rgba(239,68,68,0.1);padding:12px;border-radius:var(--radius-sm);border:1px solid rgba(239,68,68,0.3)' : ''}">
                <label>
                  Автомобиль <span class="required">*</span>
                  ${needsVehicle ? '<span style="color:#fca5a5;margin-left:6px;font-weight:700">(Выберите или добавьте авто)</span>' : ''}
                </label>
                <div class="flex gap-2">
                  <select class="form-control" id="select-order-vehicle" onchange="onOrderVehicleChanged(${order.id}, this.value)" ${!order.client_id ? 'disabled' : ''}>
                    <option value="">${!order.client_id ? '— Сначала выберите клиента —' : '— Выберите автомобиль —'}</option>
                    ${vehicles.map(v => `
                      <option value="${v.id}" ${order.vehicle_id === v.id ? 'selected' : ''}>
                        ${App.vehicleLabel(v)}
                      </option>
                    `).join('')}
                  </select>
                  <button class="btn btn-secondary" onclick="inlineCreateVehicle(${order.id}, ${order.client_id})" ${!order.client_id ? 'disabled title="Сначала выберите клиента"' : ''} style="flex-shrink:0">
                    + Добавить авто
                  </button>
                </div>
              </div>

              <!-- Complaint -->
              <div class="form-group mb-4">
                <label>🩺 Жалоба клиента / причина обращения</label>
                ${order.scoped ? `
                  <div class="text-sm" style="padding:8px 12px;background:var(--bg-input);border-radius:var(--radius-sm)">${order.complaint ? App.escHtml(order.complaint) : '<span class="text-muted">не указана</span>'}</div>
                ` : `
                  <div class="flex gap-2">
                    <textarea class="form-control" id="input-order-complaint" rows="2"
                      placeholder="Например: стук спереди справа на неровностях / плановый осмотр">${App.escHtml(order.complaint || '')}</textarea>
                    <button class="btn btn-secondary" id="btn-save-complaint" style="flex-shrink:0;align-self:flex-start">Сохранить</button>
                  </div>`}
              </div>

              <!-- Mileage Field -->
              <div class="form-group mb-4">
                <label style="display:flex;align-items:center;gap:6px">
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" style="opacity:.6"><path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 2a6 6 0 110 12A6 6 0 0110 4zm0 1a1 1 0 00-1 1v4.586l-2.707 2.707a1 1 0 101.414 1.414L10 12.414V8a1 1 0 00-1-1z"/></svg>
                  Пробег (км)
                </label>
                <div class="flex gap-2">
                  <input
                    type="number"
                    class="form-control"
                    id="input-order-mileage"
                    placeholder="Например: 85000"
                    min="0"
                    value="${order.mileage ?? ''}"
                    style="max-width:200px"
                  />
                  <button class="btn btn-secondary" id="btn-save-mileage" style="flex-shrink:0">Сохранить</button>
                </div>
                ${order.mileage ? `<div class="text-sm text-muted" style="margin-top:4px">Текущий пробег: <strong>${order.mileage.toLocaleString('ru-RU')} км</strong></div>` : ''}
                ${order.vehicle_id && !order.scoped ? `
                  <div style="margin-top:8px">
                    <a href="#/vehicle-history/${order.vehicle_id}" style="font-size:12px;color:var(--accent);text-decoration:none;display:inline-flex;align-items:center;gap:4px">
                      <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/></svg>
                      История обслуживания этого авто
                    </a>
                  </div>
                ` : ''}
              </div>

              <!-- Totals breakdown -->
              ${order.scoped ? `
              <div class="order-totals">
                <div class="order-totals-row total">
                  <span class="label">🔧 Сумма ваших работ</span>
                  <span class="value">${App.formatMoney(servicesTotal)}</span>
                </div>
              </div>` : `
              <div class="order-totals">
                <div class="order-totals-row">
                  <span class="label">🔧 Сумма работ</span>
                  <span class="value">${App.formatMoney(servicesTotal)}</span>
                </div>
                <div class="order-totals-row">
                  <span class="label">🔩 Сумма запчастей</span>
                  <span class="value">${App.formatMoney(partsTotal)}</span>
                </div>
                <div class="order-totals-row total">
                  <span class="label">Итого</span>
                  <span class="value">${App.formatMoney(totalAmount)}</span>
                </div>
                ${discountTotal > 0 ? `
                <div class="order-totals-row">
                  <span class="label">в т.ч. скидка</span>
                  <span class="value">${App.formatMoney(discountTotal)}</span>
                </div>` : ''}
              </div>`}
            </div>
          </div>

          <!-- Works & Parts Tabbed Card -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Состав заказа</span>
              <div id="tab-actions" class="flex gap-2"></div>
            </div>

            <!-- Tab navigation -->
            <div class="card-tabs">
              <div class="card-tab ${activeTab === 'defect' ? 'active' : ''}" id="tab-defect" onclick="switchOrderTab('defect', ${tabArgs})">
                🩺 Дефектовка <span style="font-size:11px;opacity:.7">(${defectItems.length})</span>
                ${proposedCount ? `<span title="Ждут решения клиента" style="background:#f59e0b;color:#000;border-radius:10px;padding:0 6px;font-size:11px;margin-left:2px">${proposedCount}</span>` : ''}
              </div>
              <div class="card-tab ${activeTab === 'works' ? 'active' : ''}" id="tab-works" onclick="switchOrderTab('works', ${tabArgs})">
                🔧 ${order.scoped ? 'Мои работы' : 'Работы'} <span style="font-size:11px;opacity:.7">(${works.length})</span>
              </div>
              <div class="card-tab ${activeTab === 'parts' ? 'active' : ''}" id="tab-parts" onclick="switchOrderTab('parts', ${tabArgs})">
                🔩 Запчасти и материалы <span style="font-size:11px;opacity:.7">(${approvedParts.length})</span>
              </div>
            </div>

            <!-- Tab: Дефектовка -->
            <div id="tab-pane-defect" class="tab-pane ${activeTab === 'defect' ? 'active' : ''}">
              ${_renderDefectList(defectItems, order.parts || [], order.id, order.vehicle?.brand || '', order.vehicle?.model || '', !order.scoped)}
            </div>

            <!-- Tab: Работы -->
            <div id="tab-pane-works" class="tab-pane ${activeTab === 'works' ? 'active' : ''}">
              <div id="items-wrap">
                ${_renderItemsTable(works, order.id, empMap, order.vehicle?.brand || '', order.vehicle?.model || '')}
              </div>
            </div>

            <!-- Tab: Запчасти -->
            <div id="tab-pane-parts" class="tab-pane ${activeTab === 'parts' ? 'active' : ''}">
              <div id="parts-wrap">
                ${_renderPartsTable(approvedParts, order.id)}
              </div>
            </div>
          </div>

        </div>

        <!-- Right Column: History -->
        <div>
          <div class="card">
            <div class="card-header">
              <span class="card-title">История статусов</span>
            </div>
            <div class="card-body">
              ${order.status_history.length === 0
      ? '<p class="text-muted text-sm">История пуста</p>'
      : order.status_history.slice().reverse().map(h => `
                  <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">
                    <div style="width:8px;height:8px;border-radius:50%;background:var(--accent);margin-top:5px;flex-shrink:0"></div>
                    <div>
                      ${App.statusBadge(h.status)}
                      <div class="text-muted text-sm" style="margin-top:3px">${App.formatDate(h.changed_at)}</div>
                    </div>
                  </div>
                `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `);

  // Set initial tab actions
  _setTabActions(activeTab, order.id, order.vehicle?.brand || '', order.vehicle?.model || '', order.vehicle);

  document.getElementById('btn-save-complaint')?.addEventListener('click', async () => {
    const complaint = document.getElementById('input-order-complaint').value.trim() || null;
    try {
      await App.api(`/orders/${order.id}`, { method: 'PUT', body: { complaint } });
      App.toast('Жалоба клиента сохранена');
    } catch (err) {
      App.toast(err.message, 'error');
    }
  });

  // Event handlers
  document.getElementById('btn-save-status').addEventListener('click', async () => {
    const newStatus = document.getElementById('order-status-select').value;
    try {
      await App.api(`/orders/${order.id}`, { method: 'PUT', body: { status: newStatus } });
      App.toast('Статус обновлён');
      renderOrderDetail(order.id);
    } catch (err) {
      App.toast(err.message, 'error');
    }
  });

  // Mileage save handler
  const saveMileage = async () => {
    const input = document.getElementById('input-order-mileage');
    if (!input) return;
    const val = input.value.trim();
    const mileage = val === '' ? null : parseInt(val, 10);
    if (mileage !== null && (isNaN(mileage) || mileage < 0)) {
      App.toast('Введите корректный пробег (целое число ≥ 0)', 'error');
      return;
    }
    try {
      await App.api(`/orders/${order.id}`, { method: 'PUT', body: { mileage } });
      App.toast('Пробег сохранён');
      renderOrderDetail(order.id);
    } catch (err) {
      App.toast(err.message, 'error');
    }
  };

  document.getElementById('btn-save-mileage')?.addEventListener('click', saveMileage);
  document.getElementById('input-order-mileage')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveMileage();
    }
  });
}

// ─── Tab switching ────────────────────────────────────────────────────────────
// Активная вкладка заказа — чтобы после сохранения позиции не перескакивать на «Работы»
let _activeOrderTab = { orderId: null, tab: 'works' };

function switchOrderTab(tab, orderId, brand, model) {
  _activeOrderTab = { orderId, tab };
  // Toggle tabs
  document.querySelectorAll('.card-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`tab-pane-${tab}`).classList.add('active');

  // Update action buttons
  const vehicleEl = document.getElementById('select-order-vehicle');
  const vehicleExists = vehicleEl && vehicleEl.value;
  _setTabActions(tab, orderId, brand, model, vehicleExists);
}

function _setTabActions(tab, orderId, brand, model, vehicle) {
  const actionsEl = document.getElementById('tab-actions');
  if (!actionsEl) return;
  // Скидки меняют деньги — механику с видимостью «только свои работы» недоступны
  const canBulk = !Permissions.isOrderScoped();

  if (tab === 'defect') {
    actionsEl.innerHTML = `
      ${canBulk ? `
      <button class="btn btn-sm btn-secondary" onclick="downloadDefectSheet(${orderId})" title="Дефектовочный лист для клиента (DOCX)">📋 Дефектовочный лист</button>
      <button class="btn btn-sm btn-secondary" onclick="setAllProposed(${orderId}, 'approved')" title="Согласовать все позиции, ожидающие решения">✓ Согласовать всё</button>
      <button class="btn btn-sm btn-secondary" onclick="setAllProposed(${orderId}, 'declined')" title="Отказ по всем позициям, ожидающим решения">✕ Отказ от остального</button>` : ''}
      <button class="btn btn-sm btn-primary" onclick="showItemModal(${orderId}, null, '${brand}', '${model}', 'defect')">
        + Добавить в дефектовку
      </button>
    `;
  } else if (tab === 'works') {
    actionsEl.innerHTML = `
      ${vehicle ? `
      <button class="btn btn-sm btn-secondary" onclick="recalcOrderPrices(${orderId})" title="Пересчитать цены позиций из справочника под текущий автомобиль">
        ↻ Пересчитать цены
      </button>` : ''}
      ${canBulk ? `<button class="btn btn-sm btn-secondary" onclick="showBulkDiscountModal(${orderId}, 'items')" title="Одна скидка на все работы">% Скидка на все</button>` : ''}
      ${canBulk ? `
      <button class="btn btn-sm btn-primary" onclick="showItemModal(${orderId}, null, '${brand}', '${model}')">
        + Добавить работу
      </button>` : ''}
    `;
  } else {
    actionsEl.innerHTML = `
      ${canBulk ? `<button class="btn btn-sm btn-secondary" onclick="showBulkDiscountModal(${orderId}, 'parts')" title="Одна скидка на все запчасти">% Скидка на все</button>` : ''}
      <button class="btn btn-sm btn-primary" onclick="showPartModal(${orderId}, null)">
        + Добавить запчасть
      </button>
    `;
  }
}

// ─── Defect (Дефектовка) ──────────────────────────────────────────────────────
const URGENCY_OPTIONS = [
  { value: 'urgent',      label: 'Срочно',        color: '#ef4444' },
  { value: 'recommended', label: 'Рекомендуется', color: '#f59e0b' },
  { value: 'later',       label: 'Можно позже',   color: '#9ca3af' },
];

const APPROVAL_BADGES = {
  proposed: '<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b">Ждёт решения</span>',
  approved: '<span class="badge" style="background:rgba(72,187,120,0.15);color:#48bb78">Согласовано</span>',
  declined: '<span class="badge" style="background:rgba(239,68,68,0.15);color:#fca5a5">Отказ</span>',
};

function _urgencyBadge(urgency) {
  const u = URGENCY_OPTIONS.find(o => o.value === urgency);
  return u ? `<span class="badge" style="background:transparent;border:1px solid ${u.color};color:${u.color}">${u.label}</span>` : '';
}

/**
 * Вкладка «Дефектовка»: найденные при осмотре работы с ценами и запчастями.
 * canDecide — менеджер/владелец: отмечает решение клиента и добавляет запчасти.
 */
function _renderDefectList(items, parts, orderId, brand, model, canDecide) {
  if (!items.length) {
    return `<div class="empty-state" style="padding:30px">
      <p class="text-muted">Дефектовки пока нет. Механик добавляет найденное при осмотре кнопкой «+ Добавить в дефектовку» —
      менеджер согласует позиции с клиентом, и согласованные появятся на вкладке «Работы».</p>
    </div>`;
  }
  const sumOf = list => list.reduce((s, i) => s + i.amount + parts.filter(p => p.item_id === i.id).reduce((a, p) => a + p.amount, 0), 0);
  const byApproval = a => items.filter(i => i.approval === a);

  return `
    <div class="defect-list">
      ${items.map(item => {
        const itemParts = parts.filter(p => p.item_id === item.id);
        const declined = item.approval === 'declined';
        return `
        <div class="defect-card ${declined ? 'is-declined' : ''}">
          <div class="defect-card-head">
            <div style="min-width:0">
              <div class="defect-card-title">${App.escHtml(item.work_name)}${item.price_variant ? ` <span class="text-muted text-sm" style="font-weight:400">· ${App.escHtml(item.price_variant)}</span>` : ''}</div>
              ${item.defect_note ? `<div class="text-sm" style="margin-top:2px">🔎 ${App.escHtml(item.defect_note)}</div>` : ''}
              <div class="flex gap-2" style="flex-wrap:wrap;margin-top:6px;align-items:center">
                ${APPROVAL_BADGES[item.approval] || ''} ${_urgencyBadge(item.urgency)}
                <span class="text-sm text-muted">👤 ${item.employee ? App.escHtml(item.employee.full_name) : 'не назначен'}</span>
              </div>
            </div>
            <div class="defect-card-price">${_amountHtml(item.amount, item.price, item.discount)}</div>
          </div>

          ${itemParts.length || canDecide ? `
          <div class="defect-card-parts">
            ${itemParts.map(p => `
              <div class="defect-part-row">
                <span>🔩 ${App.escHtml(p.name)} <span class="text-muted">× ${+p.qty}</span></span>
                <span class="flex gap-2" style="align-items:center">
                  <strong>${App.formatMoney(p.amount)}</strong>
                  ${canDecide ? `
                    <button class="btn btn-sm btn-ghost" onclick="showPartModal(${orderId}, ${p.id})" title="Изменить">✏️</button>
                    <button class="btn btn-sm btn-ghost" onclick="deletePart(${orderId}, ${p.id})" title="Удалить">✕</button>` : ''}
                </span>
              </div>`).join('')}
            ${canDecide && !declined ? `<button class="btn btn-sm btn-ghost" onclick="showPartModal(${orderId}, null, ${item.id})">+ запчасть к этой работе</button>` : ''}
          </div>` : ''}

          <div class="defect-card-actions">
            ${canDecide ? (item.approval === 'proposed' ? `
              <button class="btn btn-sm btn-primary" onclick="setItemApproval(${orderId}, ${item.id}, 'approved')">✓ Согласовано</button>
              <button class="btn btn-sm btn-secondary" onclick="setItemApproval(${orderId}, ${item.id}, 'declined')">✕ Отказ</button>
            ` : `
              <button class="btn btn-sm btn-ghost" onclick="setItemApproval(${orderId}, ${item.id}, 'proposed')" title="Вернуть на согласование">↺ Вернуть на согласование</button>
            `) : ''}
            ${canDecide || item.approval === 'proposed' ? `
              <button class="btn btn-sm btn-secondary" onclick="showItemModal(${orderId}, ${item.id}, '${brand}', '${model}', 'defect')">✏️ Изм.</button>
              <button class="btn btn-sm btn-danger" onclick="deleteItem(${orderId}, ${item.id})">✕</button>` : ''}
          </div>
        </div>`;
      }).join('')}

      <div class="defect-summary">
        <span>Всего по дефектовке: <strong>${App.formatMoney(sumOf(items))}</strong></span>
        ${byApproval('approved').length ? `<span style="color:#48bb78">Согласовано: <strong>${App.formatMoney(sumOf(byApproval('approved')))}</strong></span>` : ''}
        ${byApproval('proposed').length ? `<span style="color:#f59e0b">Ждёт решения: <strong>${App.formatMoney(sumOf(byApproval('proposed')))}</strong></span>` : ''}
        ${byApproval('declined').length ? `<span style="color:#fca5a5">Отказ: <strong>${App.formatMoney(sumOf(byApproval('declined')))}</strong></span>` : ''}
      </div>
    </div>`;
}

async function setItemApproval(orderId, itemId, approval) {
  try {
    await App.api(`/orders/${orderId}/items/${itemId}`, { method: 'PUT', body: { approval } });
    App.toast({ approved: 'Согласовано — работа перенесена во вкладку «Работы»', declined: 'Отмечен отказ клиента', proposed: 'Позиция возвращена на согласование' }[approval]);
    renderOrderDetail(orderId);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

async function setAllProposed(orderId, approval) {
  const question = approval === 'approved'
    ? 'Согласовать все позиции дефектовки, которые ждут решения клиента?'
    : 'Отметить отказ клиента по всем позициям, которые ещё ждут решения?';
  if (!await App.confirm(question)) return;
  try {
    await App.api(`/orders/${orderId}/approval`, { method: 'POST', body: { approval } });
    App.toast(approval === 'approved' ? 'Все позиции согласованы' : 'Отказ отмечен');
    renderOrderDetail(orderId);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

async function downloadDefectSheet(orderId) {
  try {
    App.toast('Формируется дефектовочный лист…');
    const resp = await fetch(`/api/print-templates/defect-sheet/${orderId}`, {
      headers: { Authorization: `Bearer ${App.token}` },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Ошибка формирования');
    }
    const url = URL.createObjectURL(await resp.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `Дефектовочный_лист_№${orderId}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

// ─── Discounts ────────────────────────────────────────────────────────────────
/** Сумма позиции; при скидке — зачёркнутая полная цена и процент под ней */
function _amountHtml(amount, fullPrice, discount) {
  if (!discount) return App.formatMoney(amount);
  return `${App.formatMoney(amount)}
    <div class="text-sm text-muted" style="font-weight:400;white-space:nowrap">
      <s>${App.formatMoney(fullPrice)}</s> · −${+discount}%
    </div>`;
}

function _fullRateBadge(item) {
  return item.full_rate
    ? ' <span class="badge" style="background:rgba(72,187,120,0.15);color:#48bb78;font-size:10px" title="Исполнитель получает 100% суммы работы">100%</span>'
    : '';
}

function showBulkDiscountModal(orderId, target) {
  const isItems = target === 'items';
  App.openModal({
    title: isItems ? 'Скидка на все работы' : 'Скидка на все запчасти',
    body: `
      <form id="bulk-discount-form" onsubmit="event.preventDefault()">
        <div class="form-group">
          <label>Скидка, %</label>
          <input name="discount" id="bulk-discount-input" type="number" class="form-control" min="0" max="100" step="0.5" value="0" />
          <small class="text-muted" style="font-size:11px">
            Заменит скидку у всех ${isItems ? 'работ' : 'запчастей'} этого заказа. 0 — убрать скидку.
          </small>
        </div>
      </form>
    `,
    submitLabel: 'Применить',
    onSubmit: async () => {
      const discount = parseFloat(document.getElementById('bulk-discount-input').value) || 0;
      if (discount < 0 || discount > 100) return App.toast('Скидка должна быть от 0 до 100%', 'error');
      try {
        await App.api(`/orders/${orderId}/discount`, { method: 'POST', body: { target, discount } });
        App.closeModal();
        App.toast(discount ? `Скидка ${discount}% применена` : 'Скидка убрана');
        await renderOrderDetail(orderId);
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
}

// ─── Items Table ──────────────────────────────────────────────────────────────
function _renderItemsTable(items, orderId, empMap, brand, model) {
  if (!items || items.length === 0) {
    return `<div class="empty-state" style="padding:30px">
      <p class="text-muted">Работы не добавлены. Нажмите «+ Добавить работу».</p>
    </div>`;
  }
  return `
    <!-- Mobile Cards View -->
    <div class="mobile-only order-items-cards-list">
      ${items.map(item => `
        <div class="order-item-card">
          <div class="order-item-card-header">
            <span class="order-item-card-title">${App.escHtml(item.work_name)}${item.price_variant ? ` <span class="text-sm text-muted" style="font-weight:400">· ${App.escHtml(item.price_variant)}</span>` : ''}</span>
            <span class="order-item-card-price">${_amountHtml(item.amount, item.price, item.discount)}</span>
          </div>
          <div class="order-item-card-meta">
            <span>👤 ${item.employee ? App.escHtml(item.employee.full_name) : '<span class="text-muted">Исполнитель не назначен</span>'}${_fullRateBadge(item)}</span>
          </div>
          <div class="order-item-card-footer">
            <select class="form-control item-status-select"
              onchange="changeItemStatus(${orderId}, ${item.id}, this.value)">
              ${ITEM_STATUSES.map(s => `
                <option value="${s.value}" ${item.status === s.value ? 'selected' : ''}>${s.label}</option>
              `).join('')}
            </select>
            <div class="item-actions">
              <button class="btn btn-sm btn-secondary" onclick="showItemModal(${orderId}, ${item.id}, '${brand}', '${model}')" title="Изменить">✏️ Изм.</button>
              <button class="btn btn-sm btn-danger" onclick="deleteItem(${orderId}, ${item.id})" title="Удалить">✕</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Desktop Table View -->
    <div class="desktop-only table-wrap" style="border:none;border-radius:0">
      <table class="items-table">
        <thead>
          <tr>
            <th>Наименование работы</th>
            <th>Исполнитель</th>
            <th>Сумма (₸)</th>
            <th>Статус</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td class="td-primary">${App.escHtml(item.work_name)}${item.price_variant ? `<div class="text-sm text-muted" style="font-weight:400">${App.escHtml(item.price_variant)}</div>` : ''}</td>
              <td class="text-sm">${item.employee ? App.escHtml(item.employee.full_name) : '<span class="text-muted">—</span>'}${_fullRateBadge(item)}</td>
              <td class="font-bold">${_amountHtml(item.amount, item.price, item.discount)}</td>
              <td>
                <select class="form-control" style="width:auto;padding:4px 8px"
                  onchange="changeItemStatus(${orderId}, ${item.id}, this.value)">
                  ${ITEM_STATUSES.map(s => `
                    <option value="${s.value}" ${item.status === s.value ? 'selected' : ''}>${s.label}</option>
                  `).join('')}
                </select>
              </td>
              <td>
                <div class="item-actions">
                  <button class="btn btn-sm btn-secondary" onclick="showItemModal(${orderId}, ${item.id}, '${brand}', '${model}')">Изм.</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteItem(${orderId}, ${item.id})">✕</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

// ─── Parts Table ──────────────────────────────────────────────────────────────
function _renderPartsTable(parts, orderId) {
  if (!parts || parts.length === 0) {
    return `<div class="empty-state" style="padding:30px">
      <p class="text-muted">Запчасти не добавлены. Нажмите «+ Добавить запчасть».</p>
    </div>`;
  }
  return `
    <!-- Mobile Cards View -->
    <div class="mobile-only order-items-cards-list">
      ${parts.map(p => {
        return `
        <div class="order-item-card">
          <div class="order-item-card-header">
            <span class="order-item-card-title">${App.escHtml(p.name)}</span>
            <span class="order-item-card-price">${_amountHtml(p.amount, p.price * p.qty, p.discount)}</span>
          </div>
          <div class="order-item-card-meta">
            <span>${p.article ? `<span class="badge" style="background:rgba(255,255,255,0.08);color:var(--text-secondary);font-size:11px;">Арт: ${App.escHtml(p.article)}</span>` : '<span class="text-muted">Без артикула</span>'}</span>
            <span style="font-size:13px;color:var(--text-secondary);">${+p.qty} шт × ${App.formatMoney(p.price)}</span>
          </div>
          <div class="order-item-card-footer" style="justify-content:flex-end;">
            <div class="item-actions">
              <button class="btn btn-sm btn-secondary" onclick="showPartModal(${orderId}, ${p.id})">✏️ Изм.</button>
              <button class="btn btn-sm btn-danger" onclick="deletePart(${orderId}, ${p.id})">✕</button>
            </div>
          </div>
        </div>
      `;
      }).join('')}
    </div>

    <!-- Desktop Table View -->
    <div class="desktop-only table-wrap" style="border:none;border-radius:0">
      <table class="items-table">
        <thead>
          <tr>
            <th>Наименование</th>
            <th>Артикул</th>
            <th style="text-align:center">Кол-во</th>
            <th>Цена (₸)</th>
            <th>Сумма (₸)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${parts.map(p => {
    return `
            <tr>
              <td class="td-primary">${App.escHtml(p.name)}</td>
              <td class="text-sm text-muted">${p.article ? App.escHtml(p.article) : '—'}</td>
              <td style="text-align:center">${+p.qty}</td>
              <td>${App.formatMoney(p.price)}</td>
              <td class="font-bold">${_amountHtml(p.amount, p.price * p.qty, p.discount)}</td>
              <td>
                <div class="item-actions">
                  <button class="btn btn-sm btn-secondary" onclick="showPartModal(${orderId}, ${p.id})">Изм.</button>
                  <button class="btn btn-sm btn-danger" onclick="deletePart(${orderId}, ${p.id})">✕</button>
                </div>
              </td>
            </tr>
          `;
  }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ─── Part Modal ───────────────────────────────────────────────────────────────
function _updatePartSumPreview() {
  const form = document.getElementById('part-form');
  if (!form) return;
  const price = parseFloat(form.price.value) || 0;
  const qty = parseFloat(form.qty.value) || 1;
  const discount = form.discount ? (parseFloat(form.discount.value) || 0) : 0;
  document.getElementById('part-sum-preview').textContent =
    'Сумма: ' + App.formatMoney(price * qty * (1 - discount / 100));
}

/** itemId — привязать новую запчасть к работе (дефектовка): она наследует решение клиента по работе */
async function showPartModal(orderId, partId = null, itemId = null) {
  const scoped = Permissions.isOrderScoped();
  let part = null;
  if (partId) {
    try {
      const order = await App.api(`/orders/${orderId}`);
      part = (order.parts || []).find(p => p.id === partId) || null;
    } catch {}
  }

  App.openModal({
    title: part ? 'Редактировать запчасть' : (itemId ? 'Запчасть к работе из дефектовки' : 'Добавить запчасть / материал'),
    body: `
      <form id="part-form">
        <div class="form-group">
          <label>Наименование <span class="required">*</span></label>
          <input name="name" class="form-control" required
            value="${part ? App.escHtml(part.name) : ''}"
            placeholder="Масляный фильтр, тормозная жидкость…" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Артикул</label>
            <input name="article" class="form-control"
              value="${part ? App.escHtml(part.article || '') : ''}"
              placeholder="AB-1234" />
          </div>
          <div class="form-group">
            <label>Количество <span class="required">*</span></label>
            <input name="qty" type="number" class="form-control" required min="0.001" step="0.001"
              value="${part ? part.qty : 1}" oninput="_updatePartSumPreview()"
              placeholder="1" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Цена за единицу (₸) <span class="required">*</span></label>
            <input name="price" type="number" class="form-control" required min="0" step="100"
              value="${part ? part.price : ''}"
              placeholder="0"
              id="part-price-input" oninput="_updatePartSumPreview()" />
          </div>
          ${scoped ? '' : `
          <div class="form-group">
            <label>Скидка, %</label>
            <input name="discount" type="number" class="form-control" min="0" max="100" step="0.5"
              value="${part ? +part.discount : 0}" oninput="_updatePartSumPreview()" />
          </div>`}
        </div>
        <div id="part-sum-preview" class="text-sm text-muted" style="margin-top:-6px;margin-bottom:8px">
          ${part ? `Сумма: ${App.formatMoney(part.amount)}` : ''}
        </div>
      </form>
    `,
    submitLabel: part ? 'Сохранить' : 'Добавить',
    onSubmit: async () => {
      const data = App.formData('part-form');
      data.price = parseFloat(data.price) || 0;
      data.qty = parseFloat(data.qty) || 1;
      if (!partId && itemId) data.item_id = itemId;
      if ('discount' in data) data.discount = parseFloat(data.discount) || 0;

      try {
        if (partId) {
          await App.api(`/orders/${orderId}/parts/${partId}`, { method: 'PUT', body: data });
          App.toast('Запчасть обновлена');
        } else {
          await App.api(`/orders/${orderId}/parts`, { method: 'POST', body: data });
          App.toast('Запчасть добавлена');
        }
        App.closeModal();
        await renderOrderDetail(orderId);
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
}

async function deletePart(orderId, partId) {
  if (!await App.confirm('Удалить эту запчасть из заказа?')) return;
  try {
    await App.api(`/orders/${orderId}/parts/${partId}`, { method: 'DELETE' });
    App.toast('Запчасть удалена');
    await renderOrderDetail(orderId);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

// ─── Comments Drawer ──────────────────────────────────────────────────────────
let _commentsOrderId = null;
let _commentsImageFile = null;

async function openCommentsDrawer(orderId) {
  _commentsOrderId = orderId;
  _commentsImageFile = null;

  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'drawer-backdrop';
  backdrop.id = 'drawer-backdrop';
  backdrop.onclick = closeCommentsDrawer;
  document.body.appendChild(backdrop);

  // Create drawer
  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.id = 'comments-drawer';
  drawer.innerHTML = `
    <div class="drawer-header">
      <span class="drawer-title">💬 Комментарии к заказу #${orderId}</span>
      <button class="drawer-close" onclick="closeCommentsDrawer()">✕</button>
    </div>
    <div class="chat-messages" id="chat-messages">${App.spinner()}</div>
    <div class="chat-input-bar">
      <div id="chat-preview-wrap" class="chat-preview-wrap" style="display:none"></div>
      <div class="chat-input-row">
        <textarea class="chat-textarea" id="chat-text" placeholder="Написать комментарий…" rows="1"
          onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();sendComment(${orderId});}"
          oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
        <label class="chat-attach-btn" title="Прикрепить изображение">
          📎
          <input type="file" id="chat-image-input" accept="image/*" style="display:none"
            onchange="onChatImageSelected(this)" />
        </label>
        <button class="chat-send-btn" onclick="sendComment(${orderId})" title="Отправить">
          ➤
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(drawer);

  await loadComments(orderId);
}

async function loadComments(orderId) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return;

  try {
    const comments = await App.api(`/orders/${orderId}/comments`);
    _renderComments(comments, orderId);
  } catch (err) {
    messagesEl.innerHTML = `<p class="text-danger text-sm">Ошибка: ${App.escHtml(err.message)}</p>`;
  }
}

function _renderComments(comments, orderId) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return;

  if (!comments || comments.length === 0) {
    messagesEl.innerHTML = `
      <div class="chat-empty">
        <span style="font-size:36px">💬</span>
        <span>Комментариев пока нет</span>
        <span style="font-size:11px">Напишите первый или прикрепите фото дефекта</span>
      </div>`;
    return;
  }

  messagesEl.innerHTML = comments.map(c => {
    const initials = (c.author || '?').substring(0, 2).toUpperCase();
    const date = new Date(c.created_at);
    const timeStr = date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    return `
      <div class="chat-message" id="msg-${c.id}">
        <div class="chat-message-header">
          <div class="chat-avatar">${initials}</div>
          <span class="chat-author">${App.escHtml(c.author)}</span>
          <span class="chat-time">${timeStr}</span>
        </div>
        <div class="chat-bubble">
          ${c.text ? `<div>${App.escHtml(c.text).replace(/\n/g, '<br>')}</div>` : ''}
          ${c.image_path ? `<img src="${c.image_path}" alt="фото" onclick="showCommentImage('${c.image_path}')" />` : ''}
        </div>
        <button class="chat-delete-btn" onclick="deleteComment(${orderId}, ${c.id})">🗑 удалить</button>
      </div>
    `;
  }).join('');

  // Scroll to bottom
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showCommentImage(src) {
  let lightbox = document.getElementById('comment-lightbox');
  if (lightbox) lightbox.remove();
  lightbox = document.createElement('div');
  lightbox.id = 'comment-lightbox';
  lightbox.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);';
  lightbox.onclick = (e) => { if (e.target !== lightbox.querySelector('img')) lightbox.remove(); };
  lightbox.innerHTML = `
    <img src="${src}" style="max-width:95vw;max-height:90vh;object-fit:contain;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,0.8);" />
    <button onclick="document.getElementById('comment-lightbox').remove()" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.2);border:none;color:#fff;width:38px;height:38px;border-radius:50%;font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;">✕</button>
  `;
  document.body.appendChild(lightbox);
}

function onChatImageSelected(input) {
  if (!input.files || !input.files[0]) return;
  _commentsImageFile = input.files[0];

  const previewWrap = document.getElementById('chat-preview-wrap');
  const url = URL.createObjectURL(_commentsImageFile);
  previewWrap.style.display = 'flex';
  previewWrap.innerHTML = `
    <img src="${url}" alt="preview" />
    <span>${App.escHtml(_commentsImageFile.name)}</span>
    <button class="chat-preview-remove" onclick="removeChatImage()" title="Убрать">✕</button>
  `;
}

function removeChatImage() {
  _commentsImageFile = null;
  const previewWrap = document.getElementById('chat-preview-wrap');
  previewWrap.style.display = 'none';
  previewWrap.innerHTML = '';
  const fileInput = document.getElementById('chat-image-input');
  if (fileInput) fileInput.value = '';
}

async function sendComment(orderId) {
  const textEl = document.getElementById('chat-text');
  const text = textEl ? textEl.value.trim() : '';

  if (!text && !_commentsImageFile) {
    App.toast('Введите текст или прикрепите изображение', 'error');
    return;
  }

  const sendBtn = document.querySelector('.chat-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const token = App.token || localStorage.getItem('sto_token');
    const formData = new FormData();
    if (text) formData.append('text', text);
    if (_commentsImageFile) formData.append('image', _commentsImageFile);

    const resp = await fetch(`/api/orders/${orderId}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Ошибка отправки');
    }

    // Clear input
    if (textEl) { textEl.value = ''; textEl.style.height = 'auto'; }
    removeChatImage();

    // Reload comments
    await loadComments(orderId);

    // Update comment count badge in header button (if page is open)
    const comments = await App.api(`/orders/${orderId}/comments`).catch(() => []);
    const btnComments = document.getElementById('btn-comments');
    if (btnComments) {
      btnComments.innerHTML = `💬 Комментарии${comments.length > 0 ? ` <span style="background:var(--accent);color:#000;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:4px">${comments.length}</span>` : ''}`;
    }

  } catch (err) {
    App.toast(err.message, 'error');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

async function deleteComment(orderId, commentId) {
  if (!await App.confirm('Удалить этот комментарий?')) return;
  try {
    await App.api(`/orders/${orderId}/comments/${commentId}`, { method: 'DELETE' });
    App.toast('Комментарий удалён');
    await loadComments(orderId);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

function closeCommentsDrawer() {
  const backdrop = document.getElementById('drawer-backdrop');
  const drawer = document.getElementById('comments-drawer');
  if (backdrop) backdrop.remove();
  if (drawer) drawer.remove();
  _commentsImageFile = null;
}

// ─── Print Modal ──────────────────────────────────────────────────────────────
async function openPrintModal(orderId) {
  if (!Permissions.can(App.user?.role, 'print.generate')) {
    App.toast('Печать недоступна для вашей роли', 'error');
    return;
  }
  try {
    const { exists } = await App.api('/print-templates/template-exists');
    if (!exists) {
      // Шаблон загружается в «Настройки → Печатная форма»
      if (App.isOwner() && await App.confirm('Шаблон печатной формы не загружен. Перейти в настройки, чтобы загрузить его?')) {
        App.navigate('/settings/print');
      } else if (!App.isOwner()) {
        App.toast('Шаблон не загружен. Обратитесь к администратору.', 'error');
      }
      return;
    }
  } catch {}
  generateOrderDoc(orderId);
}

async function generateOrderDoc(orderId) {
  try {
    const token = App.token || localStorage.getItem('sto_token');
    App.toast('Формируется документ…');

    const resp = await fetch(`/api/print-templates/generate/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Ошибка генерации');
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Заказ-наряд_№${orderId}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    App.toast('Документ сформирован и скачан!');
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

// ─── Inline Client & Vehicle Creation ─────────────────────────────────────────

async function onOrderClientChanged(orderId, clientId) {
  const cId = clientId ? parseInt(clientId) : null;
  try {
    await App.api(`/orders/${orderId}`, {
      method: 'PUT',
      body: { client_id: cId, vehicle_id: null },
    });
    App.toast('Клиент привязан к заказу');
    renderOrderDetail(orderId);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

async function onOrderVehicleChanged(orderId, vehicleId) {
  const vId = vehicleId ? parseInt(vehicleId) : null;
  try {
    await App.api(`/orders/${orderId}`, {
      method: 'PUT',
      body: { vehicle_id: vId },
    });
    App.toast('Автомобиль привязан к заказу');

    const order = await App.api(`/orders/${orderId}`).catch(() => null);
    const hasCatalogItems = order?.items?.some(i => i.service_id);
    if (vId && hasCatalogItems) {
      const confirmed = await App.confirm(
        'У заказа есть позиции, добавленные из справочника услуг. Пересчитать их цены под новый автомобиль?'
      );
      if (confirmed) {
        await recalcOrderPrices(orderId);
        return;
      }
    }

    renderOrderDetail(orderId);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

async function recalcOrderPrices(orderId) {
  try {
    const result = await App.api(`/orders/${orderId}/recalculate-prices`, { method: 'POST' });
    if (result.updated_count > 0) {
      App.toast(`Обновлено цен: ${result.updated_count}`);
    } else {
      App.toast('Все цены уже актуальны — обновлять нечего');
    }
    renderOrderDetail(orderId);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

function inlineCreateClient(orderId) {
  App.openModal({
    title: 'Быстрое создание клиента',
    body: `
      <form id="inline-client-form">
        <div class="form-group">
          <label>ФИО <span class="required">*</span></label>
          <input name="full_name" class="form-control" required placeholder="Иванов Иван Иванович" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Телефон <span class="required">*</span></label>
            <input name="phone" id="inline-client-phone" class="form-control" required
              placeholder="+7 (___) ___-__-__" inputmode="numeric" />
          </div>
          <div class="form-group">
            <label>Email</label>
            <input name="email" type="email" class="form-control" placeholder="client@example.kz" />
          </div>
        </div>
      </form>
    `,
    submitLabel: 'Создать и выбрать',
    onSubmit: async () => {
      const data = App.formData('inline-client-form');
      try {
        const newClient = await App.api('/clients/', { method: 'POST', body: data });
        App.toast(`Клиент «${newClient.full_name}» создан!`);
        App.closeModal();
        await onOrderClientChanged(orderId, newClient.id);
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
  setTimeout(() => {
    const phoneInput = document.getElementById('inline-client-phone');
    if (phoneInput) attachPhoneMask(phoneInput);
  }, 0);
}

async function inlineCreateVehicle(orderId, clientId) {
  if (!clientId) {
    App.toast('Сначала выберите клиента!', 'error');
    return;
  }

  let brands = [];
  try { brands = await App.api('/vehicles/brands'); } catch {}

  App.openModal({
    title: 'Быстрое добавление автомобиля',
    body: `
      <form id="inline-vehicle-form">
        <input type="hidden" name="client_id" value="${clientId}" />
        <div class="form-row">
          <div class="form-group">
            <label>Марка <span class="required">*</span></label>
            <select name="brand" id="inline-veh-brand" class="form-control" required onchange="onInlineVehBrandChanged(this.value)">
              <option value="">— Выберите марку —</option>
              ${brands.map(b => `<option value="${App.escHtml(b.name)}" data-id="${b.id}">${App.escHtml(b.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Модель <span class="required">*</span></label>
            <input name="model" id="inline-veh-model" class="form-control" required placeholder="Camry, RX, X5…" list="inline-veh-models" />
            <datalist id="inline-veh-models"></datalist>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Год выпуска</label>
            <input name="year" type="number" class="form-control" placeholder="2022" min="1900" max="${new Date().getFullYear() + 1}" />
          </div>
          <div class="form-group">
            <label>Гос. номер</label>
            <input name="plate_number" class="form-control" placeholder="777AAA01" />
          </div>
        </div>
      </form>
    `,
    submitLabel: 'Добавить и выбрать',
    onSubmit: async () => {
      const data = App.formData('inline-vehicle-form');
      if (data.year) data.year = parseInt(data.year);
      try {
        const newVehicle = await App.api('/vehicles/', { method: 'POST', body: data });
        App.toast(`Автомобиль ${newVehicle.brand} ${newVehicle.model} добавлен!`);
        App.closeModal();
        await onOrderVehicleChanged(orderId, newVehicle.id);
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
}

async function onInlineVehBrandChanged(brandName) {
  const bSelect = document.getElementById('inline-veh-brand');
  const dList = document.getElementById('inline-veh-models');
  const modelInput = document.getElementById('inline-veh-model');

  dList.innerHTML = '';
  if (modelInput) modelInput.value = '';

  if (!bSelect || bSelect.selectedIndex <= 0) return;
  const brandId = bSelect.options[bSelect.selectedIndex].getAttribute('data-id');
  if (!brandId) return;

  try {
    const models = await App.api(`/vehicles/brands/${brandId}/models`);
    if (models) {
      dList.innerHTML = models.map(m => `<option value="${App.escHtml(m.name)}"></option>`).join('');
    }
  } catch {}
}

// ─── Order Item Modal with Service Catalog & Auto-Pricing ─────────────────────

/** mode='defect' — позиция дефектовки: «что найдено», срочность, ждёт согласования с клиентом */
async function showItemModal(orderId, itemId = null, brand = '', model = '', mode = 'work') {
  let employees = [], services = [], item = null;
  const scoped = Permissions.isOrderScoped();
  try {
    let me = null;
    [employees, services, me] = await Promise.all([
      App.api('/employees/'),
      App.api('/services/'),
      scoped ? App.api('/auth/me') : null,
    ]);
    // Механик с ограниченной видимостью назначает работы только на себя
    if (scoped) employees = employees.filter(e => e.id === me?.employee_id);
    if (itemId) {
      const order = await App.api(`/orders/${orderId}`);
      item = order?.items?.find(i => i.id === itemId) || null;
    }
  } catch {}

  const isDefect = mode === 'defect' || !!item?.is_defect;

  App.openModal({
    title: isDefect
      ? (item ? 'Позиция дефектовки' : 'Добавить в дефектовку')
      : (item ? 'Редактировать позицию' : 'Добавить работу из справочника'),
    body: `
      <form id="item-form">
        <input type="hidden" name="service_id" id="item-service-id" value="${item?.service_id || ''}" />
        <input type="hidden" name="price_variant" id="item-price-variant" value="${App.escHtml(item?.price_variant || '')}" />
        <div class="form-group mb-4">
          <label>Выбрать из Справочника услуг</label>
          <div class="flex gap-2">
            <select class="form-control" id="select-catalog-service" onchange="onCatalogServiceSelected(this.value, '${brand}', '${model}')">
              <option value="">— Создать вручную или выбрать услугу —</option>
              ${services.map(s => `<option value="${s.id}" ${item?.service_id === s.id ? 'selected' : ''}>${App.escHtml(s.name)}${s.category ? ` (${App.escHtml(s.category.name)})` : ''}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-secondary" onclick="inlineCreateService('${brand}', '${model}')" style="flex-shrink:0">
              + Создать услугу
            </button>
          </div>
          <div id="price-variant-wrap" style="margin-top:10px"></div>
        </div>

        <div class="form-group">
          <label>${isDefect ? 'Рекомендуемая работа' : 'Наименование работы'} <span class="required">*</span></label>
          <input name="work_name" id="item-work-name" class="form-control" required
            value="${item ? App.escHtml(item.work_name) : ''}"
            placeholder="Замена масла, тормозные колодки…" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>
              Цена (₸) <span class="required">*</span>
              <span id="price-resolved-badge" class="text-sm text-success" style="margin-left:6px;font-weight:normal"></span>
            </label>
            <input name="price" id="item-price" type="number" class="form-control" required min="0" step="100"
              value="${item ? item.price : ''}"
              placeholder="0" />
          </div>
          ${scoped ? '' : `
          <div class="form-group">
            <label>Скидка, %</label>
            <input name="discount" type="number" class="form-control" min="0" max="100" step="0.5"
              value="${item ? +item.discount : 0}" />
          </div>`}
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Исполнитель</label>
            <select name="employee_id" class="form-control">
              ${scoped ? '' : '<option value="">— Не назначен —</option>'}
              ${employees.map(e => `
                <option value="${e.id}" ${item?.employee_id === e.id || scoped ? 'selected' : ''}>
                  ${App.escHtml(e.full_name)}
                </option>
              `).join('')}
            </select>
          </div>
          ${scoped ? '' : `
          <div class="form-group" style="display:flex;align-items:flex-end">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px" title="Исполнитель получит всю сумму работы, а не процент по своей ставке">
              <input type="checkbox" name="full_rate" ${item?.full_rate ? 'checked' : ''} style="width:18px;height:18px" />
              100% исполнителю
            </label>
          </div>`}
        </div>

        ${isDefect ? `
        <div class="form-group">
          <label>Что обнаружено при осмотре</label>
          <textarea name="defect_note" class="form-control" rows="2"
            placeholder="Например: люфт правой рулевой тяги, износ колодок 2 мм">${App.escHtml(item?.defect_note || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Срочность</label>
          <select name="urgency" class="form-control">
            <option value="">— не указана —</option>
            ${URGENCY_OPTIONS.map(u => `<option value="${u.value}" ${item?.urgency === u.value ? 'selected' : ''}>${u.label}</option>`).join('')}
          </select>
        </div>` : ''}

        ${item && item.approval === 'approved' ? `
        <div class="form-group">
          <label>Статус</label>
          <select name="status" class="form-control">
            ${ITEM_STATUSES.map(s => `
              <option value="${s.value}" ${item.status === s.value ? 'selected' : ''}>${s.label}</option>
            `).join('')}
          </select>
        </div>` : ''}
      </form>
    `,
    submitLabel: item ? 'Сохранить' : 'Добавить',
    onSubmit: async () => {
      const data = App.formData('item-form');
      data.price = parseFloat(data.price) || 0;
      if (!data.employee_id) data.employee_id = null;
      if (!scoped) {
        data.discount = parseFloat(data.discount) || 0;
        data.full_rate = !!document.querySelector('#item-form [name=full_rate]')?.checked;
      }
      data.service_id = data.service_id ? parseInt(data.service_id) : null;
      data.price_variant = data.service_id ? (data.price_variant || null) : null;
      if (isDefect) {
        data.defect_note = data.defect_note || null;
        data.urgency = data.urgency || null;
        // Новая позиция дефектовки ждёт решения клиента
        if (!itemId) Object.assign(data, { is_defect: true, approval: 'proposed' });
      }

      try {
        if (itemId) {
          await App.api(`/orders/${orderId}/items/${itemId}`, { method: 'PUT', body: data });
          App.toast('Позиция обновлена');
        } else {
          await App.api(`/orders/${orderId}/items`, { method: 'POST', body: data });
          App.toast(isDefect ? 'Добавлено в дефектовку — ждёт согласования с клиентом' : 'Работа добавлена');
        }
        App.closeModal();
        renderOrderDetail(orderId);
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });

  // При редактировании позиции из справочника показываем её варианты цены
  if (item?.service_id) _loadPriceVariants(item.service_id, brand, model, item.price_variant, false);
}

async function onCatalogServiceSelected(serviceId, brand, model) {
  if (!serviceId) return;
  const select = document.getElementById('select-catalog-service');
  const serviceName = select.options[select.selectedIndex].text.split(' (')[0];

  document.getElementById('item-work-name').value = serviceName;
  document.getElementById('item-service-id').value = serviceId;
  document.getElementById('item-price-variant').value = '';

  await _loadPriceVariants(serviceId, brand, model, null, true);
}

function _priceRuleLabel(o) {
  const scope = o.brand ? [o.brand, o.model].filter(Boolean).join(' ') : 'Все авто';
  return `${scope}${o.variant ? ' · ' + o.variant : ''} — ${App.formatMoney(o.price)}`;
}

/**
 * Подставляет цену услуги под авто. Если у услуги есть цены с особенностями
 * (кузов, привод), показывает список, чтобы выбрать нужную.
 * applyPrice=false — при редактировании позиции цену не перезаписываем, пока не выберут вариант.
 */
async function _loadPriceVariants(serviceId, brand, model, currentVariant, applyPrice) {
  const wrap = document.getElementById('price-variant-wrap');
  try {
    const qs = new URLSearchParams({ service_id: serviceId });
    if (brand) qs.append('brand', brand);
    if (model) qs.append('model', model);
    if (currentVariant) qs.append('variant', currentVariant);

    const info = await App.api(`/services/resolve-price/check?${qs.toString()}`);
    if (!info) return;
    if (applyPrice) {
      document.getElementById('item-price').value = info.price;
      document.getElementById('item-price-variant').value = info.variant || '';
      const badge = document.getElementById('price-resolved-badge');
      if (info.match_type === 'brand_model') badge.textContent = `(спец. цена для ${brand} ${model})`;
      else if (info.match_type === 'brand') badge.textContent = `(цена для марки ${brand})`;
      else badge.textContent = `(базовая цена)`;
    }

    const options = info.options || [];
    if (!wrap) return;
    if (!options.some(o => o.variant)) {
      wrap.innerHTML = '';
      return;
    }
    const selectedId = options.find(o => (o.variant || '') === (info.variant || '') && o.price === info.price)?.id;
    wrap.innerHTML = `
      <label>Цена с особенностью (кузов, привод…)</label>
      <select class="form-control" id="select-price-variant" onchange="onPriceVariantSelected(this)">
        ${options.map(o => `
          <option value="${o.id}" data-price="${o.price}" data-variant="${App.escHtml(o.variant || '')}" ${o.id === selectedId ? 'selected' : ''}>
            ${App.escHtml(_priceRuleLabel(o))}
          </option>`).join('')}
      </select>`;
  } catch {}
}

function onPriceVariantSelected(select) {
  const opt = select.options[select.selectedIndex];
  document.getElementById('item-price').value = opt.dataset.price;
  document.getElementById('item-price-variant').value = opt.dataset.variant;
  const badge = document.getElementById('price-resolved-badge');
  if (badge) badge.textContent = opt.dataset.variant ? `(${opt.dataset.variant})` : '';
}

async function inlineCreateService(brand, model) {
  const { roots } = await fetchCategoryTree();

  App.openModal({
    title: 'Создание новой услуги в справочнике',
    body: `
      <form id="inline-service-form">
        <div class="form-group">
          <label>Наименование услуги <span class="required">*</span></label>
          <input name="name" class="form-control" required placeholder="Компьютерная диагностика" />
        </div>
        <div class="form-group">
          <label>Категория</label>
          <select name="category_id" class="form-control">
            <option value="">— Без категории —</option>
            ${renderCategoryOptions(roots)}
          </select>
        </div>
        <p class="text-muted text-sm">Цену для услуги вы зададите отдельно, в справочнике услуг.</p>
      </form>
    `,
    submitLabel: 'Создать и выбрать',
    onSubmit: async () => {
      const raw = App.formData('inline-service-form');
      const data = {
        name: raw.name,
        category_id: raw.category_id ? parseInt(raw.category_id) : null,
      };

      try {
        const newService = await App.api('/services/', { method: 'POST', body: data });
        App.toast(`Услуга «${newService.name}» создана в справочнике! Не забудьте задать ей цену на странице «Услуги».`);
        App.closeModal();

        document.getElementById('item-work-name').value = newService.name;
        document.getElementById('item-service-id').value = newService.id;
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
}

async function changeItemStatus(orderId, itemId, newStatus) {
  try {
    await App.api(`/orders/${orderId}/items/${itemId}`, {
      method: 'PUT',
      body: { status: newStatus },
    });
    App.toast('Статус позиции обновлён');
    renderOrderDetail(orderId);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

async function deleteItem(orderId, itemId) {
  if (!await App.confirm('Удалить эту позицию из заказа?')) return;
  try {
    await App.api(`/orders/${orderId}/items/${itemId}`, { method: 'DELETE' });
    App.toast('Позиция удалена');
    renderOrderDetail(orderId);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

async function deleteOrder(id) {
  if (!await App.confirm('Удалить этот заказ-наряд? Все позиции также будут удалены.')) return;
  try {
    await App.api(`/orders/${id}`, { method: 'DELETE' });
    App.toast('Заказ-наряд удалён');
    App.navigate('/orders');
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

// ── Share order link ──────────────────────────────────────────────────────────

async function shareOrder(id) {
  const btn = document.getElementById('btn-share');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ ...'; }
  try {
    const order = await App.api(`/orders/${id}/share`, { method: 'POST' });
    const shareUrl = order.share_url || `${window.location.origin}/share/${order.sharing_token}`;
    showShareModal(shareUrl);
  } catch (err) {
    App.toast(err.message || 'Не удалось создать ссылку', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '🔗 Поделиться'; }
  }
}

function showShareModal(url) {
  // Remove old modal if exists
  const old = document.getElementById('share-modal-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'share-modal-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;
    display:flex;align-items:center;justify-content:center;padding:16px;
    backdrop-filter:blur(6px);
  `;
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const canShare = !!navigator.share;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent('Здравствуйте! Ссылка на ваш заказ-наряд: ' + url)}`;

  overlay.innerHTML = `
    <div style="background:var(--bg-card,#1a1d27);border:1px solid rgba(255,255,255,0.12);
         border-radius:16px;padding:clamp(16px, 5vw, 24px);max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.6);
         animation:fadeInUp 0.2s ease;box-sizing:border-box;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="font-size:17px;font-weight:700;color:var(--text-primary,#e2e8f0);margin:0;display:flex;align-items:center;gap:8px;">
          <span>🔗</span> Ссылка для клиента
        </h3>
        <button onclick="document.getElementById('share-modal-overlay').remove()"
          style="background:none;border:none;color:var(--text-muted,#8892a4);cursor:pointer;font-size:24px;line-height:1;padding:4px;" aria-label="Закрыть">✕</button>
      </div>
      <p style="font-size:13px;color:var(--text-secondary,#94a3b8);margin-bottom:16px;line-height:1.45;">
        Клиент сможет просматривать статус заказа, состав работ и запчастей, а также оставлять комментарии без регистрации.
      </p>

      <div style="margin-bottom:14px;">
        <input id="share-url-input" readonly value="${url}"
          style="width:100%;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.12);
                 border-radius:8px;padding:11px 12px;color:var(--text-primary,#e2e8f0);font-size:16px;outline:none;
                 font-family:monospace;box-sizing:border-box;margin-bottom:10px;">
        
        <div style="display:grid;grid-template-columns:${canShare ? '1fr 1fr' : '1fr'};gap:8px;">
          <button id="share-copy-btn" onclick="copyShareLink('${url}')"
            style="background:linear-gradient(135deg,var(--accent,#f59e0b),#d97706);color:#0f1117;border:none;
                   border-radius:8px;padding:11px 16px;font-size:14px;font-weight:700;cursor:pointer;
                   display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;">
            📋 Копировать
          </button>
          ${canShare ? `
          <button id="share-native-btn" onclick="triggerNativeShare('${url}')"
            style="background:rgba(255,255,255,0.08);color:var(--text-primary,#e2e8f0);border:1px solid rgba(255,255,255,0.15);
                   border-radius:8px;padding:11px 16px;font-size:14px;font-weight:600;cursor:pointer;
                   display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;">
            📤 Поделиться
          </button>` : ''}
        </div>

        <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer"
          style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;
                 background:#25D366;color:#fff;text-decoration:none;border-radius:8px;padding:11px 16px;
                 font-size:14px;font-weight:600;min-height:44px;box-sizing:border-box;">
          💬 Отправить в WhatsApp
        </a>
      </div>

      <div id="share-copy-status" style="font-size:13px;text-align:center;min-height:20px;font-weight:500;"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  setTimeout(() => {
    const input = document.getElementById('share-url-input');
    if (input) {
      input.focus();
      input.select();
    }
  }, 80);
}

async function copyShareLink(url) {
  const btn = document.getElementById('share-copy-btn');
  const status = document.getElementById('share-copy-status');
  const input = document.getElementById('share-url-input');

  const copied = await App.copyToClipboard(url);
  if (copied) {
    if (btn) {
      btn.innerHTML = '✓ Скопировано!';
      btn.style.background = '#10b981';
      btn.style.color = '#fff';
    }
    if (status) {
      status.style.color = '#10b981';
      status.textContent = 'Ссылка скопирована в буфер обмена!';
    }
    App.toast('Ссылка скопирована в буфер');
    setTimeout(() => {
      if (btn) {
        btn.innerHTML = '📋 Копировать';
        btn.style.background = 'linear-gradient(135deg,var(--accent,#f59e0b),#d97706)';
        btn.style.color = '#0f1117';
      }
      if (status) status.textContent = '';
    }, 2500);
  } else {
    // Fallback: select text for user
    if (input) {
      input.removeAttribute('readonly');
      input.focus();
      input.select();
      input.setSelectionRange(0, 99999);
      input.setAttribute('readonly', 'true');
    }
    if (btn) btn.innerHTML = 'Выделено';
    if (status) {
      status.style.color = 'var(--accent, #f59e0b)';
      status.textContent = 'Зажмите ссылку и выберите «Скопировать»';
    }
    App.toast('Ссылка выделена. Зажмите и скопируйте', 'info');
  }
}

async function triggerNativeShare(url) {
  if (navigator.share) {
    try {
      await navigator.share({
        title: `Заказ-наряд — ${App.company.name}`,
        text: `Ссылка на просмотр заказ-наряда в автосервисе «${App.company.name}»:`,
        url: url
      });
    } catch (err) {
      // User cancelled
    }
  }
}