// Busca as sessões ativas de um e-mail (usada pelo painel de administração).
export async function sessoesPorEmail(env, email) {
  const agora = Math.floor(Date.now() / 1000);
  const { results } = await env.DB.prepare(
    `SELECT issuer, display_name, expires_at FROM sessions WHERE email = '${email}' AND expires_at > ${agora}`
  ).all();
  return results;
}
