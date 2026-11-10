'use strict';
// Pengganti google.script.run. Hanya public/publishable key di browser.
(function () {
  const cfg=window.FA_SUPABASE_CONFIG||{};
  const ready=!!(cfg.url&&cfg.publishableKey&&!cfg.url.includes('PROJECT_ID')&&!cfg.publishableKey.includes('YOUR_'));
  const client=ready&&window.supabase?window.supabase.createClient(cfg.url,cfg.publishableKey):null;
  const table='fa_reports',bucket='fa-detail-pdf';
  const assert=async()=>{
    if(!client)throw Error('Konfigurasi Supabase belum diisi di config.js.');
    const {data:{user},error}=await client.auth.getUser();
    if(error||!user)throw Error('Sesi login tidak tersedia. Silakan masuk kembali.');
    return user;
  };
  const fail=({error,data})=>{if(error)throw Error(error.message);return data;};
  const base64Blob=b64=>{
    const raw=atob(String(b64)),chunks=[];
    for(let i=0;i<raw.length;i+=65536){const segment=raw.slice(i,i+65536),arr=new Uint8Array(segment.length);for(let j=0;j<segment.length;j++)arr[j]=segment.charCodeAt(j);chunks.push(arr);}
    return new Blob(chunks,{type:'application/pdf'});
  };
  const blobBase64=blob=>new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(String(f.result).split(',')[1]);f.onerror=()=>reject(Error('Gagal membaca arsip PDF.'));f.readAsDataURL(blob);});
  async function run(method,payload){
    if(method==='prosesFaDetail')return prosesFaDetail(payload); // Data sumber diproses lokal, tanpa backend Apps Script.
    const user=await assert();
    if(method==='listFaHistory'){
      const rows=fail(await client.from(table).select('id,filename,periode,file_modified_at,created_at').order('created_at',{ascending:false}).limit(200));
      return rows.map(r=>({id:r.id,fileId:r.id,filename:r.filename,periode:r.periode,fileModifiedAt:r.file_modified_at,savedAt:r.created_at}));
    }
    if(method==='getFaHistory'){
      const r=fail(await client.from(table).select('id,filename,periode,file_modified_at,created_at,report').eq('id',payload).single());
      return {metadata:{id:r.id,fileId:r.id,filename:r.filename,periode:r.periode,fileModifiedAt:r.file_modified_at,savedAt:r.created_at},report:r.report};
    }
    if(method==='getFaHistoryPdf'){
      const r=fail(await client.from(table).select('filename,pdf_path').eq('id',payload).single());
      if(!r.pdf_path)throw Error('PDF asli tidak tersimpan dalam arsip ini.');
      const pdf=fail(await client.storage.from(bucket).download(r.pdf_path));
      return {pdfBase64:await blobBase64(pdf),filename:r.filename};
    }
    if(method==='saveFaHistory'){
      if(!payload?.report||!payload.pdfBase64)throw Error('PDF atau data laporan kosong.');
      const blob=base64Blob(payload.pdfBase64);
      if(blob.size>15*1024*1024||blob.size<5)throw Error('Ukuran PDF tidak valid (maks. 15 MB).');
      const first=new Uint8Array(await blob.slice(0,4).arrayBuffer());
      if(String.fromCharCode(...first)!=='%PDF')throw Error('Berkas bukan PDF valid.');
      const id=crypto.randomUUID(),path=user.id+'/'+id+'.pdf';
      const fileName=String(payload.filename||'FA Detail.pdf').slice(0,160);
      fail(await client.storage.from(bucket).upload(path,blob,{contentType:'application/pdf',upsert:false}));
      try{
        const row={id,user_id:user.id,filename:fileName,periode:String(payload.report.periode||''),file_modified_at:payload.fileModifiedAt||null,pdf_path:path,report:payload.report};
        const inserted=fail(await client.from(table).insert(row).select('id,created_at').single());
        return {id:inserted.id,fileId:inserted.id,filename:fileName,periode:row.periode,fileModifiedAt:row.file_modified_at,savedAt:inserted.created_at};
      }catch(e){await client.storage.from(bucket).remove([path]);throw e;}
    }
    throw Error('Fungsi tidak tersedia: '+method);
  }
  window.sbAdapter={run,client,configured:!!client};
})();
