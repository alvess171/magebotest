// ============================================================
// Minibia — Reativador automático do Cave Bot após reconexão
// ============================================================
// Fica de olho no status da conexão com o servidor. Quando detecta
// que caiu e depois voltou, reativa o cave bot automaticamente
// (só se ele estava ativo antes de cair).
// ============================================================

(function () {

  const INTERVALO_MS = 1000;       // com que frequência verificar a conexão
  const ESPERA_APOS_RECONECTAR = 2000; // espera antes de reativar (dá tempo do jogo estabilizar)

  let estavaConectado = null; // null = ainda não sabemos o estado inicial
  let caveEstavaAtivoAntesDeCair = false;

  function estaConectado() {
    // __wasConnected reflete se a última verificação de rede teve sucesso.
    return !!window.gameClient?.networkManager?.state?.__wasConnected;
  }

  function verificarConexao() {
    const conectadoAgora = estaConectado();

    if (estavaConectado === null) {
      // primeira verificação, só guarda o estado, não faz nada ainda
      estavaConectado = conectadoAgora;
      return;
    }

    // Detectou queda de conexão
    if (estavaConectado && !conectadoAgora) {
      caveEstavaAtivoAntesDeCair = !!window.minibiaBot?.cave?.status?.().running;
      console.log("%c[Cave-Auto] Conexão caiu. Cave bot estava ativo: " + caveEstavaAtivoAntesDeCair, "color: orange;");
    }

    // Detectou volta da conexão
    if (!estavaConectado && conectadoAgora) {
      console.log("%c[Cave-Auto] Conexão voltou.", "color: lightgreen;");

      if (caveEstavaAtivoAntesDeCair) {
        setTimeout(function () {
          const jaRodando = window.minibiaBot?.cave?.status?.().running;
          if (!jaRodando && window.minibiaBot?.cave?.start) {
            const iniciou = window.minibiaBot.cave.start();
            console.log(
              "%c[Cave-Auto] Reativando cave bot após reconexão: " + (iniciou ? "sucesso ✅" : "falhou ⚠️"),
              "color: " + (iniciou ? "lightgreen" : "red") + "; font-weight: bold;"
            );
          }
        }, ESPERA_APOS_RECONECTAR);
      }
    }

    estavaConectado = conectadoAgora;
  }

  setInterval(verificarConexao, INTERVALO_MS);
  console.log("[Cave-Auto] Vigia de reconexão ativo.");

})();
