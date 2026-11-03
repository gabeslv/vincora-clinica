-- Vincóra: schema inicial.
-- Execute no SQL Editor do Supabase. Revise antes de usar com dados reais.
-- Todas as tabelas privadas usam owner_id + RLS.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.professional_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  professional_registration text,
  timezone text not null default 'America/Manaus',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  full_name text not null,
  email text,
  phone text,
  birth_date date,
  status text not null default 'active' check (status in ('active','inactive')),
  administrative_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_owner_id_id_unique unique (owner_id, id),
  constraint patients_full_name_length_check check (char_length(trim(full_name)) between 2 and 160)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  patient_id uuid not null,
  starts_at timestamptz not null,
  duration_minutes integer not null default 50 check (duration_minutes between 10 and 240),
  status text not null default 'scheduled'
    check (status in ('scheduled','confirmed','completed','cancelled','no_show')),
  administrative_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_owner_id_id_unique unique (owner_id, id),
  constraint appointments_patient_owner_fk
    foreign key (owner_id, patient_id) references public.patients(owner_id, id) on delete restrict
);

create table if not exists public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  patient_id uuid not null,
  appointment_id uuid,
  record_type text not null check (record_type in ('anamnesis','evolution','care_plan','other')),
  title text not null,
  content text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_records_patient_owner_fk
    foreign key (owner_id, patient_id) references public.patients(owner_id, id) on delete restrict,
  constraint clinical_records_appointment_owner_fk
    foreign key (owner_id, appointment_id) references public.appointments(owner_id, id) on delete restrict
);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  patient_id uuid,
  appointment_id uuid,
  transaction_type text not null check (transaction_type in ('income','expense')),
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  due_date date,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_patient_owner_fk
    foreign key (owner_id, patient_id) references public.patients(owner_id, id) on delete restrict,
  constraint transactions_appointment_owner_fk
    foreign key (owner_id, appointment_id) references public.appointments(owner_id, id) on delete restrict
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  patient_id uuid,
  document_type text not null,
  title text not null,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_patient_owner_fk
    foreign key (owner_id, patient_id) references public.patients(owner_id, id) on delete restrict
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert','update','delete')),
  created_at timestamptz not null default now()
);

create index if not exists patients_owner_name_idx on public.patients(owner_id, full_name);
create index if not exists appointments_owner_starts_idx on public.appointments(owner_id, starts_at);
create index if not exists appointments_owner_patient_idx on public.appointments(owner_id, patient_id);
create index if not exists clinical_records_owner_patient_date_idx on public.clinical_records(owner_id, patient_id, occurred_at desc);
create index if not exists transactions_owner_due_idx on public.financial_transactions(owner_id, due_date);
create index if not exists documents_owner_patient_idx on public.documents(owner_id, patient_id);

-- RLS habilitado em todas as tabelas privadas.
alter table public.professional_profiles enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.clinical_records enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.documents enable row level security;
alter table public.audit_events enable row level security;

-- Profile: o profissional só pode ler e alterar seu próprio perfil.
create policy "profile_select_own" on public.professional_profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profile_insert_own" on public.professional_profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profile_update_own" on public.professional_profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Pacientes
create policy "patients_select_own" on public.patients
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "patients_insert_own" on public.patients
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "patients_update_own" on public.patients
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Pacientes são arquivados via UPDATE; a aplicação não permite exclusão física.

-- Agenda
create policy "appointments_select_own" on public.appointments
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "appointments_insert_own" on public.appointments
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "appointments_update_own" on public.appointments
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "appointments_delete_own" on public.appointments
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Prontuários: acesso restrito ao profissional proprietário.
create policy "clinical_records_select_own" on public.clinical_records
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "clinical_records_insert_own" on public.clinical_records
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "clinical_records_update_own" on public.clinical_records
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "clinical_records_delete_own" on public.clinical_records
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Financeiro
create policy "transactions_select_own" on public.financial_transactions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "transactions_insert_own" on public.financial_transactions
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "transactions_update_own" on public.financial_transactions
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "transactions_delete_own" on public.financial_transactions
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Documentos: metadados; arquivos devem ficar em bucket privado com políticas próprias.
create policy "documents_select_own" on public.documents
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "documents_insert_own" on public.documents
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "documents_update_own" on public.documents
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "documents_delete_own" on public.documents
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Eventos de auditoria: leitura própria. Escrita deve ser feita por função/trigger confiável.
create policy "audit_select_own" on public.audit_events
  for select to authenticated using (owner_id = (select auth.uid()));

-- Updated_at
create trigger patients_updated_at before update on public.patients
  for each row execute procedure public.set_updated_at();
create trigger appointments_updated_at before update on public.appointments
  for each row execute procedure public.set_updated_at();
create trigger clinical_records_updated_at before update on public.clinical_records
  for each row execute procedure public.set_updated_at();
create trigger transactions_updated_at before update on public.financial_transactions
  for each row execute procedure public.set_updated_at();
create trigger documents_updated_at before update on public.documents
  for each row execute procedure public.set_updated_at();
create trigger profiles_updated_at before update on public.professional_profiles
  for each row execute procedure public.set_updated_at();

-- Nota: a tabela audit_events não é gravável diretamente por usuários autenticados.
-- Adicione triggers SECURITY DEFINER cuidadosamente revisados antes de depender de auditoria.
