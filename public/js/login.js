  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('msg');
    msgEl.hidden = true;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get('next') || '/index.html';
    } catch (err) {
      showMessage(msgEl, err.message);
    }
  });
