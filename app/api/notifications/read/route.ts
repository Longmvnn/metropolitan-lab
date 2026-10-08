import {actor,all,db,visible} from '../../../../lib/lab';
import {enrolled,recordCourse} from '../../../../lib/academic';
import {assertOrigin} from '../../../../lib/auth';
export async function POST(req:Request){try{
 assertOrigin(req);
 const user=await actor(),body:any=await req.json();
 if(body.expectUser!==user.id)return Response.json({error:'Your signed-in account changed.'},{status:409});
 if(!Array.isArray(body.notifications)||body.notifications.length>500)throw new Error('Choose up to 500 notifications.');
 const records=await all();
 const notifications=records.filter((r:any)=>r.kind==='notification'&&visible(r,user,records)&&(user.role==='admin'||records.some((e:any)=>e.kind==='enrollment'&&e.student===user.id&&e.semester===r.semester&&(!recordCourse(r,records)||enrolled(records,user.id,r.semester,recordCourse(r,records)!)))));
 const requested=new Map(body.notifications.map((n:any)=>[n.id,n.revision]));
 const read=notifications.filter((n:any)=>requested.get(n.id)===n.revision);
 if(read.length)await db().batch(read.map((n:any)=>db().prepare('INSERT INTO notification_reads(user_id,notification_id,read_revision) VALUES(?,?,?) ON CONFLICT(user_id,notification_id) DO UPDATE SET read_revision=max(read_revision,excluded.read_revision)').bind(user.id,n.id,n.revision)));
 return Response.json({ok:true,read:read.map((n:any)=>({id:n.id,revision:n.revision}))},{headers:{'Cache-Control':'no-store'}});
}catch(e:any){return Response.json({error:e.message||'Unable to mark notifications read.'},{status:400});}}
