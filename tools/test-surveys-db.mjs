// Isolated synthetic PostgreSQL only. Never connects to production.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.SURVEY_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const root = new URL('../supabase/migrations/', import.meta.url);
const initial = await fs.readFile(new URL('202607290001_initial_schema.sql', root), 'utf8');
const definition = (name) => initial.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`))[0];
await db.exec(`
create role authenticated; create role anon; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',current_setting('test.aal',true)) $$;
create table auth.users(id uuid primary key);
${initial.slice(initial.indexOf('create table public.roles'),initial.indexOf('create table public.departments'))}
create table public.data_access_scopes(user_id uuid,module text,scope_type text,department_id uuid,created_by uuid);
create table public.audit_logs(actor_user_id uuid,action text,table_name text,record_id uuid,old_data jsonb,new_data jsonb,metadata jsonb);
${definition('is_admin')}
${definition('write_audit_log')}
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
grant usage on schema auth to authenticated;
insert into public.roles(code,name) values('admin','Admin'),('manager','Manager'),('user','User'),('viewer','Viewer');
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
insert into public.profiles(id,email) select id,id||'@example.invalid' from auth.users;
insert into public.user_roles(user_id,role_id) select '11111111-1111-4111-8111-111111111111',id from public.roles where code='admin';
set test.uid='11111111-1111-4111-8111-111111111111'; set test.aal='aal2';
`);
for (const file of ['202608280002_user_module_access.sql','202609070001_telecom_cost_management.sql','202609080001_company_surveys.sql']) await db.exec(await fs.readFile(new URL(file, root), 'utf8'));
await db.exec('set role authenticated');
assert.ok((await db.query('select public.get_my_access() as a')).rows[0].a.modules.includes('surveys'));
const manager = '22222222-2222-4222-8222-222222222222'; const viewer = '33333333-3333-4333-8333-333333333333';
const grant = (id, role, modules) => db.query('select public.admin_set_user_access($1::uuid,$2,true,false,$3::jsonb,$4::jsonb)', [id, role, '[]', JSON.stringify(modules)]);
await grant(manager, 'manager', []); await grant(viewer, 'viewer', ['surveys']);
await assert.rejects(() => grant(manager, 'manager', ['invalid']), /Unknown system module/);
const questions = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Điền thông tin có khoảng trắng', type: 'short', required: true, options: [] },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'Một đáp án', type: 'single', required: true, options: ['Đồng ý', 'Không đồng ý'] },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: 'Nhiều đáp án', type: 'multiple', required: false, options: ['Đào tạo', 'Không gian'] },
];
const save = (qs = questions, id = null, revision = null) => db.query('select public.save_company_survey($1,$2,$3,$4,$5) as id', [id, revision, 'Khảo sát synthetic', 'Không có dữ liệu thật', JSON.stringify(qs)]);
const id = (await save()).rows[0].id;
const survey = async () => (await db.query('select * from public.company_surveys where id=$1', [id])).rows[0];
const token = (await survey()).public_token;
const status = (revision, value) => db.query('select public.set_company_survey_status($1,$2,$3)', [id, revision, value]);
const publicRead = () => db.query('select public.get_public_survey($1) as s', [token]);
assert.equal((await publicRead()).rows[0].s, null);
await assert.rejects(() => save([{ ...questions[0], title: '' }]), /INVALID_QUESTIONS/);
await assert.rejects(() => save([{ ...questions[1], options: ['A', 'A'] }]), /INVALID_OPTIONS/);
await assert.rejects(() => save([questions[0], questions[0]]), /INVALID_QUESTIONS/);
await assert.rejects(() => save(questions, id, 999), /SURVEY_STALE/);
await status(1, 'open');
assert.equal((await survey()).revision, 2);
await assert.rejects(() => save([{ ...questions[0], title: 'changed' }], id, 2), /QUESTIONS_LOCKED/);
await assert.rejects(() => db.query('delete from public.company_surveys'), /permission denied/);
await db.exec(`set test.uid='${manager}'`);
assert.equal((await db.query('select count(*) from public.company_surveys')).rows[0].count, 0);
await assert.rejects(() => save(), /FORBIDDEN/);
await db.exec("set test.uid='11111111-1111-4111-8111-111111111111'"); await grant(manager, 'manager', ['surveys']);
await db.exec(`set test.uid='${manager}'`);
assert.equal((await db.query('select count(*) from public.company_surveys')).rows[0].count, 1);
await save(questions, id, 2);
await db.exec(`set test.uid='${viewer}'`);
await assert.rejects(() => save(), /FORBIDDEN/);
await db.exec("set test.uid='11111111-1111-4111-8111-111111111111'; set test.aal='aal1'");
await assert.rejects(() => save(), /FORBIDDEN/);
await db.exec("set test.uid=''; set role anon");
const publicSurvey = (await publicRead()).rows[0].s;
assert.deepEqual(Object.keys(publicSurvey).sort(), ['description', 'questions', 'title']);
await assert.rejects(() => db.query('select * from public.survey_responses'), /permission denied/);
await assert.rejects(() => db.query('select * from public.company_surveys'), /permission denied/);
await assert.rejects(() => save(), /permission denied/);
const answers = { [questions[0].id]: 'Thông tin giữ khoảng trắng', [questions[1].id]: 'Đồng ý', [questions[2].id]: ['Đào tạo', 'Không gian'] };
const submission = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const submit = (a = answers, requestId = submission, phone = '0900000000', email = '') => db.query('select public.submit_company_survey($1,$2,$3,$4,$5,$6)', [token, requestId, 'Người thử synthetic', phone, email, JSON.stringify(a)]);
await assert.rejects(() => submit({}), /REQUIRED_ANSWER/);
await assert.rejects(() => submit({ ...answers, [questions[1].id]: ['Đồng ý'] }), /INVALID_ANSWERS/);
await assert.rejects(() => submit({ ...answers, [questions[2].id]: ['Giả mạo'] }), /INVALID_ANSWERS/);
await assert.rejects(() => submit({ ...answers, [questions[2].id]: ['Đào tạo', 'Đào tạo'] }), /INVALID_ANSWERS/);
await assert.rejects(() => submit({ ...answers, unknown: 'extra' }), /INVALID_ANSWERS/);
await assert.rejects(() => submit(answers, submission, '', ''), /check constraint/);
await submit(); await submit();
await submit(answers, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '', 'synthetic@example.invalid');
await db.exec("set role authenticated; set test.uid='11111111-1111-4111-8111-111111111111'; set test.aal='aal2'");
assert.equal((await survey()).response_count, 2);
assert.equal((await db.query('select count(*) from public.survey_responses')).rows[0].count, 2);
assert.equal((await db.query('select answers from public.survey_responses limit 1')).rows[0].answers[questions[0].id], 'Thông tin giữ khoảng trắng');
await status(3, 'closed');
await db.exec("set test.uid=''; set role anon");
assert.equal((await publicRead()).rows[0].s, null);
await submit(); // idempotent retry after closing remains successful
await assert.rejects(() => submit(answers, 'ffffffff-ffff-4fff-8fff-ffffffffffff'), /UNAVAILABLE/);
await db.close();
console.log('PASS: survey migration, real module grants/MFA/RLS, draft/open/closed, question locking, stale updates, anonymous projection, private identities, required/single/multiple validation, contact rules, atomic submission and idempotent retries.');
