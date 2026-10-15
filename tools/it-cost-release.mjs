// Narrow Supabase release helper. Token stays in the existing ignored local store.
// Network evidence includes request method/path, response status/bytes and time,
// never Authorization headers, financial records or secrets.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {migrationWithRecord}from './sql-migration-record.mjs';
const [mode,ref]=process.argv.slice(2);
if(!['projects','check','apply','verify'].includes(mode))throw Error('Usage: node tools/it-cost-release.mjs projects|check|apply|verify [project-ref]');
const token=(await fs.readFile(path.join(os.homedir(),'.supabase/access-token'),'utf8')).trim();
const log=process.env.IT_NETWORK_LOG||'/private/tmp/tdw-it-cost-release-network.log';
async function request(endpoint,body) {
  const started=Date.now(),method=body?'POST':'GET';let r;
  try {r=await fetch(`https://api.supabase.com${endpoint}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
    const text=await r.text();await fs.appendFile(log,JSON.stringify({time:new Date().toISOString(),host:'api.supabase.com',method,path:endpoint,status:r.status,sent_bytes:body?Buffer.byteLength(JSON.stringify(body)):0,received_bytes:Buffer.byteLength(text),duration_ms:Date.now()-started})+'\n');
    if(!r.ok){let reason='';try{const p=JSON.parse(text);reason=String(p.message||p.error||p.code||'').slice(0,900);}catch{}throw Error(`Supabase HTTP ${r.status}: ${reason.replace(/Bearer\s+\S+/gi,'Bearer [redacted]')}`);}return JSON.parse(text);
  }catch(e){if(!r)await fs.appendFile(log,JSON.stringify({time:new Date().toISOString(),host:'api.supabase.com',method,path:endpoint,status:'request_failed'})+'\n');throw e;}
}
if(mode==='projects') {
  const projects=await request('/v1/projects');console.log(JSON.stringify(projects.map(p=>({id:p.id,name:p.name,region:p.region,status:p.status})),null,2));
} else {
  if(!/^[a-z0-9]{20}$/.test(ref||''))throw Error('Project ref required');
  const endpoint=`/v1/projects/${ref}/database/query`;
  const filename='202610140001_it_cost_management.sql',migration=await fs.readFile(new URL(`../supabase/migrations/${filename}`,import.meta.url),'utf8');
  if(mode==='check')console.log(JSON.stringify(await request(endpoint,{query:"select to_regclass('public.it_cost_entries')::text as it_table, to_regclass('public.company_surveys')::text as surveys_table;"}),null,2));
  if(mode==='apply') {
    const present=await request(endpoint,{query:"select to_regclass('public.it_cost_entries')::text as it_table;"});
    if(present[0]?.it_table)throw Error('IT schema already exists. Use verify; do not overwrite deployed migration.');
    // Record the migration in the same transaction as schema creation.
    const statement=migrationWithRecord(migration,'202610140001','it_cost_management');
    await request(endpoint,{query:statement});console.log('IT migration committed and recorded.');
  }
  if(mode==='verify')console.log(JSON.stringify(await request(endpoint,{query:"select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('it_cost_categories','it_services','it_service_periods','it_cost_entries','it_cost_entry_lines','it_documents','it_document_links')) as tables, (select count(*) from public.it_cost_categories) as categories, (select count(*) from public.it_cost_entries) as cost_entries, (select public from storage.buckets where id='it-cost-documents') as bucket_public, (select count(*) from supabase_migrations.schema_migrations where version='202610140001') as migration_recorded;"}),null,2));
}
