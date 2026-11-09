
(() => {
  const $ = (id) => document.getElementById(id);
  if (!$('sim-start')) return;

  let status = null;
  let refreshHandle = null;

  function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('pt-BR');
  }

  function render(data) {
    status = data;
    $('sim-status').textContent = data.running ? 'Executando' : data.active ? 'Ativo' : 'Inativo';
    $('sim-status').className = `badge ${data.active ? 'success' : ''}`;
    $('sim-start').disabled = data.active;
    $('sim-stop').disabled = !data.active;
    $('sim-users').textContent = data.counts.users;
    $('sim-products').textContent = data.counts.products;
    $('sim-purchases').textContent = data.counts.purchases;
    $('sim-errors').textContent = data.counts.errors;

    const history = $('sim-history');
    history.innerHTML = data.history.length
      ? data.history.map((item) => `
        <div class="sim-history-item ${item.status === 'error' ? 'sim-error' : ''}">
          <span class="sim-history-time">${formatDate(item.at)}</span>
          <span class="sim-history-type">${item.type === 'user' ? 'Usuário' : item.type === 'product' ? 'Produto' : item.type === 'purchase' ? 'Compra' : 'Falha'}</span>
          <span>${escapeHtml(item.message)}</span>
        </div>
      `).join('')
      : '<p class="hint">Nenhuma atividade registrada nesta sessão.</p>';
    updateCountdown();
  }

  function updateCountdown() {
    if (!status || !status.active || !status.nextRunAt) {
      $('sim-next').textContent = 'Próxima execução: —';
      return;
    }
    const remaining = Math.max(0, Math.ceil((new Date(status.nextRunAt).getTime() - Date.now()) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    $('sim-next').textContent = `Próxima execução em: ${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  async function refresh() {
    try {
      render(await api('/admin/simulator'));
    } catch (err) {
      $('sim-history').textContent = err.message;
    }
  }

  $('sim-start').addEventListener('click', async () => {
    $('sim-start').disabled = true;
    try {
      render(await api('/admin/simulator/start', { method: 'POST' }));
    } catch (err) {
      showMessage(document.getElementById('msg'), err.message);
      $('sim-start').disabled = false;
    }
  });

  $('sim-stop').addEventListener('click', async () => {
    $('sim-stop').disabled = true;
    try {
      render(await api('/admin/simulator/stop', { method: 'POST' }));
    } catch (err) {
      showMessage(document.getElementById('msg'), err.message);
      $('sim-stop').disabled = false;
    }
  });

  refresh();
  refreshHandle = setInterval(refresh, 5000);
  setInterval(updateCountdown, 1000);
  window.addEventListener('beforeunload', () => clearInterval(refreshHandle));
})();
