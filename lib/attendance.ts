import {env} from 'cloudflare:workers';
import {eq} from 'drizzle-orm';
import {getDb} from '../db/index';
import {attendanceSessions} from '../db/schema';
import {all,db,get,now} from './lab';
import {enrolled,writableSemester} from './academic';
import {limit} from './auth';
import {ATTENDANCE_RADIUS_METERS,coordinates,distanceMeters,checkpointCode} from './geofence';

export class AttendanceError extends Error {constructor(message:string,public status=400){super(message);}}
// Every checkpoint has its own session and roster, preserving beginning/middle/end
// evidence instead of allowing a first check-in to count for later checkpoints.
export async function startCheckpoint(user:{id:string;role:string},body:{timetable?:string;semester?:string}) {
 if(user.role!=='admin')throw new AttendanceError('Lecturer access required.',403);
 const timetable=body.timetable?await get(body.timetable):null;
 if(!timetable||timetable.kind!=='timetable')throw new AttendanceError('Choose a timetable session.');
 const term=await writableSemester(timetable.semester);
 if(body.semester&&body.semester!==term.id)throw new AttendanceError('Select the timetable’s active semester.');
 const config=env as unknown as Record<string,unknown>;
 const lat=config.LECTURE_HALL_LATITUDE,lon=config.LECTURE_HALL_LONGITUDE;
 if(lat===undefined||lon===undefined||String(lat).trim()===''||String(lon).trim()==='')throw new AttendanceError('Configure the lecture hall coordinates before starting attendance.');
 const hall=coordinates(Number(lat),Number(lon));
 const id=crypto.randomUUID(),time=Date.now(),expires=time+180000,code=checkpointCode();
 const data={title:timetable.course+' · '+timetable.room,semester:term.id,course:timetable.course,timetable:timetable.id,started:new Date(time).toISOString(),expires:new Date(expires).toISOString(),lateAfter:3,code,closed:false};
 const everyone=await all();
 const students=(await db().prepare("SELECT id FROM users WHERE role='student'").all()).results.filter((s:{id:string})=>enrolled(everyone,s.id,term.id,timetable.course));
 const insert=(recordId:string,kind:string,value:unknown)=>db().prepare('INSERT INTO records(id,kind,data,revision,created) VALUES(?,?,?,1,?)').bind(recordId,kind,JSON.stringify(value),now());
 await db().batch([
  insert(id,'session',data),
  db().prepare('INSERT INTO attendance_sessions(id,lecturer_id,active_code,code_expires_at,is_locked,lecture_hall_latitude,lecture_hall_longitude) VALUES(?,?,?,?,0,?,?)').bind(id,user.id,code,expires,hall.latitude,hall.longitude),
  ...students.map((s:{id:string})=>insert(`${id}:${s.id}`,'attendance',{semester:term.id,session:id,student:s.id,status:'Absent',time:'',reason:'Checkpoint not verified'})),
 ]);
 return {ok:true,id,code,expiresAt:expires};
}
export async function lockCheckpoint(user:{id:string;role:string},id:string) {
 const session=await db().prepare('SELECT lecturer_id FROM attendance_sessions WHERE id=?').bind(id).first();
 if(user.role!=='admin'||session?.lecturer_id!==user.id)throw new AttendanceError('Only the lecturer who opened this checkpoint can lock it.',403);
 const record=await get(id);await writableSemester(record?.semester);
 await getDb().update(attendanceSessions).set({isLocked:true}).where(eq(attendanceSessions.id,id));
 await db().prepare("UPDATE records SET data=json_set(data,'$.closed',json('true')),revision=revision+1 WHERE id=?").bind(id).run();
 return {ok:true};
}
export async function submitCheckpoint(user:{id:string;role:string},body:{code?:unknown;sessionId?:unknown;latitude?:unknown;longitude?:unknown;accuracy?:unknown}) {
 if(user.role!=='student')throw new AttendanceError('Student access required.',403);
 await limit('attendance:'+user.id,15,180000);
 const point=coordinates(body.latitude,body.longitude);
 if(typeof body.accuracy!=='number'||!Number.isFinite(body.accuracy)||body.accuracy<0||body.accuracy>50)throw new AttendanceError('Location is not accurate enough. Enable precise location and try again.',403);
 if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))throw new AttendanceError('Enter the six-digit checkpoint code.');
 const matches=(await db().prepare('SELECT * FROM attendance_sessions WHERE active_code=? AND is_locked=0 AND code_expires_at>?').bind(body.code,Date.now()).all()).results;
 const everything=await all();
 const candidates=matches.filter((s:{id:string})=>{
  const record=everything.find((r:{id:string})=>r.id===s.id);
  return (!body.sessionId||body.sessionId===s.id)&&record&&enrolled(everything,user.id,record.semester,record.course);
 });
 if(candidates.length!==1)throw new AttendanceError('That code is invalid, ambiguous, or the checkpoint has closed.',403);
 const session=candidates[0],record=await get(session.id);await writableSemester(record.semester);
 const distance=distanceMeters(point,{latitude:session.lecture_hall_latitude,longitude:session.lecture_hall_longitude});
 if(distance>ATTENDANCE_RADIUS_METERS)throw new AttendanceError('You must be within 50 meters of the lecture hall to check in.',403);
 const id=`${session.id}:${user.id}`,time=Date.now();
 // Recheck code, lock, expiry, enrollment and semester in the same write. A
 // concurrent lock/expiry or duplicate submission cannot create attendance.
 const result=await db().prepare(`UPDATE records SET data=json_set(data,'$.status','Present','$.time',?,'$.reason','Geofenced checkpoint verified'),revision=revision+1
 WHERE id=? AND kind='attendance' AND json_extract(data,'$.status')='Absent'
 AND EXISTS(SELECT 1 FROM attendance_sessions WHERE id=? AND active_code=? AND is_locked=0 AND code_expires_at>?)
 AND EXISTS(SELECT 1 FROM records WHERE kind='enrollment' AND json_extract(data,'$.student')=? AND json_extract(data,'$.semester')=? AND json_extract(data,'$.course')=?)
 AND EXISTS(SELECT 1 FROM records WHERE id=? AND kind='semester' AND coalesce(json_extract(data,'$.archived'),0)=0)`)
 .bind(new Date(time).toISOString(),id,session.id,body.code,time,user.id,record.semester,record.course,record.semester).run();
 if(!result.meta.changes)throw new AttendanceError('Attendance is already recorded or this checkpoint is no longer available.',409);
 return {ok:true,status:'Present'};
}
