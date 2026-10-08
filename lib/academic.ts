import {db,all,get,uid,now} from './lab';
export const globalKinds=['onboarding','roster','semester','course','enrollment','profile','email-challenge','scheduler','mail-lock'];
export async function ensureAcademic(){
 const exists=await get('semester:initial');if(exists)return;
 const records=await all(),settings=records.find((r:any)=>r.kind==='settings');
 const students=(await db().prepare("SELECT id FROM users WHERE role='student'").all()).results;
 const insert=(id:string,kind:string,data:any)=>db().prepare('INSERT OR IGNORE INTO records(id,kind,data,revision,created) VALUES(?,?,?,1,?)').bind(id,kind,JSON.stringify(data),now());
 const ops=[insert('semester:initial','semester',{title:settings?.title||'Semester I',start:settings?.start||'',weeks:settings?.weeks||15,archived:false})];
 for(const [code,name,rooms] of [['UP 406','Metropolitan Planning Theories','RM 70'],['UP 417','Metropolitan Planning Studio','RM 22']])ops.push(insert('course:'+code,'course',{code,name,rooms}));
 for(const r of records.filter((r:any)=>!globalKinds.includes(r.kind)))ops.push(db().prepare("UPDATE records SET data=json_set(data,'$.semester',?) WHERE id=?").bind('semester:initial',r.id));
 for(const s of students){const p=records.find((r:any)=>r.id==='profile:'+s.id);for(const course of p?.courses||['UP 406','UP 417'])if(!records.some((r:any)=>r.kind==='enrollment'&&r.student===s.id&&r.semester==='semester:initial'&&r.course===course))ops.push(insert(`enrollment:semester:initial:${course}:${s.id}`,'enrollment',{semester:'semester:initial',course,student:s.id}));}
 await db().batch(ops);
}
export async function activeSemester(){const semesters=await all('semester');return semesters.find((s:any)=>!s.archived);}
export async function writableSemester(id?:string){const s=id?await get(id):await activeSemester();if(!s||s.kind!=='semester'||s.archived)throw new Error('Archived semesters are read-only. Select the active semester.');return s;}
export function recordCourse(r:any,records:any[]):string|undefined{if(r.course&&r.course!=='Both courses')return r.course;for(const key of ['assessment','session','resource','submission','group'])if(r[key]){const parent=records.find((p:any)=>p.id===r[key]);if(parent&&parent.id!==r.id)return recordCourse(parent,records);}return undefined;}
export function inScope(r:any,records:any[],semester:string,course?:string){if(globalKinds.includes(r.kind))return false;return r.semester===semester&&(!course||!recordCourse(r,records)||recordCourse(r,records)===course);}
export function enrolled(records:any[],student:string,semester:string,course:string){return records.some((r:any)=>r.kind==='enrollment'&&r.student===student&&r.semester===semester&&r.course===course);}
export async function assertTargetWritable(r:any){if(r&&!globalKinds.includes(r.kind))await writableSemester(r.semester);}
