/**
 * service-categories.js — Управление иерархическим справочником категорий услуг.
 * Категория может иметь родителя (подкатегория) — неограниченная вложенность,
 * хотя на практике используется 2 уровня (Категория -> Подкатегория).
 */

/** Загружает плоский список категорий и строит дерево по parent_id */
async function fetchCategoryTree() {
  const flat = await App.api('/service-categories/');
  const byId = {};
  flat.forEach(c => byId[c.id] = { ...c, children: [] });
  const roots = [];
  flat.forEach(c => {
    if (c.parent_id && byId[c.parent_id]) {
      byId[c.parent_id].children.push(byId[c.id]);
    } else {
      roots.push(byId[c.id]);
    }
  });
  return { roots, byId, flat };
}

/** Строит <option> с отступами по уровню вложенности — для использования в select-е формы услуги */
function renderCategoryOptions(nodes, depth = 0) {
  let html = '';
  nodes.forEach(node => {
    const prefix = depth > 0 ? '— '.repeat(depth) : '';
    html += `<option value="${node.id}">${prefix}${App.escHtml(node.name)}</option>`;
    if (node.children.length) {
      html += renderCategoryOptions(node.children, depth + 1);
    }
  });
  return html;
}

/** Строит полный "хлебный путь" категории по её id, напр. "Двигатель → ТО" */
function categoryPath(categoryId, byId) {
  if (!categoryId || !byId[categoryId]) return null;
  const parts = [];
  let cursor = byId[categoryId];
  while (cursor) {
    parts.unshift(cursor.name);
    cursor = cursor.parent_id ? byId[cursor.parent_id] : null;
  }
  return parts.join(' → ');
}

// ─── Модалка управления категориями ────────────────────────────────────────
async function showCategoriesModal() {
  const { roots, byId } = await fetchCategoryTree();

  App.openModal({
    title: 'Категории услуг',
    wide: true,
    noFooter: true,
    body: `
      <div style="margin-bottom:16px">
        <button class="btn btn-primary btn-sm" onclick="showCategoryFormModal(null)">+ Новая категория</button>
      </div>
      <div id="categories-tree-wrap">${renderCategoryTreeHtml(roots)}</div>
    `,
  });
}

function renderCategoryTreeHtml(nodes, depth = 0) {
  if (!nodes.length) {
    return depth === 0 ? '<p class="text-muted text-sm">Категорий пока нет</p>' : '';
  }
  return nodes.map(node => `
    <div style="margin-left:${depth * 14}px;border-left:${depth > 0 ? '2px solid var(--border)' : 'none'};padding-left:${depth > 0 ? '8px' : '0'};margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:8px 12px;background:var(--bg-input);border-radius:var(--radius-sm)">
        <span class="font-bold" style="font-size:14px">${App.escHtml(node.name)}</span>
        <div class="item-actions" style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-sm btn-secondary" onclick="showCategoryFormModal(${node.id})">+ Подкатегория</button>
          <button class="btn btn-sm btn-secondary" onclick="showCategoryFormModal(null, ${node.id})">Изм.</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCategory(${node.id}, '${App.escHtml(node.name)}')">✕</button>
        </div>
      </div>
      ${renderCategoryTreeHtml(node.children, depth + 1)}
    </div>
  `).join('');
}

/**
 * Форма создания/редактирования категории.
 * parentIdForNew — если задан, создаём подкатегорию у этого родителя.
 * editId — если задан, редактируем существующую категорию (переименование/смена родителя).
 */
async function showCategoryFormModal(parentIdForNew = null, editId = null) {
  const { roots, byId, flat } = await fetchCategoryTree();
  const editCategory = editId ? byId[editId] : null;

  App.openModal({
    title: editCategory ? 'Редактировать категорию' : (parentIdForNew ? 'Новая подкатегория' : 'Новая категория'),
    body: `
      <form id="category-form">
        <div class="form-group">
          <label>Название <span class="required">*</span></label>
          <input name="name" class="form-control" required
            value="${editCategory ? App.escHtml(editCategory.name) : ''}"
            placeholder="Двигатель, ТО, Тормозная система…" />
        </div>
        <div class="form-group">
          <label>Родительская категория</label>
          <select name="parent_id" class="form-control">
            <option value="">— Нет (категория верхнего уровня) —</option>
            ${flat
              .filter(c => c.id !== editId) // нельзя выбрать себя же родителем
              .map(c => `<option value="${c.id}" ${
                (editCategory ? editCategory.parent_id === c.id : parentIdForNew === c.id) ? 'selected' : ''
              }>${App.escHtml(categoryPath(c.id, byId))}</option>`).join('')}
          </select>
        </div>
      </form>
    `,
    submitLabel: editCategory ? 'Сохранить' : 'Добавить',
    onSubmit: async () => {
      const data = App.formData('category-form');
      const payload = {
        name: data.name,
        parent_id: data.parent_id ? parseInt(data.parent_id) : null,
      };
      try {
        if (editCategory) {
          await App.api(`/service-categories/${editId}`, { method: 'PUT', body: payload });
          App.toast('Категория обновлена');
        } else {
          await App.api('/service-categories/', { method: 'POST', body: payload });
          App.toast('Категория добавлена');
        }
        App.closeModal();
        showCategoriesModal(); // возвращаемся к дереву категорий с обновлёнными данными
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
}

async function deleteCategory(id, name) {
  if (!await App.confirm(`Удалить категорию «${name}»?`)) return;
  try {
    await App.api(`/service-categories/${id}`, { method: 'DELETE' });
    App.toast('Категория удалена');
    showCategoriesModal();
  } catch (err) {
    App.toast(err.message, 'error');
  }
}
