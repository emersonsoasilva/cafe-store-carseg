  const msgEl = document.getElementById('msg');
  const cartData = JSON.parse(sessionStorage.getItem('cafe_cart') || '[]');

  if (cartData.length === 0) {
    document.getElementById('summary').innerHTML = '<p>Seu carrinho está vazio. <a href="/index.html">Voltar à loja</a>.</p>';
    document.getElementById('checkout-form').hidden = true;
  } else {
    document.getElementById('summary').innerHTML =
      '<p>' + cartData.length + ' item(ns) selecionados. Preencha o endereço de entrega para confirmar.</p>';
  }

  document.getElementById('checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    msgEl.hidden = true;

    const items = cartData.map(([productId, quantity]) => ({ productId, quantity }));
    const shipping = {
      street: document.getElementById('street').value,
      city: document.getElementById('city').value,
      state: document.getElementById('state').value.toUpperCase(),
      zip: document.getElementById('zip').value,
    };

    try {
      const data = await api('/orders', { method: 'POST', body: { items, shipping } });
      sessionStorage.removeItem('cafe_cart');
      showMessage(msgEl, `Pedido confirmado! Número: ${data.order.id}`, 'success');
      setTimeout(() => { window.location.href = '/orders.html'; }, 1200);
    } catch (err) {
      if (err.message.includes('Não autenticado')) {
        window.location.href = '/login.html?next=/checkout.html';
        return;
      }
      showMessage(msgEl, err.message);
    }
  });
