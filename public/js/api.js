/**
 * Wrapper de fetch que:
 * 1) sempre envia cookies (credentials: 'include') para autenticação;
 * 2) anexa automaticamente o header X-CSRF-Token em métodos que alteram
 *    estado, lendo o valor do cookie "csrf_token" (padrão double-submit).
 */
function readCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const finalHeaders = { 'Content-Type': 'application/json', ...headers };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    const csrf = readCookie('csrf_token');
    if (csrf) finalHeaders['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers: finalHeaders,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    // resposta sem corpo (ex.: 204)
  }

  if (!res.ok) {
    const message = (data && (data.error || (data.details && data.details[0] && data.details[0].message))) ||
      'Ocorreu um erro inesperado.';
    throw new Error(message);
  }
  return data;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showMessage(el, text, type = 'error') {
  el.textContent = text;
  el.className = `message ${type}`;
  el.hidden = false;
}
