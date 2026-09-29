/** vehicles.js — Vehicle CRUD modals (used within client detail page). */

async function showVehicleModal(clientId, vehicleId = null) {
  let vehicle = null, brands = [];
  try {
    brands = await App.api('/vehicles/brands');
    if (vehicleId) vehicle = await App.api(`/vehicles/${vehicleId}`);
  } catch { }

  App.openModal({
    title: vehicle ? 'Редактировать автомобиль' : 'Добавить автомобиль',
    body: `
      <form id="vehicle-form">
        <input type="hidden" name="client_id" value="${clientId}" />
        <div class="form-row">
          <div class="form-group">
            <label>Марка <span class="required">*</span></label>
            <select name="brand" id="veh-brand-select" class="form-control" required onchange="onVehBrandChanged(this.value)">
              <option value="">— Выберите марку —</option>
              ${brands.map(b => `<option value="${App.escHtml(b.name)}" data-id="${b.id}" ${vehicle?.brand === b.name ? 'selected' : ''}>${App.escHtml(b.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Модель <span class="required">*</span></label>
            <input name="model" id="veh-model-input" class="form-control" required
              value="${vehicle ? App.escHtml(vehicle.model) : ''}"
              placeholder="Camry, RX, X5…" list="veh-models-list" />
            <datalist id="veh-models-list"></datalist>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Год выпуска</label>
            <input name="year" type="number" class="form-control"
              value="${vehicle?.year ?? ''}"
              placeholder="2020" min="1900" max="${new Date().getFullYear() + 1}" />
          </div>
          <div class="form-group">
            <label>Гос. номер (например 777AAA01)</label>
            <input name="plate_number" class="form-control"
              value="${vehicle?.plate_number ? App.escHtml(vehicle.plate_number) : ''}"
              placeholder="777AAA01" />
          </div>
        </div>
        <div class="form-group">
          <label>VIN</label>
          <input name="vin" class="form-control" maxlength="17"
            value="${vehicle?.vin ? App.escHtml(vehicle.vin) : ''}"
            placeholder="17-символьный VIN-код" />
        </div>
      </form>
    `,
    submitLabel: vehicle ? 'Сохранить' : 'Добавить',
    onSubmit: async () => {
      const data = App.formData('vehicle-form');
      if (data.year) data.year = parseInt(data.year);

      try {
        if (vehicleId) {
          await App.api(`/vehicles/${vehicleId}`, { method: 'PUT', body: data });
          App.toast('Автомобиль обновлён');
        } else {
          await App.api('/vehicles/', { method: 'POST', body: data });
          App.toast('Автомобиль добавлен');
        }
        App.closeModal();
        renderClientDetail(clientId);
      } catch (err) {
        App.toast(err.message, 'error');
      }
    },
  });
}

async function onVehBrandChanged(brandName) {
  const bSelect = document.getElementById('veh-brand-select');
  const dList = document.getElementById('veh-models-list');
  const modelInput = document.getElementById('veh-model-input');

  dList.innerHTML = '';
  if (modelInput) modelInput.value = ''; // сбрасываем старую модель при смене марки

  if (!bSelect || bSelect.selectedIndex <= 0) return;
  const brandId = bSelect.options[bSelect.selectedIndex].getAttribute('data-id');
  if (!brandId) return;

  try {
    const models = await App.api(`/vehicles/brands/${brandId}/models`);
    if (models) {
      dList.innerHTML = models.map(m => `<option value="${App.escHtml(m.name)}"></option>`).join('');
    }
  } catch { }
}


async function deleteVehicle(vehicleId, clientId) {
  if (!await App.confirm('Удалить этот автомобиль?')) return;
  try {
    await App.api(`/vehicles/${vehicleId}`, { method: 'DELETE' });
    App.toast('Автомобиль удалён');
    renderClientDetail(clientId);
  } catch (err) {
    App.toast(err.message, 'error');
  }
}