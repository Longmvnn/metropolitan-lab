import {db,get,all,now,uid} from './lab';
import {activeSemester,ensureAcademic} from './academic';
import {namesMatch,normalizeRegistration,normalizeEmail,isGmail} from './auth-crypto';

export async function registrationDetails(input:any) {
 const clean=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ');
 const firstName=clean(input.firstName),middleName=clean(input.middleName),lastName=clean(input.lastName);
 if(!firstName||!lastName||[firstName,middleName,lastName].some(s=>s.length>60))throw new Error('Enter your first, middle (if any), and last names as listed on the class list.');
 const registration=normalizeRegistration(input.registration),email=normalizeEmail(input.email);
 if(!registration||registration.length>60)throw new Error('Enter your registration number.');
 if(!isGmail(email)||email.length>254)throw new Error('Enter a valid Gmail address.');
 const roster=await get('roster:'+registration);
 if(!roster||roster.kind!=='roster')throw new Error('That registration number is not on the class list. Check it with your lecturer.');
 if(!namesMatch(roster.name||'',[firstName,middleName,lastName]))throw new Error('Your names do not match this registration number on the class list.');
 const existing=await claimTarget(roster);
 if(await db().prepare('SELECT id FROM users WHERE lower(email)=? AND id!=?').bind(email,existing?.id||'').first())throw new Error('That Gmail belongs to another account. Use Log in for that account.');
 return {firstName,middleName,lastName,name:[firstName,middleName,lastName].filter(Boolean).join(' '),registration,email};
}
async function claimTarget(roster:any) {
 if(await db().prepare('SELECT user_id FROM auth_claims WHERE registration=?').bind(normalizeRegistration(roster.registration)).first())throw new Error('This student account is already active. Use Log in with your verified Gmail.');
 const profiles=(await all('profile')).filter((p:any)=>normalizeRegistration(p.registration)===normalizeRegistration(roster.registration));
 const ids=[...new Set([...profiles.map((p:any)=>p.owner),...(roster.student?[roster.student]:[])])];
 const candidates=[];
 for(const id of ids){const u=await db().prepare('SELECT id,role,identity,verified_at FROM users WHERE id=?').bind(id).first();if(u)candidates.push(u);}
 if(candidates.length>1)throw new Error('This registration number has duplicate profiles. Ask your lecturer to correct the class list.');
 const existing=candidates[0];
 if(existing&&(existing.role!=='student'||existing.verified_at))throw new Error('This student account is already active. Use Log in with your verified Gmail.');
 return existing||null;
}
export async function activateStudent(input:any) {
 // Revalidate at redemption, since the roster or another claim may have changed since code issuance.
 const p=await registrationDetails(input),roster=await get('roster:'+p.registration),existing=await claimTarget(roster);
 await ensureAcademic();
 const studentId=existing?.id||uid(),old=existing?await get('profile:'+studentId):null;
 const semester=await activeSemester(),enrollments=(await all('enrollment')).filter((e:any)=>e.student===studentId);
 const courses=old?.courses?.length?old.courses:roster.courses?.length?roster.courses:(await all('course')).map((c:any)=>c.code);
 const profile={...(old||{}),owner:studentId,registration:p.registration,email:p.email,emailVerified:true,verifiedAt:now(),status:'active',firstName:p.firstName,middleName:p.middleName,lastName:p.lastName,courses,programme:old?.programme||roster.programme||''};
 for(const key of ['id','kind','revision','created','data'])delete profile[key];
 const rosterData={...roster,student:studentId,email:p.email,enteredName:p.name,status:'Linked',linked:now()};
 for(const key of ['id','kind','revision','created','data'])delete rosterData[key];
 await db().batch([
  existing?db().prepare('UPDATE users SET email=?,name=?,verified_at=? WHERE id=?').bind(p.email,p.name,now(),studentId):db().prepare("INSERT INTO users(id,email,name,role,verified_at) VALUES(?,?,?,'student',?)").bind(studentId,p.email,p.name,now()),
  // This unique registration claim makes competing verifications roll back as one D1 transaction.
  db().prepare('INSERT INTO auth_claims(registration,user_id) VALUES(?,?)').bind(p.registration,studentId),
  db().prepare('INSERT INTO records(id,kind,data,revision,created) VALUES(?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=records.revision+1').bind('profile:'+studentId,'profile',JSON.stringify(profile),now()),
  db().prepare('UPDATE records SET data=?,revision=revision+1 WHERE id=?').bind(JSON.stringify(rosterData),roster.id),
  // Preserve preloaded enrolments rather than enrolling an existing student in unrelated courses.
  ...(!enrollments.length&&semester?courses.map((course:string)=>db().prepare('INSERT OR IGNORE INTO records(id,kind,data,revision,created) VALUES(?,?,?,1,?)').bind(`enrollment:${semester.id}:${course}:${studentId}`,'enrollment',JSON.stringify({semester:semester.id,course,student:studentId}),now())):[])
 ]);
 return studentId;
}
