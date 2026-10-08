'use client';
import {useState} from 'react';
import {Badge} from './ui';
import {schemeFor,courseworkMaximum} from '../../lib/assessment-scheme';
export default function AssessmentScheme({ctx}:any){
 const {data,get,settings,action,archived,navigate}=ctx,course=data.selectedCourse;
 const assessments=get('assessment').filter((a:any)=>a.course===course&&a.published);
 const maximum=courseworkMaximum(course);
 const scheme=schemeFor(settings,course,assessments);
 const [weights,setWeights]=useState<Record<string,string>>(()=>Object.fromEntries(assessments.map((a:any)=>[a.id,a.weight===undefined?'':String(a.weight)])));
 const [policy,setPolicy]=useState(/No institutional percentages|Configure the approved coursework/.test(scheme.policy||'')?'':scheme.policy||''),[approved,setApproved]=useState(!!scheme.approved),[busy,setBusy]=useState(false);
 const total=assessments.reduce((sum:number,a:any)=>sum+Number(weights[a.id]||0),0);
 const complete=assessments.length>0&&assessments.every((a:any)=>weights[a.id]!==undefined&&weights[a.id]!==''&&Number.isFinite(Number(weights[a.id]))&&Number(weights[a.id])>=0&&Number(weights[a.id])<=maximum)&&Math.abs(total-maximum)<0.01;
 async function save(e:any){e.preventDefault();setBusy(true);await action({action:'assessmentScheme',course,settingsRevision:settings.revision,approved,policy,weights:assessments.map((a:any)=>({id:a.id,revision:a.revision,weight:weights[a.id]??''}))},approved?'Assessment scheme confirmed':'Assessment scheme saved as draft');setBusy(false);}
 return <section className="card" id="assessment-scheme"><div className="card-head"><div><h2>Assessment scheme</h2><p className="muted">{course} · Use the course selector above to configure another course.</p></div><Badge>{scheme.approved?'Confirmed':'Awaiting confirmation'}</Badge></div>
 <p>Coursework for {course} contributes {maximum}%. Enter assessment weights that add up to {maximum}%. Coursework marks are shown out of {maximum}.</p>
 {assessments.length?<form className="stack" onSubmit={save}><fieldset disabled={busy||archived} style={{border:0,padding:0,margin:0}}><div className="form-grid">{assessments.map((a:any)=><label key={a.id}>{a.title} · weight (%)<input type="number" min={0} max={maximum} step="0.01" value={weights[a.id]??''} onChange={e=>{setWeights(w=>({...w,[a.id]:e.target.value}));setApproved(false);}}/></label>)}</div><p role="status"><strong>{Number(total.toFixed(2))}% of {maximum}% allocated</strong>{!complete?` · Enter all weights and total ${maximum}% to confirm.`:''}</p><label>Approved scheme / source notes<textarea rows={3} value={policy} onChange={e=>{setPolicy(e.target.value);setApproved(false);}} placeholder="Reference your approved course outline or assessment scheme"/></label><label className="check-label below"><input type="checkbox" checked={approved} disabled={!complete} onChange={e=>setApproved(e.target.checked)}/><span>I confirm these weights match the approved course scheme.</span></label></fieldset><div className="button-row"><button className="primary" disabled={busy||archived}>{busy?'Saving…':approved?'Save confirmed scheme':'Save draft'}</button></div></form>:<div className="notice"><p>Publish an assessment for {course} first. It will appear here so you can enter its weight.</p><button className="secondary" onClick={()=>navigate('assignments')}>Go to assessments</button></div>}
 </section>;
}
