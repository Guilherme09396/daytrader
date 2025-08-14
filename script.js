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

const importCSVInput = document.getElementById("importCSV");


let chartProfit, chartWDL, chartShift;
let dbInstance;
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
  dataInput.value = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}-${String(agora.getDate()).padStart(2,'0')}`;
  horaInput.value = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;
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
  if(!user){
    window.location.href = 'login.html';
  } else {
    carregarOperacoesFirebase();
  }
});

function salvarOperacao(op) {
  const user = auth.currentUser;
  if (!user) return alert("Faça login primeiro");
  
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

    if (periodo === "7" && ((agora - dataOp)/(1000*60*60*24))>7) return false;
    if (periodo === "30" && ((agora - dataOp)/(1000*60*60*24))>30) return false;
    if (periodo === "hoje" && dataOp.toDateString() !== agora.toDateString()) return false;
    if (periodo === "mes" && (dataOp.getMonth()!==agora.getMonth() || dataOp.getFullYear()!==agora.getFullYear())) return false;
    if (periodo==="custom"){
      const inicio = dataInicioInput.value ? new Date(dataInicioInput.value) : null;
      const fim = dataFimInput.value ? new Date(dataFimInput.value) : null;
      if (inicio && dataOp<inicio) return false;
      if (fim && dataOp>fim) return false;
    }

    const horaNum = parseInt(op.hora.split(":")[0]);
    if (filtroTurno.value==="manha" && (horaNum<6 || horaNum>=12)) return false;
    if (filtroTurno.value==="tarde" && (horaNum<12 || horaNum>=18)) return false;
    if (filtroTurno.value==="noite" && (horaNum<18 || horaNum>=24)) return false;
    if (filtroTurno.value==="madrugada" && (horaNum<0 || horaNum>=6)) return false;
    if (filtroStatus.value!=="all" && op.status!==filtroStatus.value) return false;

    const search = inputFilter.value.toLowerCase();
    if (search){
      const turno = horaNum<6?"madrugada":horaNum<12?"manha":horaNum<18?"tarde":"noite";
      if (!(op.valor.toString().includes(search) || (op.ativo && op.ativo.toLowerCase().includes(search)) || (op.obs && op.obs.toLowerCase().includes(search)) || turno.includes(search)))
        return false;
    }
    return true;
  });
}

// ========================
// TABELA
// ========================
function renderTable(){
  const tbody = document.querySelector("#opsTable tbody");
  tbody.innerHTML = "";
  const ops = applyFilters();
  ops.forEach(op=>{
    const corStatus = op.status.toLowerCase() == 'derrota' ? 'red' : 'green'
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${op.data}</td>
      <td>${op.hora}</td>
      <td>${op.ativo||""}</td>
      <td>R$ ${op.valor.toFixed(2)}</td>
      <td>${op.payout}%</td>
      <td style='color: ${corStatus}'>${op.status}</td>
      <td>R$ ${op.resultado.toFixed(2)}</td>
      <td>${op.obs||""}</td>
      <td><button class="btn ghost btn-delete">×</button></td>
    `;
    tr.querySelector(".btn-delete").addEventListener("click", ()=> deletarOperacao(op.id));
    tbody.appendChild(tr);
  });
  atualizarTudo();
}

// ========================
// ESTATÍSTICAS / GRÁFICOS
// ========================
function atualizarEstatisticas() {
  const ops = applyFilters();
  const total = ops.length;
  const lucro = ops.reduce((acc,o)=>acc+o.resultado,0);
  const wins = ops.filter(o=>o.status==="vitoria").length;
  const avg = total ? ops.reduce((acc,o)=>acc+o.valor,0)/total : 0;

  statProfit.textContent = `R$ ${lucro.toFixed(2)}`;
  statWinrate.textContent = total?`${((wins/total)*100).toFixed(1)}%`:"0%";
  statTotal.textContent = total;
  statAvg.textContent = `R$ ${avg.toFixed(2)}`;
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

  if(chartProfit) chartProfit.destroy();
  chartProfit = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Lucro por dia", data, backgroundColor: "#4ade80" }]
    },
    options: { responsive:true, plugins:{legend:{display:false}} }
  });
}
function atualizarGraficoWDL() {
  const ctx = document.getElementById("chart-wdl").getContext("2d");
  const ops = applyFilters();
  const wins = ops.filter(o=>o.status==="vitoria").length;
  const losses = ops.filter(o=>o.status==="derrota").length;
  const draws = ops.filter(o=>o.status==="empate").length;

  if(chartWDL) chartWDL.destroy();
  chartWDL = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Vitórias", "Derrotas", "Empates"],
      datasets:[{
        data: [wins, losses, draws],
        backgroundColor: ["#4ade80","#f87171","#facc15"]
      }]
    },
    options: { responsive:true }
  });
}

function atualizarGraficoTurno() {
  const ctx = document.getElementById("chart-shift").getContext("2d");
  const ops = applyFilters();
  const turnos = { madrugada:0, manha:0, tarde:0, noite:0 };

  ops.forEach(op => {
    const h = parseInt(op.hora.split(":")[0]);
    if(h<6) turnos.madrugada += op.resultado;
    else if(h<12) turnos.manha += op.resultado;
    else if(h<18) turnos.tarde += op.resultado;
    else turnos.noite += op.resultado;
  });

  if(chartShift) chartShift.destroy();
  chartShift = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Madrugada","Manhã","Tarde","Noite"],
      datasets:[{
        label: "Lucro por turno",
        data: Object.values(turnos),
        backgroundColor: "#60a5fa"
      }]
    },
    options: { responsive:true, plugins:{legend:{display:false}} }
  });
}

function atualizarTudo(){
  atualizarEstatisticas();
  atualizarGraficoLucro();
  atualizarGraficoWDL();
  atualizarGraficoTurno();
}

// ========================
// CARREGAR OPERAÇÕES
// ========================
function carregarOperacoes() {
  if(!dbInstance) return;
  const tx = dbInstance.transaction("operations","readonly");
  const store = tx.objectStore("operations");
  store.getAll().onsuccess = e=>{
    operations = e.target.result || [];
    renderTable();
  };
}

function carregarOperacoesFirebase(){
  const user = auth.currentUser;
  if(!user) return;
  db.collection("operations").where("userId","==",user.uid).orderBy("createdAt","desc").get()
    .then(snapshot=>{
      operations = snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));
      renderTable();
    });
}

// ========================
// EXPORT CSV
// ========================
function exportCSV(filtered=false){
  let csv="Data,Hora,Ativo,Valor,Payout,Status,Resultado,Obs\n";
  const ops = filtered ? applyFilters() : operations;
  ops.forEach(op=>{
    csv+=`${op.data},${op.hora},${op.ativo||""},${op.valor},${op.payout},${op.status},${op.resultado.toFixed(2)},${op.obs||""}\n`;
  });
  const blob = new Blob([csv],{type:"text/csv"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filtered ? "operacoes_filtradas.csv":"operacoes.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

// ========================
// EVENTOS
// ========================
form.addEventListener("submit", e=>{
  e.preventDefault();
  const valor=parseFloat(valorInput.value);
  const payout=parseFloat(payoutInput.value);
  const status=statusInput.value;
  const data=dataInput.value;
  const hora=horaInput.value;
  const ativo=assetInput.value;
  const obs=obsInput.value;
  const resultado=calcularResultado(valor,payout,status);
  salvarOperacao({valor,payout,status,data,hora,ativo,obs,resultado});
  resetForm();
});

document.getElementById("resetForm").addEventListener("click",resetForm);
document.getElementById("applyFilter").addEventListener("click",renderTable);
document.getElementById("resetFilter").addEventListener("click",()=>{
  filtroPeriodoSelect.value="30";
  filtroTurno.value="all";
  filtroStatus.value="all";
  inputFilter.value="";
  dataInicioInput.value="";
  dataFimInput.value="";
  renderTable();
});

exportAllBtn.addEventListener("click",()=>exportCSV(false));
exportFilteredBtn.addEventListener("click",()=>exportCSV(true));

document.getElementById("clearAll").addEventListener("click", ()=>{
  if(confirm("Tem certeza que deseja apagar TODAS as operações?")){
    const tx = dbInstance.transaction("operations","readwrite");
    tx.objectStore("operations").clear().onsuccess=()=>carregarOperacoes();
  }
});

document.getElementById("logoutBtn").addEventListener("click", ()=>{
  auth.signOut().then(()=>{
    window.location.href='login.html';
  });
});

// ========================
// INICIALIZAÇÃO
// ========================
window.addEventListener("DOMContentLoaded",()=>{
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
  // Pula o cabeçalho
  for (let i = 1; i < lines.length; i++) {
    const [data, hora, ativo, valor, payout, status, resultado, obs] = lines[i].split(",");

    if(!data || !hora || !valor || !payout || !status) continue;

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

    // Salva no Firebase
    salvarOperacao(op);

    // Salva no IndexedDB local
    if(dbInstance){
      const tx = dbInstance.transaction("operations","readwrite");
      tx.objectStore("operations").add(op);
    }
  }

  importCSVInput.value = ""; // limpa input
  carregarOperacoes();
  alert("CSV importado com sucesso!");
});
