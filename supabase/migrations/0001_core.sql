-- SIXXAB AI platform core schema.
-- Stage-gates are enforced here in Postgres, not by the model: a gated task cannot resume until a person decides.

create extension if not exists pgcrypto;

-- ---------- tenancy ----------
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'founder' check (plan in ('founder', 'growth', 'enterprise')),
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = auth.uid());
$$;

-- ---------- autonomy ----------
create table if not exists public.task_types (
  org_id uuid not null references public.orgs(id) on delete cascade,
  key text not null,
  label text not null,
  level smallint not null check (level between 1 and 3),
  risk text not null check (risk in ('internal', 'external', 'money')),
  approvals_to_promote int not null default 10 check (approvals_to_promote >= 0),
  max_level smallint not null check (max_level between 1 and 3),
  spend_cap_minor bigint check (spend_cap_minor is null or spend_cap_minor >= 0),
  primary key (org_id, key),
  check (level <= max_level),
  -- money can never be fully autonomous without an explicit schema change
  check (risk <> 'money' or max_level <= 2)
);

-- ---------- work ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  agent_id text not null,
  goal text not null check (length(goal) <= 4000),
  status text not null check (status in ('planned', 'running', 'awaiting_approval', 'draft_for_human', 'done', 'rejected', 'failed')),
  transcript jsonb not null default '[]'::jsonb,
  pending jsonb,
  output text,
  parent_task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_org_updated on public.tasks (org_id, updated_at desc);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  kind text not null check (kind in ('approve', 'draft')),
  task_type text not null,
  summary text not null,
  proposed jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  edited jsonb,
  reason text,
  decided_by text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists approvals_org_status on public.approvals (org_id, status, created_at desc);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  task_id uuid,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists audit_org_at on public.audit_log (org_id, at desc);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  task_type text not null,
  agent_id text not null,
  outcome text not null check (outcome in ('approved', 'approved_with_edits', 'rejected')),
  reason text,
  proposed jsonb not null,
  final jsonb,
  at timestamptz not null default now()
);
create index if not exists feedback_org_type on public.feedback (org_id, task_type, at desc);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  kind text not null check (kind in ('fact', 'decision', 'outcome', 'note')),
  text text not null check (length(text) <= 25000),
  agent_id text,
  at timestamptz not null default now(),
  tsv tsvector generated always as (to_tsvector('simple', text)) stored
);
create index if not exists memories_tsv on public.memories using gin (tsv);

create table if not exists public.briefings (
  org_id uuid not null references public.orgs(id) on delete cascade,
  date date not null,
  shipped jsonb not null,
  needs_you jsonb not null,
  learned jsonb not null,
  summary text not null,
  created_at timestamptz not null default now(),
  primary key (org_id, date)
);

-- ---------- stage-gates and integrity ----------

-- Approvals only move pending -> approved/rejected, once.
create or replace function public.guard_approval() returns trigger language plpgsql as $$
begin
  if old.status <> 'pending' then
    raise exception 'Approval % was already decided', old.id;
  end if;
  if new.status = 'pending' then
    return new;
  end if;
  if new.decided_by is null then
    raise exception 'A decision needs a decider';
  end if;
  new.decided_at := coalesce(new.decided_at, now());
  return new;
end $$;
drop trigger if exists approvals_guard on public.approvals;
create trigger approvals_guard before update on public.approvals for each row execute function public.guard_approval();

-- A paused task cannot run again until its approval is decided.
create or replace function public.guard_task_resume() returns trigger language plpgsql as $$
declare
  v_status text;
begin
  new.updated_at := now();
  if old.status in ('awaiting_approval', 'draft_for_human') and new.status not in ('awaiting_approval', 'draft_for_human') then
    select status into v_status from public.approvals where id = (old.pending->>'approvalId')::uuid;
    if v_status is null or v_status = 'pending' then
      raise exception 'Task % is waiting for a person: approval not decided', old.id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before update on public.tasks for each row execute function public.guard_task_resume();

-- The audit log is append-only.
create or replace function public.audit_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
drop trigger if exists audit_no_change on public.audit_log;
create trigger audit_no_change before update or delete on public.audit_log for each row execute function public.audit_append_only();

-- ---------- memory search ----------
create or replace function public.recall_memories(p_org uuid, p_query text, p_limit int default 5)
returns setof public.memories language sql stable as $$
  select m.* from public.memories m
  where m.org_id = p_org and m.tsv @@ websearch_to_tsquery('simple', p_query)
  order by ts_rank(m.tsv, websearch_to_tsquery('simple', p_query)) desc, m.at desc
  limit least(greatest(p_limit, 1), 20);
$$;

-- ---------- new user: personal workspace with default autonomy ----------
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  insert into public.orgs (name) values (coalesce(new.email, new.phone, 'My company')) returning id into v_org;
  insert into public.org_members (org_id, user_id, role) values (v_org, new.id, 'owner');
  insert into public.task_types (org_id, key, label, level, risk, approvals_to_promote, max_level, spend_cap_minor) values
    (v_org, 'internal_note', 'Write an internal note or plan', 3, 'internal', 0, 3, null),
    (v_org, 'memory_write', 'Save a fact to company memory', 3, 'internal', 0, 3, null),
    (v_org, 'send_message', 'Send a customer message', 2, 'external', 20, 3, null),
    (v_org, 'publish_post', 'Publish a social post', 2, 'external', 15, 3, null),
    (v_org, 'send_email_campaign', 'Send an email campaign', 1, 'external', 10, 2, null),
    (v_org, 'spend_money', 'Spend money (ads, purchases, payments)', 1, 'money', 30, 2, 50000);
  insert into public.audit_log (org_id, actor, action, detail) values (v_org, 'platform', 'org.created', jsonb_build_object('user', new.id));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- row-level security: members read their org; writes go through the server ----------
alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.task_types enable row level security;
alter table public.tasks enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_log enable row level security;
alter table public.feedback enable row level security;
alter table public.memories enable row level security;
alter table public.briefings enable row level security;

create policy orgs_read on public.orgs for select using (public.is_member(id));
create policy members_read on public.org_members for select using (user_id = auth.uid() or public.is_member(org_id));
create policy task_types_read on public.task_types for select using (public.is_member(org_id));
create policy tasks_read on public.tasks for select using (public.is_member(org_id));
create policy approvals_read on public.approvals for select using (public.is_member(org_id));
create policy audit_read on public.audit_log for select using (public.is_member(org_id));
create policy feedback_read on public.feedback for select using (public.is_member(org_id));
create policy memories_read on public.memories for select using (public.is_member(org_id));
create policy briefings_read on public.briefings for select using (public.is_member(org_id));
