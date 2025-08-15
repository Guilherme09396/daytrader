// ========================
// ELEMENTOS DOM
// ========================
const form = document.getElementById("entryForm");
const valorInput = document.getElementById("valor");
const payoutInput = document.getElementById("payout");
const statusInput = document.getElementById("status");
const dataInput = document.getElementById("data");
const horaInput = document.getElementById("hora");
const assetInput = document.getElementById("asset");
const obsInput = document.getElementById("obs");

const filtroPeriodoSelect = document.getElementById("filtro-periodo");
const dataInicioInput = document.getElementById("dataInicio");
const dataFimInput = document.getElementById("dataFim");
const customDateInputs = document.getElementById("customDateInputs");
const filtroTurno = document.getElementById("filtro-turno");
const filtroStatus = document.getElementById("filtro-status");
const inputFilter = document.getElementById("inputFilter");

const exportAllBtn = document.getElementById("exportAll");
const exportFilteredBtn = document.getElementById("exportFiltered");

const statProfit = document.getElementById("stat-profit");
const statWinrate = document.getElementById("stat-winrate");
const statTotal = document.getElementById("stat-total");
const statAvg = document.getElementById("stat-avg");
const initialBank = document.getElementById("initial-bank");
const stopWin = document.getElementById("stop-win");

const importCSVInput = document.getElementById("importCSV");

const salvarBancaBtn = document.getElementById("salvarBancaBtn");
const bancaInicialInput = document.getElementById("bancaInicial");
const metaDiariaInput = document.getElementById("metaDiaria");

let bancaInicialMesInformada = false

let chartProfit, chartWDL, chartShift;
let dbInstance;
let currentPage = 1;
const rowsPerPage = 10; // você pode alterar o número de linhas por página
let operations = [];

// ========================
// UTILITÁRIOS
// ========================
function calcularResultado(valor, payout, status) {
  if (status === "vitoria") return (valor * payout) / 100;
  if (status === "derrota") return -valor;
  return 0;
}

function preencherDataHora() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  const hora = String(agora.getHours()).padStart(2, '0');
  const min = String(agora.getMinutes()).padStart(2, '0');

  dataInput.value = `${ano}-${mes}-${dia}`;
  horaInput.value = `${hora}:${min}`;
}


function resetForm() {
  valorInput.value = 5;
  payoutInput.value = 87;
  statusInput.value = "vitoria";
  assetInput.value = "";
  obsInput.value = "";
  preencherDataHora();
}

// ========================
// INDEXEDDB
// ========================
function initDB() {
  const request = indexedDB.open("DayTardeDB", 1);
  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains("operations")) {
      db.createObjectStore("operations", { keyPath: "id", autoIncrement: true });
    }
  };
  request.onsuccess = (event) => {
    dbInstance = event.target.result;
    carregarOperacoes();
    pegarDadosBanca();
  };
  request.onerror = (event) => console.error("Erro IndexedDB:", event.target.error);
}

// ========================
// FIREBASE
// ========================
const auth = firebase.auth();
const db = firebase.firestore();

// Só permite acesso se usuário estiver logado
auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = 'login.html';
  } else {
    carregarOperacoesFirebase();
  }
});

function salvarOperacao(op) {
  const user = auth.currentUser;
  if (!user) return alert("Faça login primeiro");
  if (!bancaInicialMesInformada) return alert("É necessário informa a banca inicial para poder cadastrar!")

  db.collection("operations").add({
    ...op,
    userId: user.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => carregarOperacoesFirebase())
    .catch(err => console.error(err));
}

function deletarOperacao(id) {
  db.collection("operations").doc(id).delete()
    .then(() => carregarOperacoesFirebase())
    .catch(err => console.error(err));
}

// ========================
// FILTROS
// ========================
filtroPeriodoSelect.addEventListener("change", () => {
  customDateInputs.style.display = filtroPeriodoSelect.value === "custom" ? "block" : "none";
});

function applyFilters() {
  return operations.filter(op => {
    const dataOp = new Date(`${op.data}T${op.hora}`);
    const agora = new Date();
    const periodo = filtroPeriodoSelect.value;

    if (periodo === "7" && ((agora - dataOp) / (1000 * 60 * 60 * 24)) > 7) return false;
    if (periodo === "30" && ((agora - dataOp) / (1000 * 60 * 60 * 24)) > 30) return false;
    if (periodo === "hoje" && dataOp.toDateString() !== agora.toDateString()) return false;
    if (periodo === "mes" && (dataOp.getMonth() !== agora.getMonth() || dataOp.getFullYear() !== agora.getFullYear())) return false;
    if (periodo === "custom") {
      const inicio = dataInicioInput.value ? new Date(dataInicioInput.value + "T00:00:00") : null;
      const fim = dataFimInput.value ? new Date(dataFimInput.value + "T23:59:59") : null;
      if (inicio && dataOp < inicio) return false;
      if (fim && dataOp > fim) return false;
    }

    const horaNum = parseInt(op.hora.split(":")[0]);
    if (filtroTurno.value === "manha" && (horaNum < 6 || horaNum >= 12)) return false;
    if (filtroTurno.value === "tarde" && (horaNum < 12 || horaNum >= 18)) return false;
    if (filtroTurno.value === "noite" && (horaNum < 18 || horaNum >= 24)) return false;
    if (filtroTurno.value === "madrugada" && (horaNum < 0 || horaNum >= 6)) return false;
    if (filtroStatus.value !== "all" && op.status !== filtroStatus.value) return false;

    const search = inputFilter.value.toLowerCase();
    if (search) {
      const turno = horaNum < 6 ? "madrugada" : horaNum < 12 ? "manha" : horaNum < 18 ? "tarde" : "noite";
      if (!(op.valor.toString().includes(search) ||
        (op.ativo && op.ativo.toLowerCase().includes(search)) ||
        (op.obs && op.obs.toLowerCase().includes(search)) ||
        turno.includes(search)))
        return false;
    }

    return true;
  });
}

// ========================
// TABELA
// ========================
function renderTable() {
  pegarDadosBanca()
  const tbody = document.querySelector("#opsTable tbody");
  tbody.innerHTML = "";

  const ops = applyFilters().sort((a, b) => new Date(b.data + "T" + b.hora) - new Date(a.data + "T" + a.hora));

  const totalPages = Math.ceil(ops.length / rowsPerPage);
  if (currentPage > totalPages) currentPage = totalPages || 1;

  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const pagedOps = ops.slice(start, end);

  pagedOps.forEach(op => {
    const cores = {
      derrota: 'red',
      vitoria: 'green',
      empate: 'yellow'
    }
    let corStatus = cores[op.status.toLowerCase()]

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${op.data}</td>
      <td>${op.hora}</td>
      <td>${op.ativo || ""}</td>
      <td>R$ ${op.valor.toFixed(2)}</td>
      <td>${op.payout}%</td>
      <td style='color: ${corStatus}'>${op.status}</td>
      <td>R$ ${op.resultado.toFixed(2)}</td>
      <td>${op.obs || ""}</td>
      <td><button class="btn ghost btn-delete">×</button></td>
    `;
    tr.querySelector(".btn-delete").addEventListener("click", () => deletarOperacao(op.id));
    tbody.appendChild(tr);
  });

  renderPagination(totalPages);
  atualizarTudo();
}

function renderPagination(totalPages) {
  const container = document.getElementById("pagination");
  if (!container) return;
  container.innerHTML = "";

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = i === currentPage ? "active" : "";
    btn.addEventListener("click", () => {
      currentPage = i;
      renderTable();
    });
    container.appendChild(btn);
  }
}


// ========================
// ESTATÍSTICAS / GRÁFICOS
// ========================
function atualizarEstatisticas() {
  const ops = applyFilters();
  const total = ops.length;
  const lucro = ops.reduce((acc, o) => acc + o.resultado, 0);
  const wins = ops.filter(o => o.status === "vitoria").length;
  const avg = total ? ops.reduce((acc, o) => acc + o.valor, 0) / total : 0;

  statProfit.textContent = `R$ ${lucro.toFixed(2)}`;
  statWinrate.textContent = total ? `${((wins / total) * 100).toFixed(1)}%` : "0%";
  statTotal.textContent = total;
  statAvg.textContent = `R$ ${avg.toFixed(2)}`;
}

// function formatacaoDataPegarBanca() {
//   const dataAtual = new Date()
//   let mes = dataAtual.getMonth() + 1
//   mes = mes < 10 ? `0${mes}` : mes
//   const ano = dataAtual.getFullYear()
//   const formatacao = `${ano}-${mes}`
//   return formatacao
// }

function pegarDadosBanca() {
  const formatacao = new Date().toISOString().slice(0, 7);

  const user = auth.currentUser;
  if (!user) return;
  db.collection("bancas").where("userId", "==", user.uid).where("mes", "==", formatacao).get()
    .then(snapshot => {
      const snap = snapshot.docs[0]
      if (typeof (snap) == 'undefined') {
        alert("banca ainda não informada\ninforme para poder cadastrar as operações!")
        return
      }

      const doc = snap.data()
      const bancaInicial = parseFloat(doc.bancaInicial).toFixed(2)

      initialBank.innerText = `R$ ${bancaInicial}`
      stopWin.innerText = `R$ ${doc.valorMetaDiaria}`
    });
}

function atualizarGraficoLucro() {
  const ctx = document.getElementById("chart-profit").getContext("2d");
  const ops = applyFilters();
  const lucroPorDia = {};

  ops.forEach(op => {
    if (!lucroPorDia[op.data]) lucroPorDia[op.data] = 0;
    lucroPorDia[op.data] += op.resultado;
  });

  const labels = Object.keys(lucroPorDia).sort();
  const data = labels.map(d => lucroPorDia[d]);

  if (chartProfit) chartProfit.destroy();
  chartProfit = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Lucro por dia", data, backgroundColor: "#4ade80" }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}
function atualizarGraficoWDL() {
  const ctx = document.getElementById("chart-wdl").getContext("2d");
  const ops = applyFilters();
  const wins = ops.filter(o => o.status === "vitoria").length;
  const losses = ops.filter(o => o.status === "derrota").length;
  const draws = ops.filter(o => o.status === "empate").length;

  if (chartWDL) chartWDL.destroy();
  chartWDL = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Vitórias", "Derrotas", "Empates"],
      datasets: [{
        data: [wins, losses, draws],
        backgroundColor: ["#4ade80", "#f87171", "#facc15"]
      }]
    },
    options: { responsive: true }
  });
}

function atualizarGraficoTurno() {
  const ctx = document.getElementById("chart-shift").getContext("2d");
  const ops = applyFilters();
  const turnos = { madrugada: 0, manha: 0, tarde: 0, noite: 0 };

  ops.forEach(op => {
    const h = parseInt(op.hora.split(":")[0]);
    if (h < 6) turnos.madrugada += op.resultado;
    else if (h < 12) turnos.manha += op.resultado;
    else if (h < 18) turnos.tarde += op.resultado;
    else turnos.noite += op.resultado;
  });

  if (chartShift) chartShift.destroy();
  chartShift = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Madrugada", "Manhã", "Tarde", "Noite"],
      datasets: [{
        label: "Lucro por turno",
        data: Object.values(turnos),
        backgroundColor: "#60a5fa"
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}

function atualizarGraficoMeta() {
  const ctx = document.getElementById("chart-meta").getContext("2d");
  const ops = applyFilters();

  const lucroPorDia = {};

  ops.forEach(op => {
    if (!lucroPorDia[op.data]) lucroPorDia[op.data] = 0;
    lucroPorDia[op.data] += op.resultado;
  });

  const dias = Object.keys(lucroPorDia).sort();
  const lucros = dias.map(d => Number(lucroPorDia[d].toFixed(2)));

  // Pegando meta do elemento DOM
  const metaTexto = stopWin.textContent.replace("R$ ", "").replace(",", ".");
  const metaDiaria = parseFloat(metaTexto) || 50;

  if (window.chartMeta) window.chartMeta.destroy();

  window.chartMeta = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dias,
      datasets: [
        {
          label: 'Lucro do Dia',
          data: lucros,
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96, 165, 250, 0.2)',
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointBackgroundColor: '#60a5fa',
        },
        {
          label: 'Meta Diária',
          data: Array(dias.length).fill(metaDiaria),
          borderColor: '#f87171',
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      },
      plugins: {
        legend: {
          labels: {
            color: '#e6f0f6'
          }
        }
      }
    }
  });
}


function atualizarTudo() {
  atualizarEstatisticas();
  atualizarGraficoLucro();
  atualizarGraficoWDL();
  atualizarGraficoTurno();
  atualizarGraficoMeta();
}

// ========================
// CARREGAR OPERAÇÕES
// ========================
function carregarOperacoes() {
  if (!dbInstance) return;
  const tx = dbInstance.transaction("operations", "readonly");
  const store = tx.objectStore("operations");
  store.getAll().onsuccess = e => {
    operations = e.target.result || [];
    renderTable();
  };
}

function carregarOperacoesFirebase() {
  const user = auth.currentUser;
  if (!user) return;
  db.collection("operations").where("userId", "==", user.uid).orderBy("createdAt", "desc").get()
    .then(snapshot => {
      operations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderTable();
    });
}

// ========================
// EXPORT CSV
// ========================
function exportCSV(filtered = false) {
  let csv = "Data,Hora,Ativo,Valor,Payout,Status,Resultado,Obs\n";
  const ops = filtered ? applyFilters() : operations;
  ops.forEach(op => {
    csv += `${op.data},${op.hora},${op.ativo || ""},${op.valor},${op.payout},${op.status},${op.resultado.toFixed(2)},${op.obs || ""}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filtered ? "operacoes_filtradas.csv" : "operacoes.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

// ========================
// EVENTOS
// ========================
form.addEventListener("submit", e => {
  e.preventDefault();
  const valor = parseFloat(valorInput.value);
  const payout = parseFloat(payoutInput.value);
  const status = statusInput.value;
  const data = dataInput.value;
  const hora = horaInput.value;
  const ativo = assetInput.value;
  const obs = obsInput.value;
  const resultado = calcularResultado(valor, payout, status);

  salvarOperacao({ valor, payout, status, data, hora, ativo, obs, resultado });
  resetForm();
});

document.getElementById("resetForm").addEventListener("click", resetForm);
document.getElementById("applyFilter").addEventListener("click", renderTable);
document.getElementById("resetFilter").addEventListener("click", () => {
  filtroPeriodoSelect.value = "30";
  filtroTurno.value = "all";
  filtroStatus.value = "all";
  inputFilter.value = "";
  dataInicioInput.value = "";
  dataFimInput.value = "";
  renderTable();
});

exportAllBtn.addEventListener("click", () => exportCSV(false));
exportFilteredBtn.addEventListener("click", () => exportCSV(true));

document.getElementById("clearAll").addEventListener("click", async () => {
  if (confirm("Tem certeza que deseja apagar TODAS as operações?")) {
    // Limpa IndexedDB
    const tx = dbInstance.transaction("operations", "readwrite");
    tx.objectStore("operations").clear().onsuccess = () => carregarOperacoes();

    // Limpa Firebase
    const user = auth.currentUser;
    if (user) {
      const snapshot = await db.collection("operations").where("userId", "==", user.uid).get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      carregarOperacoesFirebase();
    }
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  auth.signOut().then(() => {
    window.location.href = 'login.html';
  });
});

// ========================
// INICIALIZAÇÃO
// ========================
window.addEventListener("DOMContentLoaded", () => {
  initDB();
  preencherDataHora();
});


// ========================
// IMPORT CSV
// ========================
importCSVInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const lines = text.split("\n").filter(l => l.trim() !== "");

  for (let i = 1; i < lines.length; i++) {
    const [data, hora, ativo, valor, payout, status, resultado, obs] = lines[i].split(",");
    if (!data || !hora || !valor || !payout || !status) continue;

    const op = {
      data: data.trim(),
      hora: hora.trim(),
      ativo: ativo ? ativo.trim() : "",
      valor: parseFloat(valor),
      payout: parseFloat(payout),
      status: status.trim(),
      resultado: parseFloat(resultado) || calcularResultado(parseFloat(valor), parseFloat(payout), status.trim()),
      obs: obs ? obs.trim() : ""
    };

    salvarOperacao(op);

    if (dbInstance) {
      const tx = dbInstance.transaction("operations", "readwrite");
      tx.objectStore("operations").add(op);
    }
  }

  importCSVInput.value = "";
  carregarOperacoes();
  alert("CSV importado com sucesso!");
});

// Função para salvar no Firebase
salvarBancaBtn.addEventListener("click", async () => {
  const bancaInicial = parseFloat(bancaInicialInput.value);
  const metaDiaria = parseFloat(metaDiariaInput.value);

  if (!bancaInicial || !metaDiaria) {
    alert("Preencha os dois campos corretamente!");
    return;
  }

  try {
    const userId = firebase.auth().currentUser.uid; // pega o usuário logado
    const mesAtual = new Date().toISOString().slice(0, 7); // formato YYYY-MM (mês atual)
    let bancaJaCadastrada = false

    await firebase.firestore().collection("bancas").where('mes', '==', mesAtual).get().then(snapshot => {
      if (typeof (snapshot.docs[0]) != 'undefined') bancaJaCadastrada = true
    });

    if (bancaJaCadastrada) {
      alert("Banca já cadastrada")
      return
    }

    const valorMetaDiaria = (parseFloat(bancaInicial) * (metaDiaria / 100)).toFixed(2)

    await firebase.firestore().collection("bancas").add({
      mes: mesAtual,
      bancaInicial,
      metaDiaria,
      valorMetaDiaria,
      userId
    });

    bancaInicialMesInformada = true


    alert("Banca inicial salva com sucesso!");
    pegarDadosBanca();
    bancaInicialInput.value = ''
    metaDiariaInput.value = ''
  } catch (error) {
    console.error(error);
    alert("Erro ao salvar a banca.");
  }
});