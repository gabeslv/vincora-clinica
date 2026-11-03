import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Activity, CalendarDays, ChartNoAxesCombined, ChevronDown, ChevronRight, CircleDollarSign, FileHeart, FileText, LayoutDashboard, LockKeyhole, LogOut, Menu, Settings, ShieldCheck, Users, X } from 'lucide-react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { formatDate } from './lib/format'
import { formatCurrency } from './lib/format'
import PatientsPage from './pages/PatientsPage'
const AgendaPage=lazy(()=>import('./pages/AgendaPage'))
const ClinicalRecordsPage=lazy(()=>import('./pages/ClinicalRecordsPage'))
const FinancePage=lazy(()=>import('./pages/FinancePage'))
const DocumentsPage=lazy(()=>import('./pages/DocumentsPage'))
const ReportsPage=lazy(()=>import('./pages/ReportsPage'))
const SettingsPage=lazy(()=>import('./pages/SettingsPage'))

type NavItem = { label: string; path: string; icon: typeof LayoutDashboard; active: boolean }
const navItems: NavItem[] = [
  { label: 'Visão geral', path: '/', icon: LayoutDashboard, active: true },
  { label: 'Agenda', path: '/agenda', icon: CalendarDays, active: true },
  { label: 'Pacientes', path: '/pacientes', icon: Users, active: true },
  { label: 'Prontuários', path: '/prontuarios', icon: FileHeart, active: true },
  { label: 'Financeiro', path: '/financeiro', icon: CircleDollarSign, active: true },
  { label: 'Documentos', path: '/documentos', icon: FileText, active: true },
  { label: 'Relatórios', path: '/relatorios', icon: ChartNoAxesCombined, active: true },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [mfaChecking, setMfaChecking] = useState(false)
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaCheckError, setMfaCheckError] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(() => {
    const params = new URLSearchParams(`${window.location.search}&${window.location.hash.replace(/^#/, '')}`)
    return params.get('type') === 'recovery'
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((event, next) => { setSession(next); setAuthLoading(false); if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true) })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (authLoading || recoveryMode) return
    if (!session || !supabase) { setMfaChecking(false); setMfaRequired(false); setMfaCheckError(''); return }
    let active = true
    setMfaChecking(true); setMfaCheckError('')
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
      if (!active) return
      if (error) { setMfaCheckError('Não foi possível verificar a autenticação multifator. Tente novamente.'); setMfaRequired(true) }
      else setMfaRequired(data.currentLevel === 'aal1' && data.nextLevel === 'aal2')
      setMfaChecking(false)
    })
    return () => { active = false }
  }, [session, authLoading, recoveryMode])

  const pageTitle = useMemo(() => navItems.find((item) => item.path === location.pathname)?.label ?? 'Configurações', [location.pathname])
  if (authLoading) return <LoadingScreen />
  if (!isSupabaseConfigured) return <SetupScreen />
  if (recoveryMode && session) return <PasswordRecoveryScreen onComplete={() => setRecoveryMode(false)} />
  if (!session) return <LoginScreen />
  if (mfaChecking) return <LoadingScreen />
  if (mfaRequired) return <MfaChallengeScreen initialError={mfaCheckError} onVerified={() => { setMfaRequired(false); setMfaCheckError('') }} />
  if (location.pathname === '/login') return <Navigate to="/" replace />

  async function signOut() { await supabase?.auth.signOut(); navigate('/login') }

  return <div className="app-shell">
    {sidebarOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><img className="brand-logo" src="/vincora-logo.png" alt="Vincôra" /><button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X size={18} /></button></div>
      <div className="workspace-label">ESPAÇO DE TRABALHO</div>
      <div className="workspace-card"><div className="workspace-avatar"><Activity size={17} /></div><div className="workspace-info"><strong>Clínica Vincôra</strong><span>Espaço profissional</span></div><ChevronDown size={15} className="muted-icon" /></div>
      <nav className="main-nav" aria-label="Menu principal"><div className="nav-caption">MENU PRINCIPAL</div>
        {navItems.map(({ label, path, icon: Icon, active }) => active
          ? <Link key={path} to={path} onClick={() => setSidebarOpen(false)} className={`nav-link ${location.pathname === path ? 'nav-link-active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></Link>
          : <span key={path} className="nav-link nav-link-muted" aria-disabled="true" title="Disponível em uma próxima etapa"><Icon size={18} strokeWidth={1.8} /><span>{label}</span><span className="stage-dot" /></span>)}
        <div className="nav-caption nav-caption-spaced">PREFERÊNCIAS</div><Link to="/configuracoes" onClick={() => setSidebarOpen(false)} className={`nav-link ${location.pathname === '/configuracoes' ? 'nav-link-active' : ''}`}><Settings size={18} /><span>Configurações</span></Link>
      </nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><ShieldCheck size={17} /></div><div><strong>Seus dados são privados</strong><span>Acesso protegido pela sua conta</span></div></div>
        <div className="profile-row"><div className="profile-avatar">{(session.user.email ?? 'V').charAt(0).toUpperCase()}</div><div className="profile-details"><strong>Profissional</strong><span title={session.user.email}>{session.user.email}</span></div><button className="icon-button" title="Sair" aria-label="Sair da conta" onClick={signOut}><LogOut size={17} /></button></div>
      </div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><div className="breadcrumbs"><span>Vincôra</span><ChevronRight size={14} /><strong>{pageTitle}</strong></div></div><div className="topbar-actions"><div className="privacy-chip"><LockKeyhole size={14} /><span>Área protegida</span></div><div className="topbar-avatar">{(session.user.email ?? 'V').charAt(0).toUpperCase()}</div></div></header>
      <div className="page-content"><Suspense fallback={<PageLoading/>}><Routes>
        <Route path="/" element={<Dashboard userEmail={session.user.email ?? ''} />} />
        <Route path="/pacientes" element={<PatientsPage />} />
        <Route path="/agenda" element={<AgendaPage />} /><Route path="/prontuarios" element={<ClinicalRecordsPage />} /><Route path="/financeiro" element={<FinancePage />} /><Route path="/documentos" element={<DocumentsPage />} /><Route path="/relatorios" element={<ReportsPage />} /><Route path="/configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes></Suspense></div>
      <footer className="app-footer"><span>Vincôra · cuidado em cada detalhe</span><span><ShieldCheck size={13} /> Seus dados permanecem privados</span></footer>
    </main>
  </div>
}

function LoadingScreen() { return <div className="center-screen"><img className="loading-logo" src="/vincora-logo.png" alt="Vincôra" /><p>Preparando seu espaço de cuidado…</p></div> }
function PageLoading(){return <div className="patient-loading"><span className="loader small"/>Abrindo módulo…</div>}

function SetupScreen() {
  return <div className="center-screen setup-screen"><img className="setup-logo" src="/vincora-logo.png" alt="Vincôra" /><div className="setup-card"><div className="eyebrow">CONFIGURAÇÃO INICIAL</div><h1>Vamos conectar seu consultório.</h1><p>Para ativar o login e todos os módulos, conecte um projeto Supabase e configure as variáveis de ambiente.</p><ol><li>Crie um projeto Supabase para a clínica.</li><li>Copie a URL e a chave pública (anon) do projeto.</li><li>Preencha <code>.env</code> com base em <code>.env.example</code>.</li><li>Execute as migrações <code>001_initial_schema.sql</code>, <code>002_clinical_operations.sql</code> e <code>003_fix_audit_trigger.sql</code>, nesta ordem.</li><li>Crie a conta profissional no Supabase Auth e desative cadastro público.</li></ol><div className="security-note"><ShieldCheck size={18} /><span>Não use dados reais até validar as políticas de acesso e a configuração de produção.</span></div></div></div>
}

function LoginScreen() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('')
  async function login(event: FormEvent) { event.preventDefault(); if (!supabase) return; setBusy(true); setError(''); setMessage(''); const { error: authError } = await supabase.auth.signInWithPassword({ email, password }); if (authError) setError('Não foi possível entrar. Confira o e-mail e a senha.'); setBusy(false) }
  async function resetPassword() { if (!supabase || !email) { setError('Informe seu e-mail para solicitar a recuperação.'); return } setBusy(true); setError(''); setMessage(''); const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }); if (resetError) setError('Não foi possível solicitar a recuperação. Verifique as configurações de e-mail do Supabase.'); else setMessage('Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.'); setBusy(false) }
  return <div className="auth-layout"><section className="auth-art"><div className="auth-brand"><img src="/vincora-logo.png" alt="Vincôra" /></div><div className="art-quote"><h2>Um espaço organizado para cuidar de quem importa.</h2><p>Mais tranquilidade para a rotina do consultório, com cuidado em cada detalhe.</p></div><div className="brand-color-dots"><i /><i /><i /><i /></div><div className="art-bottom">GESTÃO CLÍNICA COM CUIDADO</div></section><section className="auth-panel"><form className="auth-form" onSubmit={login}><div className="eyebrow">BEM-VINDA DE VOLTA</div><h1>Acesse seu consultório</h1><p className="auth-description">Entre com sua conta profissional para continuar.</p><label htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" required /><label htmlFor="password">Senha</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" required /><button className="primary-button auth-submit" disabled={busy} type="submit">{busy ? 'Aguarde…' : 'Entrar na minha conta'}<ChevronRight size={17} /></button><button type="button" className="text-button reset-button" onClick={resetPassword} disabled={busy}>Esqueci minha senha</button>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<div className="auth-security"><ShieldCheck size={16} /><span>Seu acesso é pessoal e protegido.</span></div></form><div className="auth-legal">O acesso é individual. Não compartilhe suas credenciais.</div></section></div>
}

function PasswordRecoveryScreen({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false)
  const navigate = useNavigate()
  async function updatePassword(event: FormEvent) {
    event.preventDefault(); setError('')
    if (password !== confirmation) { setError('As senhas informadas não são iguais.'); return }
    if (password.length < 8) { setError('Use uma senha com pelo menos 8 caracteres.'); return }
    if (!supabase) return
    setBusy(true); const { error: updateError } = await supabase.auth.updateUser({ password }); setBusy(false)
    if (updateError) { setError('Não foi possível atualizar sua senha. Solicite um novo link de recuperação.'); return }
    setDone(true)
  }
  function finish() { window.history.replaceState({}, '', '/'); onComplete(); navigate('/', { replace: true }) }
  return <div className="password-recovery-shell"><section className="password-recovery-card"><img src="/vincora-logo.png" alt="Vincôra" /><div className="eyebrow">SEGURANÇA DA CONTA</div>{done ? <><h1>Senha atualizada.</h1><p>Seu acesso está pronto. Entre novamente com a nova senha.</p><button className="primary-button" onClick={finish}>Voltar ao acesso seguro <ChevronRight size={17} /></button></> : <><h1>Defina sua nova senha</h1><p>Escolha uma senha pessoal e mantenha seu acesso protegido.</p><form className="recovery-form" onSubmit={updatePassword}><label htmlFor="new-password">Nova senha</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /><label htmlFor="confirm-password">Confirme a nova senha</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy}>{busy ? 'Atualizando…' : 'Salvar nova senha'}<ChevronRight size={17} /></button></form></>}</section></div>
}

function MfaChallengeScreen({ initialError, onVerified }: { initialError: string; onVerified: () => void }) {
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(true)
  useEffect(() => { let active=true; async function load(){if(!supabase){setLoading(false);return}const {data,error}=await supabase.auth.mfa.listFactors();if(!active)return;if(error)setError('Não foi possível localizar seu autenticador.');else setFactorId(data.totp.find((factor)=>factor.status==='verified')?.id??'');setLoading(false)}void load();return()=>{active=false}},[])
  async function verify(event:FormEvent){event.preventDefault();if(!supabase||!factorId)return;setBusy(true);setError('');const {error:verifyError}=await supabase.auth.mfa.challengeAndVerify({factorId,code:code.trim()});setBusy(false);if(verifyError){setError('Código incorreto ou expirado. Confira o app autenticador e tente novamente.');return}onVerified()}
  async function signOut(){await supabase?.auth.signOut()}
  return <div className="password-recovery-shell"><section className="password-recovery-card mfa-login-card"><img src="/vincora-logo.png" alt="Vincôra"/><div className="eyebrow">VERIFICAÇÃO DE SEGURANÇA</div><h1>Confirme seu acesso</h1><p>Digite o código temporário exibido no seu app autenticador.</p>{loading?<div className="patient-loading">Verificando fator…</div>:factorId?<form className="recovery-form" onSubmit={verify}><label htmlFor="login-mfa-code">Código autenticador</label><input id="login-mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,''))} required/><button className="primary-button" type="submit" disabled={busy||code.length<6}>{busy?'Verificando…':'Verificar código'}</button>{(error||initialError)&&<p className="form-error" role="alert">{error||initialError}</p>}</form>:<div className="notice-error" role="alert">Não foi encontrado um autenticador TOTP verificado para esta conta. Entre em contato com a administradora da clínica.<button className="primary-button" onClick={signOut}>Sair da conta</button></div>}<button type="button" className="text-button mfa-logout" onClick={signOut}>Encerrar sessão</button></section></div>
}

type DashboardAppointment={id:string;patient_id:string;starts_at:string;duration_minutes:number;status:string;patient_name:string}
function Dashboard({ userEmail }: { userEmail: string }) {
  const [patientCount,setPatientCount]=useState<number|null>(null);const [appointments,setAppointments]=useState<DashboardAppointment[]|null>(null);const [monthly,setMonthly]=useState<{income:number;pending:number}|null>(null);const [profileName,setProfileName]=useState('');const [loading,setLoading]=useState(true);const [loadError,setLoadError]=useState('')
  useEffect(()=>{let active=true;async function load(){const client=supabase;if(!client){setLoading(false);return}const now=new Date();const dayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());const nextDay=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);const monthStart=new Date(now.getFullYear(),now.getMonth(),1);const monthEnd=new Date(now.getFullYear(),now.getMonth()+1,1);const [{count,error:patientError},{data:todayRows,error:agendaError},{data:txRows,error:financeError},{data:profile},{data:allPatients}]=await Promise.all([client.from('patients').select('id',{count:'exact',head:true}).eq('status','active'),client.from('appointments').select('id,patient_id,starts_at,duration_minutes,status').gte('starts_at',dayStart.toISOString()).lt('starts_at',nextDay.toISOString()).order('starts_at'),client.from('financial_transactions').select('transaction_type,amount_cents,status').gte('created_at',monthStart.toISOString()).lt('created_at',monthEnd.toISOString()),client.auth.getUser().then(async({data:userData})=>userData.user?client.from('professional_profiles').select('display_name').eq('id',userData.user.id).maybeSingle():{data:null,error:null}),client.from('patients').select('id,full_name')]);if(!active)return;if(patientError||agendaError||financeError){setLoadError('Alguns indicadores não puderam ser carregados. Confira as migrações e tente novamente.')}setPatientCount(patientError?null:count??0);const patientRows=(allPatients??[]) as {id:string;full_name:string}[];const names=new Map<string,string>(patientRows.map((patient)=>[patient.id,patient.full_name]));setAppointments(agendaError?null:((todayRows??[]) as Omit<DashboardAppointment,'patient_name'>[]).map((row)=>({...row,patient_name:names.get(row.patient_id)??'Paciente arquivado'})));setMonthly(financeError?null:{income:(txRows??[]).filter((t)=>t.status==='paid'&&t.transaction_type==='income').reduce((sum,t)=>sum+t.amount_cents,0),pending:(txRows??[]).filter((t)=>t.status==='pending').reduce((sum,t)=>sum+t.amount_cents,0)});setProfileName(profile?.display_name??'');setLoading(false)}void load();return()=>{active=false}},[])
  const today=new Date();const greeting=today.getHours()<12?'Bom dia':today.getHours()<18?'Boa tarde':'Boa noite';const firstName=profileName.trim().split(/\s+/)[0]||userEmail.split('@')[0]?.split(/[._-]/)[0]||'profissional';const displayName=firstName.charAt(0).toLocaleUpperCase('pt-BR')+firstName.slice(1);const statusNames:Record<string,string>={scheduled:'Agendado',confirmed:'Confirmado',completed:'Concluído',cancelled:'Cancelado',no_show:'Falta'}
  return <div className="dashboard"><div className="page-heading"><div><div className="eyebrow">{formatDate(today)}</div><h1>{greeting}, {displayName}<span className="greeting-spark"> ✳</span></h1><p>Seu espaço de cuidado começa por aqui.</p></div><Link className="primary-button" to="/pacientes"><Users size={17}/>Cadastrar paciente</Link></div>
    <div className="welcome-banner"><div className="welcome-copy"><div className="welcome-kicker"><span className="brand-spark">✳</span> UM DIA DE CADA VEZ</div><h2>Seu trabalho merece uma rotina mais tranquila.</h2><p>Organize seus acompanhamentos com cuidado e presença, em cada etapa.</p><Link className="banner-link" to="/agenda">Ver agenda <ChevronRight size={15}/></Link></div><div className="welcome-illustration" aria-hidden="true"><span className="brand-person teal-person"/><span className="brand-person yellow-person"/><span className="brand-person purple-person"/><span className="brand-sun"/></div></div>
    <div className="section-heading"><div><h2>Visão geral</h2><p>Indicadores carregados do seu espaço</p></div><span className="date-pill"><CalendarDays size={15}/>{formatDate(today)}</span></div>
    {loadError&&<div className="notice-error" role="alert">{loadError}</div>}
    <div className="stats-grid"><StatCard label="Atendimentos hoje" value={loading?'…':appointments===null?'—':String(appointments.length)} note="Agendados para hoje" icon={CalendarDays} tone="sage"/><StatCard label="Pacientes ativos" value={loading?'…':patientCount===null?'—':String(patientCount)} note={patientCount===0?'Cadastre seu primeiro paciente':'Cadastros em acompanhamento'} icon={Users} tone="lavender"/><StatCard label="Receitas pagas no mês" value={loading?'…':monthly===null?'—':formatCurrency(monthly.income/100)} note="Com base nos lançamentos pagos" icon={CircleDollarSign} tone="peach"/><StatCard label="Pagamentos pendentes" value={loading?'…':monthly===null?'—':formatCurrency(monthly.pending/100)} note="Lançamentos ainda em aberto" icon={Activity} tone="blue"/></div>
    <div className="dashboard-status-summary" aria-label="Status dos atendimentos de hoje"><span>Status de hoje</span>{(['completed','cancelled','no_show'] as const).map((status)=><span key={status}><i className={`dashboard-status-dot ${status}`}/>{statusNames[status]}: <b>{loading||appointments===null?'—':appointments.filter((item)=>item.status===status).length}</b></span>)}</div>
    <div className="dashboard-columns"><section className="surface-card agenda-card"><div className="card-heading"><div><h3>Agenda do dia</h3><p>{new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}).format(today)}</p></div><Link className="subtle-button" to="/agenda">Abrir agenda <ChevronRight size={15}/></Link></div>{loading?<div className="patient-loading">Carregando atendimentos…</div>:appointments===null?<div className="empty-state">Não foi possível carregar a agenda.</div>:appointments.length?<div className="dashboard-appointments">{appointments.slice(0,5).map((item)=><div className="dashboard-appointment" key={item.id}><span className="dashboard-time">{new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(item.starts_at))}</span><div><b>{item.patient_name}</b><small>{item.duration_minutes} min · {statusNames[item.status]??item.status}</small></div><span className={`dashboard-status-dot ${item.status}`}/></div>)}</div>:<div className="empty-state"><div className="empty-icon"><CalendarDays size={23}/></div><strong>Agenda livre hoje</strong><p>Agendamentos que você criar aparecerão aqui.</p><Link className="outline-button" to="/agenda"><CalendarDays size={14}/>Abrir agenda</Link></div>}</section><section className="surface-card quick-card"><div className="card-heading"><div><h3>Acesso rápido</h3><p>Ir diretamente ao que precisa</p></div></div><div className="quick-actions"><QuickDashboardAction to="/pacientes" icon={Users} title="Gerenciar pacientes" description="Cadastros e informações administrativas"/><QuickDashboardAction to="/agenda" icon={CalendarDays} title="Organizar agenda" description="Horários e atendimentos"/><QuickDashboardAction to="/prontuarios" icon={FileHeart} title="Abrir prontuários" description="Registros clínicos protegidos"/><QuickDashboardAction to="/financeiro" icon={CircleDollarSign} title="Ver financeiro" description="Receitas, despesas e pendências"/></div></section></div>
    <div className="dashboard-footnote"><ShieldCheck size={16}/><span>Os indicadores refletem os registros do banco. O sistema não exibe números de demonstração.</span></div></div>
}

function StatCard({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof Users; tone: string }) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className={`stat-icon ${tone}`}><Icon size={18} /></div></div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div> }

function QuickDashboardAction({to,icon:Icon,title,description}:{to:string;icon:typeof Users;title:string;description:string}){return <Link className="quick-action" to={to}><div className="quick-icon"><Icon size={18}/></div><div className="quick-copy"><strong>{title}</strong><span>{description}</span></div><ChevronRight size={16} className="quick-chevron"/></Link>}

