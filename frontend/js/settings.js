/**
 * settings.js — раздел «Настройки» (только владелец).
 * Подразделы: Об автосервисе, Роли и права, Пользователи, Печатная форма.
 * Вкладки подразделов App.setContent добавляет сам, пока открыт адрес #/settings/...
 */

const SETTINGS_TABS = [
  { id: 'general', label: '🏢 Об автосервисе', render: () => renderSettingsGeneral() },
  { id: 'roles',   label: '🔐 Роли и права',   render: () => renderRoles() },
  { id: 'users',   label: '👤 Пользователи',   render: () => renderUsers() },
  { id: 'print',   label: '🖨 Печатная форма', render: () => renderSettingsPrint() },
];

function _currentSettingsTab() {
  const id = window.location.hash.split('?')[0].split('/')[2] || 'general';
  return SETTINGS_TABS.some(t => t.id === id) ? id : 'general';
}

function settingsTabsHtml() {
  const active = _currentSettingsTab();
  return `
    <div class="settings-header">
      <h1 class="page-title">⚙️ Настройки</h1>
      <div class="card-tabs settings-tabs">
        ${SETTINGS_TABS.map(t => `
          <a href="#/settings/${t.id}" class="card-tab ${t.id === active ? 'active' : ''}">${t.label}</a>
        `).join('')}
      </div>
    </div>`;
}

function renderSettings(tabId) {
  const tab = SETTINGS_TABS.find(t => t.id === tabId);
  if (!tab) return App.navigate('/settings/general');
  return tab.render();
}

// ─── Об автосервисе: название и логотип ───────────────────────────────────────

function renderSettingsGeneral() {
  const c = App.company;
  App.setContent(`
    <div class="page-header">
      <div>
        <h2 class="page-title" style="font-size:20px">Об автосервисе</h2>
        <p class="page-subtitle">Название и логотип показываются в меню, на экране входа, на странице клиента и в печатных формах</p>
      </div>
    </div>
    <div class="page-body">
      <div class="card" style="max-width:640px">
        <div class="card-body">
          <form id="company-form" onsubmit="event.preventDefault(); saveCompanyInfo()">
            <div class="form-group">
              <label>Название автосервиса <span class="required">*</span></label>
              <input name="name" id="company-name-input" class="form-control" required maxlength="100"
                value="${App.escHtml(c.name)}" placeholder="например, Автосервис München" />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Адрес</label>
                <input name="address" id="company-address-input" class="form-control" maxlength="200"
                  value="${App.escHtml(c.address || '')}" placeholder="г. Астана, ул. …" />
              </div>
              <div class="form-group">
                <label>Телефон</label>
                <input name="phone" id="company-phone-input" class="form-control" maxlength="200"
                  value="${App.escHtml(c.phone || '')}" placeholder="+7 …" />
              </div>
            </div>
            <small class="text-muted" style="font-size:11px;display:block;margin-bottom:12px">
              В печатной форме: {{company_name}}, {{company_address}}, {{company_phone}}, {{company_contacts}}, {{company_logo}}
            </small>
            <button type="submit" class="btn btn-primary">Сохранить</button>
          </form>

          <div class="form-group" style="margin-top:20px">
            <label>Логотип</label>
            <div class="flex gap-3" style="align-items:center;flex-wrap:wrap">
              <div class="brand-logo settings-logo-preview">${App.logoHtml(56)}</div>
              <div class="flex gap-2" style="flex-wrap:wrap">
                <label class="btn btn-secondary" style="cursor:pointer;margin:0">
                  ⬆ ${c.logo_url ? 'Заменить логотип' : 'Загрузить логотип'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onchange="uploadCompanyLogo(this)" />
                </label>
                ${c.logo_url ? '<button class="btn btn-ghost" onclick="deleteCompanyLogo()">Удалить</button>' : ''}
              </div>
            </div>
            <small class="text-muted" style="font-size:11px;display:block;margin-top:8px">
              PNG, JPG или WEBP. Пустые поля вокруг логотипа обрезаются автоматически. Для тёмного меню лучше подходит логотип на прозрачном фоне.
            </small>
          </div>
        </div>
      </div>
    </div>
  `);
}

async function saveCompanyInfo() {
  const name = document.getElementById('company-name-input').value.trim();
  if (!name) return App.toast('Введите название автосервиса', 'error');
  const address = document.getElementById('company-address-input').value.trim();
  const phone = document.getElementById('company-phone-input').value.trim();
  try {
    App.company = await App.api('/settings/company', { method: 'PUT', body: { name, address, phone } });
    App.applyBranding();
    App.toast('Данные автосервиса сохранены');
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

/**
 * Обрезает пустые (прозрачные или одноцветные) поля вокруг логотипа и уменьшает
 * его до разумного размера, чтобы в меню логотип не выглядел крошечным.
 */
async function _trimLogo(file) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const w = img.naturalWidth, h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(img.src);
  const px = ctx.getImageData(0, 0, w, h).data;

  // Фон — прозрачность или цвет левого верхнего угла
  const [br, bg, bb, ba] = px;
  const isBg = i => (ba < 16 ? px[i + 3] < 16
    : Math.abs(px[i] - br) + Math.abs(px[i + 1] - bg) + Math.abs(px[i + 2] - bb) < 30 && px[i + 3] > 200);

  let top = h, left = w, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isBg((y * w + x) * 4)) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return file; // картинка пустая — отправляем как есть

  const pad = Math.round(Math.max(right - left, bottom - top) * 0.03);
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  right = Math.min(w - 1, right + pad); bottom = Math.min(h - 1, bottom + pad);
  const cw = right - left + 1, ch = bottom - top + 1;
  const scale = Math.min(1, 512 / Math.max(cw, ch));

  const out = document.createElement('canvas');
  out.width = Math.round(cw * scale); out.height = Math.round(ch * scale);
  out.getContext('2d').drawImage(canvas, left, top, cw, ch, 0, 0, out.width, out.height);
  return await new Promise(resolve => out.toBlob(resolve, 'image/png'));
}

async function uploadCompanyLogo(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    let logo = file;
    try { logo = await _trimLogo(file); } catch {}
    const formData = new FormData();
    formData.append('image', logo, 'logo.png');
    const resp = await fetch('/api/settings/company/logo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${App.token}` },
      body: formData,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.detail || 'Ошибка загрузки');
    App.company = data;
    App.applyBranding();
    App.toast('Логотип загружен');
    renderSettingsGeneral();
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

async function deleteCompanyLogo() {
  if (!await App.confirm('Удалить логотип? Будет показана стандартная иконка.')) return;
  try {
    App.company = await App.api('/settings/company/logo', { method: 'DELETE' });
    App.applyBranding();
    App.toast('Логотип удалён');
    renderSettingsGeneral();
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

// ─── Печатная форма: шаблон DOCX и плейсхолдеры ───────────────────────────────

async function renderSettingsPrint() {
  App.setContent(App.spinner());
  let placeholders = [], exists = false;
  try {
    [placeholders, { exists }] = await Promise.all([
      App.api('/print-templates/placeholders'),
      App.api('/print-templates/template-exists'),
    ]);
  } catch {}

  App.setContent(`
    <div class="page-header">
      <div>
        <h2 class="page-title" style="font-size:20px">Печатная форма заказ-наряда</h2>
        <p class="page-subtitle">DOCX-шаблон, по которому кнопка «Печать» формирует документ</p>
      </div>
    </div>
    <div class="page-body">
      <div class="card mb-4" style="max-width:760px">
        <div class="card-header"><span class="card-title">Шаблон</span></div>
        <div class="card-body">
          <div class="template-status ${exists ? 'ok' : 'missing'}">
            ${exists ? '✅ Шаблон загружен и готов к использованию' : '⚠️ Шаблон ещё не загружен'}
          </div>
          <div class="form-group">
            <label>Выберите DOCX-файл шаблона</label>
            <input type="file" id="print-template-file" accept=".docx" class="form-control" />
          </div>
          <button class="btn btn-primary" id="btn-upload-template" onclick="uploadPrintTemplate()">⬆ Загрузить шаблон</button>
          <p class="text-muted text-sm" style="margin-top:10px">Файл заменит текущий шаблон. Используйте формат .docx (Microsoft Word).</p>
        </div>
      </div>

      <div class="card" style="max-width:760px">
        <div class="card-header"><span class="card-title">Плейсхолдеры</span></div>
        <div class="card-body">
          <p class="text-muted text-sm mb-4">
            Создайте шаблон в Word и вставьте в нужные места плейсхолдеры из списка — при печати они заменятся данными заказа.
          </p>
          <table class="print-placeholders-table">
            <thead><tr><th>Плейсхолдер</th><th>Описание</th></tr></thead>
            <tbody>
              ${placeholders.map(p => `
                <tr>
                  <td>${App.escHtml(p.key)}</td>
                  <td style="color:var(--text-secondary)">${App.escHtml(p.description)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `);
}

async function uploadPrintTemplate() {
  const fileInput = document.getElementById('print-template-file');
  if (!fileInput || !fileInput.files[0]) {
    App.toast('Выберите файл', 'error');
    return;
  }

  const btn = document.getElementById('btn-upload-template');
  if (btn) btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const resp = await fetch('/api/print-templates/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${App.token}` },
      body: formData,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Ошибка загрузки');
    }

    App.toast('Шаблон успешно загружен!');
    renderSettingsPrint();
  } catch (err) {
    App.toast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}
