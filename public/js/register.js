  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('msg');
    msgEl.hidden = true;

    const body = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      cpf: document.getElementById('cpf').value,
      phone: document.getElementById('phone').value,
      password: document.getElementById('password').value,
      street: document.getElementById('street').value,
      city: document.getElementById('city').value,
      state: document.getElementById('state').value.toUpperCase(),
      zip: document.getElementById('zip').value,
    };

    try {
      await api('/auth/register', { method: 'POST', body });
      window.location.href = '/index.html';
    } catch (err) {
      showMessage(msgEl, err.message);
    }
  });
