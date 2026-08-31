-- Creates the `app_user` role the API runs business-data queries as, and
-- enforces per-user isolation with Postgres RLS. The `migrator` role (whatever
-- DATABASE_URL connects as) owns the tables and is never used at request time.
--
-- __APP_USER_PASSWORD__ is substituted by migrate.ts from APP_DB_PASSWORD.

do $$
begin
  if not exists (select from pg_roles where rolname = 'app_user') then
    create role app_user login password '__APP_USER_PASSWORD__';
  end if;
end
$$;

grant usage on schema public to app_user;

grant select, insert, update, delete on
  orders, payments, ingestion_flags, reconciliations, discrepancy_explanations
to app_user;

grant select, insert, update, delete on "user", "session", "account", "verification"
to app_user;

do $$
declare
  t text;
begin
  foreach t in array array['orders', 'payments', 'ingestion_flags', 'reconciliations', 'discrepancy_explanations']
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
  end loop;
end
$$;
