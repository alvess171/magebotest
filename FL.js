(() => {
  if (document.getElementById("follow-ui-demo")) return;

  const panel = document.createElement("div");
  panel.id = "follow-ui-demo";

  panel.innerHTML = `
    <div id="follow-header">FOLLOW CONFIG</div>

    <label>Nome do alvo</label>
    <input id="follow-name" type="text" placeholder="Player" />

    <label>Distância</label>
    <input id="follow-distance" type="number" min="1" max="10" value="3" />

    <label>Delay (ms)</label>
    <input id="follow-delay" type="number" min="100" value="500" />

    <div class="buttons">
      <button id="follow-start">Iniciar</button>
      <button id="follow-stop">Parar</button>
    </div>

    <div id="follow-status">Status: Desligado</div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #follow-ui-demo{
      position:fixed;
      top:120px;
      right:20px;
      width:260px;
      background:#1e1e1e;
      color:#fff;
      border:1px solid #555;
      border-radius:8px;
      padding:10px;
      z-index:999999;
      font-family:Arial,sans-serif;
      box-shadow:0 0 12px rgba(0,0,0,.5);
    }

    #follow-header{
      font-weight:bold;
      margin-bottom:10px;
      text-align:center;
      cursor:move;
    }

    #follow-ui-demo label{
      display:block;
      margin-top:8px;
      font-size:12px;
    }

    #follow-ui-demo input{
      width:100%;
      box-sizing:border-box;
      margin-top:3px;
      padding:6px;
    }

    .buttons{
      display:flex;
      gap:6px;
      margin-top:12px;
    }

    .buttons button{
      flex:1;
      padding:6px;
      cursor:pointer;
    }

    #follow-status{
      margin-top:10px;
      font-size:12px;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(panel);

  const cfg = JSON.parse(
    localStorage.getItem("follow-ui-demo-config") || "{}"
  );

  if (cfg.name) document.getElementById("follow-name").value = cfg.name;
  if (cfg.distance) document.getElementById("follow-distance").value = cfg.distance;
  if (cfg.delay) document.getElementById("follow-delay").value = cfg.delay;

  function save() {
    localStorage.setItem(
      "follow-ui-demo-config",
      JSON.stringify({
        name: document.getElementById("follow-name").value,
        distance: document.getElementById("follow-distance").value,
        delay: document.getElementById("follow-delay").value
      })
    );
  }

  document
    .querySelectorAll("#follow-ui-demo input")
    .forEach(el => el.addEventListener("change", save));

  document.getElementById("follow-start").onclick = () => {
    save();
    document.getElementById("follow-status").textContent =
      "Status: Ligado";
  };

  document.getElementById("follow-stop").onclick = () => {
    document.getElementById("follow-status").textContent =
      "Status: Desligado";
  };

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const header = document.getElementById("follow-header");

  header.addEventListener("mousedown", e => {
    dragging = true;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    panel.style.left = `${e.clientX - offsetX}px`;
    panel.style.top = `${e.clientY - offsetY}px`;
    panel.style.right = "auto";
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });
})();