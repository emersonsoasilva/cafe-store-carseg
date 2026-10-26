  const msgEl = document.getElementById('msg');
  const STATUS_LABEL = {
    pendente: 'Pendente', pago: 'Pago', em_separacao: 'Em separação',
    enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado',
  };
  const NEXT_STATUS = {
    pendente: 'pago', pago: 'em_separacao', em_separacao: 'enviado', enviado: 'entregue',
  };

  async function guardAdmin() {
    try {
      const { user } = await api('/auth/me');
      if (user.role !== 'admin') {
        window.location.href = '/index.html';
      }
    } catch (_) {
      window.location.href = '/login.html?next=/admin.html';
    }
  }

  async function loadProducts() {
    const el = document.getElementById('admin-products');
    try {
      const { products } = await api('/admin/products');
      el.innerHTML = `
        <table>
          <thead><tr><th>Nome</th><th>Preço</th><th>Estoque</th><th>Ativo</th><th></th></tr></thead>
          <tbody>
            ${products.map((p) => `
              <tr>
                <td>${escapeHtml(p.name)}</td>
                <td>${p.priceFormatted}</td>
                <td>${p.stock}</td>
                <td>${p.active ? 'Sim' : 'Não'}</td>
                <td>${p.active ? `<button class="danger deactivate-btn" data-id="${p.id}">Desativar</button>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      document.querySelectorAll('.deactivate-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await api(`/admin/products/${btn.dataset.id}`, { method: 'DELETE' });
            loadProducts();
          } catch (err) {
            showMessage(msgEl, err.message);
          }
        });
      });
    } catch (err) {
      showMessage(msgEl, err.message);
    }
  }

  async function loadOrders() {
    const el = document.getElementById('admin-orders');
    try {
      const { orders } = await api('/admin/orders');
      el.innerHTML = orders.map((o) => `
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:center;">
            <strong>Pedido ${o.id.slice(0, 8)}</strong>
            <span class="badge ${o.status}">${STATUS_LABEL[o.status] || o.status}</span>
          </div>
          <p class="hint">${o.totalFormatted} · Entrega em ${escapeHtml(o.shippingAddress.city)}/${escapeHtml(o.shippingAddress.state)}</p>
          ${NEXT_STATUS[o.status] ? `<button class="advance-btn" data-id="${o.id}" data-next="${NEXT_STATUS[o.status]}">Avançar para "${STATUS_LABEL[NEXT_STATUS[o.status]]}"</button>` : ''}
        </div>
      `).join('') || '<p class="hint">Nenhum pedido registrado ainda.</p>';

      document.querySelectorAll('.advance-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await api(`/admin/orders/${btn.dataset.id}/status`, {
              method: 'PATCH',
              body: { status: btn.dataset.next },
            });
            loadOrders();
          } catch (err) {
            showMessage(msgEl, err.message);
          }
        });
      });
    } catch (err) {
      showMessage(msgEl, err.message);
    }
  }

  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const priceReais = parseFloat(document.getElementById('priceReais').value || '0');
    const body = {
      name: document.getElementById('name').value,
      description: document.getElementById('description').value,
      origin: document.getElementById('origin').value,
      roastLevel: document.getElementById('roastLevel').value,
      weightGrams: parseInt(document.getElementById('weightGrams').value, 10),
      priceCents: Math.round(priceReais * 100),
      stock: parseInt(document.getElementById('stock').value, 10),
    };
    try {
      await api('/admin/products', { method: 'POST', body });
      e.target.reset();
      loadProducts();
    } catch (err) {
      showMessage(msgEl, err.message);
    }
  });

  (async () => {
    await guardAdmin();
    loadProducts();
    loadOrders();
  })();
