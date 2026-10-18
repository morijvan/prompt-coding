import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, AlertCircle, ArrowDownUp, ArrowRight, BarChart3, BedDouble, Bell, Boxes, Building2,
  CalendarCheck, Check, ChevronDown, CircleHelp, ClipboardList, Download, FileText, FlaskConical,
  HeartPulse, LayoutDashboard, LogOut, Menu, MessageSquareText, Search,
  Settings, ShieldCheck, Stethoscope, Users, X, type LucideIcon,
} from 'lucide-react';
import {
  askAssistant, createCentre, createInventoryItem, createInventoryMovement,
  decideRecommendation, downloadSummaryReport, getDownloadSummaryReportQueryKey, getGetCentreQueryKey,
  getListAlertsQueryKey, getListAttendanceQueryKey,
  getListBedsQueryKey, getListCentresQueryKey, getListDiagnosticTestsQueryKey,
  getListInventoryMovementsQueryKey, getListInventoryQueryKey,
  getListRecommendationsQueryKey, getListUsersQueryKey,
  recordAttendance, updateAlert, updateBed,
  updateDiagnosticTest, updateUserRole, useGetCentre, useGetCurrentUser, useGetDashboard,
  useGetDemandForecasts, useListAlerts, useListAttendance, useListBeds, useListCentres,
  useListDiagnosticTests, useListInventory, useListInventoryMovements, useListPatientVisits,
  useListRecommendations, useListStaff, useListUsers, useListAuditLogs, useDownloadSummaryReport,
} from '@workspace/api-client-react';
import type {
  Alert, AppUser, AttendanceRecord, AuditLog, Bed, Centre, DiagnosticTest, Forecast, InventoryItem,
  InventoryMovement, Recommendation, VisitAggregate,
} from '@workspace/api-client-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useRoute } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }

const navSections: { title: string; items: { label: string; path: string; icon: LucideIcon; roles?: string[] }[] }[] = [
  { title: 'District overview', items: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Health centres', path: '/centres', icon: Building2 },
    { label: 'Footfall', path: '/patients', icon: Activity },
    { label: 'Beds', path: '/beds', icon: BedDouble },
  ] },
  { title: 'Daily operations', items: [
    { label: 'Inventory', path: '/inventory', icon: Boxes, roles: ['district_admin','centre_manager','inventory_manager'] },
    { label: 'Movements', path: '/inventory/movements', icon: ArrowDownUp, roles: ['district_admin','centre_manager','inventory_manager'] },
    { label: 'Forecasting', path: '/forecasting', icon: BarChart3, roles: ['district_admin','inventory_manager'] },
    { label: 'Redistribution', path: '/redistribution', icon: ArrowRight, roles: ['district_admin','inventory_manager'] },
    { label: 'Attendance', path: '/attendance', icon: CalendarCheck },
    { label: 'Diagnostics', path: '/diagnostics', icon: FlaskConical },
    { label: 'Alerts', path: '/alerts', icon: Bell },
  ] },
  { title: 'Intelligence & access', items: [
    { label: 'Field assistant', path: '/assistant', icon: MessageSquareText },
    { label: 'Reports', path: '/reports', icon: FileText },
    { label: 'Users & roles', path: '/users', icon: Users, roles: ['district_admin'] },
    { label: 'Audit log', path: '/audit-logs', icon: ClipboardList, roles: ['district_admin'] },
    { label: 'Settings', path: '/settings', icon: Settings },
  ] },
];

function AppLogo({ dark = false }: { dark?: boolean }) {
  return <div className={`brand-mark ${dark ? 'brand-mark-dark' : ''}`}><span className="brand-cross">+</span><span>smart<span className="brand-light">health</span></span></div>;
}
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const current = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== current) client.clear();
    previous.current = current;
  }), [addListener, client]);
  return null;
}
const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: { colorPrimary: '#216b61', colorForeground: '#1b3734', colorMutedForeground: '#637571', colorDanger: '#bd4e43', colorBackground: '#fffdf8', colorInput: '#fbfaf4', colorInputForeground: '#1b3734', colorNeutral: '#d9ded5', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.75rem' },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf8] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#1b3734] font-bold', headerSubtitle: 'text-[#637571]',
    socialButtonsBlockButtonText: 'text-[#1b3734] font-semibold', formFieldLabel: 'text-[#25413d] font-semibold',
    footerActionLink: 'text-[#216b61] font-semibold', footerActionText: 'text-[#637571]', dividerText: 'text-[#637571]',
    identityPreviewEditButton: 'text-[#216b61]', formFieldSuccessText: 'text-[#216b61]', alertText: 'text-[#8c352d]',
    logoBox: 'mb-3', logoImage: 'max-h-10', socialButtonsBlockButton: 'border-[#d9ded5] rounded-lg',
    formButtonPrimary: 'bg-[#216b61] hover:bg-[#18584f] text-white rounded-lg', formFieldInput: 'bg-[#fbfaf4] border-[#d9ded5] text-[#1b3734] rounded-lg',
    footerAction: 'text-[#637571]', dividerLine: 'bg-[#d9ded5]', alert: 'bg-[#fff0ed]',
    otpCodeFieldInput: 'border-[#d9ded5] text-[#1b3734]', formFieldRow: 'mb-4', main: 'gap-4',
  },
};

function Landing() {
  const { isSignedIn } = useUser();
  if (isSignedIn) return <Redirect to="/dashboard" />;
  return <main className="landing">
    <header className="landing-nav"><Link href="/" className="logo-link"><AppLogo /></Link><div className="landing-nav-actions"><span className="district-tag"><span className="live-dot"/> Public health operations</span><Link className="text-link" href="/sign-in">Sign in</Link><Link className="button button-primary" href="/sign-up">Get started <ArrowRight size={16}/></Link></div></header>
    <section className="landing-hero">
      <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line"/> District care, in focus</div><h1>A clearer picture<br/>of <em>care capacity.</em></h1><p>One shared operational view for the people keeping local healthcare moving — from district teams to the clinic floor.</p><div className="hero-ctas"><Link className="button button-primary button-large" href="/sign-in">Open your workspace <ArrowRight size={17}/></Link><a className="button button-outline button-large" href="#how-it-works">See how it works</a></div><div className="hero-proof"><span className="proof-icons"><i>PH</i><i>CH</i><i>IN</i></span><span>Built around PHC & CHC realities</span></div></div>
      <div className="hero-visual"><div className="sun-disc"/><div className="visual-label"><span className="live-dot"/> TODAY · DISTRICT SNAPSHOT</div><div className="visual-center"><div className="map-grid"/><div className="map-route route-a"/><div className="map-route route-b"/><div className="map-node node-a"><span/></div><div className="map-node node-b"><span/></div><div className="map-node node-c"><span/></div><div className="map-node node-d"><span/></div><div className="map-caption"><b>Shared picture.</b><br/>Local care, understood.</div><div className="floating-stat"><span>Care sites reporting</span><strong>24 <small>/ 27</small></strong><i>↑ 3 this week</i></div><div className="floating-stat second"><span>District view</span><strong>Ready</strong><i className="soft-green">Updated just now</i></div></div><div className="visual-footer"><span>STATE HEALTH NETWORK</span><span>FIELD VIEW / 01</span></div></div>
    </section>
    <section className="landing-strip"><div><span className="strip-number">01</span><b>See capacity</b><small>Beds, people, diagnostics</small></div><div><span className="strip-number">02</span><b>Spot pressure</b><small>Demand and stock signals</small></div><div><span className="strip-number">03</span><b>Coordinate locally</b><small>Review before action</small></div><div className="strip-note">Designed for busy clinics.<br/><strong>Useful at a glance.</strong></div></section>
    <section id="how-it-works" className="landing-story"><div className="story-aside"><span className="eyebrow">A shared operational picture</span><h2>Because care capacity<br/>is never just one number.</h2></div><div className="story-content"><p>Smart Health brings together the signals that help district teams understand how local care is holding up: facility readiness, medicine availability, patient footfall, staffing, beds and diagnostics.</p><p>It is not a substitute for local judgement. It helps teams know where to look, what has changed and what needs a conversation.</p><div className="story-note"><ShieldCheck size={19}/><span><b>Human decisions stay human.</b> Transfers are recommendations for review — never an automatic stock change.</span></div></div></section>
    <section className="landing-cta"><div><span className="eyebrow">The district, together</span><h2>Make the next<br/>decision with context.</h2></div><Link className="button button-warm button-large" href="/sign-in">Enter Smart Health <ArrowRight size={17}/></Link></section>
    <footer className="landing-footer"><AppLogo/><span>Operational clarity for public health teams</span><span>India · PHC / CHC network</span></footer>
  </main>;
}
function SignInPage() { return <div className="auth-frame"><div className="auth-brand"><Link href="/" className="logo-link"><AppLogo/></Link><p>Local care, understood.</p></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/></div>; }
function SignUpPage() { return <div className="auth-frame"><div className="auth-brand"><Link href="/" className="logo-link"><AppLogo/></Link><p>Bring your district into focus.</p></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/></div>; }

function SkeletonRows() { return <div className="skeleton-list">{[0,1,2,3,4].map(i=><div className="skeleton-row" key={i}><span/><span/><span/><span/></div>)}</div>; }
function LoadState({ loading, error, retry, children }: { loading?: boolean; error?: boolean; retry?: () => void; children: ReactNode }) {
  if (loading) return <SkeletonRows/>;
  if (error) return <div className="state-card"><AlertCircle size={22}/><b>We could not load this view.</b><span>Check your connection and try again.</span><button className="button button-outline" onClick={retry}>Try again</button></div>;
  return <>{children}</>;
}
function EmptyState({ title = 'Nothing to show yet', detail = 'When records are available, they will appear here.' }: { title?: string; detail?: string }) {
  return <div className="empty-state"><span className="empty-icon"><ClipboardList size={22}/></span><b>{title}</b><span>{detail}</span></div>;
}
function PageHeading({ kicker, title, subtitle, action }: { kicker: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}
function StatusPill({ status }: { status: string }) {
  const cls = /critical|offline|unavailable|absent|rejected/i.test(status) ? 'danger' : /warning|attention|limited|pending|low/i.test(status) ? 'warning' : /resolved|operational|available|approved|present|active|healthy/i.test(status) ? 'good' : 'neutral';
  return <span className={`status-pill ${cls}`}><i/>{status.replaceAll('_',' ')}</span>;
}
function SearchBox({ value, onChange, placeholder='Search records' }: { value: string; onChange: (s:string)=>void; placeholder?:string }) {
  return <label className="search-box"><Search size={16}/><input data-testid="input-search" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>{value&&<button aria-label="Clear search" onClick={()=>onChange('')}><X size={14}/></button>}</label>;
}
function DataTable({ headers, children, empty }: { headers: string[]; children: ReactNode; empty: boolean }) {
  return <div className="table-wrap">{empty ? <EmptyState/> : <table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table>}</div>;
}
function Metric({ label, value, note, icon: Icon, tone='teal' }: { label:string; value:ReactNode; note:string; icon:LucideIcon; tone?:string }) {
  return <article className={`metric-card ${tone}`}><div className="metric-top"><span>{label}</span><i><Icon size={17}/></i></div><strong>{value}</strong><small>{note}</small></article>;
}
function MiniBars({ values }: { values: { label:string; value:number }[] }) {
  const max = Math.max(...values.map(v=>v.value), 1);
  return <div className="mini-chart" aria-label="Visit trend chart">{values.map(v=><div className="bar-column" key={v.label}><div className="bar-track"><i style={{height:`${Math.max(8,v.value/max*100)}%`}}/></div><span>{v.label}</span></div>)}</div>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const currentQuery = useGetCurrentUser();
  const role = currentQuery.data?.role ?? 'healthcare_staff';
  const firstName = currentQuery.data?.name?.split(' ')[0] || user?.firstName || 'Team member';
  const activeName = navSections.flatMap(s=>s.items).find(i=>location===i.path)?.label || (location.startsWith('/centres/')?'Centre details':'Workspace');
  const permitted = navSections.map(section=>({...section,items:section.items.filter(item=>!item.roles||item.roles.includes(role))}));
  return <div className="app-shell">
    <aside className={`sidebar ${open?'sidebar-open':''}`}><div className="sidebar-top"><Link href="/dashboard" className="sidebar-logo"><AppLogo dark/></Link><button className="sidebar-close" onClick={()=>setOpen(false)} aria-label="Close navigation"><X size={19}/></button></div><div className="district-switch"><div className="district-emblem">IN</div><div><b>District network</b><span>Operations workspace</span></div><ChevronDown size={14}/></div><nav>{permitted.map(section=><div className="nav-group" key={section.title}><div className="nav-label">{section.title}</div>{section.items.map(item=><Link key={item.path} href={item.path} className={`nav-link ${location===item.path||(item.path==='/centres'&&location.startsWith('/centres/'))?'active':''}`} onClick={()=>setOpen(false)}><item.icon size={17}/><span>{item.label}</span>{item.path==='/alerts'&&<b className="nav-count">4</b>}</Link>)}</div>)}</nav><div className="sidebar-foot"><div className="network-status"><span className="live-dot"/>Network reporting normally</div><div className="profile-row"><div className="avatar">{firstName.slice(0,1).toUpperCase()}</div><div className="profile-meta"><b>{firstName}</b><span>{role.replaceAll('_',' ')}</span></div><button onClick={()=>signOut({redirectUrl:basePath||'/'})} aria-label="Sign out"><LogOut size={16}/></button></div></div></aside>
    {open&&<button className="mobile-scrim" onClick={()=>setOpen(false)} aria-label="Close menu"/>}
    <main className="workspace"><header className="topbar"><button className="mobile-menu" onClick={()=>setOpen(true)} aria-label="Open navigation"><Menu/></button><div className="breadcrumbs"><span>District network</span><b>/</b><strong>{activeName}</strong></div><div className="topbar-actions"><span className="snapshot-time"><span className="live-dot"/> Live operational view</span><Link href="/alerts" className="top-icon" aria-label="Alerts"><Bell size={17}/><i/></Link><button className="top-user" onClick={()=>signOut({redirectUrl:basePath||'/'})}><span className="avatar small">{firstName.slice(0,1).toUpperCase()}</span><span>{firstName}</span><LogOut size={15}/></button></div></header><div className="workspace-content">{children}</div><footer className="workspace-footer"><span>SMART HEALTH <i>/</i> FIELD OPERATIONS</span><span>Data is aggregated. No personal patient records are shown.</span></footer></main>
  </div>;
}
function ShellPage({ children }: { children: ReactNode }) { return <AppShell>{children}</AppShell>; }

function LegacyDashboardPage() {
  const q=useGetDashboard();
  const d=q.data;
  return <ShellPage><PageHeading kicker="District overview" title="Good morning, team." subtitle="A live view of care capacity across your district." action={<div className="updated-tag"><span className="live-dot"/> Data refreshed recently</div>}/>
    <LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}>{d&&<><div className="metric-grid">
      <Metric label="Reporting centres" value={d.totals.centres} note={`${d.mapCentres?.length||0} in current view`} icon={Building2}/>
      <Metric label="Visits today" value={d.totals.visitsToday.toLocaleString('en-IN')} note="Aggregated footfall" icon={Activity} tone="gold"/>
      <Metric label="Beds available" value={d.totals.availableBeds} note="Across reporting sites" icon={BedDouble} tone="blue"/>
      <Metric label="Stock-outs" value={d.totals.stockOuts} note="Items below usable stock" icon={Boxes} tone={d.totals.stockOuts?'coral':'teal'}/>
      <Metric label="Doctor attendance" value={`${d.totals.doctorAttendance}%`} note="Of scheduled today" icon={Stethoscope} tone="green"/>
    </div><div className="dashboard-grid"><section className="panel trend-panel"><div className="panel-heading"><div><div className="eyebrow">Patient footfall</div><h2>Visits, last 7 days</h2></div><Link className="subtle-link" href="/patients">Explore visits <ArrowRight size={15}/></Link></div><div className="chart-summary"><strong>{d.totals.visitsToday.toLocaleString('en-IN')}</strong><span>today <i>district total</i></span></div><MiniBars values={d.visitTrend.map(v=>({label:new Date(v.date).toLocaleDateString('en-IN',{weekday:'short'}),value:v.visits}))}/></section><section className="panel readiness-panel"><div className="panel-heading"><div><div className="eyebrow">Network readiness</div><h2>Centre status</h2></div><span className="panel-count">{d.centreStatus.length} sites</span></div><div className="readiness-list">{d.centreStatus.slice(0,5).map((c,i)=><div className="readiness-row" key={c.centreId}><div className={`site-index site-${i}`}>{String(i+1).padStart(2,'0')}</div><div className="site-copy"><b>{c.name}</b><span>{c.type} · {c.visits} visits today</span></div><span className="attendance-compact">{c.attendance}%<small>staff</small></span><StatusPill status={c.stockStatus}/></div>)}</div><Link href="/centres" className="panel-bottom-link">View all centres <ArrowRight size={14}/></Link></section></div>
    <div className="dashboard-grid lower-grid"><section className="panel stock-panel"><div className="panel-heading"><div><div className="eyebrow">Supply picture</div><h2>Inventory by category</h2></div><Link className="subtle-link" href="/inventory">Open inventory <ArrowRight size={15}/></Link></div><div className="stock-list">{d.inventoryStatus.map(item=><div className="stock-row" key={item.name}><b>{item.name}</b><div className="stock-stack"><span style={{width:`${item.healthy/(item.healthy+item.low+item.critical||1)*100}%`}}/><i style={{width:`${item.low/(item.healthy+item.low+item.critical||1)*100}%`}}/><em style={{width:`${item.critical/(item.healthy+item.low+item.critical||1)*100}%`}}/></div><small>{item.healthy+item.low+item.critical}</small></div>)}</div><div className="stock-legend"><span><i className="legend-healthy"/> In range</span><span><i className="legend-low"/> Low</span><span><i className="legend-critical"/> Critical</span></div></section><section className="panel alerts-panel"><div className="panel-heading"><div><div className="eyebrow">Needs a look</div><h2>Recent alerts</h2></div><Link className="subtle-link" href="/alerts">All alerts <ArrowRight size={15}/></Link></div>{d.recentAlerts?.length?d.recentAlerts.slice(0,4).map((a:Alert)=><div className="compact-alert" key={a.id}><span className={`alert-mark ${a.severity}`}/><div><b>{a.title}</b><small>{a.centreName} · {relative(a.createdAt)}</small></div><StatusPill status={a.severity}/></div>):<EmptyState title="No active alerts" detail="There are no new issues to review."/>}</section></div>
    <div className="map-strip"><div className="map-strip-text"><div className="eyebrow">Local care, in context</div><h2>Your district at a glance</h2><p>Centre readiness and capacity share one view.</p><Link href="/centres" className="button button-outline">Explore centres <ArrowRight size={15}/></Link></div><div className="district-map">{(d.mapCentres||[]).slice(0,20).map((c:Centre,i:number)=><Link key={c.id} href={`/centres/${c.id}`} className={`map-pin pin-${i%5}`} title={c.name}><span/></Link>)}<span className="map-watermark">DISTRICT NETWORK</span><div className="map-city-label">Care sites <b>{d.mapCentres?.length||0}</b></div></div></div></>}</LoadState>
  </ShellPage>;
}
function DashboardPage() {
  const q = useGetDashboard();
  const d = q.data;
  const locations = d?.mapCentres ?? [];
  const latitudes = locations.map((centre) => centre.latitude);
  const longitudes = locations.map((centre) => centre.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLong = Math.min(...longitudes);
  const maxLong = Math.max(...longitudes);

  return (
    <ShellPage>
      <PageHeading
        kicker="District overview"
        title="Good morning, team."
        subtitle="A shared view of care capacity across your district."
        action={<div className="updated-tag">Synthetic demo data</div>}
      />
      <LoadState loading={q.isLoading} error={q.isError} retry={() => q.refetch()}>
        {d && (
          <>
            <div className="metric-grid">
              <Metric label="Reporting centres" value={d.totals.centres} note={`${locations.length} in current view`} icon={Building2} />
              <Metric label="Visits today" value={d.totals.visitsToday.toLocaleString("en-IN")} note="Aggregated footfall" icon={Activity} tone="gold" />
              <Metric label="Beds available" value={d.totals.availableBeds} note="Across reporting sites" icon={BedDouble} tone="blue" />
              <Metric label="Stock-outs" value={d.totals.stockOuts} note="Items at zero stock" icon={Boxes} tone={d.totals.stockOuts ? "coral" : "teal"} />
              <Metric
                label="Doctor attendance"
                value={d.totals.doctorAttendance === null ? "Not reported" : `${d.totals.doctorAttendance}%`}
                note={d.totals.doctorAttendance === null ? "No explicit attendance records" : "Based on explicit status records"}
                icon={Stethoscope}
                tone="green"
              />
            </div>
            <div className="dashboard-grid">
              <section className="panel trend-panel">
                <div className="panel-heading">
                  <div><div className="eyebrow">Patient footfall</div><h2>Visits, last 7 days</h2></div>
                  <Link className="subtle-link" href="/patients">Explore visits <ArrowRight size={15} /></Link>
                </div>
                <div className="chart-summary"><strong>{d.totals.visitsToday.toLocaleString("en-IN")}</strong><span>today <i>district total</i></span></div>
                <MiniBars values={d.visitTrend.map((visit) => ({
                  label: new Date(`${visit.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" }),
                  value: visit.visits,
                }))} />
              </section>
              <section className="panel readiness-panel">
                <div className="panel-heading">
                  <div><div className="eyebrow">Network readiness</div><h2>Centre status</h2></div>
                  <span className="panel-count">{d.centreStatus.length} sites</span>
                </div>
                <div className="readiness-list">
                  {d.centreStatus.slice(0, 5).map((centre, index) => (
                    <div className="readiness-row" key={centre.centreId}>
                      <div className={`site-index site-${index}`}>{String(index + 1).padStart(2, "0")}</div>
                      <div className="site-copy"><b>{centre.name}</b><span>{centre.type} · {centre.visits} visits today</span></div>
                      <span className="attendance-compact">
                        {centre.attendance === null ? "—" : `${centre.attendance}%`}
                        <small>{centre.attendance === null ? "no report" : "reported"}</small>
                      </span>
                      <StatusPill status={centre.stockStatus} />
                    </div>
                  ))}
                </div>
                <Link href="/centres" className="panel-bottom-link">View all centres <ArrowRight size={14} /></Link>
              </section>
            </div>
            <div className="dashboard-grid lower-grid">
              <section className="panel stock-panel">
                <div className="panel-heading">
                  <div><div className="eyebrow">Supply picture</div><h2>Inventory by category</h2></div>
                  <Link className="subtle-link" href="/inventory">Open inventory <ArrowRight size={15} /></Link>
                </div>
                <div className="stock-list">
                  {d.inventoryStatus.map((item) => {
                    const total = item.healthy + item.low + item.critical || 1;
                    return (
                      <div className="stock-row" key={item.name}>
                        <b>{item.name}</b>
                        <div className="stock-stack">
                          <span style={{ width: `${item.healthy / total * 100}%` }} />
                          <i style={{ width: `${item.low / total * 100}%` }} />
                          <em style={{ width: `${item.critical / total * 100}%` }} />
                        </div>
                        <small>{item.healthy + item.low + item.critical}</small>
                      </div>
                    );
                  })}
                </div>
                <div className="stock-legend"><span><i className="legend-healthy" /> In range</span><span><i className="legend-low" /> Low</span><span><i className="legend-critical" /> Critical</span></div>
              </section>
              <section className="panel alerts-panel">
                <div className="panel-heading">
                  <div><div className="eyebrow">Needs a look</div><h2>Recent alerts</h2></div>
                  <Link className="subtle-link" href="/alerts">All alerts <ArrowRight size={15} /></Link>
                </div>
                {d.recentAlerts.length
                  ? d.recentAlerts.slice(0, 4).map((alert: Alert) => (
                    <div className="compact-alert" key={alert.id}>
                      <span className={`alert-mark ${alert.severity}`} />
                      <div><b>{alert.title}</b><small>{alert.centreName} · {relative(alert.createdAt)}</small></div>
                      <StatusPill status={alert.severity} />
                    </div>
                  ))
                  : <EmptyState title="No active alerts" detail="There are no new issues to review." />}
              </section>
            </div>
            <div className="map-strip">
              <div className="map-strip-text">
                <div className="eyebrow">Local care, in context</div><h2>Your district at a glance</h2>
                <p>Markers use reported centre coordinates; they do not represent district boundaries.</p>
                <Link href="/centres" className="button button-outline">Explore centres <ArrowRight size={15} /></Link>
              </div>
              <div className="district-map">
                {locations.slice(0, 20).map((centre: Centre, index: number) => {
                  const x = maxLong === minLong ? 50 : 12 + ((centre.longitude - minLong) / (maxLong - minLong)) * 76;
                  const y = maxLat === minLat ? 50 : 12 + ((maxLat - centre.latitude) / (maxLat - minLat)) * 76;
                  return (
                    <Link
                      key={centre.id}
                      href={`/centres/${centre.id}`}
                      className={`map-pin pin-${index % 5}`}
                      style={{ left: `${x}%`, top: `${y}%` }}
                      title={centre.name}
                      aria-label={centre.name}
                    ><span /></Link>
                  );
                })}
                <span className="map-watermark">CENTRE LOCATIONS</span>
                <div className="map-city-label">Care sites <b>{locations.length}</b></div>
              </div>
            </div>
          </>
        )}
      </LoadState>
    </ShellPage>
  );
}

function relative(date:string) { const mins=Math.max(1,Math.round((Date.now()-new Date(date).getTime())/60000)); return mins<60?`${mins}m ago`:`${Math.floor(mins/60)}h ago`; }

function CentresPage() {
  const [search,setSearch]=useState('');
  const [type,setType]=useState('');
  const params=useMemo(()=>({search:search||undefined,type:type ? (type as 'PHC'|'CHC') : undefined,pageSize:100}),[search,type]);
  const q=useListCentres(params);
  const mutation=useMutation({mutationFn:(data:Parameters<typeof createCentre>[0])=>createCentre(data),onSuccess:()=>queryClient.invalidateQueries({queryKey:getListCentresQueryKey()})});
  function addCentre(){const name=prompt('Centre name');if(!name)return;const code=prompt('Centre code');if(!code)return;mutation.mutate({name,code,type:'PHC',district:'District',state:'India',address:'',latitude:0,longitude:0});}
  return <ShellPage><PageHeading kicker="Care network" title="Health centres" subtitle="The facilities behind your district’s care capacity." action={<button className="button button-primary" onClick={addCentre}><Building2 size={16}/> Add centre</button>}/><div className="toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Find a centre or centre code"/><select aria-label="Filter by facility type" value={type} onChange={e=>setType(e.target.value)}><option value="">All facility types</option><option>PHC</option><option>CHC</option></select><span className="result-count">{q.data?.total??0} centres</span></div><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}>{<DataTable headers={['Facility','District','Type','Current status','Address']} empty={!q.data?.items.length}>{q.data?.items.map(c=><tr key={c.id}><td><Link className="entity-link" href={`/centres/${c.id}`}><span className="facility-avatar">{c.type==='CHC'?'CH':'PH'}</span><span><b>{c.name}</b><small>{c.code}</small></span></Link></td><td>{c.district}, {c.state}</td><td><span className="type-tag">{c.type}</span></td><td><StatusPill status={c.status}/></td><td className="muted-cell">{c.address||'—'}</td></tr>)}</DataTable>}</LoadState></ShellPage>;
}
function CentreDetailPage() {
  const [,params]=useRoute('/centres/:id');
  const id=params?.id||'';
  const q=useGetCentre(id,{query:{queryKey:getGetCentreQueryKey(id),enabled:!!id}});
  return <ShellPage><div className="back-line"><Link href="/centres">← All centres</Link></div><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}>{q.data&&<><PageHeading kicker={`${q.data.type} · ${q.data.code}`} title={q.data.name} subtitle={`${q.data.address} · ${q.data.district}, ${q.data.state}`} action={<StatusPill status={q.data.status}/>}/><div className="detail-grid"><Metric label="Facility type" value={q.data.type} note="Primary care facility" icon={Building2}/><Metric label="Reporting status" value={q.data.status} note="Last known operational state" icon={Activity} tone="green"/><Metric label="Centre code" value={q.data.code} note="District facility identifier" icon={ShieldCheck} tone="gold"/></div><div className="panel centre-contact"><div><div className="eyebrow">Facility details</div><h2>Local contact & location</h2></div><div className="contact-details"><span><b>Address</b>{q.data.address||'Not recorded'}</span><span><b>District / state</b>{q.data.district}, {q.data.state}</span><span><b>Phone</b>{q.data.phone||'Not recorded'}</span><span><b>Coordinates</b>{q.data.latitude.toFixed(4)}, {q.data.longitude.toFixed(4)}</span></div></div><div className="quick-links"><Link href={`/inventory?centreId=${id}`}>Inventory <ArrowRight size={15}/></Link><Link href="/beds">Bed capacity <ArrowRight size={15}/></Link><Link href="/diagnostics">Diagnostics <ArrowRight size={15}/></Link></div></>}</LoadState></ShellPage>;
}
function InventoryPage() {
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('');
  const params=useMemo(()=>({search:search||undefined,status:status ? (status as 'all'|'low'|'expiring'|'healthy') : undefined,pageSize:100}),[search,status]);
  const q=useListInventory(params);
  const createMutation=useMutation({mutationFn:(data:Parameters<typeof createInventoryItem>[0])=>createInventoryItem(data),onSuccess:()=>queryClient.invalidateQueries({queryKey:getListInventoryQueryKey()})});
  function addItem(){const medicine=prompt('Medicine name');if(!medicine)return;const centres=prompt('Centre ID');if(!centres)return;const quantity=Number(prompt('Quantity on hand','0'));const min=Number(prompt('Minimum stock','0'));createMutation.mutate({centreId:centres,medicine,category:'Essential medicines',batch:'Unspecified',quantity,minimumStock:min,unit:'units',expiryDate:'2030-01-01',supplier:'Unspecified'});}
  return <ShellPage><PageHeading kicker="Daily operations" title="Inventory" subtitle="Medicine availability across the care network." action={<button className="button button-primary" onClick={addItem}><Boxes size={16}/> Add stock record</button>}/><div className="toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search medicine or batch"/><select value={status} onChange={e=>setStatus(e.target.value)} aria-label="Filter stock status"><option value="">All stock status</option><option value="low">Low stock</option><option value="healthy">In range</option><option value="expiring">Expiring soon</option></select><Link href="/inventory/movements" className="button button-outline"><ArrowDownUp size={15}/> View movements</Link></div><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}>{<DataTable headers={['Medicine / batch','Category','Centre','On hand','Minimum','Expiry','Updated']} empty={!q.data?.items.length}>{q.data?.items.map((item:InventoryItem)=><tr key={item.id}><td><b>{item.medicine}</b><small className="block-muted">Batch {item.batch}</small></td><td>{item.category}</td><td className="mono-cell">{item.centreId}</td><td><b>{item.quantity} {item.unit}</b></td><td>{item.minimumStock} {item.unit}</td><td>{new Date(item.expiryDate).toLocaleDateString('en-IN')}</td><td className="muted-cell">{relative(item.updatedAt)}</td></tr>)}</DataTable>}</LoadState><div className="privacy-note"><ShieldCheck size={17}/> Stock records reflect reported quantities; confirm locally before decisions.</div></ShellPage>;
}
function MovementsPage() {
  const q=useListInventoryMovements({pageSize:100});
  const inventory=useListInventory({pageSize:100});
  const movement=useMutation({mutationFn:({id,data}:{id:string;data:{type:'receipt'|'consumption'|'adjustment';quantity:number;note:string}})=>createInventoryMovement(id,data),onSuccess:()=>{queryClient.invalidateQueries({queryKey:getListInventoryMovementsQueryKey()});queryClient.invalidateQueries({queryKey:getListInventoryQueryKey()});}});
  function record(){const items=inventory.data?.items||[];if(!items.length)return;const selected=prompt(`Enter inventory item ID:\n${items.map(i=>`${i.id}: ${i.medicine} (${i.centreId})`).join('\n')}`);if(!selected)return;const quantity=Number(prompt('Quantity','1'));const note=prompt('Reason / note','Stock count update');if(!quantity||!note)return;movement.mutate({id:selected,data:{type:'adjustment',quantity,note}});}
  return <ShellPage><PageHeading kicker="Daily operations" title="Inventory movements" subtitle="A chronological record of receipts, use and adjustments." action={<button className="button button-primary" onClick={record}><ArrowDownUp size={16}/> Record movement</button>}/><div className="toolbar"><span className="result-count">{q.data?.total||0} movement records</span><span className="policy-hint">Updates require an explicit movement entry.</span></div><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}><DataTable headers={['Movement','Medicine','Centre','Quantity','Note','Recorded']} empty={!q.data?.items.length}>{q.data?.items.map((m:InventoryMovement)=><tr key={m.id}><td><span className={`movement-type ${m.type}`}>{m.type.replaceAll('_',' ')}</span></td><td><b>{m.medicine||'Medicine record'}</b></td><td>{m.centreName||m.centreId}</td><td>{m.quantity}</td><td>{m.note}</td><td>{new Date(m.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</td></tr>)}</DataTable></LoadState><div className="privacy-note"><AlertCircle size={17}/> Redistribution suggestions do not change stock. Record only confirmed movements.</div></ShellPage>;
}
function PatientsPage() {
  const [period,setPeriod]=useState<'day'|'week'|'month'>('week');
  const q=useListPatientVisits({period});
  const visits=q.data?.items||[];
  const grouped=useMemo(()=>visits.reduce((acc,v)=>{acc[v.department]=(acc[v.department]||0)+v.visits;return acc;},{} as Record<string,number>),[visits]);
  return <ShellPage><PageHeading kicker="District overview" title="Patient footfall" subtitle="Aggregated visit volumes only — no patient records."/><div className="period-switch">{(['day','week','month'] as const).map(p=><button className={period===p?'selected':''} onClick={()=>setPeriod(p)} key={p}>{p==='day'?'Today':p==='week'?'7 days':'30 days'}</button>)}</div><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}><div className="metric-grid two-metrics"><Metric label="Total visits" value={(q.data?.totalVisits||0).toLocaleString('en-IN')} note="For selected period" icon={Activity}/><Metric label="Departments reporting" value={Object.keys(grouped).length} note="Aggregated service lines" icon={Stethoscope} tone="gold"/></div><section className="panel"><div className="panel-heading"><div><div className="eyebrow">Visit aggregates</div><h2>Activity by centre & department</h2></div><span className="type-tag">{period} view</span></div><DataTable headers={['Date','Centre ID','Department','Aggregated visits']} empty={!visits.length}>{visits.map((v:VisitAggregate)=><tr key={v.id}><td>{new Date(v.date).toLocaleDateString('en-IN')}</td><td className="mono-cell">{v.centreId}</td><td>{v.department}</td><td><b>{v.visits.toLocaleString('en-IN')}</b></td></tr>)}</DataTable></section><div className="department-grid">{Object.entries(grouped).map(([name,total])=><div className="department-chip" key={name}><span>{name}</span><b>{total.toLocaleString('en-IN')}</b></div>)}</div></LoadState></ShellPage>;
}
function BedsPage() {
  const q=useListBeds();
  const beds=q.data?.items||[];
  const total=beds.reduce((a,b)=>a+b.total,0), occupied=beds.reduce((a,b)=>a+b.occupied,0), out=beds.reduce((a,b)=>a+b.outOfService,0);
  const update=useMutation({mutationFn:({id,data}:{id:string;data:{total?:number;occupied?:number;outOfService?:number}})=>updateBed(id,data),onSuccess:()=>queryClient.invalidateQueries({queryKey:getListBedsQueryKey()})});
  function adjust(b:Bed){const totalValue=Number(prompt(`Set total ${b.type} beds at ${b.centreName}`,String(b.total)));if(Number.isNaN(totalValue)||totalValue<0)return;update.mutate({id:b.id,data:{total:totalValue}});}
  return <ShellPage><PageHeading kicker="District overview" title="Bed capacity" subtitle="Reported bed availability by facility and bed type."/><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}><div className="metric-grid three-metrics"><Metric label="Total beds" value={total} note="Reported across centres" icon={BedDouble}/><Metric label="Occupied" value={occupied} note={`${total?Math.round(occupied/total*100):0}% of total capacity`} icon={Users} tone="gold"/><Metric label="Available now" value={Math.max(0,total-occupied-out)} note={`${out} out of service`} icon={Check} tone="green"/></div><DataTable headers={['Facility','Bed type','Total','Occupied','Out of service','Available','']} empty={!beds.length}>{beds.map((b:Bed)=><tr key={b.id}><td><b>{b.centreName}</b></td><td>{b.type}</td><td>{b.total}</td><td>{b.occupied}</td><td>{b.outOfService}</td><td><b>{Math.max(0,b.total-b.occupied-b.outOfService)}</b></td><td><button className="table-action" onClick={()=>adjust(b)}>Update total</button></td></tr>)}</DataTable></LoadState></ShellPage>;
}
function AttendancePage() {
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const q=useListAttendance({date});
  const staff=useListStaff();
  const record=useMutation({mutationFn:(data:Parameters<typeof recordAttendance>[0])=>recordAttendance(data),onSuccess:()=>queryClient.invalidateQueries({queryKey:getListAttendanceQueryKey()})});
  function markAbsent(){const items=staff.data?.items||[];if(!items.length)return;const staffId=prompt(`Staff ID to record:\n${items.map(s=>`${s.id}: ${s.name}`).join('\n')}`);if(!staffId)return;record.mutate({staffId,date,status:'absent'});}
  return <ShellPage><PageHeading kicker="Daily operations" title="Attendance" subtitle="Today’s team presence across reporting facilities." action={<button className="button button-outline" onClick={markAbsent}><CalendarCheck size={16}/> Record absence</button>}/><div className="toolbar"><label className="date-control">Attendance date <input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><span className="result-count">{q.data?.present||0} present of {q.data?.scheduled||0} scheduled</span></div><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}><div className="attendance-summary"><div className="attendance-gauge"><b>{q.data?.scheduled?Math.round((q.data.present/q.data.scheduled)*100):0}%</b><small>present</small></div><div><div className="eyebrow">Attendance signal</div><h2>{q.data?.present||0} staff members checked in</h2><p>Counts reflect records submitted by facilities for {new Date(date+'T00:00:00').toLocaleDateString('en-IN',{dateStyle:'long'})}.</p></div></div><DataTable headers={['Staff member','Centre','Date','Status','Check in','Check out']} empty={!q.data?.items.length}>{q.data?.items.map((r:AttendanceRecord)=><tr key={r.id}><td><span className="entity-link"><span className="avatar tiny">{r.staffName.slice(0,1)}</span><b>{r.staffName}</b></span></td><td className="mono-cell">{r.centreId}</td><td>{new Date(r.date).toLocaleDateString('en-IN')}</td><td><StatusPill status={r.status}/></td><td>{r.checkIn||'—'}</td><td>{r.checkOut||'—'}</td></tr>)}</DataTable></LoadState></ShellPage>;
}
function DiagnosticsPage() {
  const [search,setSearch]=useState('');
  const q=useListDiagnosticTests({search:search||undefined});
  const update=useMutation({mutationFn:({id,data}:{id:string;data:{status:'Available'|'Limited'|'Unavailable';interruptionNote?:string|null}})=>updateDiagnosticTest(id,data),onSuccess:()=>queryClient.invalidateQueries({queryKey:getListDiagnosticTestsQueryKey()})});
  return <ShellPage><PageHeading kicker="Daily operations" title="Diagnostics" subtitle="Test availability and throughput by facility."/><div className="toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search test, centre or category"/><span className="result-count">{q.data?.items.length||0} services</span></div><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}><div className="diagnostic-grid">{q.data?.items.map((t:DiagnosticTest)=><article className="diagnostic-card" key={t.id}><div className="diagnostic-card-top"><span className="diagnostic-icon"><FlaskConical size={18}/></span><StatusPill status={t.status}/></div><div className="eyebrow">{t.category} · {t.centreName}</div><h2>{t.name}</h2><div className="capacity-meter"><div><span>Today's throughput</span><b>{t.completedToday} / {t.capacityPerDay}</b></div><i><span style={{width:`${Math.min(100,t.capacityPerDay?t.completedToday/t.capacityPerDay*100:0)}%`}}/></i></div><div className="diagnostic-facts"><span><small>Equipment</small>{t.equipment}</span><span><small>Consumables</small>{t.consumables}</span></div>{t.interruptionNote&&<p className="interruption-note"><AlertCircle size={14}/>{t.interruptionNote}</p>}<button className="table-action" onClick={()=>{const next=prompt('Set status: Available, Limited, or Unavailable',t.status);if(!next||!['Available','Limited','Unavailable'].includes(next))return;update.mutate({id:t.id,data:{status:next as 'Available'|'Limited'|'Unavailable',interruptionNote:next==='Available'?null:prompt('Interruption note',t.interruptionNote||'')||''}});}}>Update availability</button></article>)}</div>{!q.data?.items.length&&<EmptyState title="No diagnostic services found" detail="Try another search term."/>}</LoadState></ShellPage>;
}
function ForecastingPage() {
  const [days,setDays]=useState<7|30|90>(30);
  const q=useGetDemandForecasts({days});
  return <ShellPage><PageHeading kicker="Planning signal" title="Demand forecasting" subtitle="Projected medicine demand to help teams plan timely replenishment." action={<select className="horizon-select" value={days} onChange={e=>setDays(Number(e.target.value) as 7|30|90)}><option value={7}>Next 7 days</option><option value={30}>Next 30 days</option><option value={90}>Next 90 days</option></select>}/><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}><div className="forecast-banner"><BarChart3 size={20}/><div><b>Planning signal, not a guarantee</b><span>{q.data?.methodology||'Estimates use recent reported use and stock.'}</span></div><span className="horizon-chip">{q.data?.horizonDays||days} day horizon</span></div><DataTable headers={['Medicine / centre','Current stock','Daily use','Projected demand','Stock-out in','Reorder signal','Confidence']} empty={!q.data?.items.length}>{q.data?.items.map((f:Forecast)=><tr key={f.id}><td><b>{f.medicine}</b><small className="block-muted">{f.centreName}</small></td><td>{f.currentStock}</td><td>{f.averageDailyUse.toFixed(1)}</td><td>{f.predictedDemand}</td><td><span className={f.daysUntilStockout<8?'critical-text':''}>{f.daysUntilStockout} days</span></td><td><b>{f.recommendedReorder}</b></td><td><StatusPill status={f.confidence}/></td></tr>)}</DataTable><p className="caveat"><AlertCircle size={15}/>{q.data?.items[0]?.limitation||'Forecasts are estimates; local review is required before ordering.'}</p></LoadState></ShellPage>;
}
function RedistributionPage() {
  const q=useListRecommendations({status:'all'});
  const decide=useMutation({mutationFn:({id,status}:{id:string;status:'approved'|'rejected'})=>decideRecommendation(id,{status}),onSuccess:()=>queryClient.invalidateQueries({queryKey:getListRecommendationsQueryKey()})});
  return <ShellPage><PageHeading kicker="Human review required" title="Redistribution suggestions" subtitle="Potential stock balancing opportunities — approval records intent only."/><div className="policy-banner"><ShieldCheck size={19}/><div><b>Nothing moves automatically.</b><span>Approving a suggestion does not change inventory. Confirm the transfer locally and record a movement only when it has happened.</span></div></div><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}><div className="recommendation-list">{q.data?.items.map((r:Recommendation)=><article className="recommendation-card" key={r.id}><div className="recommendation-head"><div><div className="eyebrow">Suggested redistribution · {relative(r.createdAt)}</div><h2>{r.medicine}</h2></div><StatusPill status={r.status}/></div><div className="transfer-route"><div><small>Potential source</small><b>{r.sourceCentreName}</b><span>{r.sourceCentreId}</span></div><ArrowRight size={19}/><div><small>Potential recipient</small><b>{r.targetCentreName}</b><span>{r.targetCentreId}</span></div><strong className="quantity-flag">{r.quantity}<small>units</small></strong></div><p className="recommendation-reason">{r.reason}</p><div className="recommendation-foot"><span>{r.expiryDate?`Expiry ${new Date(r.expiryDate).toLocaleDateString('en-IN')}`:'Expiry not specified'}</span>{r.status==='pending'&&<div><button className="button button-outline" onClick={()=>decide.mutate({id:r.id,status:'rejected'})}>Decline</button><button className="button button-primary" onClick={()=>decide.mutate({id:r.id,status:'approved'})}><Check size={15}/> Approve suggestion</button></div>}</div></article>)}</div>{!q.data?.items.length&&<EmptyState title="No redistribution suggestions" detail="New suggestions will appear when there is a potential stock imbalance."/>}</LoadState></ShellPage>;
}
function AlertsPage() {
  const [status,setStatus]=useState('open');
  const q=useListAlerts({status:status as 'open'|'acknowledged'|'resolved'|'all',pageSize:100});
  const update=useMutation({mutationFn:({id,state}:{id:string;state:'acknowledged'|'resolved'})=>updateAlert(id,{status:state}),onSuccess:()=>queryClient.invalidateQueries({queryKey:getListAlertsQueryKey()})});
  return <ShellPage><PageHeading kicker="Attention & follow-up" title="Alerts" subtitle="Operational signals that may need acknowledgement or resolution."/><div className="alert-overview"><div><span>Critical</span><b>{q.data?.counts.critical||0}</b></div><div><span>Warning</span><b>{q.data?.counts.warning||0}</b></div><div><span>Informational</span><b>{q.data?.counts.info||0}</b></div><div><span>Open total</span><b>{q.data?.total||0}</b></div></div><div className="toolbar"><div className="period-switch compact">{['open','acknowledged','resolved','all'].map(s=><button key={s} className={status===s?'selected':''} onClick={()=>setStatus(s)}>{s[0].toUpperCase()+s.slice(1)}</button>)}</div></div><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}><div className="alert-list">{q.data?.items.map((a:Alert)=><article className="alert-card" key={a.id}><span className={`alert-mark large ${a.severity}`}/><div className="alert-card-body"><div className="alert-card-meta"><StatusPill status={a.severity}/><span>{a.centreName} · {relative(a.createdAt)}</span></div><h2>{a.title}</h2><p>{a.detail}</p></div><div className="alert-card-actions"><StatusPill status={a.status}/>{a.status==='open'&&<button className="table-action" onClick={()=>update.mutate({id:a.id,state:'acknowledged'})}>Acknowledge</button>}{a.status!=='resolved'&&<button className="table-action" onClick={()=>update.mutate({id:a.id,state:'resolved'})}>Resolve</button>}</div></article>)}</div>{!q.data?.items.length&&<EmptyState title={`No ${status==='all'?'':status+' '}alerts`} detail="Nothing is waiting for review in this view."/>}</LoadState></ShellPage>;
}
function AssistantPage() {
  const [question,setQuestion]=useState('');
  const [language,setLanguage]=useState<'en'|'hi'>('en');
  const [answer,setAnswer]=useState<{answer:string;language:'en'|'hi';sources:string[];asOf:string;uncertainty:string}|null>(null);
  const [error,setError]=useState('');
  const ask=useMutation({mutationFn:(data:Parameters<typeof askAssistant>[0])=>askAssistant(data),onSuccess:(data)=>{setAnswer(data);setError('');},onError:()=>setError('We could not prepare an answer. Please try again.')});
  function submit(e:FormEvent){e.preventDefault();if(question.trim().length<2)return;ask.mutate({question:question.trim(),language});}
  return <ShellPage><PageHeading kicker="Ask the district picture" title="Field assistant" subtitle="Ask a question in English or Hindi. Answers use operational summaries."/><div className="assistant-layout"><section className="assistant-main"><div className="assistant-intro"><div className="assistant-symbol"><MessageSquareText size={24}/></div><div><h2>What would help you understand today?</h2><p>Ask about availability, demand or patterns across reporting centres.</p></div></div><form onSubmit={submit} className="assistant-form"><div className="assistant-controls"><span>Answer language</span><button type="button" className={language==='en'?'selected':''} onClick={()=>setLanguage('en')}>English</button><button type="button" className={language==='hi'?'selected':''} onClick={()=>setLanguage('hi')}>हिन्दी</button></div><textarea maxLength={500} value={question} onChange={e=>setQuestion(e.target.value)} placeholder={language==='hi'?'आज किन केन्द्रों पर दवाइयों की कमी है?':'Which centres may need medicine replenishment soon?'} data-testid="input-assistant-question"/><div className="assistant-submit-row"><span>{question.length} / 500</span><button className="button button-primary" disabled={question.trim().length<2||ask.isPending}>{ask.isPending?'Reviewing district data…':'Ask assistant'} <ArrowRight size={15}/></button></div></form>{error&&<div className="inline-error">{error}</div>}{answer&&<article className="answer-card"><div className="answer-label"><span className="live-dot"/> Operational summary <small>{answer.language==='hi'?'हिन्दी':'English'}</small></div><p>{answer.answer}</p><div className="answer-meta"><span>As of {new Date(answer.asOf).toLocaleString('en-IN')}</span><span><CircleHelp size={14}/>{answer.uncertainty}</span></div>{answer.sources.length>0&&<div className="source-list"><b>Sources</b>{answer.sources.map((s,i)=><span key={i}>{s}</span>)}</div>}</article>}</section><aside className="assistant-aside"><div className="eyebrow">Try asking</div>{['Where are bed availability signals tight?','Which centres have diagnostic interruptions?','What stock items need attention this week?'].map(s=><button key={s} onClick={()=>setQuestion(s)}>{s}<ArrowRight size={14}/></button>)}<div className="assistant-disclaimer"><ShieldCheck size={16}/><p>Answers are operational context, not clinical advice. Verify local information before acting.</p></div></aside></div></ShellPage>;
}
function ReportsPage() {
  useDownloadSummaryReport({query:{enabled:false,queryKey:getDownloadSummaryReportQueryKey()}});
  const [message,setMessage]=useState('');
  const download=useMutation({mutationFn:downloadSummaryReport,onSuccess:(content)=>{const blob=new Blob([content],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`smart-health-summary-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);setMessage('Your district summary CSV has been downloaded.');},onError:()=>setMessage('The report could not be prepared. Please try again.')});
  return <ShellPage><PageHeading kicker="Reporting" title="District reports" subtitle="Export an aggregated snapshot for local review and coordination."/><div className="report-feature"><div className="report-art"><div className="report-sheet"><span/><span/><span/><i/></div><div className="report-orbit"/></div><div className="report-copy"><span className="eyebrow">Ready to export</span><h2>Operational summary</h2><p>A CSV snapshot of district-level reporting for centres, visits, beds, inventory and current alerts. Patient-level records are never included.</p><div className="report-includes"><span><Check size={14}/> Aggregated indicators</span><span><Check size={14}/> Centre-level status</span><span><Check size={14}/> No patient records</span></div><button className="button button-primary button-large" onClick={()=>{setMessage('');download.mutate(undefined);}} disabled={download.isPending}><Download size={16}/>{download.isPending?'Preparing CSV…':'Download CSV'}</button>{message&&<div className={download.isError?'inline-error':'success-note'}>{message}</div>}</div></div><div className="report-footnote"><ShieldCheck size={18}/><span><b>Privacy by design</b> Reports include aggregated operational data only. Treat exported information according to district policy.</span></div></ShellPage>;
}
function UsersPage() {
  const q=useListUsers();
  const [search,setSearch]=useState('');
  const update=useMutation({mutationFn:({id,role,centreId}:{id:string;role:'district_admin'|'centre_manager'|'healthcare_staff'|'inventory_manager';centreId:string|null})=>updateUserRole(id,{role,centreId}),onSuccess:()=>queryClient.invalidateQueries({queryKey:getListUsersQueryKey()})});
  const filtered=(q.data?.items||[]).filter(u=>`${u.name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase()));
  return <ShellPage><PageHeading kicker="District administration" title="Users & roles" subtitle="Manage workspace access and local responsibility."/><div className="policy-banner"><ShieldCheck size={18}/><div><b>Role changes affect workspace access.</b><span>Assign the least access needed for each person's responsibilities.</span></div></div><div className="toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search by name, email or role"/><span className="result-count">{filtered.length} users</span></div><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}><DataTable headers={['User','Role','Facility scope','Status','']} empty={!filtered.length}>{filtered.map((u:AppUser)=><tr key={u.id}><td><span className="entity-link"><span className="avatar tiny">{u.name.slice(0,1)}</span><span><b>{u.name}</b><small>{u.email}</small></span></span></td><td><select className="role-select" value={u.role} onChange={e=>update.mutate({id:u.id,role:e.target.value as 'district_admin'|'centre_manager'|'healthcare_staff'|'inventory_manager',centreId:u.centreId||null})}><option value="district_admin">District admin</option><option value="centre_manager">Centre manager</option><option value="healthcare_staff">Healthcare staff</option><option value="inventory_manager">Inventory manager</option></select></td><td>{u.centreId||'District-wide'}</td><td><StatusPill status={u.status}/></td><td>{update.isPending&&<span className="muted-cell">Saving…</span>}</td></tr>)}</DataTable></LoadState></ShellPage>;
}
function AuditLogsPage() {
  const q=useListAuditLogs({limit:100});
  return <ShellPage><PageHeading kicker="District administration" title="Audit log" subtitle="A record of important changes made in this workspace."/><LoadState loading={q.isLoading} error={q.isError} retry={()=>q.refetch()}><DataTable headers={['Action','Record','Details','Actor','Recorded']} empty={!q.data?.items.length}>{q.data?.items.map((entry:AuditLog)=><tr key={entry.id}><td><StatusPill status={entry.action}/></td><td><b>{entry.entity}</b><small className="block-muted">{entry.entityId}</small></td><td>{entry.details||'—'}</td><td className="mono-cell">{entry.actorId}</td><td>{new Date(entry.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</td></tr>)}</DataTable></LoadState></ShellPage>;
}
function SettingsPage() {
  const [language,setLanguage]=useState(()=>localStorage.getItem('smart-health-language')||'en');
  const [compact,setCompact]=useState(()=>localStorage.getItem('smart-health-compact')==='true');
  function saveLanguage(value:string){setLanguage(value);localStorage.setItem('smart-health-language',value);}
  function saveCompact(value:boolean){setCompact(value);localStorage.setItem('smart-health-compact',String(value));document.documentElement.classList.toggle('compact-mode',value);}
  return <ShellPage><PageHeading kicker="Workspace" title="Settings" subtitle="Personal display preferences for your operations workspace."/><div className="settings-grid"><section className="panel settings-panel"><div className="eyebrow">Language</div><h2>Choose your interface language</h2><p>Operational data remains as reported. This preference changes navigation labels where translated.</p><label className="setting-row"><span><b>Interface language</b><small>English or Hindi</small></span><select value={language} onChange={e=>saveLanguage(e.target.value)}><option value="en">English</option><option value="hi">हिन्दी</option></select></label></section><section className="panel settings-panel"><div className="eyebrow">Display</div><h2>Comfortable scanning</h2><p>Choose the density that works best for your clinic or district office.</p><label className="setting-row"><span><b>Compact tables</b><small>Reduce vertical spacing in lists</small></span><button className={`toggle ${compact?'on':''}`} role="switch" aria-checked={compact} onClick={()=>saveCompact(!compact)}><i/></button></label></section><section className="panel settings-panel full"><div className="eyebrow">Data & privacy</div><h2>Operational data, handled carefully</h2><div className="privacy-setting"><ShieldCheck size={22}/><p>Smart Health displays aggregated footfall, not personal patient records. Exported reports should be handled according to your district's information policy.</p></div><div className="language-saved">{language==='hi'?'भाषा प्राथमिकता सहेजी गई':'Preferences are saved on this device.'}</div></section></div></ShellPage>;
}

function Protected({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded) return <div className="auth-loading"><div className="loading-emblem"><HeartPulse size={24}/></div><div className="skeleton-line"/></div>;
  return isSignedIn ? <>{children}</> : <Redirect to="/"/>;
}
function HomeRoute() { return <Landing/>; }
function ProtectedRoute({ component: Component }: { component: ComponentType }) { return <Protected><Component/></Protected>; }
function Routes() {
  const [,setLocation]=useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{signIn:{start:{title:'Welcome back',subtitle:'Sign in to access your district workspace'}},signUp:{start:{title:'Create your account',subtitle:'Join your local care network'}}}} routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
    <ClerkQueryClientCacheInvalidator/>
    <Switch>
      <Route path="/" component={HomeRoute}/>
      <Route path="/sign-in/*?" component={SignInPage}/>
      <Route path="/sign-up/*?" component={SignUpPage}/>
      <Route path="/dashboard"><ProtectedRoute component={DashboardPage}/></Route>
      <Route path="/centres"><ProtectedRoute component={CentresPage}/></Route>
      <Route path="/centres/:id"><ProtectedRoute component={CentreDetailPage}/></Route>
      <Route path="/inventory"><ProtectedRoute component={InventoryPage}/></Route>
      <Route path="/inventory/movements"><ProtectedRoute component={MovementsPage}/></Route>
      <Route path="/forecasting"><ProtectedRoute component={ForecastingPage}/></Route>
      <Route path="/patients"><ProtectedRoute component={PatientsPage}/></Route>
      <Route path="/beds"><ProtectedRoute component={BedsPage}/></Route>
      <Route path="/attendance"><ProtectedRoute component={AttendancePage}/></Route>
      <Route path="/diagnostics"><ProtectedRoute component={DiagnosticsPage}/></Route>
      <Route path="/redistribution"><ProtectedRoute component={RedistributionPage}/></Route>
      <Route path="/alerts"><ProtectedRoute component={AlertsPage}/></Route>
      <Route path="/assistant"><ProtectedRoute component={AssistantPage}/></Route>
      <Route path="/reports"><ProtectedRoute component={ReportsPage}/></Route>
      <Route path="/users"><ProtectedRoute component={UsersPage}/></Route>
      <Route path="/audit-logs"><ProtectedRoute component={AuditLogsPage}/></Route>
      <Route path="/settings"><ProtectedRoute component={SettingsPage}/></Route>
      <Route component={NotFound}/>
    </Switch>
  </ClerkProvider>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ErrorBoundary><Routes/></ErrorBoundary></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
