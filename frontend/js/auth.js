/** auth.js — Login page rendering and authentication logic. */

function renderLogin() {
  App.setContent(`
    <div class="login-page">
      <div class="login-box">
        <div class="login-logo">
          <div class="login-logo-icon">
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="#f59e0b"/>
              <path d="M7 18l3-8h8l3 8" stroke="#0f1117" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="10" cy="19.5" r="1.5" fill="#0f1117"/>
              <circle cx="18" cy="19.5" r="1.5" fill="#0f1117"/>
              <path d="M5 14h18" stroke="#0f1117" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <h1>Автосервис München</h1>
          <p>Система управления автосервисом</p>
        </div>

        <div class="login-card">
          <h2>Вход в систему</h2>

          <div id="login-error" class="login-error hidden"></div>

          <form id="login-form" autocomplete="on">
            <div class="form-group">
              <label for="login-username">Логин <span class="required">*</span></label>
              <input
                id="login-username"
                name="username"
                type="text"
                class="form-control"
                placeholder="Введите логин"
                autocomplete="username"
                required
              />
            </div>
            <div class="form-group">
              <label for="login-password">Пароль <span class="required">*</span></label>
              <input
                id="login-password"
                name="password"
                type="password"
                class="form-control"
                placeholder="Введите пароль"
                autocomplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              class="btn btn-primary"
              id="login-btn"
              style="width:100%; justify-content:center; padding:11px;"
            >
              Войти
            </button>
          </form>

        </div>
      </div>
    </div>
  `);

  document.getElementById('login-form').addEventListener('submit', handleLogin);
  // Auto-focus username field
  document.getElementById('login-username').focus();
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');

  btn.disabled = true;
  btn.textContent = 'Входим…';

  try {
    const data = await App.apiForm('/auth/token', {
      username: document.getElementById('login-username').value.trim(),
      password: document.getElementById('login-password').value,
    });

    App.login(data.access_token, { username: data.username, role: data.role });
  } catch (err) {
    errorEl.textContent = err.message || 'Неверный логин или пароль';
    errorEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Войти';
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
  }
}
