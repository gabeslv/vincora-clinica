import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Plus, RotateCcw, Search, ShieldCheck, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Appointment, AppointmentStatus, Patient } from '../types/database'

type ViewMode = 'day' | 'week' | 'month'
type EventRow = Appointment & { patient_name: string }
type FormValue = { patient_id: string; date: string; time: string; duration_minutes: number; modality: 'in_person' | 'video' | 'phone'; administrative_note: string }
type AuditRow = { record_id: string | null; action: string; created_at: string }
const statuses: Record<AppointmentStatus, string> = { scheduled: 'Agendado', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado', no_show: 'Falta' }
const emptyForm = (date: string): FormValue => ({ patient_id: '', date, time: '09:00', duration_minutes: 50, modality: 'in_person', administrative_note: '' })
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
const parseDate = (key: string) => { const [y,m,d] = key.split('-').map(Number); return new Date(y, m-1, d) }
const shiftDays = (date: Date, count: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate()+count)
const weekStart = (date: Date) => shiftDays(date, -((date.getDay()+6)%7))
const dateLabel = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', options).format(date)
const modalityLabel = (value: FormValue['modality']) => value === 'video' ? 'Online' : value === 'phone' ? 'Telefone' : 'Presencial'

export default function AgendaPage() {
  const [today] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))
  const [view, setView] = useState<ViewMode>('week')
  const [events, setEvents] = useState<EventRow[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<EventRow | null>(null)
  const [form, setForm] = useState<FormValue>(() => emptyForm(dateKey(new Date())))
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [defaultDuration, setDefaultDuration] = useState(50)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all'|AppointmentStatus>('all')

  const range = useMemo(() => {
    const selected = parseDate(selectedDate)
    if (view === 'day') return { start: selected, count: 1 }
    if (view === 'week') return { start: weekStart(selected), count: 7 }
    const first = new Date(selected.getFullYear(), selected.getMonth(), 1)
    const start = weekStart(first)
    const last = new Date(selected.getFullYear(), selected.getMonth()+1, 0)
    return { start, count: Math.ceil((shiftDays(last, 1).getTime()-start.getTime())/86400000) + ((start.getDay()+6)%7 === 0 ? 0 : 0) }
  }, [selectedDate, view])
  const dates = useMemo(() => Array.from({ length: view === 'month' ? Math.max(35, range.count) : range.count }, (_, index) => shiftDays(range.start, index)), [range, view])

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true); setPageError('')
    const start = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate()).toISOString()
    const endDate = shiftDays(range.start, range.count)
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).toISOString()
    const [{ data: rows, error }, { data: activePatients, error: patientError }, { data: userData }] = await Promise.all([
      supabase.from('appointments').select('id, owner_id, patient_id, starts_at, duration_minutes, modality, status, administrative_note, created_at').gte('starts_at', start).lt('starts_at', end).order('starts_at'),
      supabase.from('patients').select('id, owner_id, full_name, email, phone, birth_date, status, administrative_notes, created_at, updated_at').order('full_name').limit(1000),
      supabase.auth.getUser(),
    ])
    if (error || patientError) { setPageError('Não foi possível carregar a agenda. Confira se a migração 002 foi aplicada e tente novamente.'); setEvents([]); setLoading(false); return }
    const patientMap = new Map((activePatients ?? []).map((patient) => [patient.id, patient.full_name]))
    setPatients(((activePatients ?? []) as Patient[]).filter((patient) => patient.status === 'active'))
    setEvents(((rows ?? []) as Appointment[]).map((row) => ({ ...row, patient_name: patientMap.get(row.patient_id) ?? 'Paciente arquivado' })))
    if (userData.user) {
      const { data: clinicSettings } = await supabase.from('clinic_settings').select('default_session_minutes').eq('owner_id', userData.user.id).maybeSingle()
      if (clinicSettings?.default_session_minutes) setDefaultDuration(clinicSettings.default_session_minutes)
      const { data: logs } = await supabase.from('audit_events').select('record_id, action, created_at').eq('owner_id', userData.user.id).eq('table_name', 'appointments').order('created_at', { ascending: false }).limit(8)
      setAudit((logs ?? []) as AuditRow[])
    }
    setLoading(false)
  }, [range])

  useEffect(() => { void load() }, [load])
  const eventsByDate = useMemo(() => { const map = new Map<string, EventRow[]>(); for (const event of events) { const key = dateKey(new Date(event.starts_at)); map.set(key, [...(map.get(key) ?? []), event]) } return map }, [events])

  function shiftPeriod(direction: number) {
    const date = parseDate(selectedDate)
    const next = view === 'day' ? shiftDays(date, direction) : view === 'week' ? shiftDays(date, 7*direction) : new Date(date.getFullYear(), date.getMonth()+direction, 1)
    setSelectedDate(dateKey(next))
  }
  function openCreate(date = selectedDate) { setEditing(null); setForm({...emptyForm(date),duration_minutes:defaultDuration}); setFormError(''); setDialog(true) }
  function openEdit(event: EventRow) { setEditing(event); const start = new Date(event.starts_at); setForm({ patient_id: event.patient_id, date: dateKey(start), time: `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`, duration_minutes: event.duration_minutes, modality: event.modality, administrative_note: event.administrative_note ?? '' }); setFormError(''); setDialog(true) }

  async function save(event: FormEvent) {
    event.preventDefault(); setFormError('')
    if (!form.patient_id) { setFormError('Escolha um paciente ativo.'); return }
    if (!supabase) return
    const starts = new Date(`${form.date}T${form.time}`)
    if (!Number.isFinite(starts.getTime())) { setFormError('Confira a data e o horário.'); return }
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) { setFormError('Sua sessão expirou. Entre novamente.'); return }
    const payload = { owner_id: userData.user.id, patient_id: form.patient_id, starts_at: starts.toISOString(), duration_minutes: Number(form.duration_minutes), modality: form.modality, administrative_note: form.administrative_note.trim() || null }
    setBusy(true)
    const result = editing ? await supabase.from('appointments').update(payload).eq('id', editing.id) : await supabase.from('appointments').insert(payload)
    setBusy(false)
    if (result.error) {
      setFormError(result.error.code === '23P01' || result.error.message.includes('appointment_time_conflict') ? 'Este horário conflita com outro atendimento. Escolha outro horário.' : result.error.message.includes('appointment_must_fit_one_day') ? 'O atendimento precisa terminar no mesmo dia.' : 'Não foi possível salvar o atendimento. Confira se a migração 002 foi aplicada.')
      return
    }
    setDialog(false); setNotice(editing ? 'Agendamento atualizado.' : 'Atendimento agendado.'); await load()
  }

  async function changeStatus(item: EventRow, status: AppointmentStatus) {
    if (!supabase) return
    const { error } = await supabase.from('appointments').update({ status }).eq('id', item.id)
    if (error) { setNotice('Não foi possível alterar o status.'); return }
    setNotice(`Status atualizado: ${statuses[status].toLocaleLowerCase('pt-BR')}.`); await load()
  }

  const headingDate = view === 'month' ? dateLabel(parseDate(selectedDate), { month: 'long', year: 'numeric' }) : view === 'week' ? `${dateLabel(range.start, { day: 'numeric', month: 'short' })} – ${dateLabel(shiftDays(range.start, 6), { day: 'numeric', month: 'short', year: 'numeric' })}` : dateLabel(parseDate(selectedDate), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const eventsToday = events.filter((item) => dateKey(new Date(item.starts_at)) === selectedDate)
  const visibleEvents=(view==='week'?events:eventsToday).filter((item)=>(statusFilter==='all'||item.status===statusFilter)&&item.patient_name.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')))

  return <div className="agenda-page">
    <div className="page-heading"><div><div className="eyebrow">ROTINA DO CONSULTÓRIO</div><h1>Agenda</h1><p>Organize atendimentos e acompanhe cada horário.</p></div><button className="primary-button" onClick={() => openCreate()}><Plus size={17} /> Novo atendimento</button></div>
    {notice && <div className="success-banner" role="status"><Check size={15} />{notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso"><X size={14} /></button></div>}
    {pageError && <div className="notice-error" role="alert">{pageError}<button className="text-button" onClick={() => void load()}>Tentar novamente</button></div>}
    <div className="agenda-toolbar"><div className="period-control"><button className="icon-button" aria-label="Período anterior" onClick={() => shiftPeriod(-1)}><ArrowLeft size={16} /></button><button className="today-button" onClick={() => setSelectedDate(dateKey(today))}>Hoje</button><button className="icon-button" aria-label="Próximo período" onClick={() => shiftPeriod(1)}><ArrowRight size={16} /></button><h2>{headingDate}</h2></div><div className="agenda-view-tabs" role="group" aria-label="Visualização da agenda">{([['day','Dia'],['week','Semana'],['month','Mês']] as const).map(([key,label]) => <button key={key} onClick={() => setView(key)} aria-pressed={view===key} className={view===key?'selected':''}>{label}</button>)}</div></div>
    <div className="agenda-layout"><section className="surface-card calendar-card">
      {view === 'month' ? <div className="month-calendar"><div className="weekday-row">{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{dates.map((date) => { const key = dateKey(date); const inMonth = date.getMonth() === parseDate(selectedDate).getMonth(); const dayEvents = eventsByDate.get(key) ?? []; return <button key={key} className={`month-day ${inMonth?'':'outside-month'} ${key===selectedDate?'chosen-day':''} ${key===dateKey(today)?'current-day':''}`} onClick={() => { setSelectedDate(key); setView('day') }}><span>{date.getDate()}</span>{dayEvents.length>0&&<i>{dayEvents.length} {dayEvents.length===1?'atendimento':'atend.'}</i>}</button> })}</div></div> : view === 'week' ? <div className="week-grid">{dates.map((date) => { const key=dateKey(date); const dayEvents=eventsByDate.get(key)??[]; return <button key={key} className={`week-day ${key===selectedDate?'selected-day':''} ${key===dateKey(today)?'current-day':''}`} onClick={() => setSelectedDate(key)}><span>{dateLabel(date,{weekday:'short'})}</span><b>{date.getDate()}</b><i>{dayEvents.length?`${dayEvents.length} ${dayEvents.length===1?'sessão':'sessões'}`:'—'}</i></button> })}</div> : null}
      <div className="calendar-list-heading"><div><div className="eyebrow">{view==='month'?'DIA SELECIONADO':'HORÁRIOS'}</div><h3>{view==='month'?dateLabel(parseDate(selectedDate),{weekday:'long',day:'numeric',month:'long'}):view==='week'?'Atendimentos da semana':'Atendimentos do dia'}</h3></div><span className="record-count">{view==='week'?events.length:eventsToday.length}</span></div>
      <div className="agenda-filters"><label className="agenda-search"><Search size={15}/><input aria-label="Buscar na agenda por paciente" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar por paciente"/></label><label className="agenda-status-filter"><span className="sr-only">Filtrar por status</span><select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value as 'all'|AppointmentStatus)}><option value="all">Todos os status</option>{Object.entries(statuses).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select><ChevronDown size={13}/></label></div>
      {loading ? <div className="patient-loading"><span className="loader small" />Carregando agenda…</div> : visibleEvents.length ? <div className="appointment-list">{visibleEvents.map((item) => <AppointmentCard key={item.id} event={item} onEdit={openEdit} onStatus={changeStatus} />)}</div> : <div className="patients-empty"><div className="empty-icon"><CalendarDays size={24} /></div><h3>{search||statusFilter!=='all'?'Nenhum atendimento corresponde aos filtros':'Nenhum atendimento neste período'}</h3><p>{search||statusFilter!=='all'?'Altere os filtros para ver outros atendimentos.':'Quando você agendar uma sessão, ela aparecerá aqui.'}</p>{!search&&statusFilter==='all'&&<button className="outline-button" onClick={() => openCreate(selectedDate)}><Plus size={15} /> Agendar atendimento</button>}</div>}
      <div className="agenda-legend"><span><i className="legend-dot scheduled" />Agendado</span><span><i className="legend-dot confirmed" />Confirmado</span><span><i className="legend-dot completed" />Concluído</span><span><i className="legend-dot cancelled" />Cancelado / falta</span></div>
    </section><aside className="agenda-side"><section className="surface-card day-summary"><div className="card-heading"><div><h3>Resumo do período</h3><p>{headingDate}</p></div><CalendarDays size={19} className="summary-shield" /></div><div className="summary-number">{loading?'—':view==='week'?events.length:eventsToday.length}</div><div className="summary-caption">atendimentos cadastrados</div><div className="summary-statuses">{(['scheduled','confirmed','completed','no_show','cancelled'] as AppointmentStatus[]).map((status) => <div key={status}><span className={`legend-dot ${status}`} />{statuses[status]}<b>{events.filter((item)=>item.status===status && (view==='week'||dateKey(new Date(item.starts_at))===selectedDate)).length}</b></div>)}</div></section>
      <section className="surface-card agenda-audit"><div className="eyebrow">HISTÓRICO DE ALTERAÇÕES</div><h3>Atividade recente</h3>{audit.length ? <div className="audit-list">{audit.map((entry,index)=><div key={`${entry.record_id}-${entry.created_at}-${index}`}><i /> <span><b>{entry.action==='insert'?'Atendimento criado':entry.action==='delete'?'Registro removido':'Atendimento atualizado'}</b><small>{dateLabel(new Date(entry.created_at),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span></div>)}</div> : <p>As alterações nos agendamentos aparecerão aqui.</p>}</section>
      <div className="agenda-privacy"><ShieldCheck size={15} />Conflitos de horário também são verificados pelo banco.</div></aside></div>
    {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy)setDialog(false)}}><section className="patient-modal appointment-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-title"><div className="modal-heading"><div><div className="eyebrow">{editing?'ALTERAR HORÁRIO':'NOVO HORÁRIO'}</div><h2 id="appointment-title">{editing?'Editar atendimento':'Agendar atendimento'}</h2></div><button className="icon-button" onClick={()=>!busy&&setDialog(false)} aria-label="Fechar"><X size={18}/></button></div><form className="patient-form" onSubmit={save}>
      <div className="form-field full-field"><label htmlFor="appointment-patient">Paciente <span>*</span></label><select id="appointment-patient" required value={form.patient_id} onChange={(e)=>setForm({...form,patient_id:e.target.value})}><option value="">Selecione um paciente ativo</option>{patients.map((p)=><option value={p.id} key={p.id}>{p.full_name}</option>)}</select></div>
      <div className="form-field"><label htmlFor="appointment-date">Data <span>*</span></label><input id="appointment-date" type="date" required value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})}/></div><div className="form-field"><label htmlFor="appointment-time">Horário <span>*</span></label><input id="appointment-time" type="time" required value={form.time} onChange={(e)=>setForm({...form,time:e.target.value})}/></div>
      <div className="form-field"><label htmlFor="appointment-duration">Duração</label><select id="appointment-duration" value={form.duration_minutes} onChange={(e)=>setForm({...form,duration_minutes:Number(e.target.value)})}>{[30,40,45,50,60,75,90,120].map((duration)=><option value={duration} key={duration}>{duration} minutos</option>)}</select></div><div className="form-field"><label htmlFor="appointment-modality">Modalidade</label><select id="appointment-modality" value={form.modality} onChange={(e)=>setForm({...form,modality:e.target.value as FormValue['modality']})}><option value="in_person">Presencial</option><option value="video">Online</option><option value="phone">Telefone</option></select></div>
      <div className="form-field full-field"><label htmlFor="appointment-note">Observação administrativa <span className="optional-label">Opcional</span></label><textarea id="appointment-note" rows={2} maxLength={500} value={form.administrative_note} onChange={(e)=>setForm({...form,administrative_note:e.target.value})} placeholder="Informação administrativa, sem conteúdo clínico"/></div>
      {formError&&<p className="form-error full-field" role="alert"><AlertCircle size={14}/>{formError}</p>}<div className="modal-actions full-field"><button type="button" className="outline-button" onClick={()=>setDialog(false)} disabled={busy}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy?'Salvando…':editing?'Salvar alterações':'Agendar'}</button></div>
    </form></section></div>}
  </div>
}

function AppointmentCard({event,onEdit,onStatus}:{event:EventRow;onEdit:(event:EventRow)=>void;onStatus:(event:EventRow,status:AppointmentStatus)=>void}) {
  const start=new Date(event.starts_at);const end=new Date(start.getTime()+event.duration_minutes*60000)
  return <article className={`appointment-row status-border-${event.status}`}><div className="appointment-time"><b>{dateLabel(start,{hour:'2-digit',minute:'2-digit'})}</b><span>{dateLabel(end,{hour:'2-digit',minute:'2-digit'})} · {event.duration_minutes} min</span></div><div className="appointment-person"><span className="patient-avatar avatar-0">{event.patient_name.charAt(0).toLocaleUpperCase('pt-BR')}</span><div><b>{event.patient_name}</b><span>{modalityLabel(event.modality)}{event.administrative_note?` · ${event.administrative_note}`:''}</span></div></div><div className="appointment-actions"><label className={`patient-status status-${event.status}`}><span className="sr-only">Status</span><select aria-label={`Status de ${event.patient_name}`} value={event.status} onChange={(e)=>onStatus(event,e.target.value as AppointmentStatus)}>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><ChevronDown size={12}/></label><button className="icon-button" onClick={()=>onEdit(event)} aria-label={`Editar atendimento de ${event.patient_name}`} title="Editar ou reagendar"><RotateCcw size={15}/></button></div></article>
}
