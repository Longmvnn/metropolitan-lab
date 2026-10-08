'use client';
import React,{useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {LayoutDashboard,CalendarDays,ClipboardList,GraduationCap,Users,FolderOpen,Bell,Mail,Menu,X,CheckCircle2,UserRound,MoreHorizontal,Eye,ArrowLeft} from 'lucide-react';
import {seed} from './data';
import {Toasts,Toast,Skeleton,Modal,date} from './components/ui';
import ProfileMenu from './components/ProfileMenu';
import StudentHome from './components/StudentHome';
import LecturerHome from './components/LecturerHome';
import TimetableAttendance from './components/TimetableAttendance';
import Assessments from './components/Assessments';
import Marks from './components/Marks';
import Letters from './components/Letters';
import CourseMaterials from './components/CourseMaterials';
import People from './components/People';
import Groups from './components/Groups';
import Announcements from './components/Announcements';
import ProfilePage from './components/ProfilePage';
import SettingsPage from './components/SettingsPage';
import UploadCentre from './components/UploadCentre';
import RecordForm from './components/RecordForm';
import AuthForm from './components/AuthForm';

type Page={id:string,label:string,icon:any,title?:string};
const studentPages:Page[]=[{id:'home',label:'Home',icon:LayoutDashboard},{id:'timetable',label:'Timetable & attendance',icon:CalendarDays},{id:'assignments',label:'Assignments',icon:ClipboardList},{id:'letters',label:'Letters & requests',icon:Mail},{id:'marks',label:'Marks & feedback',icon:GraduationCap},{id:'group',label:'My group',icon:Users},{id:'materials',label:'Course materials',icon:FolderOpen}];
const lecturerPages:Page[]=[{id:'home',label:'Dashboard',icon:LayoutDashboard},{id:'timetable',label:'Timetable & attendance',icon:CalendarDays},{id:'assignments',label:'Assessments & marks',icon:ClipboardList},{id:'letters',label:'Letters & requests',icon:Mail},{id:'people',label:'Students & groups',icon:Users},{id:'materials',label:'Course materials',icon:FolderOpen},{id:'announcements',label:'Announcements',icon:Bell}];
const hiddenPages:Record<string,string>={announcements:'Announcements',profile:'My profile',settings:'Settings',upload:'Import students & timetable'};
// On phones, students get a bottom tab bar: four destinations plus "More".
const bottomTabs=['home','timetable','assignments','marks'];

export default function Lab(){
 const [portal,setPortal]=useState('student'),[data,setData]=useState<any>(null),[page,setPage]=useState('home'),[loading,setLoading]=useState(true),[signedOut,setSignedOut]=useState(false),[loadError,setLoadError]=useState(''),[preview,setPreview]=useState(false),[drawer,setDrawer]=useState(false),[modal,setModal]=useState<any>(null),[toasts,setToasts]=useState<Toast[]>([]),[tick,setTick]=useState(Date.now()),[celebrate,setCelebrate]=useState('');
 const toast=useCallback((text:string,kind:'success'|'error'='success')=>{const id=Date.now()+Math.random();setToasts(t=>[...t.slice(-2),{id,kind,text}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),kind==='error'?7000:4000);},[]);
 const userId=useRef('');
 // One browser holds one sign-in. If another tab signs in as someone else, reload instead of acting as the wrong account.
 const refresh=useCallback(async()=>{try{const params=new URLSearchParams(window.location.search);const r=await fetch('/api/lab?'+params.toString());const d:any=await r.json();if(userId.current&&d.user?.id!==userId.current){userId.current='';setData(null);}if(d.user?.id)userId.current=d.user.id;if(!r.ok){if(/Sign in/.test(d.error||'')){setSignedOut(true);return;}throw new Error(d.error);}setData(d);setSignedOut(false);setLoadError('');}catch(e:any){setLoadError(e.message);}finally{setLoading(false);}},[]);
 useEffect(()=>{const params=new URLSearchParams(window.location.search);const requested=params.get('portal');if(requested==='student'||requested==='lecturer')setPortal(requested);const p=params.get('page');if(p)setPage(p);refresh();},[refresh]);
 useEffect(()=>{if(preview||!data)return;const t=setInterval(()=>{if(!modal&&document.visibilityState==='visible')refresh();},30000);return()=>clearInterval(t);},[preview,modal,data,refresh]);
 useEffect(()=>{const t=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(t);},[]);
 useEffect(()=>{const onFocus=()=>{if(userId.current)refresh();};window.addEventListener('focus',onFocus);return()=>window.removeEventListener('focus',onFocus);},[refresh]);

 if(loading)return <Skeleton/>;
 
 if(!data)return <AuthForm portal={portal} setPortal={setPortal} error={signedOut?'':loadError}/>;

 const user=data.user,admin=user.role==='admin',records:any[]=data.records||[],students:any[]=data.students||[];
 const readOnly=preview||!!data.previewAsStudent;
 const archived=data.semesters?.find((s:any)=>s.id===data.semester)?.archived;
 const get=(kind:string)=>records.filter((r:any)=>r.kind===kind);
 const settings=get('settings')[0]||seed[0].data;
 const courseCodes:string[]=(data.courses||[]).map((c:any)=>c.code);
 const courseName=(code:string)=>data.courses?.find((c:any)=>c.code===code)?.name||code;
 const member=(id:string)=>students.find((s:any)=>s.id===id)?.name||(id===user.id?user.name:'Group member');
 const week=settings.start?Math.floor((tick-Date.parse(settings.start+'T00:00:00+03:00'))/604800000)+1:null;
 const weekLabel=week===null?'':week<1?'Starts soon':week>Number(settings.weeks)?'Semester complete':`Week ${week} of ${settings.weeks}`;
 const pages=admin?lecturerPages:studentPages;
 const navigate=(p:string)=>{setPage(p);setDrawer(false);window.scrollTo({top:0});const u=new URL(window.location.href);u.searchParams.set('page',p);window.history.replaceState(null,'',u);};
 const guard=()=>{if(archived){toast('Archived semesters are read-only.','error');return false;}if(readOnly){toast(data.previewAsStudent?'This is a preview of the student view. Nothing is saved.':'This is a read-only preview. Sign in to save.','error');return false;}return true;};
 const open=(kind:string,record?:any,defaults?:any)=>{if(!guard())return;setModal({kind,record,defaults:{course:data.selectedCourse||courseCodes[0],...defaults}});};
 async function action(body:any,message='Changes saved'){if(!guard())return false;try{const r=await fetch('/api/lab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({course:data.selectedCourse,...body,semester:data.semester,expectUser:data.user?.id})});const d:any=await r.json();if(r.status===409&&d.switched){toast(d.error,'error');setTimeout(()=>window.location.reload(),1200);return null;}if(!r.ok)throw new Error(d.error);await refresh();if(body.action==='checkin')setCelebrate(d.status||'Present');else if(message)toast(message);return d;}catch(e:any){toast(e.message,'error');return null;}}
 const ctx={data,user,admin,readOnly,archived,records,students,get,settings,courseCodes,courseName,member,tick,navigate,open,action,refresh,toast,guard,week};
 const current=pages.find(p=>p.id===page)||(hiddenPages[page]&&{id:page,label:hiddenPages[page]})||pages[0];
 const pageId=current.id;
 const unread=get('notification').filter((n:any)=>!n.read).length;

 return <div className={'app'+(admin?' lecturer':' student')}>
  <aside className={'sidebar'+(drawer?' open':'')} aria-label="Main navigation">
   <a className="brand" onClick={()=>navigate('home')}><img src="/branding/archplaza-logo-lime.png" alt="ArchPlaza" className="brand-logo"/></a>
   <SideNav pages={pages} active={pageId} navigate={navigate}/>
   <div className="sidebar-bottom"><span className="uni-mark">AU</span><div>Ardhi University<small>{admin?'Lecturer workspace':'Student workspace'}</small></div></div>
  </aside>
  {drawer&&<div className="drawer-scrim" onClick={()=>setDrawer(false)}/>}
  <div className="main">
   {preview&&<div className="preview-banner"><Eye size={16}/>Read-only preview.<a href={'/?portal='+portal} target="_top">Sign in</a></div>}
   <header className="topbar">
    <button className="icon-button mobile-menu" aria-label={drawer?'Close menu':'Open menu'} onClick={()=>setDrawer(!drawer)}>{drawer?<X size={20}/>:<Menu size={20}/>}</button>
    <img className="topbar-logo" src="/branding/archplaza-logo-lime.png" alt="ArchPlaza"/><div className="topbar-context">
     {weekLabel&&<span className="week-chip">{weekLabel}</span>}
     <label className="topbar-select"><span className="sr-only">Semester</span><select aria-label="Semester" value={data.semester||''} onChange={e=>{const p=new URLSearchParams(window.location.search);p.set('semester',e.target.value);p.delete('course');window.location.assign('/?'+p);}}>{data.semesters?.map((s:any)=><option key={s.id} value={s.id}>{s.title}{s.archived?' · Archived':''}</option>)}</select></label>
     {courseCodes.length>1&&<label className="topbar-select"><span className="sr-only">Course</span><select aria-label="Course" value={data.selectedCourse||''} onChange={e=>{const p=new URLSearchParams(window.location.search);p.set('course',e.target.value);window.location.assign('/?'+p);}}>{data.courses?.map((c:any)=><option key={c.id} value={c.code}>{c.code} · {c.name}</option>)}</select></label>}
    </div>
    <div className="topbar-actions">
     <button className="icon-button bell" aria-label={`Announcements${unread?`, ${unread} new`:''}`} onClick={()=>navigate('announcements')}><Bell size={19}/>{unread>0&&<i>{unread>9?'9+':unread}</i>}</button>
     <ProfileMenu user={user} courses={courseCodes} navigate={navigate} photo={get('profile').find((p:any)=>p.owner===user.id)?.photo}/>
    </div>
   </header>
   <main key={pageId} className="page">
    {archived&&<div className="notice"><strong>Archived semester · read-only</strong><p>Marks, attendance and files are preserved. Choose the active semester to make changes.</p></div>}
    {pageId!=='home'&&<div className="page-heading"><h1>{current.label}</h1>{(pageId==='profile'||pageId==='settings')&&<button className="text-button" onClick={()=>navigate('home')}><ArrowLeft size={16}/>Back to {admin?'dashboard':'home'}</button>}</div>}
    {pageId==='home'&&(admin?<LecturerHome ctx={ctx}/>:<StudentHome ctx={ctx}/>)}
    {pageId==='timetable'&&<TimetableAttendance ctx={ctx}/>}
    {pageId==='assignments'&&<><Assessments ctx={ctx}/>{admin&&<Marks ctx={ctx}/>}</>}
    {pageId==='marks'&&!admin&&<Marks ctx={ctx}/>}
    {pageId==='letters'&&<Letters ctx={ctx}/>}
    {pageId==='group'&&!admin&&<Groups ctx={ctx}/>}
    {pageId==='people'&&admin&&<People ctx={ctx}/>}
    {pageId==='materials'&&<CourseMaterials ctx={ctx}/>}
    {pageId==='announcements'&&<Announcements ctx={ctx}/>}
    {pageId==='profile'&&<ProfilePage ctx={ctx}/>}
    {pageId==='settings'&&admin&&<SettingsPage ctx={ctx}/>}
    {pageId==='upload'&&admin&&<UploadCentre records={records} preview={readOnly} onRefresh={refresh} open={open}/>}
    <footer className="app-footer"><span>ArchPlaza</span><span>Teaching workspace · Official records remain with Ardhi University</span></footer>
   </main>
  </div>
  {!admin&&<nav className="bottom-tabs" aria-label="Quick navigation">{bottomTabs.map(id=>{const p=pages.find(x=>x.id===id)!;const Icon=p.icon;return <button key={id} className={pageId===id?'active':''} aria-current={pageId===id?'page':undefined} onClick={()=>navigate(id)}><Icon size={21}/><span>{id==='timetable'?'Timetable':id==='marks'?'Marks':p.label}</span></button>;})}<button className={!bottomTabs.includes(pageId)?'active':''} onClick={()=>setDrawer(true)}><MoreHorizontal size={21}/><span>More</span></button></nav>}
  {modal&&<RecordForm ctx={ctx} modal={modal} close={()=>setModal(null)}/>}
  {celebrate&&<Modal title="" onClose={()=>setCelebrate('')}><div className="celebrate"><span className="celebrate-tick"><CheckCircle2 size={56}/></span><h2>{celebrate==='Late'?'You’re checked in (late)':'You’re marked present'}</h2><p>{date(new Date().toISOString())}</p><button className="primary" onClick={()=>setCelebrate('')}>Done</button></div></Modal>}
  <Toasts items={toasts} dismiss={id=>setToasts(t=>t.filter(x=>x.id!==id))}/>
 </div>;
}

// The active pill slides between items instead of jumping.
function SideNav({pages,active,navigate}:{pages:Page[],active:string,navigate:(p:string)=>void}){const ref=useRef<HTMLElement>(null);const [pos,setPos]=useState<{top:number,height:number}|null>(null);useLayoutEffect(()=>{const el=ref.current?.querySelector<HTMLElement>('button.active');setPos(el?{top:el.offsetTop,height:el.offsetHeight}:null);},[active]);return <nav ref={ref} className="side-nav">{pos&&<span className="side-indicator" style={{transform:`translateY(${pos.top}px)`,height:pos.height}}/>}{pages.map(p=>{const Icon=p.icon;return <button key={p.id} className={active===p.id?'active':''} aria-current={active===p.id?'page':undefined} onClick={()=>navigate(p.id)}><Icon size={19}/><span>{p.label}</span></button>;})}</nav>;}

function previewData(portal:string){return {courses:[{id:'preview-406',code:'UP 406',name:'Metropolitan Planning Theories'},{id:'preview-417',code:'UP 417',name:'Metropolitan Planning Studio'}],semesters:[{id:'preview',title:'Preview semester'}],semester:'preview',selectedCourse:'UP 406',user:{name:portal==='student'?'Student preview':'Lecturer preview',role:portal==='student'?'student':'admin',id:'preview',email:''},records:seed.map(r=>({...r,...r.data,data:undefined})),students:[],audit:[]};}
