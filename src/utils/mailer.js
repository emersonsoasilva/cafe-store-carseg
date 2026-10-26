/**
 * Este projeto é uma demonstração e não está integrado a um provedor de
 * e-mail real. Em produção, troque esta função por uma chamada a um serviço
 * como SES, SendGrid, Postmark etc. O importante do ponto de vista de
 * segurança é: o link de reset nunca deve ser retornado na resposta HTTP da
 * API (isso permitiria a qualquer pessoa resetar a senha de terceiros) — ele
 * deve viajar apenas por um canal fora de banda, como o e-mail.
 */
function sendPasswordResetEmail({ to, name, resetUrl }) {
  console.log('----------------------------------------------------');
  console.log('[mailer-simulado] E-mail de recuperação de senha');
  console.log(`Para: ${to}`);
  console.log(`Olá, ${name}. Clique no link abaixo para redefinir sua senha:`);
  console.log(resetUrl);
  console.log('Este link expira em 15 minutos e só pode ser usado uma vez.');
  console.log('----------------------------------------------------');
}

module.exports = { sendPasswordResetEmail };
