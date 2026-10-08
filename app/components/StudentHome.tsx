'use client';
import {Clock,CheckCircle2,MapPin,ArrowRight,CalendarClock,Megaphone,ClipboardList} from 'lucide-react';
import {Badge,Empty,CountUp,Contours,remaining,shortDate,dayParts} from './ui';
import {Avatar} from './ProfileMenu';
import {submissionStatus} from './Assessments';

const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export function nextClass(timetable:any[],courses:string[],tick:number){const eat=new Date(tick+10800000);return timetable.filter((t:any)=>courses.includes(t.course)).map((t:any)=>{const shift=(days.indexOf(t.day)-eat.getUTCDay()+7)%7;const d=new Date(eat);d.setUTCDate(d.getUTCDate()+shift);let at=Date.parse(d.toISOString().slice(0,10)+'T'+t.start+':00+03:00');const end=Date.parse(d.toISOString().slice(0,10)+'T'+t.end+':00+03:00');if(end<tick)at+=604800000;return {...t,at,live:at<=tick&&end>tick};}).sort((a:any,b:any)=>a.at-b.at)[0];}

export default function StudentHome({ctx}:any){const {user,get,courseCodes:courses,navigate,open,tick}=ctx;
 const profile=get('profile').find((p:any)=>p.owner===user.id);
 const live=get('session').filter((s:any)=>!s.closed&&Date.parse(s.expires)>tick);
 const att=get('attendance').filter((r:any)=>r.status!=='Excused'),attended=att.filter((r:any)=>['Present','Late'].includes(r.status)).length,rate=att.length?Math.round(attended/att.length*100):null;
 const next=nextClass(get('timetable'),courses,tick);
 const upcoming=get('assessment').filter((a:any)=>a.published&&a.due&&courses.includes(a.course)).map((a:any)=>({...a,status:submissionStatus(ctx,a)})).filter((a:any)=>Date.parse(a.due)>tick-86400000*2||a.status==='Not started').sort((a:any,b:any)=>Date.parse(a.due)-Date.parse(b.due));
 const nextDue=upcoming.find((a:any)=>a.status==='Not started'&&Date.parse(a.due)>tick);
 const notices=get('notification').sort((a:any,b:any)=>(b.created||'').localeCompare(a.created||''));
 const first=user.name.split(' ')[0];
 return <div className="stack reveal">
  <section className="welcome">
   <Contours/>
   <Avatar user={user} photo={profile?.photo} size="large"/>
   <div><h1>Hi {first}, welcome back</h1><p>{[profile?.year,profile?.programme].filter(Boolean).join(' · ')||'Urban & Regional Planning'}</p><div className="chips">{courses.map((c:string)=><span className="chip" key={c}>{c}</span>)}</div></div>
   {!profile?.emailVerified&&<button className="secondary" onClick={()=>navigate('profile')}>Verify email</button>}
  </section>
  {live.length>0&&<section className="live-banner"><span className="pulse"/><div><strong>Class check-in is open</strong><p>{live.map((s:any)=>s.title).join(' · ')}</p></div><button className="primary on-dark" onClick={()=>open('checkin')}><CheckCircle2 size={18}/>Check in now</button></section>}
  <div className="card-row three">
   <button className="card stat-card tint-lime" onClick={()=>navigate('timetable')}>
    <span className="card-label"><CalendarClock size={18}/>Next class</span>
    {next?<><strong className="big">{next.live?'Now':next.day.slice(0,3)+' '+next.start}</strong><p>{next.course} · until {next.end}</p><span className="card-foot"><MapPin size={16}/>{next.room}<em>{next.live?'In progress':'in '+remaining(next.at-tick)}</em></span></>:<><strong className="big">—</strong><p>No classes on your timetable yet.</p></>}
    <ArrowRight className="card-arrow" size={18}/>
   </button>
   <button className="card stat-card tint-peach" onClick={()=>navigate('assignments')}>
    <span className="card-label"><Clock size={18}/>Next deadline</span>
    {nextDue?<><strong className="big">{remaining(Date.parse(nextDue.due)-tick)}</strong><p>{nextDue.title}</p><span className="card-foot">{shortDate(nextDue.due)}</span></>:<><strong className="big">All clear</strong><p>Nothing due right now.</p></>}
    <ArrowRight className="card-arrow" size={18}/>
   </button>
   <button className="card stat-card tint-lilac" onClick={()=>navigate('timetable')}>
    <span className="card-label"><CheckCircle2 size={18}/>My attendance</span>
    <strong className="big">{rate===null?'—':<CountUp value={rate} suffix="%"/>}</strong>
    <p>{att.length?`${attended} of ${att.length} classes attended`:'Recorded after your first class.'}</p>
    <span className="meter"><i style={{width:(rate||0)+'%'}}/></span>
    <ArrowRight className="card-arrow" size={18}/>
   </button>
  </div>
  <div className="card-row two">
   <section className="card"><div className="card-head"><h2>Upcoming deadlines</h2><button className="text-button" onClick={()=>navigate('assignments')}>All assignments<ArrowRight size={16}/></button></div>
    {upcoming.length?upcoming.slice(0,5).map((a:any)=>{const d=dayParts(a.due);return <button className="list-row" key={a.id} onClick={()=>navigate('assignments')}><span className="date-tile"><b>{d.day}</b><small>{d.month}</small></span><span className="grow"><strong>{a.title}</strong><small>{a.course} · {a.type}</small></span><Badge>{a.status}</Badge></button>;}):<Empty icon={ClipboardList} title="No deadlines yet" body="Your lecturer will post assignments here."/>}
   </section>
   <section className="card"><div className="card-head"><h2>Latest announcements</h2><button className="text-button" onClick={()=>navigate('announcements')}>See all<ArrowRight size={16}/></button></div>
    {notices.length?notices.slice(0,4).map((n:any)=><div className="list-row static" key={n.id}><span className="icon-tile"><Megaphone size={18}/></span><span className="grow"><strong>{n.title}</strong><small className="clamp">{n.body}</small></span></div>):<Empty icon={Megaphone} title="No announcements yet" body="Class updates from your lecturers will appear here."/>}
   </section>
  </div>
 </div>;
}
