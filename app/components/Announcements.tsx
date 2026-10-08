'use client';
import {useEffect} from 'react';
import {Plus,Megaphone,Clock,Trash2} from 'lucide-react';
import {Badge,Empty,date,shortDate,remaining} from './ui';

export default function Announcements({ctx}:any){const {admin,get,open,tick}=ctx;const notices=get('notification').sort((a:any,b:any)=>(b.created||'').localeCompare(a.created||''));const due=get('assessment').filter((a:any)=>a.published&&a.due&&Date.parse(a.due)>tick).sort((a:any,b:any)=>a.due.localeCompare(b.due)).slice(0,4);
 const unreadKey=JSON.stringify(notices.filter((n:any)=>!n.read).slice(0,500).map((n:any)=>({id:n.id,revision:n.revision})));
 const {refresh,user,readOnly}=ctx;
 useEffect(()=>{
  if(readOnly||unreadKey==='[]')return;
  let cancelled=false,busy=false;
  const markRead=()=>{
   if(document.visibilityState!=='visible'||busy)return;
   busy=true;
   fetch('/api/notifications/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notifications:JSON.parse(unreadKey),expectUser:user.id})})
    .then(r=>{if(!r.ok)throw new Error('Unable to mark notifications read.');if(!cancelled)return refresh();})
    .catch(()=>{}).finally(()=>{busy=false;});
  };
  markRead();document.addEventListener('visibilitychange',markRead);
  return ()=>{cancelled=true;document.removeEventListener('visibilitychange',markRead);};
 },[unreadKey,user.id,readOnly,refresh]);
 return <div className="stack reveal">
  {admin&&<div className="toolbar"><span className="muted grow">Students see announcements on their home page and here.</span><button className="primary" onClick={()=>open('notification',undefined,{type:'Announcement'})}><Plus size={18}/>Post announcement</button></div>}
  {due.length>0&&<section className="card tint-peach"><div className="card-head"><h2>Coming up</h2></div>{due.map((a:any)=><div className="list-row static" key={a.id}><Clock size={18}/><span className="grow"><strong>{a.title}</strong><small>{a.course} · {shortDate(a.due)}</small></span><Badge tone={Date.parse(a.due)-tick<172800000?'amber':'grey'}>in {remaining(Date.parse(a.due)-tick)}</Badge></div>)}</section>}
  {notices.length?<div className="card list-card">{notices.map((n:any)=><article className="announcement" key={n.id}><span className="icon-tile"><Megaphone size={18}/></span><div className="grow"><div className="announcement-meta"><Badge tone="grey">{n.type}</Badge>{n.course&&<span>{n.course}</span>}<span>{date(n.created)}</span></div><h3>{n.title}</h3><p className="prewrap">{n.body}</p></div>{admin&&<div className="row-actions"><button className="text-button" onClick={()=>open('notification',n)}>Edit</button><button className="icon-button small" aria-label={'Delete '+n.title} title="Delete" onClick={()=>ctx.guard()&&confirm(`Delete “${n.title}”? Students will no longer see it.`)&&ctx.action({action:'deleteNotification',id:n.id},'Announcement deleted')}><Trash2 size={16}/></button></div>}</article>)}</div>:<Empty icon={Megaphone} title="No announcements yet" body={admin?'Post class updates, room changes and reminders.':'Class updates from your lecturers will appear here.'}/>}
 </div>;}
