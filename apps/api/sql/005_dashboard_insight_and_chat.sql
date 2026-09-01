create table if not exists dashboard_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references "user"(id) on delete cascade,
  structured jsonb not null,
  model text not null,
  created_at timestamp not null default now()
);

create table if not exists dashboard_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "user"(id) on delete cascade,
  role chat_role not null,
  content text not null,
  created_at timestamp not null default now()
);
create index if not exists dashboard_chat_messages_user_idx on dashboard_chat_messages(user_id);

do $$
declare
  t text;
begin
  foreach t in array array['dashboard_insights', 'dashboard_chat_messages']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);

    execute format('drop policy if exists user_isolation_select on %I', t);
    execute format(
      'create policy user_isolation_select on %I for select using (user_id = current_setting(''app.user_id'', true)::uuid)',
      t
    );

    execute format('drop policy if exists user_isolation_write on %I', t);
    execute format(
      'create policy user_isolation_write on %I for insert with check (user_id = current_setting(''app.user_id'', true)::uuid)',
      t
    );

    execute format('drop policy if exists user_isolation_update on %I', t);
    execute format(
      'create policy user_isolation_update on %I for update using (user_id = current_setting(''app.user_id'', true)::uuid) with check (user_id = current_setting(''app.user_id'', true)::uuid)',
      t
    );

    execute format('drop policy if exists user_isolation_delete on %I', t);
    execute format(
      'create policy user_isolation_delete on %I for delete using (user_id = current_setting(''app.user_id'', true)::uuid)',
      t
    );

    execute format('grant select, insert, update, delete on %I to app_user', t);
  end loop;
end
$$;
