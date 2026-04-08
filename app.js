import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getDatabase, ref, onValue, push, set, update, remove } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA9hxi8keOUJG_mhdD4OSN32A1jypXrXEA',
  authDomain: 'grading-dura.firebaseapp.com',
  databaseURL: 'https://grading-dura-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'grading-dura',
  storageBucket: 'grading-dura.firebasestorage.app',
  messagingSenderId: '455000354944',
  appId: '1:455000354944:web:69b96169f6174ec5a8b665',
  measurementId: 'G-9J29KM9NHC'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

const USERS = {
  staff: { email: 'staff@dura.local', role: 'staff', label: 'Staff' },
  grading: { email: 'grading@dura.local', role: 'grading', label: 'Grading' }
};
const FIXED_SUPPLIERS = [
  'CV LEMBAH HIJAU PERKASA',
  'KOPERASI KARYA MANDIRI',
  'TANI RAMPAH JAYA',
  'PT PUTRA UTAMA LESTARI',
  'PT MANUNGGAL ADI JAYA'
];
const pageMeta = {
  dashboard: ['Dashboard', 'Ringkasan operasional grading dan Tenera Dura secara realtime.'],
  grading: ['Input Grading', 'Input grading realtime ke Firebase.'],
  td: ['Input Tenera Dura', 'Input Tenera Dura realtime ke Firebase.'],
  rekapGrading: ['Rekap Grading', 'Rekap grading lengkap per transaksi.'],
  rekapTD: ['Rekap Tenera Dura', 'Rekap Tenera Dura lengkap per transaksi.'],
  rekapData: ['Rekap Data', 'Kesimpulan otomatis berdasarkan filter.'],
  sheetGrading: ['Spreadsheet Grading', 'Edit dan hapus data grading.'],
  sheetTD: ['Spreadsheet Tenera Dura', 'Edit dan hapus data Tenera Dura.'],
  performance: ['Performance', 'Ranking per supplier atau sopir.'],
  analytics: ['Analytics', 'Insight operasional dari data realtime.'],
  supplier: ['Supplier', 'Daftar supplier tetap dan supplier manual yang pernah dipakai.']
};

const state = {
  user: null,
  currentRole: 'staff',
  grading: [],
  td: [],
  selectedLoginRole: 'staff',
  boundRealtime: false,
  waContext: { kind: 'grading', detail: false }
};

const $ = (id) => document.getElementById(id);
const num = (v) => Number(v || 0);
const fixed = (v) => Number(v || 0).toFixed(2);
const pct = (v) => `${fixed(v)}%`;
const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const dt = (iso) => new Date(iso || Date.now());
const dateOnly = (iso) => dt(iso).toISOString().slice(0,10);
const localDate = (iso) => dt(iso).toLocaleDateString('id-ID');
const localTime = (iso) => dt(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

function setStatus(message = '', type = 'info') {
  const box = $('appStatus');
  if (!box) return;
  box.className = `alert ${type} ${message ? '' : 'hidden'}`.trim();
  box.textContent = message;
}

function getSupplierOptions() {
  const custom = [...new Set(state.grading.map((x) => String(x.supplier || '').trim()).filter(Boolean))];
  return [...new Set([...FIXED_SUPPLIERS, ...custom])].sort((a, b) => a.localeCompare(b));
}

function getDriverNames() {
  return [...new Set([...state.grading.map(x => x.driver), ...state.td.map(x => x.driver)].filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

function calculateGrading(data) {
  const totalBunches = num(data.totalBunches);
  const mentah = num(data.mentah), mengkal = num(data.mengkal), overripe = num(data.overripe), busuk = num(data.busuk), kosong = num(data.kosong), partheno = num(data.partheno), tikus = num(data.tikus);
  const totalCategories = mentah + mengkal + overripe + busuk + kosong + partheno + tikus;
  const masak = totalBunches - totalCategories;
  const toPct = (v) => totalBunches > 0 ? (v / totalBunches) * 100 : 0;
  const percentages = {
    masak: toPct(Math.max(masak, 0)), mentah: toPct(mentah), mengkal: toPct(mengkal), overripe: toPct(overripe),
    busuk: toPct(busuk), kosong: toPct(kosong), partheno: toPct(partheno), tikus: toPct(tikus)
  };
  const deductions = {
    dasar: 3,
    mentah: percentages.mentah * 0.5,
    mengkal: percentages.mengkal * 0.15,
    overripe: percentages.overripe > 5 ? (percentages.overripe - 5) * 0.25 : 0,
    busuk: percentages.busuk,
    kosong: percentages.kosong,
    partheno: percentages.partheno * 0.15,
    tikus: percentages.tikus * 0.15
  };
  const totalDeduction = Object.values(deductions).reduce((a, b) => a + b, 0);
  let validation = { type: 'info', message: 'Perhitungan siap disimpan.' };
  if (!data.driver || !data.plate || !data.supplier || totalBunches <= 0) validation = { type: 'warning', message: 'Lengkapi nama sopir, plat, supplier, dan total janjang.' };
  if (totalCategories > totalBunches) validation = { type: 'error', message: 'Total kategori melebihi total janjang.' };
  let status = 'BAIK', statusClass = 'ok';
  if (totalDeduction > 15) { status = 'BURUK'; statusClass = 'bad'; }
  else if (totalDeduction > 8) { status = 'PERLU PERHATIAN'; statusClass = 'warn'; }
  return { totalBunches, mentah, mengkal, overripe, busuk, kosong, partheno, tikus, masak, percentages, deductions, totalDeduction, status, statusClass, validation };
}

function calculateTD(data) {
  const tenera = num(data.tenera), dura = num(data.dura), total = tenera + dura;
  const pctTenera = total > 0 ? (tenera / total) * 100 : 0;
  const pctDura = total > 0 ? (dura / total) * 100 : 0;
  const dominant = pctTenera === pctDura ? '-' : (pctTenera > pctDura ? 'Tenera' : 'Dura');
  return { tenera, dura, total, pctTenera, pctDura, dominant };
}

function supplierStats(rows = state.grading) {
  const map = {};
  rows.forEach(r => {
    const key = r.supplier || '-';
    if (!map[key]) map[key] = { name: key, count: 0, totalJanjang: 0, masakPct: 0, totalDed: 0 };
    map[key].count += 1;
    map[key].totalJanjang += num(r.totalBunches);
    map[key].masakPct += num(r.percentages?.masak);
    map[key].totalDed += num(r.totalDeduction);
  });
  return Object.values(map).map(x => ({ ...x, avgMasak: x.count ? x.masakPct / x.count : 0, avgDed: x.count ? x.totalDed / x.count : 0 })).sort((a,b)=>a.avgDed-b.avgDed);
}

function driverStats(rows = state.grading) {
  const map = {};
  rows.forEach(r => {
    const key = r.driver || '-';
    if (!map[key]) map[key] = { name: key, count: 0, totalJanjang: 0, masakPct: 0, totalDed: 0 };
    map[key].count += 1;
    map[key].totalJanjang += num(r.totalBunches);
    map[key].masakPct += num(r.percentages?.masak);
    map[key].totalDed += num(r.totalDeduction);
  });
  return Object.values(map).map(x => ({ ...x, avgMasak: x.count ? x.masakPct / x.count : 0, avgDed: x.count ? x.totalDed / x.count : 0 })).sort((a,b)=>b.totalJanjang-a.totalJanjang);
}

function tdDriverStats(rows = state.td) {
  const map = {};
  rows.forEach(r => {
    const key = r.driver || '-';
    if (!map[key]) map[key] = { name: key, count: 0, total: 0, pctTenera: 0, pctDura: 0 };
    map[key].count += 1;
    map[key].total += num(r.total);
    map[key].pctTenera += num(r.pctTenera);
    map[key].pctDura += num(r.pctDura);
  });
  return Object.values(map).map(x => ({ ...x, avgTenera: x.count ? x.pctTenera / x.count : 0, avgDura: x.count ? x.pctDura / x.count : 0 })).sort((a,b)=>b.total-a.total);
}

function causeTotals(rows = state.grading) {
  const out = { mentah: 0, mengkal: 0, overripe: 0, busuk: 0, kosong: 0, partheno: 0, tikus: 0 };
  rows.forEach(r => Object.keys(out).forEach(k => out[k] += num(r.deductions?.[k])));
  return out;
}

function insights(rows = state.grading) {
  if (!rows.length) return ['Belum ada data grading.'];
  const avgMasak = rows.reduce((a, x) => a + num(x.percentages?.masak), 0) / rows.length;
  const avgDed = rows.reduce((a, x) => a + num(x.totalDeduction), 0) / rows.length;
  const topCause = Object.entries(causeTotals(rows)).sort((a,b)=>b[1]-a[1])[0];
  return [
    `Rata-rata % masak ${pct(avgMasak)}.`,
    `Rata-rata total potongan ${pct(avgDed)}.`,
    `Penyebab potongan terbesar: ${topCause?.[0] || '-'} (${pct(topCause?.[1] || 0)}).`
  ];
}

function fillStatic() {
  const options = getSupplierOptions();
  const supplierSelect = $('gradingSupplier');
  if (supplierSelect) supplierSelect.innerHTML = '<option value="">Pilih supplier tetap</option>' + FIXED_SUPPLIERS.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  const allOptions = '<option value="">Semua Supplier</option>' + options.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  ['rekapGradingSupplier', 'rekapDataSupplier', 'waSupplier'].forEach(id => { const el = $(id); if (el) el.innerHTML = allOptions; });
  const dl = getDriverNames().map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
  if ($('driverList')) $('driverList').innerHTML = dl;
  if ($('tdDriverList')) $('tdDriverList').innerHTML = dl;
  renderSupplierPage();
}

function applyRoleUI() {
  $('roleLabel').textContent = state.currentRole.toUpperCase();
  $('userEmail').textContent = state.user?.email || '';
  document.querySelectorAll('.staff-only,.staff-only-page').forEach(el => el.classList.toggle('hidden', state.currentRole !== 'staff'));
  if (state.currentRole !== 'staff') {
    const active = document.querySelector('.menu-item.active')?.dataset.page;
    if (['sheetGrading','sheetTD','performance','analytics','supplier'].includes(active)) switchPage('dashboard');
  }
}

function switchPage(page) {
  document.querySelectorAll('.menu-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
  $('pageTitle').textContent = pageMeta[page]?.[0] || 'Dashboard';
  $('pageSubtitle').textContent = pageMeta[page]?.[1] || '';
  $('summaryCards').classList.toggle('hidden', page !== 'dashboard');
  closeSidebarOnMobile();
}

function renderSummaryCards() {
  const totalJanjang = state.grading.reduce((a, x) => a + num(x.totalBunches), 0);
  const avgMasak = state.grading.length ? state.grading.reduce((a, x) => a + num(x.percentages?.masak), 0) / state.grading.length : 0;
  const avgDed = state.grading.length ? state.grading.reduce((a, x) => a + num(x.totalDeduction), 0) / state.grading.length : 0;
  const avgTenera = state.td.length ? state.td.reduce((a, x) => a + num(x.pctTenera), 0) / state.td.length : 0;
  $('summaryCards').innerHTML = `
    <div class="summary-card"><span class="label">Total Janjang</span><span class="value">${totalJanjang}</span><span class="sub">Akumulasi grading</span></div>
    <div class="summary-card"><span class="label">Rata-rata % Masak</span><span class="value">${pct(avgMasak)}</span><span class="sub">Fokus kematangan</span></div>
    <div class="summary-card hot"><span class="label">Rata-rata Potongan</span><span class="value">${pct(avgDed)}</span><span class="sub">Fokus utama UI</span></div>
    <div class="summary-card"><span class="label">Rata-rata % Tenera</span><span class="value">${pct(avgTenera)}</span><span class="sub">Modul Tenera Dura</span></div>`;
}

function renderDashboard() {
  $('dashGrading').innerHTML = `
    <div class="metric"><span>Transaksi</span><strong>${state.grading.length}</strong></div>
    <div class="metric"><span>Total Janjang</span><strong>${state.grading.reduce((a,x)=>a+num(x.totalBunches),0)}</strong></div>
    <div class="metric"><span>Rata-rata % Masak</span><strong>${pct(state.grading.length ? state.grading.reduce((a,x)=>a+num(x.percentages?.masak),0)/state.grading.length : 0)}</strong></div>
    <div class="metric"><span>Rata-rata Potongan</span><strong>${pct(state.grading.length ? state.grading.reduce((a,x)=>a+num(x.totalDeduction),0)/state.grading.length : 0)}</strong></div>`;
  $('dashTD').innerHTML = `
    <div class="metric"><span>Transaksi TD</span><strong>${state.td.length}</strong></div>
    <div class="metric"><span>Total TD</span><strong>${state.td.reduce((a,x)=>a+num(x.total),0)}</strong></div>
    <div class="metric"><span>Rata-rata % Tenera</span><strong>${pct(state.td.length ? state.td.reduce((a,x)=>a+num(x.pctTenera),0)/state.td.length : 0)}</strong></div>
    <div class="metric"><span>Rata-rata % Dura</span><strong>${pct(state.td.length ? state.td.reduce((a,x)=>a+num(x.pctDura),0)/state.td.length : 0)}</strong></div>`;
  $('dashInsights').innerHTML = insights().map(x => `<div class="stat"><strong>${escapeHtml(x)}</strong></div>`).join('') || '<div class="empty-state">Belum ada insight.</div>';
  $('dashSuppliers').innerHTML = supplierStats().slice(0,5).map(s => `<div class="stat"><strong>${escapeHtml(s.name)}</strong><div class="meta">${s.count} transaksi • ${s.totalJanjang} janjang • Potongan ${pct(s.avgDed)}</div><div class="bar"><div style="width:${Math.min(s.avgMasak,100)}%"></div></div></div>`).join('') || '<div class="empty-state">Belum ada data supplier.</div>';
  $('dashDrivers').innerHTML = driverStats().slice(0,5).map(s => `<div class="stat"><strong>${escapeHtml(s.name)}</strong><div class="meta">${s.count} transaksi • ${s.totalJanjang} janjang • % Masak ${pct(s.avgMasak)}</div><div class="bar"><div style="width:${Math.min(s.avgMasak,100)}%"></div></div></div>`).join('') || '<div class="empty-state">Belum ada data sopir.</div>';
}

function renderGradingLive() {
  const form = $('gradingForm');
  if (!form) return;
  const raw = Object.fromEntries(new FormData(form).entries());
  raw.supplier = resolveSupplier(raw);
  const calc = calculateGrading(raw);
  $('gradingTotalDeduction').textContent = pct(calc.totalDeduction);
  $('gradingStatus').textContent = calc.status;
  $('gradingStatus').className = `status ${calc.statusClass}`;
  $('gradingLiveCards').innerHTML = `
    <div class="metric"><span>% Masak</span><strong>${pct(calc.percentages.masak)}</strong></div>
    <div class="metric"><span>Total Janjang</span><strong>${calc.totalBunches}</strong></div>
    <div class="metric"><span>Mentah</span><strong>${pct(calc.percentages.mentah)}</strong></div>
    <div class="metric"><span>Busuk</span><strong>${pct(calc.percentages.busuk)}</strong></div>`;
  const rows = [
    ['Masak', calc.masak, calc.percentages.masak, 0],
    ['Mentah', calc.mentah, calc.percentages.mentah, calc.deductions.mentah],
    ['Mengkal', calc.mengkal, calc.percentages.mengkal, calc.deductions.mengkal],
    ['Overripe', calc.overripe, calc.percentages.overripe, calc.deductions.overripe],
    ['Busuk', calc.busuk, calc.percentages.busuk, calc.deductions.busuk],
    ['Tandan Kosong', calc.kosong, calc.percentages.kosong, calc.deductions.kosong],
    ['Parthenocarpi', calc.partheno, calc.percentages.partheno, calc.deductions.partheno],
    ['Makan Tikus', calc.tikus, calc.percentages.tikus, calc.deductions.tikus]
  ];
  $('gradingBreakdown').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${pct(r[2])}</td><td>${pct(r[3])}</td></tr>`).join('');
  $('gradingValidation').className = `alert ${calc.validation.type}`;
  $('gradingValidation').textContent = calc.validation.message;
}

function renderTDLive() {
  const form = $('tdForm');
  if (!form) return;
  const raw = Object.fromEntries(new FormData(form).entries());
  const calc = calculateTD(raw);
  $('tdTotal').textContent = calc.total;
  $('tdPctTenera').textContent = pct(calc.pctTenera);
  $('tdPctDura').textContent = pct(calc.pctDura);
  $('tdDominant').textContent = calc.dominant;
  $('tdBarTenera').style.width = `${Math.min(calc.pctTenera,100)}%`;
  $('tdBarDura').style.width = `${Math.min(calc.pctDura,100)}%`;
  $('tdDonut').style.background = `conic-gradient(var(--primary) ${calc.pctTenera * 3.6}deg,#efc56e 0deg)`;
  $('tdDonutText').textContent = pct(calc.pctTenera);
}

function filterGradingRows() {
  const q = $('rekapGradingSearch').value.trim().toLowerCase();
  const supplier = $('rekapGradingSupplier').value;
  const start = $('rekapGradingStart').value;
  const end = $('rekapGradingEnd').value;
  return state.grading.filter(r => {
    const hit = !q || [r.driver, r.plate, r.supplier].join(' ').toLowerCase().includes(q);
    const hitSupplier = !supplier || r.supplier === supplier;
    const d = dateOnly(r.createdAt);
    const hitStart = !start || d >= start;
    const hitEnd = !end || d <= end;
    return hit && hitSupplier && hitStart && hitEnd;
  });
}

function filterTDRows() {
  const q = $('rekapTDSearch').value.trim().toLowerCase();
  const start = $('rekapTDStart').value;
  const end = $('rekapTDEnd').value;
  return state.td.filter(r => {
    const hit = !q || [r.driver, r.plate, r.supplier || ''].join(' ').toLowerCase().includes(q);
    const d = dateOnly(r.createdAt);
    const hitStart = !start || d >= start;
    const hitEnd = !end || d <= end;
    return hit && hitStart && hitEnd;
  });
}

function renderRekapGrading() {
  const rows = filterGradingRows();
  $('rekapGradingTable').innerHTML = rows.length ? rows.map(r => `<tr data-detail-type="grading" data-detail-id="${r.id}"><td>${localDate(r.createdAt)}</td><td>${localTime(r.createdAt)}</td><td>${escapeHtml(r.driver)}</td><td>${escapeHtml(r.plate)}</td><td>${escapeHtml(r.supplier)}</td><td>${r.totalBunches}</td><td>${pct(r.percentages?.masak)}</td><td>${pct(r.totalDeduction)}</td><td>${r.revised ? 'Ya' : '-'}</td></tr>`).join('') : '<tr><td colspan="9">Tidak ada data grading.</td></tr>';
}

function renderRekapTD() {
  const rows = filterTDRows();
  $('rekapTDTable').innerHTML = rows.length ? rows.map(r => `<tr data-detail-type="td" data-detail-id="${r.id}"><td>${localDate(r.createdAt)}</td><td>${localTime(r.createdAt)}</td><td>${escapeHtml(r.driver)}</td><td>${escapeHtml(r.plate)}</td><td>${r.tenera}</td><td>${r.dura}</td><td>${pct(r.pctTenera)}</td><td>${pct(r.pctDura)}</td><td>${r.revised ? 'Ya' : '-'}</td></tr>`).join('') : '<tr><td colspan="9">Tidak ada data Tenera Dura.</td></tr>';
}

function getRekapDataFiltered() {
  const start = $('rekapDataStart').value;
  const end = $('rekapDataEnd').value;
  const supplier = $('rekapDataSupplier').value;
  const driver = $('rekapDataDriver').value.trim().toLowerCase();
  const grading = state.grading.filter(r => {
    const d = dateOnly(r.createdAt);
    return (!start || d >= start) && (!end || d <= end) && (!supplier || r.supplier === supplier) && (!driver || (r.driver || '').toLowerCase().includes(driver));
  });
  const td = state.td.filter(r => {
    const d = dateOnly(r.createdAt);
    return (!start || d >= start) && (!end || d <= end) && (!driver || (r.driver || '').toLowerCase().includes(driver));
  });
  return { grading, td };
}

function renderRekapData() {
  const { grading, td } = getRekapDataFiltered();
  $('rekapDataGradingSummary').innerHTML = [
    `Transaksi grading: ${grading.length}`,
    `Total janjang: ${grading.reduce((a,x)=>a+num(x.totalBunches),0)}`,
    `Rata-rata % masak: ${pct(grading.length ? grading.reduce((a,x)=>a+num(x.percentages?.masak),0)/grading.length : 0)}`,
    `Rata-rata potongan: ${pct(grading.length ? grading.reduce((a,x)=>a+num(x.totalDeduction),0)/grading.length : 0)}`
  ].map(x=>`<div class="stat"><strong>${escapeHtml(x)}</strong></div>`).join('');
  $('rekapDataTDSummary').innerHTML = [
    `Transaksi TD: ${td.length}`,
    `Total TD: ${td.reduce((a,x)=>a+num(x.total),0)}`,
    `Rata-rata % Tenera: ${pct(td.length ? td.reduce((a,x)=>a+num(x.pctTenera),0)/td.length : 0)}`,
    `Rata-rata % Dura: ${pct(td.length ? td.reduce((a,x)=>a+num(x.pctDura),0)/td.length : 0)}`
  ].map(x=>`<div class="stat"><strong>${escapeHtml(x)}</strong></div>`).join('');
  $('rekapDataSupplierTable').innerHTML = supplierStats(grading).map(s=>`<tr><td>${escapeHtml(s.name)}</td><td>${s.count}</td><td>${s.totalJanjang}</td><td>${pct(s.avgMasak)}</td><td>${pct(s.avgDed)}</td></tr>`).join('') || '<tr><td colspan="5">Tidak ada data supplier.</td></tr>';
  const driverMap = driverStats(grading);
  const tdMap = Object.fromEntries(tdDriverStats(td).map(x=>[x.name, x]));
  $('rekapDataDriverTable').innerHTML = driverMap.map(d=>`<tr><td>${escapeHtml(d.name)}</td><td>${d.count}</td><td>${d.totalJanjang}</td><td>${pct(d.avgMasak)}</td><td>${tdMap[d.name] ? tdMap[d.name].total : 0}</td></tr>`).join('') || '<tr><td colspan="5">Tidak ada data sopir.</td></tr>';
}

function renderSheetGrading() {
  const q = $('sheetGradingSearch')?.value.trim().toLowerCase() || '';
  const rows = state.grading.filter(r => !q || [r.driver, r.plate, r.supplier].join(' ').toLowerCase().includes(q));
  $('sheetGradingTable').innerHTML = `
    <thead><tr><th>Tanggal</th><th>Jam</th><th>Sopir</th><th>Plat</th><th>Supplier</th><th>Total</th><th>% Masak</th><th>Potongan</th><th>Aksi</th></tr></thead>
    <tbody>${rows.map(r => `<tr data-id="${r.id}"><td>${localDate(r.createdAt)}</td><td>${localTime(r.createdAt)}</td><td contenteditable="true" class="editable" data-key="driver">${escapeHtml(r.driver)}</td><td contenteditable="true" class="editable" data-key="plate">${escapeHtml(r.plate)}</td><td contenteditable="true" class="editable" data-key="supplier">${escapeHtml(r.supplier)}</td><td contenteditable="true" class="editable" data-key="totalBunches">${r.totalBunches}</td><td>${pct(r.percentages?.masak)}</td><td>${pct(r.totalDeduction)}</td><td><button class="text-btn danger" data-del-grading="${r.id}">Hapus</button></td></tr>`).join('') || '<tr><td colspan="9">Belum ada data grading.</td></tr>'}</tbody>`;
}

function renderSheetTD() {
  const q = $('sheetTDSearch')?.value.trim().toLowerCase() || '';
  const rows = state.td.filter(r => !q || [r.driver, r.plate].join(' ').toLowerCase().includes(q));
  $('sheetTDTable').innerHTML = `
    <thead><tr><th>Tanggal</th><th>Jam</th><th>Sopir</th><th>Plat</th><th>Tenera</th><th>Dura</th><th>% Tenera</th><th>% Dura</th><th>Aksi</th></tr></thead>
    <tbody>${rows.map(r => `<tr data-id="${r.id}"><td>${localDate(r.createdAt)}</td><td>${localTime(r.createdAt)}</td><td contenteditable="true" class="editable" data-key="driver">${escapeHtml(r.driver)}</td><td contenteditable="true" class="editable" data-key="plate">${escapeHtml(r.plate)}</td><td contenteditable="true" class="editable" data-key="tenera">${r.tenera}</td><td contenteditable="true" class="editable" data-key="dura">${r.dura}</td><td>${pct(r.pctTenera)}</td><td>${pct(r.pctDura)}</td><td><button class="text-btn danger" data-del-td="${r.id}">Hapus</button></td></tr>`).join('') || '<tr><td colspan="9">Belum ada data Tenera Dura.</td></tr>'}</tbody>`;
}

function renderPerformance() {
  const mode = $('performanceMode')?.value || 'grading';
  const view = $('performanceView')?.value || 'supplier';
  const head = $('performanceHead');
  const body = $('performanceBody');
  if (!head || !body) return;
  if (mode === 'td') {
    const rows = tdDriverStats();
    head.innerHTML = '<tr><th>Sopir</th><th>Transaksi</th><th>Total TD</th><th>% Tenera</th><th>% Dura</th></tr>';
    body.innerHTML = rows.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>${r.count}</td><td>${r.total}</td><td>${pct(r.avgTenera)}</td><td>${pct(r.avgDura)}</td></tr>`).join('') || '<tr><td colspan="5">Belum ada data.</td></tr>';
    return;
  }
  const rows = view === 'supplier' ? supplierStats() : driverStats();
  head.innerHTML = '<tr><th>' + (view === 'supplier' ? 'Supplier' : 'Sopir') + '</th><th>Transaksi</th><th>Total</th><th>% Masak</th><th>Potongan</th></tr>';
  body.innerHTML = rows.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>${r.count}</td><td>${r.totalJanjang}</td><td>${pct(r.avgMasak)}</td><td>${pct(r.avgDed)}</td></tr>`).join('') || '<tr><td colspan="5">Belum ada data.</td></tr>';
}

function renderAnalytics() {
  const causes = causeTotals();
  $('analyticsCauses').innerHTML = Object.entries(causes).map(([k,v])=>`<div class="stat"><strong>${escapeHtml(k)}</strong><div class="meta">${pct(v)}</div><div class="bar"><div style="width:${Math.min(v,100)}%"></div></div></div>`).join('') || '<div class="empty-state">Belum ada data.</div>';
  $('analyticsInsights').innerHTML = insights().map(x => `<div class="stat"><strong>${escapeHtml(x)}</strong></div>`).join('');
}

function renderSupplierPage() {
  const fixedWrap = $('fixedSupplierList');
  const customWrap = $('customSupplierList');
  if (!fixedWrap || !customWrap) return;
  fixedWrap.innerHTML = FIXED_SUPPLIERS.map(s=>`<div class="supplier-item"><div><strong>${escapeHtml(s)}</strong><div class="meta">Supplier tetap</div></div><span class="mini-badge">Tetap</span></div>`).join('');
  const custom = [...new Set(state.grading.map(x=>String(x.supplier||'').trim()).filter(Boolean).filter(s=>!FIXED_SUPPLIERS.includes(s)))].sort((a,b)=>a.localeCompare(b));
  customWrap.innerHTML = custom.length ? custom.map(s=>`<div class="supplier-item"><div><strong>${escapeHtml(s)}</strong><div class="meta">Tersimpan dari transaksi Firebase</div></div><span class="mini-badge">Manual</span></div>`).join('') : '<div class="empty-state">Belum ada supplier manual dari transaksi.</div>';
}

function refreshAll() {
  fillStatic();
  renderSummaryCards();
  renderDashboard();
  renderGradingLive();
  renderTDLive();
  renderRekapGrading();
  renderRekapTD();
  renderRekapData();
  renderSheetGrading();
  renderSheetTD();
  renderPerformance();
  renderAnalytics();
}

function resolveSupplier(raw) {
  return String(raw.supplierManual || raw.supplier || '').trim();
}

function historyHint(name) {
  const hit = state.grading.find(x => String(x.driver || '').toLowerCase() === String(name || '').trim().toLowerCase());
  if (!hit) {
    $('driverHint').textContent = 'Belum ada histori sopir.';
    return;
  }
  $('gradingPlate').value = hit.plate || '';
  $('gradingSupplier').value = FIXED_SUPPLIERS.includes(hit.supplier) ? hit.supplier : '';
  $('gradingSupplierManual').value = FIXED_SUPPLIERS.includes(hit.supplier) ? '' : (hit.supplier || '');
  $('driverHint').textContent = `Histori ditemukan: ${hit.plate} • ${hit.supplier}`;
}

function markRevised(row) {
  row.revised = true;
  row.revisedAt = new Date().toISOString();
}

async function saveGrading() {
  const form = $('gradingForm');
  const raw = Object.fromEntries(new FormData(form).entries());
  raw.supplier = resolveSupplier(raw);
  delete raw.supplierManual;
  const calc = calculateGrading(raw);
  if (calc.validation.type === 'error') throw new Error(calc.validation.message);
  if (!raw.supplier) throw new Error('Pilih supplier tetap atau ketik supplier manual.');
  const id = uid();
  await set(ref(db, `grading/${id}`), { id, createdAt: new Date().toISOString(), revised: false, revisedAt: null, ...raw, ...calc });
}

async function saveTD() {
  const form = $('tdForm');
  const raw = Object.fromEntries(new FormData(form).entries());
  const calc = calculateTD(raw);
  const id = uid();
  await set(ref(db, `td/${id}`), { id, createdAt: new Date().toISOString(), revised: false, revisedAt: null, ...raw, ...calc });
}

async function updateGradingRow(id, patch) {
  const current = state.grading.find(x => x.id === id);
  if (!current) return;
  const next = { ...current, ...patch };
  Object.assign(next, calculateGrading(next));
  markRevised(next);
  await update(ref(db, `grading/${id}`), next);
}

async function updateTDRow(id, patch) {
  const current = state.td.find(x => x.id === id);
  if (!current) return;
  const next = { ...current, ...patch };
  Object.assign(next, calculateTD(next));
  markRevised(next);
  await update(ref(db, `td/${id}`), next);
}

function getWAFiltered(kind) {
  const start = $('waStart').value;
  const end = $('waEnd').value;
  const supplier = $('waSupplier').value;
  const mode = $('waMode').value;
  const rows = (kind === 'grading' ? state.grading : state.td).filter(r => {
    const d = dateOnly(r.createdAt);
    const okDate = (!start || d >= start) && (!end || d <= end);
    const okSupplier = kind !== 'grading' || !supplier || r.supplier === supplier;
    return okDate && okSupplier;
  });
  return { rows, start, end, supplier, mode };
}

function buildWAText(kind, detail) {
  const { rows, start, end, supplier, mode } = getWAFiltered(kind);
  const title = kind === 'grading' ? (detail ? 'Detail Rekap Grading' : 'Ringkasan Rekap Grading') : (detail ? 'Detail Rekap Tenera Dura' : 'Ringkasan Rekap Tenera Dura');
  const lines = [title, `Periode: ${start || '-'} s/d ${end || '-'}`];
  if (kind === 'grading') lines.push(`Supplier: ${supplier || 'Semua Supplier'}`);
  lines.push(`Mode: ${mode === 'driver' ? 'Per Sopir' : 'Keseluruhan'}`, '');
  if (!rows.length) return lines.concat('Tidak ada data pada filter ini.').join('\n');
  if (!detail) {
    if (kind === 'grading') {
      lines.push(`Transaksi: ${rows.length}`);
      lines.push(`Total Janjang: ${rows.reduce((a,x)=>a+num(x.totalBunches),0)}`);
      lines.push(`Rata-rata % Masak: ${pct(rows.reduce((a,x)=>a+num(x.percentages?.masak),0)/rows.length)}`);
      lines.push(`Rata-rata Potongan: ${pct(rows.reduce((a,x)=>a+num(x.totalDeduction),0)/rows.length)}`);
    } else {
      lines.push(`Transaksi TD: ${rows.length}`);
      lines.push(`Total TD: ${rows.reduce((a,x)=>a+num(x.total),0)}`);
      lines.push(`Rata-rata % Tenera: ${pct(rows.reduce((a,x)=>a+num(x.pctTenera),0)/rows.length)}`);
      lines.push(`Rata-rata % Dura: ${pct(rows.reduce((a,x)=>a+num(x.pctDura),0)/rows.length)}`);
    }
    return lines.join('\n');
  }
  if (mode === 'driver') {
    const groups = kind === 'grading' ? driverStats(rows) : tdDriverStats(rows);
    groups.forEach(g => {
      lines.push('');
      lines.push(`${g.name}`);
      lines.push(kind === 'grading'
        ? `Transaksi ${g.count} | Janjang ${g.totalJanjang} | % Masak ${pct(g.avgMasak)} | Potongan ${pct(g.avgDed)}`
        : `Transaksi ${g.count} | Total TD ${g.total} | % Tenera ${pct(g.avgTenera)} | % Dura ${pct(g.avgDura)}`);
    });
    return lines.join('\n');
  }
  rows.slice(0, 100).forEach((r, i) => {
    lines.push('');
    lines.push(`${i + 1}. ${localDate(r.createdAt)} ${localTime(r.createdAt)} | ${r.driver} | ${r.plate}`);
    lines.push(kind === 'grading'
      ? `${r.supplier} | Janjang ${r.totalBunches} | % Masak ${pct(r.percentages?.masak)} | Potongan ${pct(r.totalDeduction)}`
      : `Tenera ${r.tenera} | Dura ${r.dura} | % Tenera ${pct(r.pctTenera)} | % Dura ${pct(r.pctDura)}`);
  });
  return lines.join('\n');
}

function openWAModal(kind, detail) {
  state.waContext = { kind, detail };
  $('waModalTitle').textContent = detail ? 'Kirim Detail' : 'Kirim Ringkasan';
  $('waTypeText').value = detail ? 'Detail' : 'Ringkasan';
  $('waSupplierWrap').classList.toggle('hidden', kind !== 'grading');
  $('waPreview').textContent = buildWAText(kind, detail);
  $('waModal').classList.add('open');
}

function waOpen(text) { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); }

function exportRows(kind) {
  const rows = kind === 'grading' ? filterGradingRows() : filterTDRows();
  const header = kind === 'grading'
    ? ['Tanggal','Jam','Sopir','Plat','Supplier','Total Janjang','% Masak','Potongan']
    : ['Tanggal','Jam','Sopir','Plat','Tenera','Dura','% Tenera','% Dura'];
  const body = rows.map(r => kind === 'grading'
    ? [localDate(r.createdAt), localTime(r.createdAt), r.driver, r.plate, r.supplier, r.totalBunches, fixed(r.percentages?.masak), fixed(r.totalDeduction)]
    : [localDate(r.createdAt), localTime(r.createdAt), r.driver, r.plate, r.tenera, r.dura, fixed(r.pctTenera), fixed(r.pctDura)]);
  const html = `<table><thead><tr>${header.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body.map(row=>`<tr>${row.map(c=>`<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${kind}_${Date.now()}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function showDetail(type, id) {
  const row = (type === 'grading' ? state.grading : state.td).find(x => x.id === id);
  if (!row) return;
  const data = type === 'grading'
    ? [
      ['Tanggal', localDate(row.createdAt)], ['Jam', localTime(row.createdAt)], ['Sopir', row.driver], ['Plat', row.plate], ['Supplier', row.supplier],
      ['Total Janjang', row.totalBunches], ['% Masak', pct(row.percentages?.masak)], ['Total Potongan', pct(row.totalDeduction)], ['Revisi', row.revised ? `Ya (${localDate(row.revisedAt)} ${localTime(row.revisedAt)})` : '-']
    ]
    : [
      ['Tanggal', localDate(row.createdAt)], ['Jam', localTime(row.createdAt)], ['Sopir', row.driver], ['Plat', row.plate],
      ['Tenera', row.tenera], ['Dura', row.dura], ['% Tenera', pct(row.pctTenera)], ['% Dura', pct(row.pctDura)], ['Revisi', row.revised ? `Ya (${localDate(row.revisedAt)} ${localTime(row.revisedAt)})` : '-']
    ];
  $('detailBody').innerHTML = `<div class="detail-grid">${data.map(([k,v])=>`<div class="detail-box"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div>`;
  $('detailModal').classList.add('open');
}

function subscribeRealtime() {
  if (state.boundRealtime) return;
  state.boundRealtime = true;
  setStatus('Menghubungkan data realtime Firebase...', 'info');
  onValue(ref(db, 'grading'), snap => {
    state.grading = Object.values(snap.val() || {}).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    refreshAll();
    setStatus('', 'info');
  }, err => setStatus(`Gagal memuat grading: ${err.message}`, 'error'));
  onValue(ref(db, 'td'), snap => {
    state.td = Object.values(snap.val() || {}).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    refreshAll();
  }, err => setStatus(`Gagal memuat TD: ${err.message}`, 'error'));
}

function openSidebar() { $('app').classList.add('sidebar-open'); }
function closeSidebarOnMobile() { if (window.innerWidth <= 900) $('app').classList.remove('sidebar-open'); }

function setLoginRole(role) {
  state.selectedLoginRole = role;
  document.querySelectorAll('.role-pick').forEach(btn => btn.classList.toggle('active', btn.dataset.role === role));
  $('loginEmail').value = USERS[role].email;
  $('loginInfo').textContent = `Role ${USERS[role].label} menggunakan email ${USERS[role].email}. Email boleh diganti manual jika diperlukan.`;
  $('loginError').classList.add('hidden');
}

function bindEvents() {
  document.querySelectorAll('.role-pick').forEach(btn => btn.addEventListener('click', () => setLoginRole(btn.dataset.role)));
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    try {
      $('loginError').classList.add('hidden');
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      $('loginError').textContent = err.message;
      $('loginError').classList.remove('hidden');
    }
  });
  $('logoutBtn').addEventListener('click', () => signOut(auth));
  $('menuToggle').addEventListener('click', () => openSidebar());
  $('mobileOverlay').addEventListener('click', closeSidebarOnMobile);
  document.querySelectorAll('.menu-item').forEach(btn => btn.addEventListener('click', () => switchPage(btn.dataset.page)));

  $('gradingDriver').addEventListener('input', e => historyHint(e.target.value));
  $('gradingForm').addEventListener('input', renderGradingLive);
  $('tdForm').addEventListener('input', renderTDLive);

  $('gradingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await saveGrading();
      e.target.reset();
      e.target.totalBunches.value = 0;
      e.target.querySelectorAll('.cat').forEach(x => x.value = 0);
      $('gradingSupplierManual').value = '';
      $('driverHint').textContent = 'Belum ada histori sopir.';
      renderGradingLive();
      setStatus('Data grading tersimpan realtime.', 'info');
    } catch (err) {
      setStatus(err.message || 'Gagal menyimpan grading.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('tdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await saveTD();
      e.target.reset();
      e.target.tenera.value = 0;
      e.target.dura.value = 0;
      renderTDLive();
      setStatus('Data Tenera Dura tersimpan realtime.', 'info');
    } catch (err) {
      setStatus(err.message || 'Gagal menyimpan TD.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('resetGradingBtn').addEventListener('click', () => {
    $('gradingForm').reset();
    $('gradingForm').totalBunches.value = 0;
    $('gradingForm').querySelectorAll('.cat').forEach(x => x.value = 0);
    $('gradingSupplierManual').value = '';
    $('driverHint').textContent = 'Belum ada histori sopir.';
    renderGradingLive();
  });
  $('resetTDBtn').addEventListener('click', () => {
    $('tdForm').reset();
    $('tdForm').tenera.value = 0;
    $('tdForm').dura.value = 0;
    renderTDLive();
  });
  $('copyLastGrading').addEventListener('click', () => {
    const last = state.grading[0];
    if (!last) return;
    const f = $('gradingForm');
    f.driver.value = last.driver;
    f.plate.value = last.plate;
    f.supplier.value = FIXED_SUPPLIERS.includes(last.supplier) ? last.supplier : '';
    $('gradingSupplierManual').value = FIXED_SUPPLIERS.includes(last.supplier) ? '' : (last.supplier || '');
    ['totalBunches','mentah','mengkal','overripe','busuk','kosong','partheno','tikus'].forEach(k => f[k].value = last[k]);
    renderGradingLive();
  });
  $('copyLastTD').addEventListener('click', () => {
    const last = state.td[0];
    if (!last) return;
    const f = $('tdForm');
    f.driver.value = last.driver;
    f.plate.value = last.plate;
    f.tenera.value = last.tenera;
    f.dura.value = last.dura;
    renderTDLive();
  });

  ['rekapGradingSearch'].forEach(id => $(id).addEventListener('input', renderRekapGrading));
  ['rekapGradingSupplier','rekapGradingStart','rekapGradingEnd'].forEach(id => $(id).addEventListener('change', renderRekapGrading));
  ['rekapTDSearch'].forEach(id => $(id).addEventListener('input', renderRekapTD));
  ['rekapTDStart','rekapTDEnd'].forEach(id => $(id).addEventListener('change', renderRekapTD));
  ['rekapDataStart','rekapDataEnd','rekapDataSupplier','rekapDataDriver'].forEach(id => $(id).addEventListener(id === 'rekapDataDriver' ? 'input' : 'change', renderRekapData));
  $('rekapDataRunBtn').addEventListener('click', renderRekapData);
  $('rekapDataResetBtn').addEventListener('click', () => { ['rekapDataStart','rekapDataEnd','rekapDataSupplier','rekapDataDriver'].forEach(id => $(id).value = ''); renderRekapData(); });
  $('sheetGradingSearch').addEventListener('input', renderSheetGrading);
  $('sheetTDSearch').addEventListener('input', renderSheetTD);
  $('performanceMode').addEventListener('change', renderPerformance);
  $('performanceView').addEventListener('change', renderPerformance);
  $('exportGradingBtn').addEventListener('click', () => exportRows('grading'));
  $('exportTDBtn').addEventListener('click', () => exportRows('td'));
  $('sendGradingSummaryBtn').addEventListener('click', () => openWAModal('grading', false));
  $('sendGradingDetailBtn').addEventListener('click', () => openWAModal('grading', true));
  $('sendTDSummaryBtn').addEventListener('click', () => openWAModal('td', false));
  $('sendTDDetailBtn').addEventListener('click', () => openWAModal('td', true));
  ['waStart','waEnd','waSupplier','waMode'].forEach(id => $(id).addEventListener(id === 'waMode' ? 'change' : 'input', () => { $('waPreview').textContent = buildWAText(state.waContext.kind, state.waContext.detail); }));
  $('confirmWaBtn').addEventListener('click', () => waOpen(buildWAText(state.waContext.kind, state.waContext.detail)));
  $('closeWaModalBtn').addEventListener('click', () => $('waModal').classList.remove('open'));
  $('waModal').addEventListener('click', e => { if (e.target.id === 'waModal') $('waModal').classList.remove('open'); });
  $('closeModalBtn').addEventListener('click', () => $('detailModal').classList.remove('open'));
  $('detailModal').addEventListener('click', e => { if (e.target.id === 'detailModal') $('detailModal').classList.remove('open'); });
  $('globalSearch').addEventListener('input', e => {
    $('rekapGradingSearch').value = e.target.value;
    $('rekapTDSearch').value = e.target.value;
    $('sheetGradingSearch').value = e.target.value;
    $('sheetTDSearch').value = e.target.value;
    renderRekapGrading();
    renderRekapTD();
    renderSheetGrading();
    renderSheetTD();
  });

  document.addEventListener('click', async (e) => {
    const row = e.target.closest('tr[data-detail-id]');
    if (row) showDetail(row.dataset.detailType, row.dataset.detailId);
    const delG = e.target.closest('[data-del-grading]')?.dataset.delGrading;
    if (delG && state.currentRole === 'staff' && confirm('Hapus data grading ini?')) await remove(ref(db, `grading/${delG}`));
    const delT = e.target.closest('[data-del-td]')?.dataset.delTd;
    if (delT && state.currentRole === 'staff' && confirm('Hapus data TD ini?')) await remove(ref(db, `td/${delT}`));
  });

  $('sheetGradingTable').addEventListener('focusout', async (e) => {
    if (state.currentRole !== 'staff') return;
    const cell = e.target.closest('td.editable');
    if (!cell) return;
    const tr = cell.closest('tr');
    const key = cell.dataset.key;
    const value = ['driver','plate','supplier'].includes(key) ? cell.textContent.trim() : Number(cell.textContent.trim() || 0);
    await updateGradingRow(tr.dataset.id, { [key]: value });
  });
  $('sheetTDTable').addEventListener('focusout', async (e) => {
    if (state.currentRole !== 'staff') return;
    const cell = e.target.closest('td.editable');
    if (!cell) return;
    const tr = cell.closest('tr');
    const key = cell.dataset.key;
    const value = ['driver','plate'].includes(key) ? cell.textContent.trim() : Number(cell.textContent.trim() || 0);
    await updateTDRow(tr.dataset.id, { [key]: value });
  });
}

onAuthStateChanged(auth, (user) => {
  state.user = user;
  if (!user) {
    $('loginScreen').classList.remove('hidden');
    $('app').classList.add('hidden');
    state.boundRealtime = false;
    state.grading = [];
    state.td = [];
    return;
  }
  state.currentRole = user.email === USERS.staff.email ? 'staff' : 'grading';
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  applyRoleUI();
  subscribeRealtime();
  refreshAll();
});

bindEvents();
setLoginRole('staff');
renderGradingLive();
renderTDLive();
refreshAll();
