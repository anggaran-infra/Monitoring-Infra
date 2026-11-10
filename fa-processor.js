'use strict';
// Migrasi dari Code.gs v27, perhitungan sisa tanpa Lock Pagu.
function prosesFaDetail(payload) {
  if (!payload || !Array.isArray(payload.rows)) throw Error('Baris FA Detail tidak ditemukan.');
  if (payload.rows.length > 30000) throw Error('Jumlah baris melampaui batas pengaman.');
  const result = {};
  const byRO = {};
  const detailAccounts = {}; // Bahan analisis simulasi; snapshot akun sampai komponen dan subkomponen.
  const unknown = {};
  const diagnostics = {barisAkun: 0, terpetakan: 0, tidakTerpetakan: 0, duplikat: 0, salahFormat: 0, pagu: 0, realisasi: 0, sisa: 0};
  const seen = new Set();
  const unitOrders = ['Deputi 1 – PPWATR','Deputi 2 – Konektivitas','Deputi 3 – Infrastruktur Dasar','Deputi 4 – Perumahan dan Permukiman','Biro MKKS','Biro HSDMO','Biro DKIP','Biro Umum dan Keuangan','Protokol dan TU Pimpinan','Inspektorat','PRRP'];
  function ensure(unit, kro, kategori) {
    if (!result[unit]) result[unit] = {};
    if (!result[unit][kro]) result[unit][kro] = {};
    if (!result[unit][kro][kategori]) result[unit][kro][kategori] = {pagu:0,realisasi:0,sisa:0, count:0};
    return result[unit][kro][kategori];
  }
  for (const row of payload.rows) {
    const code = String(row.kode||'').trim().toUpperCase();
    const unitCode = String(row.fullCode||'').trim().toUpperCase();
    const account = String(row.akun||'').trim();
    if (!/^\d{4}\.[A-Z]{3}\.\d{3}\.\d{3}$/.test(unitCode) || !/^5\d{5}$/.test(account)) { diagnostics.salahFormat++;continue; }
    const pagu = Number(row.pagu), realisasi=Number(row.realisasi), sisa=pagu-realisasi; // Abaikan Lock Pagu dari PDF
    if (![pagu,realisasi,sisa].every(Number.isFinite)) {diagnostics.salahFormat++;continue;}
    if (pagu < 0 || realisasi < 0) { diagnostics.salahFormat++; continue; }
    const unique = [row.page, row.rowPosition, unitCode, row.subkomponen, account].join('|');
    if (seen.has(unique)) {diagnostics.duplikat++;continue;}
    seen.add(unique);
    diagnostics.barisAkun++; diagnostics.pagu += pagu;diagnostics.realisasi += realisasi;diagnostics.sisa += sisa;
    let unit = UNIT_MAPPING[unitCode];
    if (!unit) {
      diagnostics.tidakTerpetakan++;
      if (!unknown[unitCode]) unknown[unitCode] = {jumlah:0,pagu:0,akun:new Set()};
      unknown[unitCode].jumlah++;unknown[unitCode].pagu+=pagu;unknown[unitCode].akun.add(account);
      unit = 'BELUM TERPETAKAN';
    } else diagnostics.terpetakan++;
    let kategori;
    if (unit.includes('Operasional Gaji')) {unit='Biro Umum dan Keuangan';kategori='OPERASIONAL_GAJI';}
    else if(unit.includes('Operasional Barang')) {unit='Biro Umum dan Keuangan';kategori='OPERASIONAL_BARANG';}
    else if(unit.includes('Non Operasional Modal')) {unit='Biro Umum dan Keuangan';kategori='NON_OPERASIONAL_MODAL';}
    else if (account.startsWith('524')) kategori='PERJADIN';
    else if (account.startsWith('53')) kategori='MODAL_LAIN';
    else if (unit === 'Biro Umum dan Keuangan' && account.startsWith('5')) kategori='NON524';
    else if (account.startsWith('51')) kategori='GAJI_LAIN';
    else kategori='NON524';
    // Non-524 nonoperasional: mengecualikan EBA.994, belanja modal 53 dan gaji 51.
    // Akun 52 selain 524 pada RO non-EBA.994 dicatat dalam NON524.
    if (kategori==='NON524' && !account.startsWith('52')) kategori='LAINNYA';
    const kro = unitCode.split('.').slice(0,2).join('.');
    const dst = ensure(unit,kro,kategori);
    dst.pagu+=pagu;dst.realisasi+=realisasi;dst.sisa+=sisa;dst.count++;
    // Rincian hingga RO. Pengelompokan lintas kegiatan dilakukan di UI,
    // tetapi unit tidak pernah digabung antar-biro/deputi.
    const kodeRO = unitCode.split('.').slice(0,3).join('.');
    if (!byRO[unit]) byRO[unit] = {};
    if (!byRO[unit][kodeRO]) byRO[unit][kodeRO] = {};
    if (!byRO[unit][kodeRO][kategori]) byRO[unit][kodeRO][kategori] = {pagu:0,realisasi:0,sisa:0,count:0};
    const ro = byRO[unit][kodeRO][kategori];
    ro.pagu+=pagu;ro.realisasi+=realisasi;ro.sisa+=sisa;ro.count++;
    // Simpan level akun, komponen, dan subkomponen agar simulasi tidak memakai subtotal KRO.
    // Pergeseran di aplikasi hanya simulasi; tidak mengubah data FA Detail asli.
    const domain = /^7394\.EBA\.994\.00[12]$/.test(unitCode) ? 'OPERASIONAL' : 'NONOPERASIONAL';
    const jenis = account.slice(0,2); // 51 / 52 / 53
    const detailKey = [unit,unitCode,String(row.subkomponen||''),account].join('|');
    if (!detailAccounts[detailKey]) detailAccounts[detailKey] = {
      id:detailKey,unit,fullCode:unitCode,kegiatan:unitCode.split('.')[0],
      kro:unitCode.split('.').slice(0,2).join('.'),
      ro:kodeRO,komponen:unitCode.split('.')[3],subkomponen:String(row.subkomponen||''),
      akun:account,kategori,jenis,domain,pagu:0,realisasi:0,sisa:0,count:0
    };
    const item=detailAccounts[detailKey];
    item.pagu+=pagu;item.realisasi+=realisasi;item.sisa+=sisa;item.count++;

  }
  const notMapped = Object.entries(unknown).map(([kode,v])=>({kode,jumlah:v.jumlah,pagu:v.pagu,akun:[...v.akun].sort()})).sort((a,b)=>b.pagu-a.pagu);
  const sorted = Object.keys(result).sort((a,b)=>{
    const ai=unitOrders.indexOf(a),bi=unitOrders.indexOf(b);
    return (ai<0?999:ai)-(bi<0?999:bi) || a.localeCompare(b);
  });
  return {data:result, byRO:byRO, detailAccounts:Object.values(detailAccounts), unitOrder:sorted, notMapped, diagnostics, filename:String(payload.filename||''), periode:String(payload.periode||'')};
}
