'use client';
import {useState} from 'react';
import {Plus,Upload,Users,Search,Trash2,Pencil} from 'lucide-react';
import {Badge,Empty,Modal} from './ui';
import {Avatar} from './ProfileMenu';
import Groups from './Groups';

export default function People({ctx}:any){const {students,get,open,navigate,data}=ctx;const [tab,setTab]=useState<'students'|'groups'>('students'),[q,setQ]=useState(''),[removing,setRemoving]=useState<any>(null),[editing,setEditing]=useState<any>(null),[busy,setBusy]=useState(false);
 async function saveEdit(e:any){e.preventDefault();setBusy(true);const r=await ctx.action({action:'editStudent',id:editing.user?.id||'',roster:editing.rosterId||'',name:editing.name,registration:editing.registration,email:editing.email||''},'Student updated');setBusy(false);if(r)setEditing(null);}
 async function remove(removeFromList:boolean){setBusy(true);const r=await ctx.action({action:'deleteStudent',id:removing.user?.id||'',roster:removing.rosterId||'',removeFromList},removeFromList?`${removing.name} removed from the class list`:`${removing.name}’s account removed`);setBusy(false);if(r)setRemoving(null);}
 const roster=(data.pendingRoster||[]) as any[];const profile=(id:string)=>get('profile').find((p:any)=>p.owner===id);
 // One row per person: everyone on the class list, plus students a lecturer added directly.
 // A student added by a lecturer (rather than self-registered) is matched to their class-list row by registration number.
 const reg=(v:any)=>String(v||'').trim().toUpperCase();const direct=students.filter((s:any)=>s.role==='student');
 const byReg=(r:any)=>direct.find((s:any)=>s.id===r.student)||direct.find((s:any)=>reg(profile(s.id)?.registration)&&reg(profile(s.id)?.registration)===reg(r.registration));
 // "Linked" means the student has actually signed in and verified; being on a list or added by email is not enough.
 const rows=[...roster.map((r:any)=>{const s=byReg(r);const linked=!!r.student||!!s?.joined;return {key:r.id,rosterId:r.id,name:r.name,entered:r.enteredName&&r.enteredName!==r.name?r.enteredName:'',registration:r.registration,email:linked?(profile(s?.id)?.email||r.email||s?.email):'',linked,invited:!linked&&!!s,user:s};}),
  ...direct.filter((s:any)=>!roster.some((r:any)=>byReg(r)?.id===s.id)).map((s:any)=>({key:s.id,rosterId:'',name:s.name,entered:'',registration:profile(s.id)?.registration||'—',email:s.joined?(profile(s.id)?.email||s.email):'',linked:!!s.joined,invited:!s.joined,user:s}))]
  .sort((a,b)=>Number(a.linked)-Number(b.linked)||a.name.localeCompare(b.name));
 const shown=rows.filter(r=>!q||`${r.name} ${r.entered} ${r.registration} ${r.email}`.toLowerCase().includes(q.toLowerCase()));const linked=rows.filter(r=>r.linked).length;
 return <div className="stack reveal">
  <div className="toolbar"><div className="segmented" role="tablist"><button role="tab" aria-selected={tab==='students'} className={tab==='students'?'selected':''} onClick={()=>setTab('students')}>Students <small>{rows.length}</small></button><button role="tab" aria-selected={tab==='groups'} className={tab==='groups'?'selected':''} onClick={()=>setTab('groups')}>Groups <small>{get('group').length}</small></button></div></div>
  {tab==='groups'?<Groups ctx={ctx}/>:<section className="card">
   <div className="card-head"><div><h2>Class list</h2><p className="muted">{linked} of {rows.length} have joined. Students join by signing in, entering their registration number and verifying their email.</p></div><div className="button-row"><button className="secondary" onClick={()=>navigate('upload')}><Upload size={16}/>Import class list</button><button className="secondary" onClick={()=>open('student',undefined,{role:'student'})}><Plus size={16}/>Add directly</button></div></div>
   {rows.length>0&&<label className="search below-sm"><Search size={18}/><span className="sr-only">Search students</span><input placeholder="Search by name, registration number or email" value={q} onChange={e=>setQ(e.target.value)}/></label>}
   {rows.length?<div className="table-wrap"><table><thead><tr><th>Student</th><th>Registration</th><th>Status</th><th>Verified email</th><th/></tr></thead><tbody>{shown.map(r=><tr key={r.key}><td><span className="person">{r.user?<Avatar user={r.user} photo={profile(r.user.id)?.photo} size="small"/>:<span className="avatar small ghost" aria-hidden="true">{r.name.slice(0,1)}</span>}<span>{r.name}{r.entered&&<small>Signed up as {r.entered}</small>}</span></span></td><td>{r.registration}</td><td><Badge tone={r.linked?'green':'grey'}>{r.linked?'Linked':'Waiting for student'}</Badge>{r.invited&&<small>Added by a lecturer · hasn’t signed in</small>}</td><td className={r.email?'':'muted'}>{r.email||'—'}</td><td><div className="row-actions"><button className="icon-button small" aria-label={'Edit '+r.name} title="Edit" onClick={()=>ctx.guard()&&setEditing({...r,registration:r.registration==='—'?'':r.registration,email:r.user?.email||''})}><Pencil size={16}/></button><button className="icon-button small" aria-label={'Remove '+r.name} title="Remove" onClick={()=>ctx.guard()&&setRemoving(r)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table>{!shown.length&&<p className="quiet">No students match “{q}”.</p>}</div>
   :<Empty icon={Users} title="No class list yet" body="Import your class list (names and registration numbers). Students then create their own accounts." action={<button className="primary" onClick={()=>navigate('upload')}><Upload size={18}/>Import class list</button>}/>}
  </section>}
  {editing&&<Modal title={'Edit '+editing.name} onClose={()=>setEditing(null)} busy={busy}><form onSubmit={saveEdit}><div className="form-grid"><label className="wide">Full name (as on the class list)<input required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label><label>Registration number<input required value={editing.registration} onChange={e=>setEditing({...editing,registration:e.target.value})}/></label>{editing.user&&<label>Email<input type="email" value={editing.email} onChange={e=>setEditing({...editing,email:e.target.value})}/></label>}</div>{editing.linked&&<p className="footnote">This student has already joined. Changing their name here updates it everywhere.</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':'Save'}</button></div></form></Modal>}
  {removing&&<Modal title={`Remove ${removing.name}?`} onClose={()=>setRemoving(null)} busy={busy}><div className="stack">
   {removing.user&&<p>This deletes their account, profile, attendance, marks, quiz answers and letters, and takes them out of their group. Work they submitted with a group stays.</p>}
   {!removing.user&&<p>{removing.linked?'This unlinks the account from this class-list entry.':'They haven’t joined yet.'}</p>}
   <div className="remove-options">
    {(removing.user||removing.linked)&&removing.rosterId&&<button className="secondary" disabled={busy} onClick={()=>remove(false)}><strong>Delete account, keep on class list</strong><small>They can create their account again with the same registration number.</small></button>}
    {removing.user&&!removing.rosterId&&<button className="secondary danger" disabled={busy} onClick={()=>remove(false)}><strong>Remove account</strong><small>They are not on the class list, so they can’t sign up again unless you add them.</small></button>}
    {removing.rosterId&&<button className="secondary danger" disabled={busy} onClick={()=>remove(true)}><strong>Delete completely{removing.user||removing.linked?' (account and class-list entry)':' from the class list'}</strong><small>Their registration number is removed, so they can’t sign up until you add them again.</small></button>}
   </div>
   <div className="modal-actions"><button className="secondary" onClick={()=>setRemoving(null)} disabled={busy}>Cancel</button></div>
  </div></Modal>}
 </div>;}
