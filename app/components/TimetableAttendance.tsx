'use client';
import {Plus,Upload,MapPin,CheckCircle2,CalendarDays} from 'lucide-react';
import {Badge,Empty,CountUp,date} from './ui';

const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export default function TimetableAttendance({ctx}:any){const {admin,get,tick,open,action,navigate,member,courseName}=ctx;
 const sessions=get('timetable').sort((a:any,b:any)=>DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||a.start.localeCompare(b.start));
 const today=new Date(tick).toLocaleDateString('en-US',{timeZone:'Africa/Dar_es_Salaam',weekday:'long'});
 const live=get('session').filter((s:any)=>!s.closed&&Date.parse(s.expires)>tick);
 const register=get('attendance').sort((a:any,b:any)=>(b.created||'').localeCompare(a.created||''));const session=(id:string)=>get('session').find((s:any)=>s.id===id);
 const counted=register.filter((r:any)=>r.status!=='Excused'),attended=counted.filter((r:any)=>['Present','Late'].includes(r.status)).length;
 return <div className="stack reveal">
  <section className="card"><div className="card-head"><h2>Weekly timetable</h2>{admin&&<div className="button-row"><button className="secondary" onClick={()=>navigate('upload')}><Upload size={16}/>Import</button><button className="primary" onClick={()=>open('timetable',undefined,{day:'Tuesday'})}><Plus size={18}/>Add session</button></div>}</div>
   {sessions.length?<div className="timetable">{DAYS.filter(d=>sessions.some((s:any)=>s.day===d)).map(d=><div className={'day'+(d===today?' today':'')} key={d}><div className="day-name">{d.slice(0,3)}{d===today&&<small>Today</small>}</div><div className="day-slots">{sessions.filter((s:any)=>s.day===d).map((s:any)=><div className={'slot '+(s.course===sessions[0].course?'tint-lime':'tint-lilac')} key={s.id}><span className="slot-time">{s.start} – {s.end}</span><strong>{s.course}</strong><small>{courseName(s.course)}</small><span className="slot-room"><MapPin size={14}/>{s.room} · {s.lecturers}</span>{admin&&<button className="text-button" onClick={()=>open('timetable',s)}>Edit</button>}</div>)}</div></div>)}</div>:<Empty icon={CalendarDays} title="No timetable yet" body={admin?'Add class sessions or import your timetable.':'Your class times will appear here.'}/>}
   <p className="footnote">All times are East Africa Time (UTC+3).</p>
  </section>
  <section className="card"><div className="card-head"><h2>Check-in</h2>{admin&&<button className="primary" onClick={()=>open('startSession',undefined,{timetable:sessions[0]?.id,minutes:3,lateAfter:3})}><CheckCircle2 size={18}/>Start checkpoint</button>}</div>
   {live.length?live.map((s:any)=><div className="live-banner" key={s.id}><span className="pulse"/><div className="grow"><strong>{s.title}</strong><p>{Math.max(0,Math.ceil((Date.parse(s.expires)-tick)/60000))} min left</p></div>{admin?<><strong className="session-code" aria-label="Check-in code">{s.code}</strong><button className="secondary on-dark" onClick={()=>action({action:'closeSession',id:s.id},'Check-in closed')}>Close</button></>:<button className="primary on-dark" onClick={()=>open('checkin',undefined,{sessionId:s.id})}>Check in</button>}</div>):<p className="quiet">{admin?'Start a checkpoint at the beginning, middle, or end of class. Codes expire after 3 minutes.':'When your lecturer opens check-in, a button appears here and on your home page.'}</p>}
  </section>
  <section className="card"><div className="card-head"><h2>{admin?'Attendance register':'My attendance'}</h2>{!admin&&counted.length>0&&<strong className="mid"><CountUp value={Math.round(attended/counted.length*100)} suffix="%"/></strong>}</div>
   {register.length?<div className="table-wrap"><table><thead><tr><th>Class</th>{admin&&<th>Student</th>}<th>Status</th><th>Checked in</th><th>Note</th>{admin&&<th/>}</tr></thead><tbody>{register.map((a:any)=><tr key={a.id}><td>{session(a.session)?.title||'Class'}<small>{date(session(a.session)?.started)}</small></td>{admin&&<td>{member(a.student)}</td>}<td><Badge>{a.status}</Badge></td><td>{a.time?date(a.time):'—'}</td><td className="muted">{a.reason}</td>{admin&&<td><button className="text-button" onClick={()=>open('attendance',a)}>Correct</button></td>}</tr>)}</tbody></table></div>:<p className="quiet">Attendance appears here after the first check-in.</p>}
   <p className="footnote">Excused absences don’t count against attendance. {admin?'Corrections keep the previous value and your reason.':'Sent a letter about an absence? Your lecturer can mark it as excused.'}</p>
  </section>
 </div>;}
