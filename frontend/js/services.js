/**
 * services.js — Services catalog and price management.
 * Supports general price, brand price, and brand+model price.
 */

async function renderServices() {
  App.setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Справочник услуг и Прайс-лист</h1>
        <p class="page-subtitle">Базовые и гибкие цены на работы (общие, по маркам и моделям авто)</p>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" id="btn-categories">Категории</button>
        <button class="btn btn-primary" id="btn-add-service">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          Добавить услугу
        </button>
      </div>
    </div>
    <div class="page-body">
      <div class="filter-bar">
        <div class="search-box">
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
          <input type="text" class="form-control" id="service-search" placeholder="Поиск услуги по наименованию…" />
        </div>
      </div>
      <div id="services-table-wrap">${App.spinner()}</div>
    </div>
  `);

  document.getElementById('btn-add-service').addEventListener('click', () => showServiceModal());
  document.getElementById('btn-categories').addEventListener('click', () => showCategoriesModal());

  let searchTimer;
  document.getElementById('service-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadServices(e.target.value.trim()), 300);
  });

  await loadServices('');
}

async function loadServices(search = '') {
  const wrap = document.getElementById('services-table-wrap');
  if (!wrap) return;

  try {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    const [services, { byId: categoriesById }] = await Promise.all([
      App.api(`/services/${params}`),
      fetchCategoryTree(),
    ]);

    if (!services || services.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🛠</div>
          <h3>Услуг пока нет</h3>
          <p>Добавьте первую услугу в справочник</p>
          <button class="btn btn-primary" onclick="showServiceModal()">+ Добавить услугу</button>
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Наименование услуги</th>
              <th>Категория</th>
              <th>Общая цена (базовая)</th>
              <th>Цены по маркам / моделям</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${services.map(s => {
      const genPrice = s.prices.find(p => !p.brand && !p.model);
      const customPrices = s.prices.filter(p => p.brand || p.model);

      return `
                <tr>
                  <td class="td-primary">
                    ${App.escHtml(s.name)}
                    ${s.description ? `<div class="text-muted text-sm">${App.escHtml(s.description)}</div>` : ''}
                  </td>
                  <td class="text-sm">${s.category_id ? App.escHtml(categoryPath(s.category_id, categoriesById) || '—') : '<span class="text-muted">—</span>'
        }</td>
                  <td class="font-bold" style="color:var(--accent)">
                    ${genPrice ? App.formatMoney(genPrice.price) : '<span class="text-muted">Не задана</span>'}
                  </td>
                  <td>
                    ${customPrices.length > 0 ? `
                      <div class="flex flex-col gap-1">
                        ${customPrices.map(cp => `
                          <div class="text-sm" style="background:var(--bg-input);padding:3px 8px;border-radius:var(--radius-sm);display:inline-flex;align-items:center;justify-content:space-between;gap:8px">
                            <span>
                              <strong>${App.escHtml(cp.brand || 'Все')}</strong>
                              ${cp.model ? ` ${App.escHtml(cp.model)}` : ' (все модели)'}:
                            </span>
                            <span class="font-bold text-success">${App.formatMoney(cp.price)}</span>
                            <button style="background:none;border:none;color:var(--clr-danger);cursor:pointer;" onclick="deletePriceRule(${cp.id})" title="Удалить цену">✕</button>
                          </div>
                        `).join('')}
                      </div>
                    ` : '<span class="text-muted text-sm">Нет спец. цен</span>'}
                  </td>
                  <td>
                    <div class="item-actions">
                      <button class="btn btn-sm btn-primary" onclick="showPriceModal(${s.id}, '${App.escHtml(s.name)}')">+ Цена</button>
                      <button class="btn btn-sm btn-secondary" onclick="showServiceModal(${s.id})">Изм.</button>
                      <button class="btn btn-sm btn-danger" onclick="deleteService(${s.id}, '${App.escHtml(s.name)}')">✕</button>
                    </div>
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

// ─── Service Modal ────────────────────────────────────────────────────────────
async function showServiceModal(serviceId = null) {
  let service = null;
  if (serviceId) {
    try { service = await App.api(`/services/${serviceId}`); } catch { }
  }
  const { roots } = await fetchCategoryTree();

  App.openModal({
    title: service ? 'Редактировать услугу' : 'Новая услуга',
    body: `
      <form id="service-form">
        <div class="form-group">
          <label>Наименование услуги <span class="required">*</span></label>
          <input name="name" class="form-control" required
            value="${service ? App.escHtml(service.name) : ''}"
            placeholder="Замена масла, Диагностика ходовой…" />
        </div>
        <div class="form-group">
          <label>Категория</label>
          <select name="category_id" class="form-control">
            <option value="">— Без категории —</option>
            ${renderCategoryOptions(roots)}
          </select>
        </div>
        <div class="form-group">
          <label>Описание</label>
          <textarea name="description" class="form-control" placeholder="Подробности процедуры…">${service?.description ? App.escHtml(service.description) : ''}</textarea>
        </div>
        ${!service ? `<p class="text-muted text-sm">Цену на услугу вы зададите следующим шагом — сразу после сохранения.</p>` : ''}
      </form>
    `,
    submitLabel: service ? 'Сохранить' : 'Далее: указать цену',
    onSubmit: async () => {
      const raw = App.formData('service-form');
      const data = {
        name: raw.name,
        category_id: raw.category_id ? parseInt(raw.category_id) : null,
        description: raw.description,
      };

      try {
        let savedService;
        if (serviceId) {
          savedService = await App.api(`/services/${serviceId}`, { method: 'PUT', body: data });
          App.toast('Услуга обновлена');
          App.closeModal();
          loadServices();
        } else {
          savedService = await App.api('/services/', { method: 'POST', body: data });
          App.toast('Услуга добавлена');
          App.closeModal();
          loadServices();
          // Сразу предлагаем задать цену для новой услуги
          showPriceModal(savedService.id, savedService.name);
        }
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
}

// ─── Price Modal (установка цены — общей или для конкретной марки/модели) ─────
async function showPriceModal(serviceId, serviceName) {
  let brands = [];
  try {
    brands = await App.api('/vehicles/brands');
  } catch { }

  App.openModal({
    title: `Цена: ${serviceName}`,
    body: `
      <form id="price-rule-form">
        <p class="text-sm text-muted mb-4">
          Не выбирайте марку — цена станет общей для всех авто.
          Выберите марку (и опционально модель) — чтобы задать исключение для конкретного авто.
        </p>
        <div class="form-row">
          <div class="form-group">
            <label>Марка авто (опционально)</label>
            <select name="brand" id="price-brand-select" class="form-control" onchange="onPriceBrandChanged(this.value)">
              <option value="">— Без привязки (общая цена) —</option>
              ${brands.map(b => `<option value="${b.id}" data-name="${App.escHtml(b.name)}">${App.escHtml(b.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Модель авто (опционально)</label>
            <select name="model" id="price-model-select" class="form-control" disabled>
              <option value="">— Сначала выберите марку —</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Цена (₸) <span class="required">*</span></label>
          <input name="price" type="number" class="form-control" required min="1" step="100" placeholder="7000" />
          <div class="text-muted text-sm mt-1">Цена должна быть больше 0</div>
        </div>
      </form>
    `,
    submitLabel: 'Сохранить цену',
    onSubmit: async () => {
      const bSelect = document.getElementById('price-brand-select');
      const mSelect = document.getElementById('price-model-select');
      const priceInput = document.querySelector('#price-rule-form input[name="price"]');

      // Марка не выбрана (индекс 0 — "без привязки") — значит цена общая
      const brandName = bSelect.selectedIndex > 0 ? bSelect.options[bSelect.selectedIndex].getAttribute('data-name') : null;
      const modelName = (brandName && mSelect.selectedIndex > 0) ? mSelect.options[mSelect.selectedIndex].value : null;
      const priceVal = parseFloat(priceInput.value) || 0;

      if (priceVal <= 0) {
        App.toast('Цена должна быть больше 0!', 'error');
        return;
      }

      try {
        await App.api(`/services/${serviceId}/prices`, {
          method: 'POST',
          body: { brand: brandName, model: modelName, price: priceVal },
        });
        App.toast(brandName ? 'Спец. цена сохранена!' : 'Общая цена сохранена!');
        App.closeModal();
        loadServices();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
}

/** Dynamic models dropdown loader for pricing modal */
async function onPriceBrandChanged(brandId) {
  const mSelect = document.getElementById('price-model-select');
  if (!brandId) {
    mSelect.innerHTML = '<option value="">— Сначала выберите марку —</option>';
    mSelect.disabled = true;
    return;
  }
  try {
    const models = await App.api(`/vehicles/brands/${brandId}/models`);
    if (!models || models.length === 0) {
      mSelect.innerHTML = '<option value="">— Все модели этой марки —</option>';
    } else {
      mSelect.innerHTML = '<option value="">— Все модели этой марки —</option>' +
        models.map(m => `<option value="${App.escHtml(m.name)}">${App.escHtml(m.name)}</option>`).join('');
    }
    mSelect.disabled = false;
  } catch {
    mSelect.innerHTML = '<option value="">Ошибка загрузки моделей</option>';
  }
}


async function deletePriceRule(priceId) {
  if (!await App.confirm('Удалить это правило цены?')) return;
  try {
    await App.api(`/services/prices/${priceId}`, { method: 'DELETE' });
    App.toast('Правило цены удалено');
    loadServices();
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

async function deleteService(id, name) {
  if (!await App.confirm(`Удалить услугу «${name}» из справочника?`)) return;
  try {
    await App.api(`/services/${id}`, { method: 'DELETE' });
    App.toast('Услуга удалена');
    loadServices();
  } catch (err) {
    App.toast(err.message, 'error');
  }
}