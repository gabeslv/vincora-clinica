import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { ReactNode } from 'react'
import { Archive, CalendarDays, Check, ChevronDown, Edit3, Mail, Phone, Plus, RotateCcw, Search, ShieldCheck, UserRound, Users, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Patient } from '../types/database'

type Filter = 'all' | 'active' | 'inactive'
type PatientForm = { full_name: string; email: string; phone: string; birth_date: string; administrative_notes: string }
type PatientVisit = { id: string; starts_at: string; duration_minutes: number; status: string; modality: string }
const emptyForm: PatientForm = { full_name: '', email: '', phone: '', birth_date: '', administrative_notes: '' }
const nameKey = (name: string) => name.trim().toLocaleLowerCase('pt-BR')
const formatBirthDate = (date: string | null) => date ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'long' }).format(new Date(`${date}T00:00:00Z`)) : 'Não informado'

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('active')
  const [sort, setSort] = useState<'name' | 'recent'>('name')
  const [dialog, setDialog] = useState<'create' | 'edit' | 'view' | null>(null)
  const [selected, setSelected] = useState<Patient | null>(null)
  const [form, setForm] = useState<PatientForm>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [visits, setVisits] = useState<PatientVisit[]>([])
  const [visitsLoading, setVisitsLoading] = useState(false)

  const loadPatients = useCallback(async () => {
    if (!supabase) return
    setLoading(true); setLoadError('')
    let query = supabase.from('patients').select('id, owner_id, full_name, email, phone, birth_date, status, administrative_notes, created_at, updated_at')
    if (filter !== 'all') query = query.eq('status', filter)
    const { data, error } = await query.order('full_name', { ascending: true }).limit(500)
    if (error) setLoadError('Não foi possível carregar os pacientes. Confira a conexão com o Supabase e as políticas de acesso.')
    else setPatients((data ?? []) as Patient[])
    setLoading(false)
  }, [filter])

  useEffect(() => { void loadPatients() }, [loadPatients])

  const visiblePatients = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('pt-BR')
    const items = patients.filter((p) => !normalized || [p.full_name, p.email ?? '', p.phone ?? ''].some((field) => field.toLocaleLowerCase('pt-BR').includes(normalized)))
    return sort === 'name' ? items.sort((a, b) => nameKey(a.full_name).localeCompare(nameKey(b.full_name), 'pt-BR')) : items.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [patients, search, sort])

  function openCreate() { setSelected(null); setForm(emptyForm); setFormError(''); setDialog('create') }
  function openEdit(patient: Patient) { setSelected(patient); setForm({ full_name: patient.full_name, email: patient.email ?? '', phone: patient.phone ?? '', birth_date: patient.birth_date ?? '', administrative_notes: patient.administrative_notes ?? '' }); setFormError(''); setDialog('edit') }
  async function openView(patient: Patient) { setSelected(patient); setVisits([]); setVisitsLoading(true); setDialog('view'); if (supabase) { const { data, error } = await supabase.from('appointments').select('id, starts_at, duration_minutes, status, modality').eq('patient_id', patient.id).order('starts_at', { ascending: false }).limit(10); if (!error) setVisits((data ?? []) as PatientVisit[]) } setVisitsLoading(false) }
  function closeDialog() { if (!busy) { setDialog(null); setSelected(null); setFormError('') } }

  async function savePatient(event: FormEvent) {
    event.preventDefault(); setFormError('')
    const fullName = form.full_name.trim().replace(/\s+/g, ' ')
    if (fullName.length < 2) { setFormError('Informe o nome completo do paciente.'); return }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setFormError('Confira o formato do e-mail.'); return }
    if (!supabase) { setFormError('O Supabase ainda não está configurado.'); return }
    setBusy(true)
    const data = { full_name: fullName, email: form.email.trim() || null, phone: form.phone.trim() || null, birth_date: form.birth_date || null, administrative_notes: form.administrative_notes.trim() || null }
    const result = dialog === 'edit' && selected
      ? await supabase.from('patients').update(data).eq('id', selected.id)
      : await (async () => { const { data: userData, error: userError } = await supabase.auth.getUser(); if (userError || !userData.user) return { error: userError ?? new Error('Sessão expirada.') }; return supabase.from('patients').insert({ ...data, owner_id: userData.user.id }) })()
    setBusy(false)
    if (result.error) { setFormError('Não foi possível salvar. Verifique sua conexão e tente novamente.'); return }
    setDialog(null); setSelected(null); setNotice(dialog === 'edit' ? 'Cadastro atualizado.' : 'Paciente cadastrado.'); await loadPatients()
  }

  async function setPatientStatus(patient: Patient) {
    const next = patient.status === 'active' ? 'inactive' : 'active'
    const action = next === 'inactive' ? 'arquivar' : 'reativar'
    if (!window.confirm(`Deseja ${action} o cadastro de ${patient.full_name}?`)) return
    if (!supabase) return
    const { error } = await supabase.from('patients').update({ status: next }).eq('id', patient.id)
    if (error) { setNotice('Não foi possível atualizar o status. Tente novamente.'); return }
    setNotice(next === 'inactive' ? 'Paciente arquivado.' : 'Paciente reativado.'); await loadPatients()
  }

  return <div className="patients-page">
    <div className="page-heading patients-heading"><div><div className="eyebrow">CUIDADO E ACOMPANHAMENTO</div><h1>Pacientes</h1><p>Cadastros administrativos organizados com atenção e privacidade.</p></div><button className="primary-button" onClick={openCreate}><Plus size={17} /> Novo paciente</button></div>
    <section className="patients-summary"><div className="summary-icon"><Users size={20} /></div><div><strong>Informações com propósito</strong><span>Cadastre apenas os dados administrativos necessários. Registros clínicos pertencem a um módulo separado.</span></div><ShieldCheck size={18} className="summary-shield" /></section>
    {notice && <div className="success-banner" role="status"><Check size={16} />{notice}<button aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15} /></button></div>}
    {loadError && <div className="notice-error" role="alert">{loadError}<button className="text-button" onClick={() => void loadPatients()}>Tentar novamente</button></div>}
    <section className="surface-card patient-directory"><div className="directory-top"><div><div className="directory-title"><h2>Cadastro de pacientes</h2><span className="record-count">{loading ? '…' : visiblePatients.length}</span></div><p>Pesquise e mantenha os dados atualizados</p></div><label className="sort-control"><span>Ordenar</span><select value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'recent')}><option value="name">Nome A–Z</option><option value="recent">Mais recentes</option></select><ChevronDown size={14} /></label></div>
      <div className="directory-controls"><div className="patient-search"><Search size={17} /><input aria-label="Buscar pacientes" placeholder="Buscar por nome, e-mail ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="filter-tabs" role="group" aria-label="Filtrar pacientes">{([['active', 'Ativos'], ['inactive', 'Arquivados'], ['all', 'Todos']] as const).map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={filter === key ? 'filter-active' : ''} aria-pressed={filter === key}>{label}</button>)}</div></div>
      {loading ? <div className="patient-loading"><span className="loader small" />Carregando cadastros…</div> : visiblePatients.length ? <div className="patient-table-wrap"><table className="patient-table"><thead><tr><th>Paciente</th><th>Contato</th><th>Nascimento</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{visiblePatients.map((patient, index) => <tr key={patient.id}><td><button className="patient-person" onClick={() => openView(patient)}><span className={`patient-avatar avatar-${index % 4}`}>{patient.full_name.trim().charAt(0).toLocaleUpperCase('pt-BR')}</span><span><b>{patient.full_name}</b><small>Incluído em {new Intl.DateTimeFormat('pt-BR').format(new Date(patient.created_at))}</small></span></button></td><td><div className="contact-cell">{patient.phone && <span><Phone size={13} />{patient.phone}</span>}{patient.email && <span><Mail size={13} />{patient.email}</span>}{!patient.email && !patient.phone && <span className="no-contact">Sem contato informado</span>}</div></td><td className="birth-cell">{patient.birth_date ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${patient.birth_date}T00:00:00Z`)) : '—'}</td><td><span className={`patient-status ${patient.status === 'active' ? 'status-active' : 'status-inactive'}`}><i />{patient.status === 'active' ? 'Ativo' : 'Arquivado'}</span></td><td><div className="row-actions"><button className="icon-button" onClick={() => openEdit(patient)} title="Editar cadastro" aria-label={`Editar ${patient.full_name}`}><Edit3 size={16} /></button><button className="icon-button" onClick={() => void setPatientStatus(patient)} title={patient.status === 'active' ? 'Arquivar cadastro' : 'Reativar cadastro'} aria-label={`${patient.status === 'active' ? 'Arquivar' : 'Reativar'} ${patient.full_name}`}>{patient.status === 'active' ? <Archive size={16} /> : <RotateCcw size={16} />}</button></div></td></tr>)}</tbody></table></div> : <div className="patients-empty"><div className="empty-icon"><Users size={23} /></div><h3>{search ? 'Nenhum resultado encontrado' : filter === 'inactive' ? 'Nenhum cadastro arquivado' : 'Seu primeiro vínculo começa aqui'}</h3><p>{search ? 'Tente outro nome, e-mail ou telefone.' : filter === 'inactive' ? 'Cadastros arquivados aparecerão nesta lista.' : 'Adicione um paciente para começar a organizar os acompanhamentos.'}</p>{!search && filter !== 'inactive' && <button className="outline-button" onClick={openCreate}><Plus size={15} /> Cadastrar primeiro paciente</button>}</div>}
      <div className="directory-footer"><span><LockKeyholeMini /> Somente sua conta pode acessar estes cadastros.</span><span>{loading ? '' : `${visiblePatients.length} ${visiblePatients.length === 1 ? 'cadastro' : 'cadastros'}`}</span></div>
    </section>
    {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}><section className="patient-modal" role="dialog" aria-modal="true" aria-labelledby="patient-modal-title"><div className="modal-heading"><div><div className="eyebrow">{dialog === 'create' ? 'NOVO VÍNCULO' : dialog === 'edit' ? 'ATUALIZAR CADASTRO' : 'CADASTRO ADMINISTRATIVO'}</div><h2 id="patient-modal-title">{dialog === 'create' ? 'Cadastrar paciente' : dialog === 'edit' ? 'Editar cadastro' : selected?.full_name}</h2></div><button className="icon-button" onClick={closeDialog} aria-label="Fechar" disabled={busy}><X size={19} /></button></div>
        {dialog === 'view' && selected ? <div className="patient-detail"><div className="detail-identity"><span className="patient-avatar avatar-0">{selected.full_name.charAt(0).toLocaleUpperCase('pt-BR')}</span><div><b>{selected.full_name}</b><span className={`patient-status ${selected.status === 'active' ? 'status-active' : 'status-inactive'}`}><i />{selected.status === 'active' ? 'Ativo' : 'Arquivado'}</span></div></div><div className="detail-grid"><Detail label="Telefone" value={selected.phone || 'Não informado'} icon={<Phone size={15} />} /><Detail label="E-mail" value={selected.email || 'Não informado'} icon={<Mail size={15} />} /><Detail label="Data de nascimento" value={formatBirthDate(selected.birth_date)} icon={<CalendarDays size={15} />} /><Detail label="Cadastro criado" value={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(selected.created_at))} icon={<UserRound size={15} />} /></div>{selected.administrative_notes && <div className="detail-notes"><span>Observações administrativas</span><p>{selected.administrative_notes}</p></div>}<div className="patient-visit-history"><div><b>Histórico de atendimentos</b><span>Últimos 10 agendamentos</span></div>{visitsLoading?<small>Carregando histórico…</small>:visits.length?<ul>{visits.map((visit)=><li key={visit.id}><span>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(visit.starts_at))} · {visit.duration_minutes} min</span><b>{({scheduled:'Agendado',confirmed:'Confirmado',completed:'Concluído',cancelled:'Cancelado',no_show:'Falta'} as Record<string,string>)[visit.status]??visit.status}</b></li>)}</ul>:<small>Este paciente ainda não tem atendimentos cadastrados.</small>}</div><div className="modal-actions"><button className="outline-button" onClick={() => openEdit(selected)}><Edit3 size={15} /> Editar dados</button><button className="primary-button" onClick={closeDialog}>Concluir</button></div></div> : <form className="patient-form" onSubmit={savePatient}>
          <div className="form-field full-field"><label htmlFor="full-name">Nome completo <span>*</span></label><input id="full-name" autoFocus required maxLength={160} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Nome e sobrenome" /></div>
          <div className="form-field"><label htmlFor="phone">Telefone</label><input id="phone" type="tel" autoComplete="tel" maxLength={32} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" /></div>
          <div className="form-field"><label htmlFor="patient-email">E-mail</label><input id="patient-email" type="email" autoComplete="email" maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nome@exemplo.com" /></div>
          <div className="form-field full-field"><label htmlFor="birth-date">Data de nascimento <span className="optional-label">Opcional</span></label><input id="birth-date" type="date" max={new Date().toISOString().slice(0, 10)} value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
          <div className="form-field full-field"><label htmlFor="admin-notes">Observações administrativas <span className="optional-label">Opcional</span></label><textarea id="admin-notes" rows={3} maxLength={800} value={form.administrative_notes} onChange={(e) => setForm({ ...form, administrative_notes: e.target.value })} placeholder="Informações administrativas úteis para o atendimento" /></div>
          <p className="form-privacy"><ShieldCheck size={15} />Não inclua informações clínicas neste cadastro.</p>{formError && <p className="form-error full-field" role="alert">{formError}</p>}<div className="modal-actions full-field"><button className="outline-button" type="button" onClick={closeDialog} disabled={busy}>Cancelar</button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Salvando…' : dialog === 'edit' ? 'Salvar alterações' : 'Cadastrar paciente'}</button></div>
        </form>}</section></div>}
  </div>
}

function Detail({ label, value, icon }: { label: string; value: string; icon: ReactNode }) { return <div className="detail-item"><span>{icon}{label}</span><b>{value}</b></div> }
function LockKeyholeMini() { return <ShieldCheck size={13} /> }
