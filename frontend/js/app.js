/**
 * app.js — Core application: router, API client, global state, UI helpers.
 *
 * Usage: All modules access App.api(), App.navigate(), App.toast(), etc.
 * The router is hash-based (#/orders, #/clients/:id, etc.)
 */
const App = {
  token: null,
  user: null,   // { username, role }

  // ─── Initialization ───────────────────────────────────────────────────────
  init() {
    this.token = localStorage.getItem('sto_token');
    const u = localStorage.getItem('sto_user');
    if (u) this.user = JSON.parse(u);

    window.addEventListener('hashchange', () => this._route());
    document.getElementById('btn-logout').addEventListener('click', () => this.logout());
    document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-overlay')) this.closeModal();
    });

    // Mobile sidebar listeners
    const menuBtn = document.getElementById('btn-mobile-menu');
    const sidebarClose = document.getElementById('btn-sidebar-close');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (menuBtn) menuBtn.addEventListener('click', () => this.toggleMobileSidebar());
    if (sidebarClose) sidebarClose.addEventListener('click', () => this.closeMobileSidebar());
    if (backdrop) backdrop.addEventListener('click', () => this.closeMobileSidebar());

    this._route();
  },

  // ─── Mobile Sidebar ───────────────────────────────────────────────────────
  toggleMobileSidebar() {
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('sidebar-backdrop');
    if (sb) sb.classList.toggle('mobile-open');
    if (bd) bd.classList.toggle('active');
  },

  closeMobileSidebar() {
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('sidebar-backdrop');
    if (sb) sb.classList.remove('mobile-open');
    if (bd) bd.classList.remove('active');
  },

  // ─── API Client ───────────────────────────────────────────────────────────
  async api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    if (options.headers) Object.assign(headers, options.headers);

    let body = options.body;
    if (body && typeof body === 'object' && !(options.headers?.['Content-Type'] === 'application/x-www-form-urlencoded')) {
      body = JSON.stringify(body);
    }

    const res = await fetch(`/api${path}`, { ...options, headers, body });

    if (res.status === 401) {
      this.logout();
      return null;
    }

    if (res.status === 204) return null;

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      let detail = `Ошибка ${res.status}`;
      if (data && data.detail) {
        if (Array.isArray(data.detail)) {
          // Pydantic-ошибки валидации: массив { loc, msg, ... }
          const FIELD_LABELS = {
            full_name: 'ФИО', phone: 'Телефон', email: 'Email',
            comment: 'Комментарий', brand: 'Марка', model: 'Модель',
            plate_number: 'Гос. номер', vin: 'VIN',
          };
          detail = data.detail
            .map(item => {
              const field = item.loc?.[item.loc.length - 1];
              const label = FIELD_LABELS[field] || field || 'Поле';
              return `${label}: обязательно для заполнения`;
            })
            .join('; ');
        } else if (typeof data.detail === 'string') {
          detail = data.detail;
        }
      }
      throw new Error(detail);
    }

    return data;
  },

  // Convenience POST that sends form-encoded data (for OAuth2 /token)
  async apiForm(path, formData) {
    const body = new URLSearchParams(formData).toString();
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.detail) || 'Ошибка авторизации');
    return data;
  },

  // ─── Router ───────────────────────────────────────────────────────────────
  _route() {
    const hash = window.location.hash.slice(1) || '/';
    const path = hash.split('?')[0];

    // Close mobile sidebar whenever route changes
    this.closeMobileSidebar();

    if (!this.token) {
      // Not logged in — show login
      this._showLogin();
      return;
    }

    // Show sidebar and mobile topbar when logged in
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('full-width');
    const topbar = document.getElementById('mobile-topbar');
    if (topbar) topbar.classList.remove('hidden');
    this._updateSidebar();

    // Route matching
    if (path === '/' || path === '/orders') return renderOrders();
    if (path === '/clients') return renderClients();
    if (path.startsWith('/clients/')) {
      const id = parseInt(path.split('/')[2]);
      if (id) return renderClientDetail(id);
    }
    if (path === '/employees') return renderEmployees();
    if (path.startsWith('/employees/')) {
      const id = parseInt(path.split('/')[2]);
      if (id) return renderEmployeeDetail(id);
    }
    if (path === '/services') return renderServices();
    if (path.startsWith('/orders/')) {
      const id = parseInt(path.split('/')[2]);
      if (id) return renderOrderDetail(id);
    }

    if (path === '/analytics') {
      if (this.isOwner()) return renderAnalytics();
      else return renderOrders();
    }

    if (path === '/roles') {
      if (this.isOwner()) return renderRoles();
      else return renderOrders();
    }

    if (path === '/users') {
      if (this.isOwner()) return renderUsers();
      else return renderOrders();
    }

    // Default
    renderOrders();
  },

  navigate(path) {
    window.location.hash = '#' + path;
  },

  _showLogin() {
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('main-content').classList.add('full-width');
    const topbar = document.getElementById('mobile-topbar');
    if (topbar) topbar.classList.add('hidden');
    renderLogin();
  },

  // ─── Auth ─────────────────────────────────────────────────────────────────
  login(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('sto_token', token);
    localStorage.setItem('sto_user', JSON.stringify(user));
    this.navigate('/orders');
  },

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('sto_token');
    localStorage.removeItem('sto_user');
    window.location.hash = '#/login';
    this._showLogin();
  },

  isOwner() { return this.user?.role === 'owner'; },

  // ─── Sidebar ──────────────────────────────────────────────────────────────
  _updateSidebar() {
    const path = window.location.hash.slice(1).split('?')[0];
    const role = this.user?.role;

    // Active nav item
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.remove('active');
      const route = el.dataset.route;
      if (route && path.startsWith(route)) el.classList.add('active');
    });

    // Permission-based nav visibility
    const navMap = {
      'nav-orders':    'nav.orders',
      'nav-clients':   'nav.clients',
      'nav-employees': 'nav.employees',
      'nav-services':  'nav.services',
      'nav-analytics': 'nav.analytics',
      'nav-roles':     'nav.roles',
      'nav-users':     'nav.users',
    };
    for (const [elId, feat] of Object.entries(navMap)) {
      const el = document.getElementById(elId);
      if (!el) continue;
      const allowed = Permissions.can(role, feat);
      el.classList.toggle('hidden', !allowed);
    }

    // User info
    const u = this.user;
    if (u) {
      document.getElementById('user-name').textContent = u.username;
      const roleLabel = (typeof Permissions !== 'undefined' && typeof Permissions.getRoleLabel === 'function')
        ? Permissions.getRoleLabel(u.role)
        : (u.role || 'Сотрудник');
      document.getElementById('user-role').textContent = roleLabel;
      const initial = u.username[0].toUpperCase();
      document.getElementById('user-avatar').textContent = initial;
      const mobAvatar = document.getElementById('mobile-user-avatar');
      if (mobAvatar) mobAvatar.textContent = initial;
    }
  },

  // ─── Apply Permissions to UI ──────────────────────────────────────────────
  applyPermissionsToUI() {
    this._updateSidebar();
  },

  // ─── Content Rendering ────────────────────────────────────────────────────
  setContent(html) {
    document.getElementById('main-content').innerHTML = html;
  },

  // ─── Modal ────────────────────────────────────────────────────────────────
  _modalSubmitHandler: null,

  openModal(options) {
    // options: { title, body, submitLabel?, onSubmit?, wide?, noFooter? }
    document.getElementById('modal-title').textContent = options.title;
    document.getElementById('modal-body').innerHTML = options.body;

    if (options.wide) {
      document.getElementById('modal-box').style.maxWidth = '700px';
    } else {
      document.getElementById('modal-box').style.maxWidth = '520px';
    }

    const footer = document.getElementById('modal-footer');
    const submitBtn = document.getElementById('modal-submit');

    if (options.noFooter) {
      footer.classList.add('hidden');
    } else {
      footer.classList.remove('hidden');
      submitBtn.textContent = options.submitLabel || 'Сохранить';
    }

    this._modalSubmitHandler = options.onSubmit || null;
    submitBtn.onclick = null;
    if (options.onSubmit) {
      submitBtn.onclick = (e) => {
        e.preventDefault();
        options.onSubmit();
      };
    }

    document.getElementById('modal-overlay').classList.remove('hidden');
    // Focus first input
    setTimeout(() => {
      const first = document.querySelector('#modal-body input, #modal-body select, #modal-body textarea');
      if (first) first.focus();
    }, 100);
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
    this._modalSubmitHandler = null;
  },

  // ─── Toast Notifications ──────────────────────────────────────────────────
  toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = { success: '✓', error: '✕', info: 'ℹ' }[type] || '•';
    toast.innerHTML = `<span style="font-weight:700">${icon}</span> ${this._escHtml(message)}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // ─── Utilities ────────────────────────────────────────────────────────────
  _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  escHtml(str) { return this._escHtml(str ?? ''); },

  /** Format number as Kazakhstan Tenge (KZT) */
  formatMoney(n) {
    return new Intl.NumberFormat('ru-KZ', {
      style: 'currency', currency: 'KZT', maximumFractionDigits: 0
    }).format(n || 0);
  },


  /** Format ISO datetime as readable Russian date */
  formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  },

  formatDateOnly(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  },

  /**
   * Copy text to clipboard reliably across desktop & mobile (HTTPS and HTTP).
   * Works on iOS Safari, Android Chrome, and desktop browsers.
   */
  async copyToClipboard(text) {
    if (!text) return false;

    // 1. Modern Clipboard API (available in secure contexts: HTTPS or localhost)
    if (navigator.clipboard && window.isSecureContext && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // Fallback to legacy copy below
      }
    }

    // 2. Legacy fallback for HTTP, iOS Safari, and older environments
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.width = '2em';
      textarea.style.height = '2em';
      textarea.style.padding = '0';
      textarea.style.border = 'none';
      textarea.style.outline = 'none';
      textarea.style.boxShadow = 'none';
      textarea.style.background = 'transparent';
      textarea.style.fontSize = '16px'; // Prevents auto-zoom in iOS Safari
      textarea.setAttribute('readonly', '');

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) return true;
    } catch (err) {
      // Execution failed
    }

    return false;
  },

  /** Return HTML for a status badge */
  statusBadge(status) {
    const labels = {
      new: 'Новый', in_progress: 'В работе', done: 'Готов',
      issued: 'Выдан', paid: 'Оплачен', pending: 'Ожидает'
    };

    if (typeof Permissions !== 'undefined' && typeof Permissions.getRole === 'function') {
      const allRoles = Permissions.getRoles();
      const matchedRole = allRoles.find(r => r.id === status);
      if (matchedRole) {
        return `<span class="badge badge-${status}" style="display:inline-flex;align-items:center;gap:4px;">${matchedRole.icon || '👤'} ${matchedRole.label}</span>`;
      }
    }

    const label = labels[status] || status;
    return `<span class="badge badge-${status}">${label}</span>`;
  },

  /** Spinner HTML */
  spinner() {
    return `<div class="spinner"><div class="spinner-ring"></div></div>`;
  },

  /** Simple confirmation before delete */
  async confirm(message) {
    return window.confirm(message);
  },

  /** Read form data as plain object */
  formData(formId) {
    const form = document.getElementById(formId);
    if (!form) return {};
    const data = {};
    new FormData(form).forEach((val, key) => {
      data[key] = val === '' ? null : val;
    });
    return data;
  },

  /** Vehicle display string */
  vehicleLabel(v) {
    if (!v) return '—';
    const parts = [v.brand, v.model];
    if (v.year) parts.push(`(${v.year})`);
    if (v.plate_number) parts.push(`· ${v.plate_number}`);
    return parts.join(' ');
  },
};

function formatPhoneDigits(digits) {
  let formatted = "+7";
  if (digits.length > 0) formatted += ` (${digits.slice(0, 3)}`;
  if (digits.length >= 3) formatted += `) ${digits.slice(3, 6)}`;
  if (digits.length >= 6) formatted += `-${digits.slice(6, 8)}`;
  if (digits.length >= 8) formatted += `-${digits.slice(8, 10)}`;
  return formatted;
}

function extractDigits(value) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("7") || digits.startsWith("8")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function attachPhoneMask(input) {
  // форматируем уже существующее значение при инициализации (режим редактирования)
  if (input.value) {
    input.value = formatPhoneDigits(extractDigits(input.value));
  }

  input.addEventListener("focus", () => {
    if (!input.value) input.value = "+7 (";
  });

  // ключевая правка: перехватываем Backspace/Delete ДО того, как браузер
  // попытается сам сдвинуть курсор через статичные символы маски
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Backspace" && e.key !== "Delete") return;

    e.preventDefault();

    let digits = extractDigits(input.value);

    if (e.key === "Backspace") {
      digits = digits.slice(0, -1); // всегда убираем последнюю цифру
    } else {
      // Delete — тоже упрощаем до удаления последней цифры,
      // т.к. с посимвольным редактированием внутри маски сложная логика не нужна
      digits = digits.slice(0, -1);
    }

    input.value = digits.length ? formatPhoneDigits(digits) : "";

    // ставим курсор в конец, чтобы можно было продолжать стирать подряд
    const pos = input.value.length;
    input.setSelectionRange(pos, pos);
  });

  input.addEventListener("input", (e) => {
    // сюда попадает только обычный ввод цифр (не Backspace/Delete — те перехвачены выше)
    const digits = extractDigits(input.value);
    input.value = formatPhoneDigits(digits);

    const pos = input.value.length;
    input.setSelectionRange(pos, pos);
  });

  input.addEventListener("blur", () => {
    if (extractDigits(input.value).length === 0) input.value = "";
  });
}
const FIELD_LABELS = {
  full_name: 'ФИО',
  phone: 'Телефон',
  email: 'Email',
  comment: 'Комментарий',
  brand: 'Марка',
  model: 'Модель',
  plate_number: 'Гос. номер',
  vin: 'VIN',
};

function parseApiError(err) {
  // err — это либо объект ответа FastAPI с полем detail, либо JS Error, либо строка
  const detail = err?.detail ?? err?.response?.detail ?? err;

  if (Array.isArray(detail)) {
    // 422 от Pydantic: массив объектов { loc: [...], msg: "..." }
    return detail
      .map(item => {
        const field = item.loc?.[item.loc.length - 1];
        const label = FIELD_LABELS[field] || field || 'Поле';
        return `${label}: заполните корректно`;
      })
      .join('; ');
  }

  if (typeof detail === 'string') return detail; // обычный HTTPException(detail="...")
  if (err?.message) return err.message; // обычный JS Error

  return 'Произошла ошибка. Попробуйте ещё раз.';
}