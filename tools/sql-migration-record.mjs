// Return a single atomic schema + migration-history transaction.
export function migrationWithRecord(sql,version,name) {
  if(!/^\d{12}$/.test(version)||! /^[a-z0-9_]+$/.test(name)||!/^begin;/i.test(sql)||!/commit;\s*$/i.test(sql))throw Error('Invalid migration transaction');
  // Use a replacement callback: SQL regexes contain `$` and `'`, which have
  // special meaning in a JavaScript string replacement (not in a callback).
  const quoted="'"+sql.replaceAll("'","''")+"'";
  return sql.replace(/commit;\s*$/i,()=>`insert into supabase_migrations.schema_migrations(version,statements,name) values ('${version}',array[${quoted}], '${name}');\ncommit;`);
}
