/**
 * permissions.js — Role-based access control and custom roles management for the STO CRM.
 *
 * Permissions & custom roles are stored in localStorage so the owner can configure
 * both built-in and new custom roles dynamically without backend schema limits.
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
      'print.placeholders': true,
      'print.upload':       true,
      'print.generate':     true,
      'order.delete':  true,
      'order.share':   true,
      'order.comments':true,
    },
    manager: {
      'nav.orders':    true,
      'nav.clients':   true,
      'nav.employees': false,
      'nav.services':  true,
      'nav.analytics': false,
      'nav.roles':     false,
      'print.placeholders': false,
      'print.upload':       false,
      'print.generate':     true,
      'order.delete':  false,
      'order.share':   true,
      'order.comments':true,
    },
    mechanic: {
      'nav.orders':    true,
      'nav.clients':   false,
      'nav.employees': false,
      'nav.services':  false,
      'nav.analytics': false,
      'nav.roles':     false,
      'print.placeholders': false,
      'print.upload':       false,
      'print.generate':     true,
      'order.delete':  false,
      'order.share':   false,
      'order.comments':true,
    },
  };

  const STORAGE_KEY_PERMS = 'sto_permissions';
  const STORAGE_KEY_CUSTOM_ROLES = 'sto_custom_roles';

  // ── Feature catalogue (for the UI) ──────────────────────────────────────────
  const FEATURE_GROUPS = [
    {
      group: 'Навигация (боковое меню)',
      features: [
        { key: 'nav.orders',    label: 'Заказ-наряды' },
        { key: 'nav.clients',   label: 'Клиенты' },
        { key: 'nav.employees', label: 'Сотрудники' },
        { key: 'nav.services',  label: 'Услуги и Прайс' },
        { key: 'nav.analytics', label: 'Аналитика' },
        { key: 'nav.roles',     label: 'Управление ролями' },
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
  function _loadCustomRoles() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_ROLES);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function _saveCustomRoles(roles) {
    localStorage.setItem(STORAGE_KEY_CUSTOM_ROLES, JSON.stringify(roles));
  }

  function _loadPerms() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PERMS);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function _savePerms(data) {
    localStorage.setItem(STORAGE_KEY_PERMS, JSON.stringify(data));
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
    addRole({ id, label, icon, copyFrom }) {
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
      _saveCustomRoles(custom);

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
          'print.placeholders': false,
          'print.upload': false,
          'print.generate': true,
          'order.delete': false,
          'order.share': false,
          'order.comments': true,
        };
      }
      _savePerms(perms);
      return cleanId;
    },

    /** Update an existing custom role metadata */
    updateRole(id, { label, icon }) {
      const custom = _loadCustomRoles();
      const idx = custom.findIndex(r => r.id === id);
      if (idx === -1) throw new Error('Кастомная роль не найдена');
      if (label) custom[idx].label = label.trim();
      if (icon) custom[idx].icon = icon.trim();
      _saveCustomRoles(custom);
    },

    /** Delete a custom role */
    deleteRole(id) {
      const builtin = BUILTIN_ROLES.find(r => r.id === id);
      if (builtin) throw new Error('Нельзя удалить системную встроенную роль');
      let custom = _loadCustomRoles();
      custom = custom.filter(r => r.id !== id);
      _saveCustomRoles(custom);

      const perms = _getPerms();
      delete perms[id];
      _savePerms(perms);
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

    /** Get all permissions as a plain object */
    getAll() { return _getPerms(); },

    /** Save all permissions (from settings UI) */
    saveAll(data) { _savePerms(data); },

    /** Reset all permissions to defaults and clear custom roles if requested */
    resetDefaults() {
      localStorage.removeItem(STORAGE_KEY_PERMS);
    },

    /** Reset everything including custom roles */
    resetAll() {
      localStorage.removeItem(STORAGE_KEY_PERMS);
      localStorage.removeItem(STORAGE_KEY_CUSTOM_ROLES);
    }
  };
})();
