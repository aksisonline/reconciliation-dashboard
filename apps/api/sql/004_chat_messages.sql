do $$ begin
  create type chat_role as enum ('user', 'assistant');
exception when duplicate_object then null; end $$;

create table if not exists discrepancy_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  reconciliation_id uuid not null references reconciliations(id) on delete cascade,
  role chat_role not null,
  content text not null,
  created_at timestamp not null default now()
);
create index if not exists discrepancy_chat_messages_user_idx on discrepancy_chat_messages(user_id);
create index if not exists discrepancy_chat_messages_reconciliation_idx on discrepancy_chat_messages(reconciliation_id);

alter table discrepancy_chat_messages enable row level security;
alter table discrepancy_chat_messages force row level security;

drop policy if exists user_isolation_select on discrepancy_chat_messages;
create policy user_isolation_select on discrepancy_chat_messages for select
  using (user_id = current_setting('app.user_id', true)::uuid);

drop policy if exists user_isolation_write on discrepancy_chat_messages;
create policy user_isolation_write on discrepancy_chat_messages for insert
  with check (user_id = current_setting('app.user_id', true)::uuid);

drop policy if exists user_isolation_update on discrepancy_chat_messages;
create policy user_isolation_update on discrepancy_chat_messages for update
  using (user_id = current_setting('app.user_id', true)::uuid)
  with check (user_id = current_setting('app.user_id', true)::uuid);

drop policy if exists user_isolation_delete on discrepancy_chat_messages;
create policy user_isolation_delete on discrepancy_chat_messages for delete
  using (user_id = current_setting('app.user_id', true)::uuid);

grant select, insert, update, delete on discrepancy_chat_messages to app_user;
