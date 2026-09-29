/**
 * roles.js — UI for managing built-in and custom roles and fine-grained permissions.
 * Only accessible to owners (guarded in the router).
 */

let activeRoleTab = 'owner';

function renderRoles(selectedRole = null) {
  const allRoles = Permissions.getRoles();
  if (selectedRole && allRoles.some(r => r.id === selectedRole)) {
    activeRoleTab = selectedRole;
  } else if (!allRoles.some(r => r.id === activeRoleTab)) {
    activeRoleTab = allRoles[0]?.id || 'owner';
  }

  App.setContent(`
    <div class="page-header" style="flex-wrap:wrap;gap:12px;">
      <div>
        <h1 class="page-title">🔐 Управление ролями и доступом</h1>
        <p class="page-subtitle">Настройте список ролей и права доступа к разделам и функциям</p>
      </div>
      <div class="flex gap-2" style="flex-wrap:wrap;">
        <button class="btn btn-secondary" onclick="showAddRoleModal()">
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          + Создать роль
        </button>
        <button class="btn btn-ghost btn-sm" onclick="resetRolePermissions()">↺ Сбросить права</button>
        <button class="btn btn-primary" onclick="saveRolePermissions()">💾 Сохранить изменения</button>
      </div>
    </div>

    <div class="page-body">
      <div id="roles-alert" style="display:none"></div>

      <!-- Role selector tabs -->
      <div class="card mb-4" style="padding:0;overflow:hidden;">
        <div class="role-tabs-bar" style="display:flex;overflow-x:auto;border-bottom:1px solid var(--border-color);scrollbar-width:none;-webkit-overflow-scrolling:touch;">
          ${allRoles.map((r, i) => `
            <button id="role-tab-${r.id}"
              class="role-tab ${r.id === activeRoleTab ? 'active' : ''}"
              onclick="switchRoleTab('${r.id}')"
              style="flex:1 0 auto;min-width:130px;padding:14px 18px;background:${r.id === activeRoleTab ? 'var(--bg-secondary)' : 'transparent'};
                     border:none;border-right:1px solid var(--border-color);
                     cursor:pointer;font-size:14px;font-weight:600;color:var(--text-primary);
                     display:flex;align-items:center;justify-content:center;gap:8px;transition:background 0.2s;white-space:nowrap;">
              <span style="font-size:18px">${r.icon || '👤'}</span>
              <span>${App.escHtml(r.label)}</span>
              ${!r.isBuiltin ? `<span class="badge" style="font-size:10px;padding:2px 6px;background:rgba(99,179,237,0.15);color:var(--accent);">кастомная</span>` : ''}
            </button>
          `).join('')}
        </div>

        <div style="padding:clamp(14px, 4vw, 24px);">
          ${allRoles.map(r => `
            <div id="role-pane-${r.id}" class="${r.id === activeRoleTab ? '' : 'hidden'}">
              ${renderRolePane(r)}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Legend -->
      <div class="card" style="background:rgba(99,179,237,0.06);border-color:rgba(99,179,237,0.2);">
        <div class="card-header"><span class="card-title">ℹ️ Как работают роли и доступы</span></div>
        <div style="padding:16px 20px;font-size:13px;color:var(--text-secondary);line-height:1.7;">
          <p>• <strong>Кастомные роли:</strong> вы можете создавать любые роли (например, «Мастер-приёмщик», «Автоэлектрик», «Бухгалтер») и назначать их сотрудникам при создании или редактировании.</p>
          <p>• <strong>Мгновенное применение:</strong> изменения вступают в силу сразу после нажатия кнопки «Сохранить изменения».</p>
          <p>• <strong>Роль Владелец:</strong> имеет полный и постоянный доступ ко всей системе и управлению ролями.</p>
        </div>
      </div>
    </div>
  `);
}

function renderRolePane(roleObj) {
  const role = roleObj.id;
  const perms = Permissions.getAll();
  const rolePerms = perms[role] || {};
  const isOwner = role === 'owner';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--border-color);">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:28px;">${roleObj.icon || '👤'}</span>
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
            ${App.escHtml(roleObj.label)}
            <code style="font-size:11px;background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;color:var(--text-secondary);">${role}</code>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">
            ${roleObj.isBuiltin ? 'Системная встроенная роль' : 'Пользовательская роль (доступна в карточках сотрудников)'}
          </div>
        </div>
      </div>
      
      <div class="flex gap-2">
        ${!roleObj.isBuiltin ? `
          <button class="btn btn-sm btn-secondary" onclick="showEditRoleModal('${role}')">✏️ Изменить</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCustomRole('${role}', '${App.escHtml(roleObj.label)}')">🗑 Удалить роль</button>
        ` : ''}
      </div>
    </div>

    ${Permissions.FEATURE_GROUPS.map(group => `
      <div style="margin-bottom:24px;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;
                    color:var(--text-secondary);font-weight:600;margin-bottom:12px;
                    padding-bottom:6px;border-bottom:1px solid var(--border-color);">
          ${group.group}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:10px;">
          ${group.features.map(feat => {
            const checked = rolePerms[feat.key] !== false;
            const disabled = isOwner; // owner always has everything
            return `
            <label style="display:flex;align-items:center;gap:12px;padding:12px 14px;
                           border-radius:10px;border:1px solid var(--border-color);
                           background:var(--bg-secondary);cursor:${disabled ? 'default' : 'pointer'};
                           transition:border-color 0.15s,background 0.15s;
                           ${disabled ? 'opacity:0.65;' : ''}"
                   onmouseenter="if(!${disabled}) this.style.borderColor='var(--accent)'"
                   onmouseleave="this.style.borderColor='var(--border-color)'">
              <div style="position:relative;width:44px;height:24px;flex-shrink:0;">
                <input type="checkbox" id="perm-${role}-${feat.key.replace(/\./g,'-')}"
                  data-role="${role}" data-feature="${feat.key}"
                  ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}
                  onchange="onPermChange(this)"
                  style="opacity:0;position:absolute;width:100%;height:100%;margin:0;cursor:pointer;z-index:1;">
                <div class="perm-toggle ${checked ? 'on' : 'off'}" id="toggle-${role}-${feat.key.replace(/\./g,'-')}">
                  <div class="perm-knob"></div>
                </div>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:500;color:var(--text-primary);line-height:1.4;">${feat.label}</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">
                  ${feat.key}${disabled ? ' · всегда включено' : ''}
                </div>
              </div>
            </label>`;
          }).join('')}
        </div>
      </div>
    `).join('')}
  `;
}

function switchRoleTab(role) {
  activeRoleTab = role;
  const allRoles = Permissions.getRoles();
  allRoles.forEach(r => {
    const tab  = document.getElementById(`role-tab-${r.id}`);
    const pane = document.getElementById(`role-pane-${r.id}`);
    if (tab && pane) {
      if (r.id === role) {
        tab.style.background = 'var(--bg-secondary)';
        tab.classList.add('active');
        pane.classList.remove('hidden');
      } else {
        tab.style.background = 'transparent';
        tab.classList.remove('active');
        pane.classList.add('hidden');
      }
    }
  });
}

function onPermChange(checkbox) {
  const key = `toggle-${checkbox.dataset.role}-${checkbox.dataset.feature.replace(/\./g,'-')}`;
  const toggle = document.getElementById(key);
  if (toggle) {
    toggle.classList.toggle('on', checkbox.checked);
    toggle.classList.toggle('off', !checkbox.checked);
  }
}

function collectPermissions() {
  const data = Permissions.getAll();
  document.querySelectorAll('[data-role][data-feature]').forEach(cb => {
    const role = cb.dataset.role;
    const feat = cb.dataset.feature;
    if (!data[role]) data[role] = {};
    data[role][feat] = cb.checked;
  });
  return data;
}

function saveRolePermissions() {
  const data = collectPermissions();
  Permissions.saveAll(data);

  if (typeof App !== 'undefined' && typeof App.applyPermissionsToUI === 'function') {
    App.applyPermissionsToUI();
  }

  const alert = document.getElementById('roles-alert');
  if (alert) {
    alert.style.display = 'block';
    alert.innerHTML = `
      <div style="background:rgba(72,187,120,0.15);border:1px solid rgba(72,187,120,0.35);
                  border-radius:10px;padding:12px 18px;margin-bottom:16px;font-size:14px;
                  color:#48bb78;display:flex;align-items:center;gap:10px;">
        ✅ Права доступа успешно сохранены и применены ко всем ролям.
      </div>`;
    setTimeout(() => { if (alert) alert.style.display = 'none'; }, 4000);
  }
  App.toast('Права доступа сохранены');
}

function resetRolePermissions() {
  if (!confirm('Сбросить все настройки прав к рекомендуемым значениям? (Кастомные роли сохранятся)')) return;
  Permissions.resetDefaults();
  renderRoles(activeRoleTab);
  App.toast('Настройки сброшены к умолчаниям');
}

// ── Custom Roles Modal ────────────────────────────────────────────────────────

const ROLE_EMOJI_SUGGESTIONS = ['👤', '🔧', '🗂', '🚗', '⚡️', '📋', '🔍', '🧰', '💰', '🛠', '📦', '💻', '🛡', '🤝'];

function showAddRoleModal() {
  const existingRoles = Permissions.getRoles();

  App.openModal({
    title: 'Создать новую роль',
    body: `
      <form id="add-role-form">
        <div class="form-group">
          <label>Название роли <span class="required">*</span></label>
          <input name="label" id="role-name-input" class="form-control" required placeholder="например, Мастер-приёмщик, Автоэлектрик" />
        </div>

        <div class="form-group">
          <label>Идентификатор (код роли) <span class="required">*</span></label>
          <input name="id" id="role-id-input" class="form-control" required placeholder="например, master_priemshchik" />
          <small class="text-muted" style="font-size:11px;">Латинские буквы, цифры и знаки подчеркивания</small>
        </div>

        <div class="form-group">
          <label>Иконка роли</label>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
            <input name="icon" id="role-icon-input" class="form-control" value="👤" style="width:60px;text-align:center;font-size:18px;" />
            <span class="text-muted" style="font-size:12px;">или выберите из списка:</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${ROLE_EMOJI_SUGGESTIONS.map(e => `
              <button type="button" class="btn btn-sm btn-ghost" style="font-size:16px;padding:6px 10px;" onclick="document.getElementById('role-icon-input').value='${e}'">${e}</button>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label>Скопировать начальные права из</label>
          <select name="copyFrom" class="form-control">
            <option value="">— Стандартные минимальные права —</option>
            ${existingRoles.map(r => `<option value="${r.id}">${r.icon || '👤'} ${r.label}</option>`).join('')}
          </select>
        </div>
      </form>
    `,
    submitLabel: 'Создать роль',
    onSubmit: () => {
      const form = document.getElementById('add-role-form');
      const label = form.label.value.trim();
      let id = form.id.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const icon = form.icon.value.trim() || '👤';
      const copyFrom = form.copyFrom.value;

      if (!label) {
        App.toast('Введите название роли', 'error');
        return;
      }
      if (!id) {
        id = slugify(label);
      }

      try {
        const newRoleId = Permissions.addRole({ id, label, icon, copyFrom });
        App.closeModal();
        App.toast(`Роль «${label}» успешно создана!`);
        renderRoles(newRoleId);
      } catch (err) {
        App.toast(err.message, 'error');
      }
    }
  });

  // Auto-slugify on title input
  const nameInput = document.getElementById('role-name-input');
  const idInput = document.getElementById('role-id-input');
  nameInput.addEventListener('input', () => {
    if (!idInput.dataset.manual) {
      idInput.value = slugify(nameInput.value);
    }
  });
  idInput.addEventListener('input', () => {
    idInput.dataset.manual = 'true';
  });
}

function showEditRoleModal(roleId) {
  const role = Permissions.getRole(roleId);
  if (!role || role.isBuiltin) return;

  App.openModal({
    title: `Редактировать роль «${role.label}»`,
    body: `
      <form id="edit-role-form">
        <div class="form-group">
          <label>Название роли <span class="required">*</span></label>
          <input name="label" class="form-control" required value="${App.escHtml(role.label)}" />
        </div>

        <div class="form-group">
          <label>Иконка роли</label>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
            <input name="icon" id="edit-role-icon-input" class="form-control" value="${role.icon || '👤'}" style="width:60px;text-align:center;font-size:18px;" />
            <span class="text-muted" style="font-size:12px;">или выберите:</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${ROLE_EMOJI_SUGGESTIONS.map(e => `
              <button type="button" class="btn btn-sm btn-ghost" style="font-size:16px;padding:6px 10px;" onclick="document.getElementById('edit-role-icon-input').value='${e}'">${e}</button>
            `).join('')}
          </div>
        </div>
      </form>
    `,
    submitLabel: 'Сохранить',
    onSubmit: () => {
      const form = document.getElementById('edit-role-form');
      const label = form.label.value.trim();
      const icon = form.icon.value.trim() || '👤';

      if (!label) {
        App.toast('Введите название роли', 'error');
        return;
      }

      try {
        Permissions.updateRole(roleId, { label, icon });
        App.closeModal();
        App.toast(`Роль «${label}» обновлена`);
        renderRoles(roleId);
      } catch (err) {
        App.toast(err.message, 'error');
      }
    }
  });
}

function deleteCustomRole(roleId, roleLabel) {
  if (!confirm(`Вы действительно хотите удалить роль «${roleLabel}»?`)) return;

  try {
    Permissions.deleteRole(roleId);
    App.toast(`Роль «${roleLabel}» удалена`);
    renderRoles('owner');
  } catch (err) {
    App.toast(err.message, 'error');
  }
}

function slugify(text) {
  const cyrMap = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh',
    'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
    'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
    'ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
  };
  return text.toLowerCase().split('').map(char => cyrMap[char] || char)
    .join('')
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
