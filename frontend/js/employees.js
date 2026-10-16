/** employees.js — Employee list and detail/workload pages with login credentials integration. */

const RATE_TYPE_LABELS = { fixed: 'Фиксированная', percent: 'Процент от работ' };
const EMPLOYEE_ROLE_LABELS = { mechanic: 'Механик', manager: 'Менеджер', owner: 'Владелец' };

// ─── Employee List ────────────────────────────────────────────────────────────
async function renderEmployees() {
  App.setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Сотрудники</h1>
        <p class="page-subtitle">Команда автосервиса и доступ к системе</p>
      </div>
      <button class="btn btn-primary" id="btn-add-employee">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/></svg>
        Добавить сотрудника
      </button>
    </div>
    <div class="page-body">
      <div id="employees-wrap">${App.spinner()}</div>
    </div>
  `);

  document.getElementById('btn-add-employee').addEventListener('click', () => showEmployeeModal());
  await loadEmployees();
}

async function loadEmployees() {
  const wrap = document.getElementById('employees-wrap');
  if (!wrap) return;

  try {
    const employees = await App.api('/employees/');

    if (!employees || employees.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👷</div>
          <h3>Сотрудников нет</h3>
          <p>Добавьте первого сотрудника для назначения работ и входа в систему</p>
          <button class="btn btn-primary" onclick="showEmployeeModal()">+ Добавить</button>
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Должность</th>
              <th>Тип оплаты</th>
              <th>Ставка</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${employees.map(e => `
              <tr>
                <td class="td-primary">
                  <a href="#/employees/${e.id}" style="color:var(--accent)">${App.escHtml(e.full_name)}</a>
                </td>
                <td>${App.statusBadge(e.role)}</td>
                <td class="text-sm">${RATE_TYPE_LABELS[e.rate_type] || e.rate_type}</td>
                <td class="font-bold">
                  ${e.rate_type === 'percent'
        ? `${e.rate_value}%`
        : App.formatMoney(e.rate_value)}
                </td>
                <td>
                  <div class="item-actions">
                    <a href="#/employees/${e.id}" class="btn btn-sm btn-secondary">Нагрузка</a>
                    <button class="btn btn-sm btn-secondary" onclick="showEmployeeModal(${e.id})">Изм.</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteEmployee(${e.id}, '${App.escHtml(e.full_name)}')">Удалить</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state"><p class="text-danger">Ошибка: ${App.escHtml(err.message)}</p></div>`;
  }
}

// ─── Employee Detail / Workload ───────────────────────────────────────────────
async function renderEmployeeDetail(id) {
  App.setContent(App.spinner());
  try {
    const data = await App.api(`/employees/${id}/workload`);
    const emp = data.employee;

    App.setContent(`
      <div class="page-header">
        <div>
          <div class="back-link" onclick="App.navigate('/employees')">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
            Все сотрудники
          </div>
          <h1 class="page-title">${App.escHtml(emp.full_name)}</h1>
          <p class="page-subtitle">${EMPLOYEE_ROLE_LABELS[emp.role] || emp.role}</p>
        </div>
        <button class="btn btn-secondary" onclick="showEmployeeModal(${id})">Редактировать</button>
      </div>
      <div class="page-body">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon stat-icon-amber">🔧</div>
            <div>
              <div class="stat-label">Всего работ</div>
              <div class="stat-value">${data.items.length}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon stat-icon-green">💰</div>
            <div>
              <div class="stat-label">Сумма работ</div>
              <div class="stat-value">${App.formatMoney(data.total_amount)}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon stat-icon-blue">💳</div>
            <div>
              <div class="stat-label">К выплате</div>
              <div class="stat-value">${App.formatMoney(data.estimated_salary)}</div>
              <div class="stat-sub">${emp.rate_type === 'percent' ? emp.rate_value + '% от суммы' : 'Фикс. ставка'}${data.items.some(i => i.full_rate) ? ' + работы на 100%' : ''}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Назначенные работы</span>
          </div>
          ${data.items.length === 0
        ? `<div class="empty-state" style="padding:40px">
                <p class="text-muted">На сотрудника пока не назначено ни одной работы</p>
              </div>`
        : `<div class="table-wrap" style="border:none">
                <table>
                  <thead>
                    <tr>
                      <th>Заказ</th>
                      <th>Работа</th>
                      <th>Статус</th>
                      <th>Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.items.map(item => `
                      <tr>
                        <td><a href="#/orders/${item.order_id}" style="color:var(--accent)">№${item.order_id}</a></td>
                        <td class="td-primary">${App.escHtml(item.work_name)}${item.full_rate ? ' <span class="badge" style="background:rgba(72,187,120,0.15);color:#48bb78;font-size:10px">100%</span>' : ''}${item.discount ? ` <span class="text-muted text-sm">−${+item.discount}%</span>` : ''}</td>
                        <td>${App.statusBadge(item.status)}</td>
                        <td class="font-bold">${App.formatMoney(item.amount)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>`}
        </div>

        <div class="card mt-4">
          <div class="card-header"><span class="card-title">Условия оплаты и доступ</span></div>
          <div class="card-body">
            <div class="info-list">
              <div class="info-row">
                <span class="info-row-label">Права / Должность</span>
                <span class="info-row-value">${EMPLOYEE_ROLE_LABELS[emp.role] || emp.role}</span>
              </div>
              <div class="info-row">
                <span class="info-row-label">Тип ставки</span>
                <span class="info-row-value">${RATE_TYPE_LABELS[emp.rate_type] || emp.rate_type}</span>
              </div>
              <div class="info-row">
                <span class="info-row-label">Ставка</span>
                <span class="info-row-value font-bold">
                  ${emp.rate_type === 'percent' ? `${emp.rate_value}% от выполненных работ` : App.formatMoney(emp.rate_value) + ' / мес.'}
                </span>
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

// ─── Employee Modal ───────────────────────────────────────────────────────────
async function showEmployeeModal(id = null) {
  let emp = null;
  if (id) {
    try { emp = await App.api(`/employees/${id}`); } catch { }
  }

  App.openModal({
    title: emp ? 'Редактировать сотрудника' : 'Новый сотрудник',
    body: `
      <form id="employee-form">
        <div class="form-group">
          <label>ФИО сотрудника <span class="required">*</span></label>
          <input name="full_name" class="form-control" required
            value="${emp ? App.escHtml(emp.full_name) : ''}"
            placeholder="Иванов Иван Иванович" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Должность <span class="required">*</span></label>
            <select name="role" class="form-control" required>
              <option value="mechanic" ${emp?.role === 'mechanic' ? 'selected' : ''}>Механик</option>
              <option value="manager"  ${emp?.role === 'manager' ? 'selected' : ''}>Менеджер</option>
              <option value="owner"    ${emp?.role === 'owner' ? 'selected' : ''}>Владелец</option>
            </select>
          </div>
          <div class="form-group">
            <label>Тип ставки <span class="required">*</span></label>
            <select name="rate_type" class="form-control" required>
              <option value="percent" ${emp?.rate_type === 'percent' ? 'selected' : ''}>Процент (%)</option>
              <option value="fixed"   ${emp?.rate_type === 'fixed' ? 'selected' : ''}>Фиксированная (₸)</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Ставка <span class="required">*</span></label>
          <input name="rate_value" type="number" class="form-control" required min="0" step="0.01"
            value="${emp ? emp.rate_value : ''}"
            placeholder="Для % — от 0 до 100; для фикс. — сумма в тенге" />
        </div>
        <p class="text-muted" style="font-size:12px;margin-top:12px;padding:10px;background:rgba(255,255,255,0.04);border-radius:8px;border-left:3px solid var(--accent);">
          💡 Для выдачи логина/пароля перейдите в раздел <a href="#/settings/users" style="color:var(--accent);">Настройки → Пользователи</a> и привяжите учётную запись к этому сотруднику.
        </p>
      </form>
    `,
    submitLabel: emp ? 'Сохранить' : 'Добавить',
    onSubmit: async () => {
      const data = App.formData('employee-form');
      data.rate_value = parseFloat(data.rate_value) || 0;
      // Remove any legacy credential fields before sending
      delete data.username;
      delete data.password;
      try {
        if (id) {
          await App.api(`/employees/${id}`, { method: 'PUT', body: data });
          App.toast('Сотрудник обновлён');
        } else {
          await App.api('/employees/', { method: 'POST', body: data });
          App.toast('Сотрудник добавлен');
        }
        App.closeModal();
        const path = window.location.hash.slice(1).split('?')[0];
        if (path.startsWith('/employees/')) renderEmployeeDetail(parseInt(path.split('/')[2]));
        else loadEmployees();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
}

async function deleteEmployee(id, name) {
  if (!await App.confirm(`Удалить сотрудника «${name}»?`)) return;
  try {
    await App.api(`/employees/${id}`, { method: 'DELETE' });
    App.toast('Сотрудник удалён');
    loadEmployees();
  } catch (err) {
    App.toast(err.message, 'error');
  }
}
