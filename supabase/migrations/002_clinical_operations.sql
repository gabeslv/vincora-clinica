-- Vincóra: módulos operacionais da clínica.
-- Executar após 001_initial_schema.sql no SQL Editor do Supabase.

-- Agenda: impede sobreposição de horários no banco, inclusive em gravações concorrentes.
alter table public.appointments add column if not exists modality text not null default 'in_person'
  check (modality in ('in_person','video','phone'));
create or replace function public.prevent_appointment_conflicts()
returns trigger language plpgsql set search_path = '' as $$
declare
  new_end timestamptz;
  clinic_tz text;
begin
  if new.status = 'cancelled' then return new; end if;
  new_end := new.starts_at + make_interval(mins => new.duration_minutes);
  select s.timezone into clinic_tz from public.clinic_settings s where s.owner_id = new.owner_id;
  clinic_tz := coalesce(clinic_tz, 'America/Manaus');
  if (timezone(clinic_tz, new_end - interval '1 second'))::date <> (timezone(clinic_tz, new.starts_at))::date then
    raise exception 'appointment_must_fit_one_day' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtext(new.owner_id::text), hashtext((timezone(clinic_tz, new.starts_at))::date::text));
  if exists (
    select 1 from public.appointments a
    where a.owner_id = new.owner_id
      and a.status <> 'cancelled'
      and a.id is distinct from new.id
      and a.starts_at < new_end
      and a.starts_at + make_interval(mins => a.duration_minutes) > new.starts_at
  ) then
    raise exception 'appointment_time_conflict' using errcode = '23P01';
  end if;
  return new;
end;
$$;
drop trigger if exists appointments_prevent_conflicts on public.appointments;
create trigger appointments_prevent_conflicts before insert or update of owner_id, starts_at, duration_minutes, status
on public.appointments for each row execute function public.prevent_appointment_conflicts();

-- Registros finalizados são imutáveis. Correções entram como novos adendos ligados ao original.
alter table public.clinical_records add column if not exists is_finalized boolean not null default false;
alter table public.clinical_records add column if not exists finalized_at timestamptz;
alter table public.clinical_records add column if not exists amends_record_id uuid;
alter table public.clinical_records add column if not exists amendment_reason text;
-- A chave primária em id não basta para uma FK composta por (owner_id, id).
do $$ begin
  alter table public.clinical_records add constraint clinical_records_owner_id_id_unique unique (owner_id, id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clinical_records add constraint clinical_records_amended_record_fk
    foreign key (owner_id, amends_record_id) references public.clinical_records(owner_id, id) on delete restrict;
exception when duplicate_object then null; end $$;
create index if not exists clinical_records_owner_finalized_idx on public.clinical_records(owner_id, is_finalized, occurred_at desc);

create or replace function public.protect_finalized_clinical_record()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_finalized then raise exception 'finalized_clinical_record_is_immutable' using errcode = '23514'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.is_finalized then
    raise exception 'finalized_clinical_record_is_immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.is_finalized and new.finalized_at is null then
    new.finalized_at := now();
  end if;
  if new.amends_record_id is not null and coalesce(trim(new.amendment_reason), '') = '' then
    raise exception 'amendment_reason_required' using errcode = '23514';
  end if;
  if new.amends_record_id is not null and not exists (
    select 1 from public.clinical_records original
    where original.id = new.amends_record_id
      and original.owner_id = new.owner_id
      and original.patient_id = new.patient_id
      and original.is_finalized
  ) then
    raise exception 'amendment_must_reference_finalized_record_for_same_patient' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists clinical_records_immutable_finalized on public.clinical_records;
drop trigger if exists clinical_records_validate_amendment on public.clinical_records;
create trigger clinical_records_validate_amendment before insert or update or delete on public.clinical_records
for each row execute function public.protect_finalized_clinical_record();

-- Preferências do consultório, sem conteúdo clínico.
create table if not exists public.clinic_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  clinic_name text not null default 'Vincóra' check (char_length(trim(clinic_name)) between 1 and 120),
  timezone text not null default 'America/Manaus',
  default_session_minutes integer not null default 50 check (default_session_minutes between 10 and 240),
  business_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.clinic_settings enable row level security;
drop policy if exists "settings_select_own" on public.clinic_settings;
create policy "settings_select_own" on public.clinic_settings for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "settings_insert_own" on public.clinic_settings;
create policy "settings_insert_own" on public.clinic_settings for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "settings_update_own" on public.clinic_settings;
create policy "settings_update_own" on public.clinic_settings for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop trigger if exists settings_updated_at on public.clinic_settings;
create trigger settings_updated_at before update on public.clinic_settings for each row execute function public.set_updated_at();

-- Modelos próprios para anamnese, evolução e outros registros clínicos.
create table if not exists public.clinical_record_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  record_type text not null check (record_type in ('anamnesis','evolution','care_plan','other')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  content text not null default '' check (char_length(content) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_record_templates_owner_id_id_unique unique (owner_id, id)
);
alter table public.clinical_record_templates enable row level security;
drop policy if exists "clinical_templates_select_own" on public.clinical_record_templates;
create policy "clinical_templates_select_own" on public.clinical_record_templates for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "clinical_templates_insert_own" on public.clinical_record_templates;
create policy "clinical_templates_insert_own" on public.clinical_record_templates for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "clinical_templates_update_own" on public.clinical_record_templates;
create policy "clinical_templates_update_own" on public.clinical_record_templates for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "clinical_templates_delete_own" on public.clinical_record_templates;
create policy "clinical_templates_delete_own" on public.clinical_record_templates for delete to authenticated using (owner_id = (select auth.uid()));
drop trigger if exists clinical_templates_updated_at on public.clinical_record_templates;
create trigger clinical_templates_updated_at before update on public.clinical_record_templates for each row execute function public.set_updated_at();

-- Modelos editáveis pertencem à profissional; documentos binários ficam no bucket privado.
create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  document_type text not null,
  body text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_templates_owner_id_id_unique unique (owner_id, id)
);
alter table public.document_templates enable row level security;
drop policy if exists "templates_select_own" on public.document_templates;
create policy "templates_select_own" on public.document_templates for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "templates_insert_own" on public.document_templates;
create policy "templates_insert_own" on public.document_templates for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "templates_update_own" on public.document_templates;
create policy "templates_update_own" on public.document_templates for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "templates_delete_own" on public.document_templates;
create policy "templates_delete_own" on public.document_templates for delete to authenticated using (owner_id = (select auth.uid()));
drop trigger if exists templates_updated_at on public.document_templates;
create trigger templates_updated_at before update on public.document_templates for each row execute function public.set_updated_at();

alter table public.documents add column if not exists content text;
alter table public.documents add column if not exists status text not null default 'issued' check (status in ('draft','issued','archived'));
alter table public.documents add column if not exists template_id uuid;
do $$ begin
  alter table public.documents add constraint documents_owner_template_fk
    foreign key (owner_id, template_id) references public.document_templates(owner_id, id) on delete restrict;
exception when duplicate_object then null; end $$;

-- Arquivos clínicos em bucket privado; o primeiro segmento do caminho é o UUID do proprietário.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vincora-private', 'vincora-private', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png'];
drop policy if exists "vincora_storage_select_own" on storage.objects;
create policy "vincora_storage_select_own" on storage.objects for select to authenticated
using (bucket_id = 'vincora-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "vincora_storage_insert_own" on storage.objects;
create policy "vincora_storage_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'vincora-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "vincora_storage_update_own" on storage.objects;
create policy "vincora_storage_update_own" on storage.objects for update to authenticated
using (bucket_id = 'vincora-private' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'vincora-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "vincora_storage_delete_own" on storage.objects;
create policy "vincora_storage_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'vincora-private' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Trilha mínima de operações: registra proprietário/tabela/ID/ação, nunca o conteúdo dos registros.
alter table public.audit_events add column if not exists metadata jsonb not null default '{}'::jsonb;
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
drop trigger if exists audit_patients on public.patients;
create trigger audit_patients after insert or update or delete on public.patients for each row execute function public.write_audit_event();
drop trigger if exists audit_appointments on public.appointments;
create trigger audit_appointments after insert or update or delete on public.appointments for each row execute function public.write_audit_event();
drop trigger if exists audit_clinical_records on public.clinical_records;
create trigger audit_clinical_records after insert or update or delete on public.clinical_records for each row execute function public.write_audit_event();
drop trigger if exists audit_transactions on public.financial_transactions;
create trigger audit_transactions after insert or update or delete on public.financial_transactions for each row execute function public.write_audit_event();
drop trigger if exists audit_documents on public.documents;
create trigger audit_documents after insert or update or delete on public.documents for each row execute function public.write_audit_event();
