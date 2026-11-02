-- Database guard tests. Run against a scratch Postgres after the migration:
--   psql -v ON_ERROR_STOP=1 -f tests/db.test.sql
-- Each block asserts that a rule holds; any failure raises and stops the run.
\set QUIET on
begin;

-- New user gets a workspace, owner membership and the six default task types.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'founder@acme.com');
do $$
declare v_org uuid; n int;
begin
  select org_id into v_org from org_members where user_id = '00000000-0000-0000-0000-000000000001';
  assert v_org is not null, 'org created for new user';
  select count(*) into n from task_types where org_id = v_org;
  assert n = 6, 'six default task types';
  assert (select level from task_types where org_id = v_org and key = 'spend_money') = 1, 'money starts at L1';
end $$;

-- Money can never be made fully autonomous.
do $$
begin
  begin
    update task_types set max_level = 3, level = 3 where key = 'spend_money';
    assert false, 'money at L3 must be refused';
  exception when check_violation then null;
  end;
end $$;

-- A paused task cannot resume until its approval is decided; a decision is final.
do $$
declare v_org uuid; v_task uuid := gen_random_uuid(); v_appr uuid := gen_random_uuid();
begin
  select id into v_org from orgs limit 1;
  insert into tasks (id, org_id, agent_id, goal, status) values (v_task, v_org, 'social-poster', 'Post', 'running');
  insert into approvals (id, org_id, task_id, kind, task_type, summary, proposed) values (v_appr, v_org, v_task, 'approve', 'publish_post', 'Post', '{}');
  update tasks set status = 'awaiting_approval', pending = jsonb_build_object('approvalId', v_appr) where id = v_task;

  begin
    update tasks set status = 'running' where id = v_task;
    assert false, 'resume before decision must be refused';
  exception when raise_exception then null;
  end;

  begin
    update approvals set status = 'approved' where id = v_appr;
    assert false, 'decision without a decider must be refused';
  exception when raise_exception then null;
  end;

  update approvals set status = 'approved', decided_by = 'founder' where id = v_appr;
  assert (select decided_at from approvals where id = v_appr) is not null, 'decided_at stamped';
  update tasks set status = 'running', pending = null where id = v_task;

  begin
    update approvals set status = 'rejected', decided_by = 'someone' where id = v_appr;
    assert false, 'changing a decided approval must be refused';
  exception when raise_exception then null;
  end;
end $$;

-- The audit log is append-only.
do $$
begin
  begin
    delete from audit_log;
    assert false, 'audit delete must be refused';
  exception when raise_exception then null;
  end;
  begin
    update audit_log set action = 'x';
    assert false, 'audit update must be refused';
  exception when raise_exception then null;
  end;
end $$;

-- Memory search finds relevant notes.
do $$
declare v_org uuid; n int;
begin
  select id into v_org from orgs limit 1;
  insert into memories (org_id, kind, text) values (v_org, 'fact', 'Our first niche is orthopedic clinics in Sangli');
  select count(*) into n from recall_memories(v_org, 'orthopedic clinics', 5);
  assert n = 1, 'recall finds the note';
end $$;

-- Row-level security: a member sees their org, a stranger sees nothing.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000002', 'other@else.com');
create role tester nologin;
grant usage on schema public, auth to tester;
grant select on all tables in schema public to tester;
grant execute on all functions in schema auth to tester;
set local role tester;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin assert (select count(*) from orgs) = 1, 'member sees exactly their org'; end $$;
do $$ begin assert (select count(*) from task_types) = 6, 'member sees only their task types'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
do $$ begin assert (select count(*) from orgs) = 0, 'stranger sees no orgs'; end $$;
do $$ begin assert (select count(*) from approvals) = 0, 'stranger sees no approvals'; end $$;
reset role;

rollback;
\echo 'DB GUARD TESTS PASSED'
