/**
 * permissions.js — Role-based access control and custom roles management for the STO CRM.
 *
 * Permissions & custom roles are stored on the server (/api/roles/config), so settings
 * made by the owner apply to every user on every device. Call Permissions.load()
 * after login; the rest of the API is synchronous and reads the loaded copy.
 * Visibility of orders ('orders.scope') is also enforced by the backend.
 */
const Permissions = (() => {

  // ── Default Built-in Roles ──────────────────────────────────────────────────
  const BUILTIN_ROLES = [
    { id: 'owner',    label: 'Владелец', icon: '👑', isBuiltin: true },
    { id: 'manager',  label: 'Менеджер', icon: '🗂', isBuiltin: true },
    { id: 'mechanic', label: 'Механик',  icon: '🔧', isBuiltin: true },
  ];

  // ── Default permissions per role ────────────────────────────────────────────
  const DEFAULTS = {
    owner: {
      'nav.orders':    true,
      'nav.clients':   true,
      'nav.employees': true,
      'nav.services':  true,
      'nav.analytics': true,
      'nav.roles':     true,
      'nav.users':     true,
      'nav.my_report': true,
      'print.placeholders': true,
      'print.upload':       true,
      'print.generate':     true,
      'order.delete':  true,
      'order.share':   true,
      'order.comments':true,
      'orders.scope':  'all',
    },
    manager: {
      'nav.orders':    true,
      'nav.clients':   true,
      'nav.employees': false,
      'nav.services':  true,
      'nav.analytics': false,
      'nav.roles':     false,
      'nav.users':     false,
      'nav.my_report': true,
      'print.placeholders': false,
      'print.upload':       false,
      'print.generate':     true,
      'order.delete':  false,
      'order.share':   true,
      'order.comments':true,
      'orders.scope':  'all',
    },
    mechanic: {
      'nav.orders':    true,
      'nav.clients':   false,
      'nav.employees': false,
      'nav.services':  false,
      'nav.analytics': false,
      'nav.roles':     false,
      'nav.users':     false,
      'nav.my_report': true,
      'print.placeholders': false,
      'print.upload':       false,
      'print.generate':     true,
      'order.delete':  false,
      'order.share':   false,
      'order.comments':true,
      'orders.scope':  'assigned',
    },
  };

  // Старые ключи localStorage — только для однократного переноса настроек на сервер
  const LEGACY_KEY_PERMS = 'sto_permissions';
  const LEGACY_KEY_CUSTOM_ROLES = 'sto_custom_roles';

  const ORDER_SCOPE_OPTIONS = [
    { value: 'all',      label: 'Все заказ-наряды целиком' },
    { value: 'assigned', label: 'Только где он исполнитель — и только свои работы' },
  ];

  // ── Feature catalogue (for the UI) ──────────────────────────────────────────
  const FEATURE_GROUPS = [
    {
      group: 'Видимость заказ-нарядов',
      features: [
        { key: 'orders.scope', type: 'select', options: ORDER_SCOPE_OPTIONS,
          label: 'Какие заказ-наряды видит роль',
          hint: 'При «только свои работы» сумма заказа считается только по работам сотрудника' },
      ]
    },
    {
      group: 'Навигация (боковое меню)',
      features: [
        { key: 'nav.orders',    label: 'Заказ-наряды' },
        { key: 'nav.clients',   label: 'Клиенты' },
        { key: 'nav.employees', label: 'Сотрудники' },
        { key: 'nav.services',  label: 'Услуги и Прайс' },
        { key: 'nav.analytics', label: 'Аналитика' },
        { key: 'nav.roles',     label: 'Управление ролями' },
        { key: 'nav.users',     label: 'Пользователи' },
        { key: 'nav.my_report', label: 'Моя выработка (отчёт сотрудника)' },
      ]
    },
    {
      group: 'Печать заказ-наряда',
      features: [
        { key: 'print.placeholders', label: 'Вкладка «Плейсхолдеры» (справка по шаблону)' },
        { key: 'print.upload',       label: 'Вкладка «Загрузить шаблон»' },
        { key: 'print.generate',     label: 'Вкладка «Сформировать и скачать DOCX»' },
      ]
    },
    {
      group: 'Заказ-наряд — действия',
      features: [
        { key: 'order.delete',   label: 'Кнопка «Удалить заказ»' },
        { key: 'order.share',    label: 'Кнопка «Поделиться» (ссылка для клиента)' },
        { key: 'order.comments', label: 'Комментарии / дефектовка' },
      ]
    },
  ];

  // ── Internal helpers for roles & perms ───────────────────────────────────────
  // Копия настроек, загруженная с сервера
  let _config = { custom_roles: [], permissions: {} };

  function _loadCustomRoles() {
    return JSON.parse(JSON.stringify(_config.custom_roles || []));
  }

  function _loadPerms() {
    return _config.permissions || {};
  }

  async function _persist(custom_roles, permissions) {
    const saved = await App.api('/roles/config', {
      method: 'PUT',
      body: { custom_roles, permissions },
    });
    if (saved) _config = saved;
  }

  function _readLegacy(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /** Однократно переносит настройки, сохранённые раньше в браузере владельца, на сервер */
  async function _migrateLegacy() {
    const perms = _readLegacy(LEGACY_KEY_PERMS);
    const roles = _readLegacy(LEGACY_KEY_CUSTOM_ROLES);
    if (!perms && !roles) return;
    const serverEmpty = !(_config.custom_roles || []).length
      && !Object.keys(_config.permissions || {}).length;
    if (serverEmpty) await _persist(roles || [], perms || {});
    localStorage.removeItem(LEGACY_KEY_PERMS);
    localStorage.removeItem(LEGACY_KEY_CUSTOM_ROLES);
  }

  function _getPerms() {
    const stored = _loadPerms() || {};
    const result = {};

    // Copy built-ins
    for (const [r, perms] of Object.entries(DEFAULTS)) {
      result[r] = Object.assign({}, perms, stored[r] || {});
    }

    // Copy custom roles
    const customRoles = _loadCustomRoles();
    for (const cr of customRoles) {
      result[cr.id] = Object.assign({}, stored[cr.id] || {});
    }

    // Also preserve any extra stored role keys
    for (const [r, perms] of Object.entries(stored)) {
      if (!result[r]) result[r] = Object.assign({}, perms);
    }

    return result;
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  return {
    FEATURE_GROUPS,

    /** Load role settings from the server. Call after login, before rendering pages. */
    async load() {
      try {
        const data = await App.api('/roles/config');
        if (data) _config = data;
        if (App.isOwner()) await _migrateLegacy();
      } catch (err) {
        console.warn('Не удалось загрузить настройки ролей:', err);
      }
    },

    /** Get all available roles (built-in + custom) */
    getRoles() {
      const custom = _loadCustomRoles();
      return [...BUILTIN_ROLES, ...custom];
    },

    /** Find a specific role by id */
    getRole(id) {
      if (!id) return null;
      const all = this.getRoles();
      return all.find(r => r.id === id) || { id, label: id, icon: '👤', isBuiltin: false };
    },

    /** Get human-readable role label */
    getRoleLabel(id) {
      if (!id) return '—';
      const r = this.getRole(id);
      return r ? r.label : id;
    },

    /** Get role icon/emoji */
    getRoleIcon(id) {
      if (!id) return '👤';
      const r = this.getRole(id);
      return r ? (r.icon || '👤') : '👤';
    },

    /** Add a new custom role */
    async addRole({ id, label, icon, copyFrom }) {
      if (!id || !label) throw new Error('Укажите идентификатор и название роли');
      const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const all = this.getRoles();
      if (all.some(r => r.id === cleanId)) {
        throw new Error(`Роль с идентификатором "${cleanId}" уже существует`);
      }

      const custom = _loadCustomRoles();
      custom.push({
        id: cleanId,
        label: label.trim(),
        icon: (icon || '👤').trim(),
        isBuiltin: false
      });

      // Initialize permissions for this role
      const perms = _getPerms();
      if (copyFrom && perms[copyFrom]) {
        perms[cleanId] = JSON.parse(JSON.stringify(perms[copyFrom]));
      } else {
        // default empty/mechanic-like
        perms[cleanId] = {
          'nav.orders': true,
          'nav.clients': false,
          'nav.employees': false,
          'nav.services': false,
          'nav.analytics': false,
          'nav.roles': false,
          'nav.my_report': true,
          'print.placeholders': false,
          'print.upload': false,
          'print.generate': true,
          'order.delete': false,
          'order.share': false,
          'order.comments': true,
          'orders.scope': 'assigned',
        };
      }
      await _persist(custom, perms);
      return cleanId;
    },

    /** Update an existing custom role metadata */
    async updateRole(id, { label, icon }) {
      const custom = _loadCustomRoles();
      const idx = custom.findIndex(r => r.id === id);
      if (idx === -1) throw new Error('Кастомная роль не найдена');
      if (label) custom[idx].label = label.trim();
      if (icon) custom[idx].icon = icon.trim();
      await _persist(custom, _getPerms());
    },

    /** Delete a custom role */
    async deleteRole(id) {
      const builtin = BUILTIN_ROLES.find(r => r.id === id);
      if (builtin) throw new Error('Нельзя удалить системную встроенную роль');
      let custom = _loadCustomRoles();
      custom = custom.filter(r => r.id !== id);

      const perms = _getPerms();
      delete perms[id];
      await _persist(custom, perms);
    },

    /** Check if a given role has access to a feature */
    can(role, feature) {
      if (!role) return false;
      if (role === 'owner') return true; // owner always has full access
      const perms = _getPerms();
      const rolePerms = perms[role];
      if (!rolePerms) return true; // unknown role — allow by default
      if (!(feature in rolePerms)) return true; // unknown feature — allow by default
      return rolePerms[feature] === true;
    },

    /** Get a non-boolean setting for a role (e.g. 'orders.scope') */
    getValue(role, feature) {
      if (feature === 'orders.scope' && role === 'owner') return 'all';
      const value = _getPerms()[role]?.[feature];
      return value ?? (feature === 'orders.scope' ? 'all' : null);
    },

    /** True if the current user sees only orders/works assigned to them */
    isOrderScoped() {
      return this.getValue(App.user?.role, 'orders.scope') === 'assigned';
    },

    /** Get all permissions as a plain object */
    getAll() { return _getPerms(); },

    /** Save all permissions (from settings UI) */
    async saveAll(data) { await _persist(_loadCustomRoles(), data); },

    /** Reset all permissions to defaults (custom roles are kept) */
    async resetDefaults() {
      await _persist(_loadCustomRoles(), {});
    },

    /** Reset everything including custom roles */
    async resetAll() {
      await _persist([], {});
    }
  };
})();
