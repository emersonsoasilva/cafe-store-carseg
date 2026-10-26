  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';

  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('msg');
    const newPassword = document.getElementById('newPassword').value;

    if (!token) {
      showMessage(msgEl, 'Link de redefinição inválido: token ausente.');
      return;
    }

    try {
      const data = await api('/auth/reset-password', { method: 'POST', body: { token, newPassword } });
      showMessage(msgEl, data.message + ' Redirecionando para o login...', 'success');
      setTimeout(() => { window.location.href = '/login.html'; }, 1500);
    } catch (err) {
      showMessage(msgEl, err.message);
    }
  });
