import {ensureAcademic,globalKinds,writableSemester,assertTargetWritable} from './academic';
import { env } from 'cloudflare:workers';
import { sessionUser } from './auth';
import { seed, retiredSeedIds } from '../app/data';
export const db = () => { const d=(env as any).DB; if(!d) throw new Error('Teaching records are unavailable. Please try again shortly.'); return d; };
export const bucket = () => (env as any).BUCKET;
export const uid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export async function all(kind?:string){const r=await db().prepare(kind?'SELECT * FROM records WHERE kind = ?':'SELECT * FROM records').bind(...(kind?[kind]:[])).all();return r.results.map((r:any)=>({...r,...JSON.parse(r.data),data:undefined}));}
export async function get(id:string){const r=await db().prepare('SELECT * FROM records WHERE id = ?').bind(id).first();return r?{...r,...JSON.parse(r.data),data:undefined}:null;}
export async function put(kind:string,id:string,data:any,revision?:number){
 if(!globalKinds.includes(kind)){const old=await get(id);if(old)await assertTargetWritable(old);const term=await writableSemester(old?.semester||data.semester);data={...data,semester:term.id};for(const key of ['assessment','session','resource','submission','group'])if(data[key])await assertTargetWritable(await get(data[key]));}
 const clean={...data};delete clean.data;delete clean.id;delete clean.kind;delete clean.revision;delete clean.created;
 if(revision!==undefined){const result=await db().prepare('UPDATE records SET data = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(JSON.stringify(clean),id,revision).run();if(!result.meta.changes)throw new Error('This record changed in another window. Refresh and try again.');}
 else await db().prepare('INSERT INTO records (id,kind,data,revision,created) VALUES (?,?,?,1,?)').bind(id,kind,JSON.stringify(clean),now()).run();
}
export async function log(actor:string,action:string,target:string,before:any,after:any){await db().prepare('INSERT INTO audit (id,actor,action,target,before,after,created) VALUES (?,?,?,?,?,?,?)').bind(uid(),actor,action,target,before?JSON.stringify(before):null,after?JSON.stringify(after):null,now()).run();}
export async function actor(_allowBootstrap=true){
 const u=await sessionUser();
 if(!u)throw new Error('Sign in to continue.');
 if(u.role==='admin'){await db().batch([...seed.map(r=>db().prepare('INSERT OR IGNORE INTO records (id,kind,data,revision,created) VALUES (?,?,?,1,?)').bind(r.id,r.kind,JSON.stringify(r.data),now())),...retiredSeedIds.map(id=>db().prepare('DELETE FROM records WHERE id = ? AND revision = 1').bind(id))]);}
 await ensureAcademic();return u;
}
export function belongs(record:any,user:any,records:any[]){return record.owner===user.id || !!record.group && records.some(g=>g.kind==='group'&&g.id===record.group&&(g.members||[]).includes(user.id));}
export function visible(r:any,u:any,records:any[]){if(['email-challenge','scheduler','mail-lock'].includes(r.kind))return false;if(u.role==='admin')return true;switch(r.kind){case 'profile':return r.owner===u.id;case 'resource':return !!r.published&&r.category!=='Student roster';case 'settings':case 'timetable':case 'law':case 'layer':return true;case 'content':case 'assessment':return !!r.published;case 'group':return (r.members||[]).includes(u.id);case 'session':return true;case 'mark':return r.student===u.id&&r.released;case 'attendance':return r.student===u.id;case 'notification':return !r.student||r.student===u.id;case 'file':return fileShared(r,u,records);case 'material':return r.published!==false;case 'letter':case 'attempt':return r.owner===u.id;case 'submission':case 'task':case 'activity':case 'map':return belongs(r,u,records);default:return false;}}
// A student may download a file they (or their group) uploaded, or one the lecturer has shared.
export function fileShared(r:any,u:any,records:any[]){if(u.role==='admin')return true;if(r.kind!=='file')return false;if(belongs(r,u,records))return true;if(r.letter)return false;return records.some(p=>(p.kind==='resource'&&p.published&&p.category!=='Student roster'||p.kind==='material'&&p.published!==false||p.kind==='assessment'&&p.published&&r.brief===p.id)&&(p.files||[]).includes(r.id));}
// Remove fields students must never receive: live check-in codes and quiz answer keys.
export function safeSession(r:any,u:any){if(u.role==='admin')return r;if(r.kind==='session'){const {code,...rest}=r;return rest;}if(r.kind==='assessment'&&Array.isArray(r.questions))return {...r,questions:r.questions.map(({answer,...q}:any)=>q)};return r;}
