-- Corrige a auditoria para comparar horários sem acessar campos inexistentes
-- quando o gatilho é executado em tabelas diferentes de appointments.
create or replace function public.write_audit_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  row_data jsonb;
  record_owner uuid;
  record_key uuid;
  event_metadata jsonb := '{}'::jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  record_owner := (row_data ->> 'owner_id')::uuid;
  record_key := (row_data ->> 'id')::uuid;
  if tg_table_name = 'appointments' and tg_op = 'UPDATE'
    and (to_jsonb(old)->>'starts_at') is distinct from (to_jsonb(new)->>'starts_at') then
    event_metadata := jsonb_build_object('rescheduled', true);
  end if;
  insert into public.audit_events (owner_id, table_name, record_id, action, metadata)
  values (record_owner, tg_table_name, record_key, lower(tg_op), event_metadata);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
