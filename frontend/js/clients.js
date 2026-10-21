/** clients.js — Client list and detail pages. */

// ─── Client List ─────────────────────────────────────────────────────────────
async function renderClients() {
  App.setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Клиенты</h1>
        <p class="page-subtitle">Управление клиентской базой</p>
      </div>
      <button class="btn btn-primary" id="btn-add-client">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/></svg>
        Добавить клиента
      </button>
    </div>
    <div class="page-body">
      <div class="filter-bar">
        <div class="search-box">
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
          <input type="text" class="form-control" id="client-search" placeholder="Поиск по имени или телефону…" />
        </div>
      </div>
      <div id="clients-table-wrap">${App.spinner()}</div>
    </div>
  `);

  document.getElementById('btn-add-client').addEventListener('click', () => showClientModal());

  let searchTimer;
  document.getElementById('client-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadClients(e.target.value.trim()), 300);
  });

  await loadClients('');
}

async function loadClients(search = '') {
  const wrap = document.getElementById('clients-table-wrap');
  if (!wrap) return;

  try {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    const clients = await App.api(`/clients/${params}`);

    if (!clients || clients.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <h3>Клиентов пока нет</h3>
          <p>Добавьте первого клиента, чтобы начать работу</p>
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Телефон</th>
              <th>Email</th>
              <th>Авто</th>
              <th>Комментарий</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => `
              <tr>
                <td class="td-primary">
                  <a href="#/clients/${c.id}" style="color:var(--accent)">${App.escHtml(c.full_name)}</a>
                </td>
                <td>${App.escHtml(c.phone)}</td>
                <td>${c.email ? App.escHtml(c.email) : '<span class="text-muted">—</span>'}</td>
                <td>
                  ${c.vehicles.length > 0
        ? c.vehicles.map(v => `<span class="badge badge-pending" style="margin-right:4px">${App.escHtml(v.brand)} ${App.escHtml(v.model)}</span>`).join('')
        : '<span class="text-muted">—</span>'}
                </td>
                <td class="text-muted text-sm">${c.comment ? App.escHtml(c.comment.substring(0, 40)) + (c.comment.length > 40 ? '…' : '') : '—'}</td>
                <td>
                  <div class="item-actions">
                    <button class="btn btn-sm btn-secondary" onclick="showClientModal(${c.id})">Изм.</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteClient(${c.id}, '${App.escHtml(c.full_name)}')">Удалить</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><p class="text-danger">Ошибка загрузки: ${App.escHtml(err.message)}</p></div>`;
  }
}

// ─── Client Detail ────────────────────────────────────────────────────────────
async function renderClientDetail(id) {
  App.setContent(App.spinner());
  try {
    const client = await App.api(`/clients/${id}`);
    if (!client) return;

    App.setContent(`
      <div class="page-header">
        <div>
          <div class="back-link" onclick="App.goBack('/clients')">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
            Все клиенты
          </div>
          <h1 class="page-title">${App.escHtml(client.full_name)}</h1>
          <p class="page-subtitle">${App.escHtml(client.phone)}</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary" onclick="showClientModal(${client.id})">Редактировать</button>
          <button class="btn btn-primary" onclick="App.navigate('/orders?client_id=${client.id}')">Заказ-наряды</button>
        </div>
      </div>
      <div class="page-body">
        <div class="detail-grid">
          <div>
            <div class="card mb-4">
              <div class="card-header">
                <span class="card-title">Информация о клиенте</span>
                <button class="btn btn-sm btn-secondary" onclick="showClientModal(${client.id})">Изменить</button>
              </div>
              <div class="card-body">
                <div class="info-list">
                  <div class="info-row">
                    <span class="info-row-label">ФИО</span>
                    <span class="info-row-value">${App.escHtml(client.full_name)}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-row-label">Телефон</span>
                    <span class="info-row-value">${App.escHtml(client.phone)}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-row-label">Email</span>
                    <span class="info-row-value">${client.email ? App.escHtml(client.email) : '—'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-row-label">Комментарий</span>
                    <span class="info-row-value">${client.comment ? App.escHtml(client.comment) : '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <span class="card-title">Автомобили (${client.vehicles.length})</span>
                <button class="btn btn-sm btn-primary" onclick="showVehicleModal(${client.id})">
                  + Добавить авто
                </button>
              </div>
              <div class="card-body" id="vehicles-list">
                ${renderVehiclesList(client.vehicles, client.id)}
              </div>
            </div>
          </div>

          <div>
            <div class="card">
              <div class="card-header">
                <span class="card-title">Быстрые действия</span>
              </div>
              <div class="card-body flex flex-col gap-2">
                <button class="btn btn-primary" style="width:100%;justify-content:center"
                  onclick="showNewOrderForClient(${client.id})">
                  + Новый заказ-наряд
                </button>
                <button class="btn btn-secondary" style="width:100%;justify-content:center"
                  onclick="App.navigate('/orders?client_id=${client.id}')">
                  История заказов
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);
  } catch (err) {
    App.setContent(`<div class="page-body"><p class="text-danger">Ошибка: ${App.escHtml(err.message)}</p></div>`);
  }
}

function renderVehiclesList(vehicles, clientId) {
  if (!vehicles.length) {
    return `<p class="text-muted text-sm">Автомобилей нет. Добавьте первый автомобиль.</p>`;
  }
  return vehicles.map(v => `
    <div class="info-list" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <strong>${App.escHtml(v.brand)} ${App.escHtml(v.model)}${v.year ? ` (${v.year})` : ''}</strong>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-secondary" onclick="App.navigate('/vehicle-history/${v.id}')" title="История обслуживания">
            📋 История
          </button>
          <button class="btn btn-sm btn-secondary" onclick="showVehicleModal(${clientId}, ${v.id})">Изм.</button>
          <button class="btn btn-sm btn-danger" onclick="deleteVehicle(${v.id}, ${clientId})">Удалить</button>
        </div>
      </div>
      <div class="info-row">
        <span class="info-row-label">Гос. номер</span>
        <span class="info-row-value">${v.plate_number ? App.escHtml(v.plate_number) : '—'}</span>
      </div>
    </div>
  `).join('');
}

// ─── Client Modal ─────────────────────────────────────────────────────────────
async function showClientModal(id = null) {
  let client = null;
  if (id) {
    try { client = await App.api(`/clients/${id}`); } catch { }
  }

  // Справочник марок нужен только для нового клиента (блок авто показываем только при создании)
  let brands = [];
  if (!client) {
    try { brands = await App.api('/vehicles/brands'); } catch { }
  }

  App.openModal({
    title: client ? 'Редактировать клиента' : 'Новый клиент',
    body: `
      <form id="client-form">
        <div class="form-group">
          <label>ФИО <span class="required">*</span></label>
          <input name="full_name" class="form-control" required value="${client ? App.escHtml(client.full_name) : ''}" placeholder="Иванов Иван Иванович" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Телефон <span class="required">*</span></label>
            <input name="phone" id="client-phone-input" class="form-control" required
              value="${client ? App.escHtml(client.phone) : ''}"
              placeholder="+7 (___) ___-__-__" inputmode="numeric" />
          </div>
          <div class="form-group">
            <label>Email</label>
            <input name="email" type="email" class="form-control" value="${client?.email ? App.escHtml(client.email) : ''}" placeholder="email@example.com" />
          </div>
        </div>
        <div class="form-group">
          <label>Комментарий</label>
          <textarea name="comment" class="form-control">${client?.comment ? App.escHtml(client.comment) : ''}</textarea>
        </div>

        ${!client ? `
        <hr style="margin:20px 0;border-color:var(--border)" />
        <h4 style="margin-bottom:12px">Автомобиль (необязательно)</h4>
        <div class="form-row">
          <div class="form-group">
            <label>Марка</label>
            <select name="vehicle_brand" id="client-veh-brand-select" class="form-control"
              onchange="onClientVehBrandChanged(this)">
              <option value="">— Выберите марку —</option>
              ${brands.map(b => `<option value="${App.escHtml(b.name)}" data-id="${b.id}">${App.escHtml(b.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Модель</label>
            <input name="vehicle_model" id="client-veh-model-input" class="form-control"
              placeholder="Camry, RX, X5…" list="client-veh-models-list" />
            <datalist id="client-veh-models-list"></datalist>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Год выпуска</label>
            <input name="vehicle_year" type="number" class="form-control"
              placeholder="2020" min="1900" max="${new Date().getFullYear() + 1}" />
          </div>
          <div class="form-group">
            <label>Гос. номер</label>
            <input name="vehicle_plate_number" class="form-control" placeholder="777AAA01" />
          </div>
        </div>
        <div class="form-group">
          <label>VIN</label>
          <input name="vehicle_vin" class="form-control" maxlength="17" placeholder="17-символьный VIN-код" />
        </div>
        ` : ''}
      </form>
    `,
    submitLabel: client ? 'Сохранить' : 'Добавить',
    onSubmit: async () => {
      const raw = App.formData('client-form');

      // Разделяем поля клиента и поля авто (пришли из одной формы)
      const clientPayload = {
        full_name: raw.full_name,
        phone: raw.phone,
        email: raw.email,
        comment: raw.comment,
      };

      try {
        let savedClient;
        if (id) {
          savedClient = await App.api(`/clients/${id}`, { method: 'PUT', body: clientPayload });
          App.toast('Клиент обновлён');
        } else {
          savedClient = await App.api('/clients/', { method: 'POST', body: clientPayload });
          App.toast('Клиент добавлен');
        }

        // Если это новый клиент и заполнено хотя бы одно поле авто — создаём авто
        if (!id) {
          const hasVehicleData = raw.vehicle_brand || raw.vehicle_model || raw.vehicle_plate_number || raw.vehicle_vin || raw.vehicle_year;
          if (hasVehicleData) {
            const vehiclePayload = {
              client_id: savedClient.id,
              brand: raw.vehicle_brand || null,
              model: raw.vehicle_model || null,
              year: raw.vehicle_year ? parseInt(raw.vehicle_year) : null,
              plate_number: raw.vehicle_plate_number || null,
              vin: raw.vehicle_vin || null,
            };
            try {
              await App.api('/vehicles/', { method: 'POST', body: vehiclePayload });
              App.toast('Автомобиль добавлен');
            } catch (vehErr) {
              // Клиент уже создан — сообщаем отдельно, чтобы не потерять его из виду
              App.toast('Клиент создан, но авто не удалось добавить: ' + vehErr.message, 'error');
            }
          }
        }

        App.closeModal();

        // Refresh current page
        const path = window.location.hash.slice(1).split('?')[0];
        if (path.startsWith('/clients/')) renderClientDetail(parseInt(path.split('/')[2]));
        else renderClients();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
  // сразу после вызова openModal:
  setTimeout(() => {
    const phoneInput = document.getElementById('client-phone-input');
    if (phoneInput) attachPhoneMask(phoneInput);
  }, 0);
}

/** Аналог onVehBrandChanged из vehicles.js, но под элементы формы клиента */
async function onClientVehBrandChanged(selectEl) {
  const dList = document.getElementById('client-veh-models-list');
  const modelInput = document.getElementById('client-veh-model-input');

  dList.innerHTML = '';
  if (modelInput) modelInput.value = ''; // сбрасываем старую модель при смене марки

  if (!selectEl || selectEl.selectedIndex <= 0) return;
  const brandId = selectEl.options[selectEl.selectedIndex].getAttribute('data-id');
  if (!brandId) return;

  try {
    const models = await App.api(`/vehicles/brands/${brandId}/models`);
    if (models) {
      dList.innerHTML = models.map(m => `<option value="${App.escHtml(m.name)}"></option>`).join('');
    }
  } catch { }
}

async function deleteClient(id, name) {
  if (!await App.confirm(`Удалить клиента «${name}»? Все его авто также будут удалены.`)) return;
  try {
    await App.api(`/clients/${id}`, { method: 'DELETE' });
    App.toast('Клиент удалён');
    renderClients();
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

async function showNewOrderForClient(clientId) {
  // Создаём заказ-наряд сразу на этого клиента (если у него одна машина — и на неё) и открываем его
  try {
    const vehicles = await App.api(`/vehicles/?client_id=${clientId}`).catch(() => []);
    const order = await App.api('/orders/', {
      method: 'POST',
      body: { client_id: clientId, vehicle_id: vehicles?.length === 1 ? vehicles[0].id : null, comment: '' },
    });
    App.toast('Новый заказ-наряд создан!');
    App.navigate(`/orders/${order.id}`);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}