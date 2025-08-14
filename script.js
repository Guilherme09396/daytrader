// === Elementos DOM ===
const form = document.getElementById("entryForm");
const valorInput = document.getElementById("valor");
const payoutInput = document.getElementById("payout");
const statusInput = document.getElementById("status");
const dataInput = document.getElementById("data");
const horaInput = document.getElementById("hora");
const assetInput = document.getElementById("asset");
const obsInput = document.getElementById("obs");

const filtroDataInicio = document.getElementById("filtro-data-inicio");
const filtroDataFim = document.getElementById("filtro-data-fim");
const filtroPeriodo = document.getElementById("filtro-periodo");
const filtroTurno = document.getElementById("filtro-turno");
const filtroStatus = document.getElementById("filtro-status");
const inputFilter = document.getElementById("inputFilter");

const exportAllBtn = document.getElementById("exportAll");
const exportFilteredBtn = document.getElementById("exportFiltered");

const statProfit = document.getElementById("stat-profit");
const statWinrate = document.getElementById("stat-winrate");
const statTotal = document.getElementById("stat-total");
const statAvg = document.getElementById("stat-avg");

let chartProfit, chartWDL, chartShift;
let dbInstance;
let operations = [];

// === Funções utilitárias ===
function calcularResultado(valor, payout, status){
  if(status==="vitoria") return (valor*payout)/100;
  if(status==="derrota") return -valor;
  return 0;
}

function preencherDataHora(){
  const agora = new Date();
  const fuso = new Date(agora.getTime() - (agora.getTimezoneOffset()*60000));
  dataInput.value = fuso.toISOString().split("T")[0];
  horaInput.value = fuso.toTimeString().slice(0,5);
}

function resetForm(){
  valorInput.value = 5;
  payoutInput.value = 87;
  statusInput.value = "vitoria";
  assetInput.value = "";
  obsInput.value = "";
  preencherDataHora();
}

// === IndexedDB ===
function initDB(){
  const request = indexedDB.open("DayTardeDB",1);

  request.onupgradeneeded = function(event){
    const db = event.target.result;
    if(!db.objectStoreNames.contains("operations")){
      db.createObjectStore("operations",{keyPath:"id",autoIncrement:true});
    }
  };

  request.onsuccess = function(event){
    dbInstance = event.target.result;
    carregarOperacoes();
  };

  request.onerror = function(event){
    console.error("Erro IndexedDB:",event.target.error);
  };
}

function salvarOperacao(op){
  const tx = dbInstance.transaction("operations","readwrite");
  const store = tx.objectStore("operations");
  store.add(op);

  tx.oncomplete = function(){
    carregarOperacoes();
  };

  tx.onerror = function(event){
    console.error("Erro ao salvar operação:",event.target.error);
  };
}

function deletarOperacao(id){
  const tx = dbInstance.transaction("operations","readwrite");
  const store = tx.objectStore("operations");
  store.delete(id);

  tx.oncomplete = function(){
    carregarOperacoes();
  };
}

// === Filtros ===
function applyFilters(){
  return operations.filter(op=>{
    const dataOp = new Date(`${op.data}T${op.hora}`);
    const agora = new Date();

    // Filtro por intervalo de datas
    if(filtroDataInicio.value && dataOp < new Date(filtroDataInicio.value)) return false;
    if(filtroDataFim.value && dataOp > new Date(filtroDataFim.value + "T23:59:59")) return false;

    // Período
    if(filtroPeriodo.value==="7" && ((agora - dataOp)/(1000*60*60*24))>7) return false;
    if(filtroPeriodo.value==="30" && ((agora - dataOp)/(1000*60*60*24))>30) return false;
    if(filtroPeriodo.value==="hoje" && dataOp.toDateString()!==agora.toDateString()) return false;
    if(filtroPeriodo.value==="mes" && (dataOp.getMonth()!==agora.getMonth() || dataOp.getFullYear()!==agora.getFullYear())) return false;

    // Turno
    const horaNum = parseInt(op.hora.split(":")[0]);
    if(filtroTurno.value==="manha" && (horaNum<6 || horaNum>=12)) return false;
    if(filtroTurno.value==="tarde" && (horaNum<12 || horaNum>=18)) return false;
    if(filtroTurno.value==="noite" && (horaNum<18 || horaNum>=24)) return false;
    if(filtroTurno.value==="madrugada" && (horaNum<0 || horaNum>=6)) return false;

    // Status
    if(filtroStatus.value!=="all" && op.status!==filtroStatus.value) return false;

    // Input search (valor, ativo, obs, turno)
    const search = inputFilter.value.toLowerCase();
    if(search){
      const turno = horaNum<6?"madrugada":horaNum<12?"manha":horaNum<18?"tarde":"noite";
      const match = op.valor.toString().includes(search) ||
                    (op.ativo && op.ativo.toLowerCase().includes(search)) ||
                    (op.obs && op.obs.toLowerCase().includes(search)) ||
                    turno.includes(search);
      if(!match) return false;
    }

    return true;
  });
}

// === Render tabela ===
function renderTable(){
  const tbody = document.querySelector("#opsTable tbody");
  tbody.innerHTML="";

  const ops = applyFilters();

  ops.forEach(op=>{
    const tr = document.createElement("tr");
    tr.innerHTML=`
      <td>${op.data}</td>
      <td>${op.hora}</td>
      <td>${op.ativo||""}</td>
      <td>R$ ${op.valor.toFixed(2)}</td>
      <td>${op.payout}%</td>
      <td>${op.status}</td>
      <td>R$ ${op.resultado.toFixed(2)}</td>
      <td>${op.obs||""}</td>
      <td><button class="btn ghost btn-delete">×</button></td>
    `;
    tr.querySelector(".btn-delete").addEventListener("click",()=>deletarOperacao(op.id));
    tbody.appendChild(tr);
  });

  atualizarTudo();
}

// === Estatísticas e gráficos ===
function atualizarEstatisticas(){
  const ops = applyFilters();
  const total = ops.length;
  const lucro = ops.reduce((acc,o)=>acc+o.resultado,0);
  const wins = ops.filter(o=>o.status==="vitoria").length;
  const avg = total?ops.reduce((acc,o)=>acc+o.valor,0)/total:0;

  statProfit.textContent = `R$ ${lucro.toFixed(2)}`;
  statWinrate.textContent = total?`${((wins/total)*100).toFixed(1)}%`:"0%";
  statTotal.textContent = total;
  statAvg.textContent = `R$ ${avg.toFixed(2)}`;
}

function atualizarGraficoLucro(){
  const ops = applyFilters();
  const lucroPorDia = {};
  ops.forEach(op=>{
    if(!lucroPorDia[op.data]) lucroPorDia[op.data]=0;
    lucroPorDia[op.data]+=op.resultado;
  });
  const labels=Object.keys(lucroPorDia).sort();
  const data=labels.map(d=>lucroPorDia[d]);

  if(chartProfit) chartProfit.destroy();
  chartProfit = new Chart(document.getElementById("chart-profit"),{
    type:"bar",
    data:{labels,datasets:[{label:"Lucro/Prejuízo (R$)",data,backgroundColor:data.map(v=>v>=0?"#2ecc71":"#e74c3c")}]},
    options:{responsive:true,scales:{y:{beginAtZero:false}}}
  });
}

function atualizarGraficoWDL(){
  const ops = applyFilters();
  const resumo={};
  ops.forEach(op=>{
    if(!resumo[op.data]) resumo[op.data]={vitoria:0,derrota:0};
    if(op.status==="vitoria") resumo[op.data].vitoria++;
    if(op.status==="derrota") resumo[op.data].derrota++;
  });

  const labels=Object.keys(resumo).sort();
  const vitorias=labels.map(d=>resumo[d].vitoria);
  const derrotas=labels.map(d=>resumo[d].derrota);

  if(chartWDL) chartWDL.destroy();
  chartWDL = new Chart(document.getElementById("chart-wdl"),{
    type:"bar",
    data:{labels,datasets:[
      {label:"Vitórias",data:vitorias,backgroundColor:"#2ecc71"},
      {label:"Derrotas",data:derrotas,backgroundColor:"#e74c3c"}
    ]},
    options:{responsive:true,scales:{y:{beginAtZero:true}}}
  });
}

function atualizarGraficoTurno(){
  const ops = applyFilters();
  const turnos={manha:{v:0,d:0,lucro:0},tarde:{v:0,d:0,lucro:0},noite:{v:0,d:0,lucro:0},madrugada:{v:0,d:0,lucro:0}};
  ops.forEach(op=>{
    const hora = parseInt(op.hora.split(":")[0]);
    const turno = hora<6?"madrugada":hora<12?"manha":hora<18?"tarde":"noite";
    if(op.status==="vitoria") turnos[turno].v++;
    if(op.status==="derrota") turnos[turno].d++;
    turnos[turno].lucro+=op.resultado;
  });

  const labelsKeys=[
    {label:"Madrugada",key:"madrugada"},
    {label:"Manhã",key:"manha"},
    {label:"Tarde",key:"tarde"},
    {label:"Noite",key:"noite"}
  ];
  const labels=labelsKeys.map(lk=>lk.label);
  const vitorias=labelsKeys.map(lk=>turnos[lk.key].v);
  const derrotas=labelsKeys.map(lk=>turnos[lk.key].d);
  const lucros=labelsKeys.map(lk=>turnos[lk.key].lucro.toFixed(2));

  if(chartShift) chartShift.destroy();
  chartShift = new Chart(document.getElementById("chart-shift"),{
    type:"bar",
    data:{labels,datasets:[
      {label:"Vitórias",data:vitorias,backgroundColor:"#3498db"},
      {label:"Derrotas",data:derrotas,backgroundColor:"#e67e22"},
      {label:"Lucro (R$)",data:lucros,backgroundColor:"#2ecc71"}
    ]},
    options:{responsive:true,scales:{y:{beginAtZero:true}}}
  });
}

function atualizarTudo(){
  atualizarEstatisticas();
  atualizarGraficoLucro();
  atualizarGraficoWDL();
  atualizarGraficoTurno();
}

// === Carregar operações ===
function carregarOperacoes(){
  const tx = dbInstance.transaction("operations","readonly");
  const store = tx.objectStore("operations");
  const getAll = store.getAll();

  getAll.onsuccess = function(){
    operations = getAll.result || [];
    renderTable();
    atualizarTudo();
  };
}

// === Export CSV ===
function exportCSV(filtered=false){
  let csv="Data,Hora,Ativo,Valor,Payout,Status,Resultado,Obs\n";
  const ops = filtered?applyFilters():operations;
  ops.forEach(op=>{
    csv+=`${op.data},${op.hora},${op.ativo||""},${op.valor},${op.payout},${op.status},${op.resultado.toFixed(2)},${op.obs||""}\n`;
  });

  const blob = new Blob([csv],{type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filtered?"operacoes_filtradas.csv":"operacoes.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// === Eventos ===
form.addEventListener("submit",e=>{
  e.preventDefault();
  const valor=parseFloat(valorInput.value);
  const payout=parseFloat(payoutInput.value);
  const status=statusInput.value;
  const data=dataInput.value;
  const hora=horaInput.value;
  const ativo=assetInput.value;
  const obs=obsInput.value;
  const resultado = calcularResultado(valor,payout,status);

  salvarOperacao({valor,payout,status,data,hora,ativo,obs,resultado});
  resetForm();
});

document.getElementById("resetForm").addEventListener("click",resetForm);
document.getElementById("applyFilter").addEventListener("click",renderTable);
document.getElementById("resetFilter").addEventListener("click",()=>{
  filtroDataInicio.value="";
  filtroDataFim.value="";
  filtroPeriodo.value="30";
  filtroTurno.value="all";
  filtroStatus.value="all";
  inputFilter.value="";
  renderTable();
});
exportAllBtn.addEventListener("click",()=>exportCSV(false));
exportFilteredBtn.addEventListener("click",()=>exportCSV(true));

document.getElementById("importCSV").addEventListener("change", function(e){
  const file = e.target.files[0];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = function(ev){
    const text = ev.target.result;
    const lines = text.split("\n").slice(1); // ignora cabeçalho
    lines.forEach(line=>{
      if(!line.trim()) return;
      const [data, hora, ativo, valor, payout, status, resultado, obs] = line.split(",");
      salvarOperacao({
        data: data.trim(),
        hora: hora.trim(),
        ativo: ativo.trim(),
        valor: parseFloat(valor),
        payout: parseFloat(payout),
        status: status.trim(),
        resultado: parseFloat(resultado),
        obs: obs ? obs.trim() : ""
      });
    });
    e.target.value=""; // limpa input após importar
  };
  reader.readAsText(file);
});

// Inicialização
window.addEventListener("DOMContentLoaded",()=>{
  initDB();
  preencherDataHora();
});