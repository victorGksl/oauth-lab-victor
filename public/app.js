// Este arquivo roda no NAVEGADOR da usuária.
// Ele só pergunta ao servidor "existe uma sessão?" e mostra o resultado.
// Nenhum token ou segredo passa por aqui: o navegador só guarda o cookie
// __Host-session, e esse cookie é HttpOnly (o JavaScript nem consegue lê-lo).

const status = document.getElementById("status");
const areaLogin = document.getElementById("area-login");
const areaSessao = document.getElementById("area-sessao");

// credentials: "same-origin" => o navegador envia os cookies porque
// /api/me está na mesma origem (mesmo https://NOME.pages.dev) que a página.
fetch("/api/me", { credentials: "same-origin" })
  .then((response) => (response.ok ? response.json() : null))
  .then((user) => {
    status.textContent = user
      ? `Sessão de ${user.email ?? user.displayName}.`
      : "Nenhuma sessão neste navegador.";

    // Esconder botões é só aparência. Não protege nenhum arquivo de public/.
    areaLogin.hidden = Boolean(user);
    areaSessao.hidden = !user;
  })
  .catch(() => {
    status.textContent = "Não foi possível consultar a sessão.";
  });
