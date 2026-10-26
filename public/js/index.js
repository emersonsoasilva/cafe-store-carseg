  let products = [];
  const cart = {}; // productId -> quantity

  function renderProducts() {
    const el = document.getElementById('products');
    if (products.length === 0) {
      el.innerHTML = '<p>Nenhum produto disponível no momento.</p>';
      return;
    }
    el.innerHTML = products.map((p) => `
      <div class="card product-card">
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description || '')}</p>
        <p class="hint">${escapeHtml(p.origin || '')} · Torra ${escapeHtml(p.roastLevel)} · ${p.weightGrams}g</p>
        <p class="price">${p.priceFormatted}</p>
        <p class="stock">${p.stock > 0 ? p.stock + ' em estoque' : 'Fora de estoque'}</p>
        <button ${p.stock <= 0 ? 'disabled' : ''} data-id="${p.id}" class="add-btn">Adicionar ao carrinho</button>
      </div>
    `).join('');

    document.querySelectorAll('.add-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        cart[id] = (cart[id] || 0) + 1;
        renderCart();
      });
    });
  }

  function renderCart() {
    const itemsEl = document.getElementById('cart-items');
    const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      itemsEl.innerHTML = '<p class="hint">Seu carrinho está vazio.</p>';
      document.getElementById('cart-total').textContent = 'R$ 0,00';
      return;
    }
    let totalCents = 0;
    itemsEl.innerHTML = entries.map(([id, qty]) => {
      const product = products.find((p) => p.id === id);
      if (!product) return '';
      totalCents += product.priceCents * qty;
      return `
        <div class="row" style="align-items:center;margin-bottom:0.4rem;">
          <span style="flex:2">${escapeHtml(product.name)}</span>
          <input type="number" min="0" max="${product.stock}" value="${qty}" data-id="${id}" class="qty-input" style="flex:1" />
          <span style="flex:1">${((product.priceCents * qty) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        </div>
      `;
    }).join('');
    document.getElementById('cart-total').textContent =
      (totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    document.querySelectorAll('.qty-input').forEach((input) => {
      input.addEventListener('change', () => {
        const qty = Math.max(0, parseInt(input.value || '0', 10));
        cart[input.dataset.id] = qty;
        renderCart();
      });
    });
  }

  async function loadProducts() {
    try {
      const data = await api('/products');
      products = data.products;
      renderProducts();
    } catch (err) {
      showMessage(document.getElementById('msg'), err.message);
    }
  }

  document.getElementById('checkout-btn').addEventListener('click', () => {
    const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      showMessage(document.getElementById('msg'), 'Adicione ao menos um produto ao carrinho.');
      return;
    }
    sessionStorage.setItem('cafe_cart', JSON.stringify(entries));
    window.location.href = '/checkout.html';
  });

  loadProducts();
