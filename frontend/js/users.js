/** users.js — User accounts management: login, role, password, linked employee. */

const USER_ROLE_LABELS = {
  owner:   '👑 Владелец',
  manager: '🗂 Менеджер',
  mechanic:'🔧 Механик',
};

// ─── Users List ───────────────────────────────────────────────────────────────
async function renderUsers() {
  App.setContent(`
    <div class="page-header">
      <div>
        <h1 class="page-title">Пользователи</h1>
        <p class="page-subtitle">Учётные записи для входа в систему</p>
      </div>
      <button class="btn btn-primary" id="btn-add-user">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/></svg>
        Добавить пользователя
      </button>
    </div>
    <div class="page-body">
      <div id="users-wrap">${App.spinner()}</div>
    </div>
  `);

  document.getElementById('btn-add-user').addEventListener('click', () => showUserModal());
  await loadUsers();
}

async function loadUsers() {
  const wrap = document.getElementById('users-wrap');
  if (!wrap) return;

  try {
    const users = await App.api('/users/');

    if (!users || users.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔐</div>
          <h3>Нет пользователей</h3>
          <p>Создайте первую учётную запись для входа в систему</p>
          <button class="btn btn-primary" onclick="showUserModal()">+ Добавить</button>
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Логин</th>
              <th>Роль</th>
              <th>Сотрудник</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td class="td-primary">
                  <span style="display:inline-flex;align-items:center;gap:8px;">
                    <span class="user-avatar-sm">${u.username[0].toUpperCase()}</span>
                    <span style="font-family:monospace;font-size:14px;">${App.escHtml(u.username)}</span>
                  </span>
                </td>
                <td>${App.statusBadge(u.role)}</td>
                <td>
                  ${u.employee_name
                    ? `<a href="#/employees/${u.employee_id}" style="color:var(--accent);">${App.escHtml(u.employee_name)}</a>`
                    : '<span class="text-muted" style="font-size:12px;">не привязан</span>'}
                </td>
                <td>
                  <div class="item-actions">
                    <button class="btn btn-sm btn-secondary" onclick="showUserModal(${u.id})">Изменить</button>
                    <button class="btn btn-sm btn-secondary" onclick="showChangePasswordModal(${u.id}, '${App.escHtml(u.username)}')">🔑 Пароль</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id}, '${App.escHtml(u.username)}')">Удалить</button>
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

// ─── User Modal (Create / Edit) ───────────────────────────────────────────────
async function showUserModal(id = null) {
  let user = null;
  let employees = [];

  try {
    [user, employees] = await Promise.all([
      id ? App.api(`/users/${id}`) : Promise.resolve(null),
      App.api('/employees/'),
    ]);
  } catch (err) {
    App.toast(`Ошибка загрузки: ${err.message}`, 'error');
    return;
  }

  const empOptions = (employees || []).map(e =>
    `<option value="${e.id}" ${user?.employee_id === e.id ? 'selected' : ''}>${App.escHtml(e.full_name)}</option>`
  ).join('');

  App.openModal({
    title: user ? `Редактировать пользователя: ${user.username}` : 'Новый пользователь',
    body: `
      <form id="user-form">
        <div class="form-group">
          <label>Логин (имя пользователя) <span class="required">*</span></label>
          <input name="username" class="form-control" required autocomplete="off"
            value="${user ? App.escHtml(user.username) : ''}"
            placeholder="например, owner или mechanic1" />
        </div>

        <div class="form-group">
          <label>Пароль ${user ? '<span class="text-muted" style="font-size:11px;">(оставьте пустым, чтобы не менять)</span>' : '<span class="required">*</span>'}</label>
          <input name="password" type="password" class="form-control" autocomplete="new-password"
            placeholder="${user ? '••••••••' : 'Введите пароль (минимум 4 символа)'}" />
        </div>

        <div class="form-group">
          <label>Роль / Права доступа <span class="required">*</span></label>
          <select name="role" class="form-control" required>
            <option value="mechanic" ${user?.role === 'mechanic' || !user ? 'selected' : ''}>🔧 Механик</option>
            <option value="manager"  ${user?.role === 'manager' ? 'selected' : ''}>🗂 Менеджер</option>
            <option value="owner"    ${user?.role === 'owner' ? 'selected' : ''}>👑 Владелец</option>
          </select>
        </div>

        <div class="form-group">
          <label>Привязать к сотруднику <span class="text-muted" style="font-size:11px;">(необязательно)</span></label>
          <select name="employee_id" class="form-control">
            <option value="">— не привязан —</option>
            ${empOptions}
          </select>
          <p class="text-muted" style="font-size:12px;margin-top:4px;">
            Сотрудник нужен для назначения работ и расчёта зарплаты
          </p>
        </div>
      </form>
    `,
    submitLabel: user ? 'Сохранить' : 'Создать',
    onSubmit: async () => {
      const raw = App.formData('user-form');
      const payload = {
        username: raw.username,
        role: raw.role,
        employee_id: raw.employee_id ? parseInt(raw.employee_id) : null,
      };
      if (raw.password) payload.password = raw.password;

      try {
        if (id) {
          await App.api(`/users/${id}`, { method: 'PUT', body: payload });
          App.toast('Пользователь обновлён');
        } else {
          if (!raw.password) {
            App.toast('Укажите пароль для нового пользователя', 'error');
            return;
          }
          await App.api('/users/', { method: 'POST', body: payload });
          App.toast('Пользователь создан');
        }
        App.closeModal();
        loadUsers();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
}

// ─── Change Password Modal ────────────────────────────────────────────────────
function showChangePasswordModal(userId, username) {
  App.openModal({
    title: `Сменить пароль: ${username}`,
    body: `
      <form id="change-pw-form">
        <div class="form-group">
          <label>Новый пароль <span class="required">*</span></label>
          <input name="password" type="password" class="form-control" required
            autocomplete="new-password"
            placeholder="Минимум 4 символа" />
        </div>
        <div class="form-group">
          <label>Повторите пароль <span class="required">*</span></label>
          <input name="password2" type="password" class="form-control" required
            autocomplete="new-password"
            placeholder="Повторите новый пароль" />
        </div>
      </form>
    `,
    submitLabel: 'Изменить пароль',
    onSubmit: async () => {
      const data = App.formData('change-pw-form');
      if (!data.password || data.password.length < 4) {
        App.toast('Пароль должен быть не короче 4 символов', 'error');
        return;
      }
      if (data.password !== data.password2) {
        App.toast('Пароли не совпадают', 'error');
        return;
      }
      try {
        await App.api(`/users/${userId}/password`, {
          method: 'POST',
          body: { password: data.password }
        });
        App.toast('Пароль успешно изменён ✓');
        App.closeModal();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
}

// ─── Delete User ──────────────────────────────────────────────────────────────
async function deleteUser(id, username) {
  if (!await App.confirm(`Удалить пользователя «${username}»?\n\nЭто действие нельзя отменить.`)) return;
  try {
    await App.api(`/users/${id}`, { method: 'DELETE' });
    App.toast('Пользователь удалён');
    loadUsers();
  } catch (err) {
    App.toast(err.message, 'error');
  }
}
