const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(env.fieldEncryptionKey, 'hex'); // 32 bytes

/**
 * Criptografa um dado sensível (ex.: CPF) em repouso.
 * Usamos AES-256-GCM (autenticado) em vez de apenas ofuscar o dado,
 * seguindo a recomendação da OWASP de proteger dados sensíveis
 * "em repouso" (A02:2021 - Cryptographic Failures).
 * Formato armazenado: iv:authTag:cipherText (tudo em hex).
 */
function encryptField(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decryptField(payload) {
  if (!payload) return null;
  const [ivHex, authTagHex, dataHex] = payload.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Mostra só os 3 últimos dígitos do CPF, nunca o valor completo em telas/listas. */
function maskCpf(cpf) {
  const digits = String(cpf).replace(/\D/g, '');
  if (digits.length < 3) return '***';
  return `***.***.***-${digits.slice(-2)}`;
}

/**
 * Gera um token opaco e aleatório (ex.: para reset de senha).
 * Retorna o token em texto puro (para enviar ao usuário) e seu hash SHA-256
 * (o único valor que deve ser persistido no banco). Isso garante que, mesmo
 * se o banco vazar, o token de reset não pode ser reutilizado diretamente
 * (mesma lógica usada para armazenar API keys com segurança).
 */
function generateOpaqueToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Comparação em tempo constante para evitar timing attacks. */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  encryptField,
  decryptField,
  maskCpf,
  generateOpaqueToken,
  hashToken,
  timingSafeEqual,
};
