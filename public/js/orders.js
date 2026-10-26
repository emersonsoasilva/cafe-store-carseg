  const STATUS_LABEL = {
    pendente: 'Pendente', pago: 'Pago', em_separacao: 'Em separação',
    enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado',
  };

  async function loadOrders() {
    const msgEl = document.getElementById('msg');
    try {
      const { orders } = await api('/orders');
      const el = document.getElementById('orders');
      if (orders.length === 0) {
        el.innerHTML = '<p>Você ainda não fez nenhum pedido. <a href="/index.html">Ver catálogo</a>.</p>';
        return;
      }
      el.innerHTML = orders.map((o) => `
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:center;">
            <strong>Pedido ${o.id.slice(0, 8)}</strong>
            <span class="badge ${o.status}">${STATUS_LABEL[o.status] || o.status}</span>
          </div>
          <p class="hint">Feito em ${new Date(o.createdAt).toLocaleString('pt-BR')}</p>
          <table>
            <thead><tr><th>Produto</th><th>Qtd</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${o.items.map((i) => `
                <tr>
                  <td>${escapeHtml(i.productName)}</td>
                  <td>${i.quantity}</td>
                  <td>${(i.subtotalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <p><strong>Total: ${o.totalFormatted}</strong></p>
          <p class="hint">Entrega: ${escapeHtml(o.shippingAddress.street)}, ${escapeHtml(o.shippingAddress.city)}/${escapeHtml(o.shippingAddress.state)}</p>
          ${o.trackingCode ? `<p class="hint">Rastreio: ${escapeHtml(o.trackingCode)}</p>` : ''}
          ${['pendente', 'pago'].includes(o.status)
            ? `<button class="danger cancel-btn" data-id="${o.id}">Cancelar pedido</button>` : ''}
        </div>
      `).join('');

      document.querySelectorAll('.cancel-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await api(`/orders/${btn.dataset.id}/cancel`, { method: 'POST' });
            loadOrders();
          } catch (err) {
            showMessage(msgEl, err.message);
          }
        });
      });
    } catch (err) {
      if (err.message.includes('Não autenticado')) {
        window.location.href = '/login.html?next=/orders.html';
        return;
      }
      showMessage(msgEl, err.message);
    }
  }

  loadOrders();
