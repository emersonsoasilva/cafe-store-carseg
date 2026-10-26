async function renderNav() {
  const nav = document.getElementById('nav-actions');
  if (!nav) return;
  try {
    const { user } = await api('/auth/me');
    nav.innerHTML = `
      <span>Olá, ${escapeHtml(user.name.split(' ')[0])}</span>
      <a href="/orders.html">Meus pedidos</a>
      ${user.role === 'admin' ? '<a href="/admin.html">Administração</a>' : ''}
      <a href="#" id="logout-link">Sair</a>
    `;
    document.getElementById('logout-link').addEventListener('click', async (e) => {
      e.preventDefault();
      await api('/auth/logout', { method: 'POST' });
      window.location.href = '/index.html';
    });
  } catch (_) {
    nav.innerHTML = `<a href="/login.html">Entrar</a><a href="/register.html">Cadastrar</a>`;
  }
}

document.addEventListener('DOMContentLoaded', renderNav);
