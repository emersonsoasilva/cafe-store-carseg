  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('msg');
    const email = document.getElementById('email').value;
    try {
      const data = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      showMessage(msgEl, data.message, 'success');
    } catch (err) {
      showMessage(msgEl, err.message);
    }
  });
