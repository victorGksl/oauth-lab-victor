// Roda no NAVEGADOR. Pergunta ao servidor quem está logado e preenche o dashboard.
// Atenção: este arquivo e o dashboard.html estão em public/, então qualquer
// pessoa consegue abri-los pela URL. Quem protege os dados é a rota /api/me,
// que só responde 200 quando existe uma sessão válida.

const usuario = document.getElementById("usuario");
const provedor = document.getElementById("provedor");

fetch("/api/me", { credentials: "same-origin" })
  .then((response) => (response.ok ? response.json() : null))
  .then((user) => {
    if (!user) {
      usuario.textContent = "Nenhuma sessão. Faça login na página inicial.";
      return;
    }
    usuario.textContent = `Olá, ${user.displayName ?? user.email}!`;
    // issuer diz quem confirmou a identidade: Google ou GitHub.
    provedor.textContent = user.issuer.includes("google") ? "Google" : "GitHub";
  })
  .catch(() => {
    usuario.textContent = "Não foi possível consultar a sessão.";
  });
