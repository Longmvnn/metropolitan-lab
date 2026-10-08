import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {env} from './auth-worker.mjs';
import {requestContext} from './auth-headers.mjs';
import {mail} from './auth-mail.mjs';
import {POST} from '../app/api/auth/route.ts';
import {POST as markNotificationsRead} from '../app/api/notifications/read/route.ts';
import {GET as getLab,POST as updateLab} from '../app/api/lab/route.ts';
import {POST as logout} from '../app/api/auth/logout/route.ts';
import {actor} from '../lib/lab.ts';
import {hashPassword,verifyPassword,namesMatch,digest} from '../lib/auth-crypto.ts';
let sqlite;
let batchQueue=Promise.resolve();
function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes}};}};}
beforeEach(()=>{sqlite?.close();sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const path of readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+path,'utf8'));env.DB={prepare:statement,batch(ops){const task=batchQueue.then(async()=>{sqlite.exec('BEGIN');try{const result=[];for(const op of ops)result.push(await op.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}});batchQueue=task.catch(()=>{});return task;}};mail.length=0;});
function record(id,kind,data){sqlite.prepare('INSERT INTO records VALUES(?,?,?,1,?)').run(id,kind,JSON.stringify(data),new Date().toISOString());}
function roster(preloaded=true,linked=false){record('roster:123/T.2022','roster',{registration:'123/T.2022',name:'DOE, JANE MARY',courses:['UP 406'],...(linked?{student:'student-1'}:{})});if(preloaded){sqlite.prepare("INSERT INTO users(id,email,name,role) VALUES('student-1','placeholder@sites.test','JANE MARY DOE','student')").run();record('profile:student-1','profile',{owner:'student-1',registration:'123/T.2022',courses:['UP 406'],emailVerified:false});record('old-mark','mark',{student:'student-1',score:87});record('old-group','group',{members:['student-1']});record('enrollment:old','enrollment',{student:'student-1',semester:'semester:initial',course:'UP 406'});}}
const details={firstName:'Jane',middleName:'Mary',lastName:'Doe',registration:'123/t.2022',email:'jane@gmail.com'};
async function call(body,jar={},origin='http://localhost'){return requestContext.run(jar,async()=>{const response=await POST(new Request('http://localhost/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));for(const c of response.headers.getSetCookie()){const [name,value]=c.split(';')[0].split('=');jar[name]=value;}return {response,body:await response.json(),jar};});}
async function register(jar={}){const r=await call({action:'register',...details},jar);assert.equal(r.response.status,200,JSON.stringify(r.body));return {jar,code:mail.at(-1).text.match(/\b\d{6}\b/)[0]};}
async function verify(jar,code){const r=await call({action:'verify',code},jar);return r.body.step==='password'?call({action:'setPassword',password:'student-test-password',confirmPassword:'student-test-password'},jar):r;}
test('claims preloaded linked roster without changing ID, marks, group or courses',async()=>{roster(true,true);const {jar,code}=await register();assert.equal(sqlite.prepare('SELECT verified_at FROM users').get().verified_at,null);const r=await verify(jar,code);assert.equal(r.response.status,200,JSON.stringify(r.body));assert.equal(r.body.redirect,'/?portal=student');assert.match(r.response.headers.get('set-cookie'),/HttpOnly/);const u=await requestContext.run(jar,()=>actor());assert.equal(u.id,'student-1');assert.equal(u.email,'jane@gmail.com');assert.equal(sqlite.prepare('SELECT count(*) n FROM users').get().n,1);assert.equal(JSON.parse(sqlite.prepare("SELECT data FROM records WHERE id='old-mark'").get().data).score,87);assert.deepEqual(JSON.parse(sqlite.prepare("SELECT data FROM records WHERE id='old-group'").get().data).members,['student-1']);assert.equal(sqlite.prepare("SELECT count(*) n FROM records WHERE kind='enrollment'").get().n,1);assert.equal((await verify(jar,code)).response.status,400);});
test('fresh roster claims create a verified profile',async()=>{roster(false);const {jar,code}=await register();assert.equal((await verify(jar,code)).response.status,200);const u=await requestContext.run(jar,()=>actor());assert.ok(u.verified_at);assert.equal(JSON.parse(sqlite.prepare('SELECT data FROM records WHERE id=?').get('profile:'+u.id).data).emailVerified,true);});
test('verified student logs in with a password without another OTP',async()=>{roster();const first=await register();await verify(first.jar,first.code);const sent=mail.length;const jar={};const result=await call({action:'studentLogin',email:'JANE@gmail.com',password:'student-test-password'},jar);assert.equal(result.body.redirect,'/?portal=student');assert.equal(mail.length,sent);assert.equal((await requestContext.run(jar,()=>actor())).id,'student-1');assert.equal((await call({action:'studentLogin',email:details.email,password:'wrong'})).response.status,400);});
test('unclaimed login requests matching details; pending registration resumes verification',async()=>{roster();assert.equal((await call({action:'studentLogin',email:details.email})).body.step,'register');await register();sqlite.exec('DELETE FROM auth_limits');assert.equal((await call({action:'studentCode',email:details.email})).body.step,'verify');});
test('wrong names and Gmail already owned by another student cannot claim roster',async()=>{roster();assert.equal((await call({action:'register',...details,middleName:'Other'})).response.status,400);assert.equal((await call({action:'register',...details,middleName:''})).response.status,400);sqlite.prepare("INSERT INTO users(id,email,name,role) VALUES('other','jane@gmail.com','Other','student')").run();assert.equal((await call({action:'register',...details})).response.status,400);assert.equal(mail.length,0);});
test('wrong OTP locks after five attempts, expiration and replay are rejected',async()=>{roster();const {jar,code}=await register();const wrong=code==='000000'?'111111':'000000';for(let i=0;i<5;i++)assert.equal((await verify(jar,wrong)).response.status,400);assert.equal((await verify(jar,code)).response.status,400);assert.equal(sqlite.prepare('SELECT verified_at FROM users').get().verified_at,null);sqlite.exec('UPDATE auth_challenges SET attempts=0,expires=0');assert.equal((await verify(jar,code)).response.status,400);});
test('two pending claims cannot overwrite the first verified account',async()=>{roster();const one=await register();const twoJar={};const two=await call({action:'register',...details,email:'other@gmail.com'},twoJar);assert.equal(two.response.status,200);const code2=mail.at(-1).text.match(/\b\d{6}\b/)[0];assert.equal((await verify(one.jar,one.code)).response.status,200);assert.equal((await verify(twoJar,code2)).response.status,400);assert.equal(sqlite.prepare('SELECT email FROM users').get().email,'jane@gmail.com');assert.equal(sqlite.prepare('SELECT count(*) n FROM auth_claims').get().n,1);});
test('lecturer password login bypasses onboarding and does not send OTP',async()=>{const hashed=await hashPassword('a-long-test-password');sqlite.prepare("INSERT INTO users(id,email,name,role,password_hash) VALUES('teacher','teacher@gmail.com','Teacher','admin',?)").run(hashed);assert.equal((await call({action:'lecturerLogin',email:'teacher@gmail.com',password:'wrong-password'})).response.status,400);const jar={};const result=await call({action:'lecturerLogin',email:'teacher@gmail.com',password:'a-long-test-password'},jar);assert.equal(result.body.redirect,'/?portal=lecturer');assert.equal((await requestContext.run(jar,()=>actor())).role,'admin');assert.equal(mail.length,0);assert.equal(await verifyPassword('a-long-test-password',hashed),true);assert.equal(await verifyPassword('a-wrong-password',hashed),false);});
test('session expiry and logout revoke access; preview identity does not grant access',async()=>{roster();const {jar,code}=await register();await verify(jar,code);await requestContext.run(jar,()=>logout(new Request('http://localhost/api/auth/logout',{method:'POST',headers:{Origin:'http://localhost'}})));await assert.rejects(()=>requestContext.run(jar,()=>actor()),/Sign in/);await assert.rejects(()=>requestContext.run({},()=>actor()),/Sign in/);});
test('cross-origin auth and repeated code sends are rejected',async()=>{roster();assert.equal((await call({action:'register',...details},{},'https://evil.test')).response.status,400);const {jar}=await register();assert.equal((await call({action:'resend'},jar)).response.status,400);assert.equal(mail.length,1);});
test('name matching respects order, punctuation and complete name tokens',()=>{assert.ok(namesMatch('Dóe, Jane Mary',['Jane','Mary','Doe']));assert.equal(namesMatch('DOE, JANE MARY',['Jane','','Doe']),false);});

test('expired sessions are rejected and email uniqueness ignores case',async()=>{roster();const {jar,code}=await register();await verify(jar,code);sqlite.exec('UPDATE auth_sessions SET expires=0');await assert.rejects(()=>requestContext.run(jar,()=>actor()),/Sign in/);assert.throws(()=>sqlite.prepare("INSERT INTO users(id,email,name,role) VALUES('duplicate','JANE@gmail.com','Duplicate','student')").run(),/UNIQUE/);});
test('atomic registration claim constraint rolls back a competing mutation',async()=>{roster();const {jar,code}=await register();await verify(jar,code);await assert.rejects(()=>env.DB.batch([statement("UPDATE users SET email='attacker@gmail.com' WHERE id='student-1'"),statement("INSERT INTO auth_claims VALUES('123/T.2022','student-1')")]),/UNIQUE/);assert.equal(sqlite.prepare("SELECT email FROM users WHERE id='student-1'").get().email,'jane@gmail.com');});
test('legacy verified students migrate as claimed while unclaimed profiles remain claimable',()=>{const legacy=new DatabaseSync(':memory:');try{for(const file of readdirSync('drizzle').filter(p=>/^000[01].*\.sql$/.test(p)).sort())legacy.exec(readFileSync('drizzle/'+file,'utf8'));legacy.exec("INSERT INTO users VALUES('verified','verified@gmail.com','Jane Doe','student','old-identity'); INSERT INTO users VALUES('unclaimed','placeholder@sites.test','Other Student','student',NULL);");legacy.prepare('INSERT INTO records VALUES(?,?,?,1,?)').run('profile:verified','profile',JSON.stringify({registration:'123/T.2022',emailVerified:true,verifiedAt:'2026-01-01'}),'2026-01-01');for(const file of readdirSync('drizzle').filter(p=>/^000[23].*\.sql$/.test(p)).sort())legacy.exec(readFileSync('drizzle/'+file,'utf8'));assert.equal(legacy.prepare("SELECT verified_at FROM users WHERE id='verified'").get().verified_at,'2026-01-01');assert.equal(legacy.prepare("SELECT verified_at FROM users WHERE id='unclaimed'").get().verified_at,null);assert.equal(legacy.prepare('SELECT user_id FROM auth_claims').get().user_id,'verified');}finally{legacy.close();}});

test('password creation requires verified Gmail and confirmation before a session is issued',async()=>{roster();const {jar,code}=await register();assert.equal((await call({action:'setPassword',password:'student-test-password',confirmPassword:'student-test-password'},jar)).response.status,400);const verified=await call({action:'verify',code},jar);assert.equal(verified.body.step,'password');await assert.rejects(()=>requestContext.run(jar,()=>actor()),/Sign in/);assert.equal((await call({action:'setPassword',password:'student-test-password',confirmPassword:'different'},jar)).response.status,400);const result=await call({action:'setPassword',password:'student-test-password',confirmPassword:'student-test-password'},jar);assert.equal(result.body.redirect,'/?portal=student');assert.equal((await call({action:'setPassword',password:'student-test-password',confirmPassword:'student-test-password'},jar)).response.status,400);});
test('password reset verifies email, revokes old sessions and accepts only the new password',async()=>{roster();const original=await register();await verify(original.jar,original.code);sqlite.exec('DELETE FROM auth_limits');const jar={};assert.equal((await call({action:'studentCode',email:details.email},jar)).body.step,'verify');const code=mail.at(-1).text.match(/\b\d{6}\b/)[0];assert.equal((await call({action:'verify',code},jar)).body.step,'password');assert.equal((await call({action:'setPassword',password:'new-student-password',confirmPassword:'new-student-password'},jar)).body.redirect,'/?portal=student');await assert.rejects(()=>requestContext.run(original.jar,()=>actor()),/Sign in/);assert.equal((await call({action:'studentLogin',email:details.email,password:'student-test-password'})).response.status,400);assert.equal((await call({action:'studentLogin',email:details.email,password:'new-student-password'})).response.status,200);});
test('existing verified students without passwords are offered email-verified setup',async()=>{roster();const original=await register();await verify(original.jar,original.code);sqlite.exec('UPDATE users SET password_hash=NULL');assert.equal((await call({action:'studentLogin',email:details.email})).body.step,'reset');});

test('notification reads persist per user and edited notifications become unread again',async()=>{roster();const {jar,code}=await register();await verify(jar,code);record('notice','notification',{semester:'semester:initial',course:'UP 406',title:'Class update'});record('private-notice','notification',{semester:'semester:initial',course:'UP 406',student:'someone-else',title:'Private'});const request=()=>new Request('http://localhost/api/notifications/read',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({expectUser:'student-1',notifications:[{id:'notice',revision:1},{id:'private-notice',revision:1}]})});const r=await requestContext.run(jar,()=>markNotificationsRead(request()));assert.equal(r.status,200);assert.equal(sqlite.prepare('SELECT count(*) n FROM notification_reads').get().n,1);let data=await requestContext.run(jar,async()=>await (await getLab(new Request('http://localhost/api/lab'))).json());assert.equal(data.records.find(r=>r.id==='notice').read,true);sqlite.prepare("UPDATE records SET revision=2 WHERE id='notice'").run();data=await requestContext.run(jar,async()=>await (await getLab(new Request('http://localhost/api/lab'))).json());assert.equal(data.records.find(r=>r.id==='notice').read,false);await requestContext.run(jar,()=>markNotificationsRead(request()));assert.equal(sqlite.prepare('SELECT read_revision FROM notification_reads').get().read_revision,1);const passwordHash=await hashPassword('teacher-test-password');sqlite.prepare("INSERT INTO users(id,email,name,role,password_hash) VALUES('teacher','teacher@gmail.com','Teacher','admin',?)").run(passwordHash);const lecturerJar={};await call({action:'lecturerLogin',email:'teacher@gmail.com',password:'teacher-test-password'},lecturerJar);data=await requestContext.run(lecturerJar,async()=>await (await getLab(new Request('http://localhost/api/lab'))).json());assert.equal(data.records.find(r=>r.id==='notice').read,false);});

test('assessment scheme saves per-course weights and rejects incomplete or stale confirmation',async()=>{const hash=await hashPassword('teacher-test-password');sqlite.prepare("INSERT INTO users(id,email,name,role,password_hash) VALUES('teacher','teacher@gmail.com','Teacher','admin',?)").run(hash);const jar={};await call({action:'lecturerLogin',email:'teacher@gmail.com',password:'teacher-test-password'},jar);await requestContext.run(jar,()=>actor());record('scheme-quiz','assessment',{semester:'semester:initial',course:'UP 406',title:'Quiz',published:true,weight:'',max:20,type:'Online quiz'});record('scheme-project','assessment',{semester:'semester:initial',course:'UP 406',title:'Project',published:true,weight:'',max:100,type:'Assignment'});const settings=sqlite.prepare("SELECT revision FROM records WHERE kind='settings'").get();const send=weights=>requestContext.run(jar,()=>updateLab(new Request('http://localhost/api/lab',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({action:'assessmentScheme',semester:'semester:initial',course:'UP 406',settingsRevision:settings.revision,approved:true,policy:'Approved course outline',weights})})));assert.equal((await send([{id:'scheme-quiz',revision:1,weight:10},{id:'scheme-project',revision:1,weight:10}])).status,400);assert.equal((await send([{id:'scheme-quiz',revision:1,weight:10},{id:'scheme-project',revision:1,weight:20}])).status,200);const saved=JSON.parse(sqlite.prepare("SELECT data FROM records WHERE kind='settings'").get().data);assert.equal(saved.schemes['UP 406'].approved,true);assert.equal(saved.schemes['UP 417'],undefined);assert.equal(JSON.parse(sqlite.prepare("SELECT data FROM records WHERE id='scheme-project'").get().data).weight,20);assert.equal((await send([{id:'scheme-quiz',revision:1,weight:10},{id:'scheme-project',revision:1,weight:20}])).status,400);});
test('assessment approval is hidden for incomplete weights or a changed scheme',async()=>{const {schemeFor,schemeSignature}=await import('../lib/assessment-scheme.ts');assert.equal(schemeFor({approved:true},'UP 406',[{id:'quiz',weight:10}]).approved,false);const assessments=[{id:'quiz',weight:30}],settings={schemes:{'UP 406':{approved:true,signature:schemeSignature(assessments)}}};assert.equal(schemeFor(settings,'UP 406',assessments).approved,true);assert.equal(schemeFor(settings,'UP 406',[{id:'different-quiz',weight:30}]).approved,false);});

test('theory and studio require their separate coursework allocations',async()=>{const {courseworkMaximum,validateScheme,schemeFor}=await import('../lib/assessment-scheme.ts');assert.equal(courseworkMaximum('UP 406'),30);assert.equal(courseworkMaximum('UP 417'),60);const assessments=[{id:'one',revision:1,weight:30},{id:'two',revision:1,weight:30}];assert.equal(validateScheme(assessments,assessments,true,'UP 417').size,2);assert.throws(()=>validateScheme(assessments,assessments,true,'UP 406'),/total 30/);assert.equal(schemeFor({approved:true},'UP 417',assessments).approved,true);assert.equal(schemeFor({approved:true},'UP 406',assessments).approved,false);});

test('invited lecturers register only after email verification and password confirmation',async()=>{
 const jar={},token=await invitation('newteacher@gmail.com');
 const start=await call({action:'lecturerRegister',firstName:'New Lecturer',email:'newteacher@gmail.com',token},jar);
 assert.equal(start.body.step,'verify');
 assert.equal(sqlite.prepare('SELECT count(*) n FROM users').get().n,0);
 assert.equal((await call({action:'setPassword',password:'lecturer-password',confirmPassword:'lecturer-password'},jar)).response.status,400);
 const code=mail.at(-1).text.match(/\b\d{6}\b/)[0];
 assert.equal((await call({action:'verify',code:'invalid'},jar)).response.status,400);
 assert.equal((await call({action:'verify',code},jar)).body.step,'password');
 await assert.rejects(()=>requestContext.run(jar,()=>actor()),/Sign in/);
 assert.equal((await call({action:'setPassword',password:'lecturer-password',confirmPassword:'different'},jar)).response.status,400);
 const result=await call({action:'setPassword',password:'lecturer-password',confirmPassword:'lecturer-password'},jar);
 assert.equal(result.body.redirect,'/?portal=lecturer');
 assert.equal((await requestContext.run(jar,()=>actor())).role,'admin');
 assert.equal((await call({action:'setPassword',password:'lecturer-password',confirmPassword:'lecturer-password'},jar)).response.status,400);
 assert.equal((await call({action:'lecturerLogin',email:'newteacher@gmail.com',password:'lecturer-password'})).body.redirect,'/?portal=lecturer');
});

test('lecturer sign-up rejects existing accounts and rechecks email ownership at password creation',async()=>{
 sqlite.prepare("INSERT INTO users(id,email,name,role) VALUES('student','student@gmail.com','Student','student')").run();
 assert.equal((await call({action:'lecturerRegister',firstName:'Teacher',email:'STUDENT@gmail.com'})).response.status,400);
 assert.equal(sqlite.prepare("SELECT role FROM users WHERE id='student'").get().role,'student');
 const jar={},token=await invitation('teacher@gmail.com');
 await call({action:'lecturerRegister',firstName:'Teacher',email:'teacher@gmail.com',token},jar);
 const code=mail.at(-1).text.match(/\b\d{6}\b/)[0];
 await call({action:'verify',code},jar);
 sqlite.prepare("INSERT INTO users(id,email,name,role) VALUES('other','teacher@gmail.com','Other','student')").run();
 assert.equal((await call({action:'setPassword',password:'lecturer-password',confirmPassword:'lecturer-password'},jar)).response.status,400);
 assert.equal(sqlite.prepare("SELECT role FROM users WHERE id='other'").get().role,'student');
 await assert.rejects(()=>requestContext.run(jar,()=>actor()),/Sign in/);
});

async function invitation(email,expires=Date.now()+86400000) {
 const token=crypto.randomUUID().replaceAll('-','').repeat(2);
 sqlite.prepare('INSERT INTO lecturer_invitations VALUES(?,?,?,?,0)').run(crypto.randomUUID(),email,await digest(token),expires);
 return token;
}
test('public, mismatched, expired and used lecturer invitations are rejected',async()=>{
 const token=await invitation('teacher@gmail.com');
 const body={action:'lecturerRegister',firstName:'Teacher',email:'teacher@gmail.com'};
 for(const input of [body,{...body,token:'fake'},{...body,token,email:'other@gmail.com'}])assert.equal((await call(input)).response.status,400);
 sqlite.exec('UPDATE lecturer_invitations SET expires_at=0');assert.equal((await call({...body,token})).response.status,400);
 sqlite.prepare('UPDATE lecturer_invitations SET expires_at=?,is_used=1').run(Date.now()+100000);assert.equal((await call({...body,token})).response.status,400);
 assert.equal(mail.length,0);
});
test('invitation atomic consumption prevents replay and rolls back on email conflict',async()=>{
 const {registerInvitedLecturer}=await import('../lib/invitations.ts');
 const token=await invitation('teacher@gmail.com'),hash=await digest(token);
 const outcomes=await Promise.allSettled([registerInvitedLecturer('teacher@gmail.com','Teacher','hash',hash),registerInvitedLecturer('teacher@gmail.com','Teacher','hash',hash)]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(sqlite.prepare('SELECT is_used FROM lecturer_invitations').get().is_used,1);
 const other=await invitation('existing@gmail.com'),otherHash=await digest(other);sqlite.prepare("INSERT INTO users(id,email,name,role) VALUES('existing','existing@gmail.com','Existing','student')").run();
 await assert.rejects(()=>registerInvitedLecturer('existing@gmail.com','Teacher','hash',otherHash),/./);
 assert.equal(sqlite.prepare("SELECT is_used FROM lecturer_invitations WHERE email='existing@gmail.com'").get().is_used,0);
});
test('invitation revoked after OTP verification cannot create lecturer',async()=>{
 const token=await invitation('teacher@gmail.com'),jar={};
 await call({action:'lecturerRegister',firstName:'Teacher',email:'teacher@gmail.com',token},jar);
 await call({action:'verify',code:mail.at(-1).text.match(/\b\d{6}\b/)[0]},jar);
 sqlite.exec('UPDATE lecturer_invitations SET expires_at=0');
 assert.equal((await call({action:'setPassword',password:'lecturer-password',confirmPassword:'lecturer-password'},jar)).response.status,400);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM users').get().n,0);
});
test('Haversine boundary, coordinate ranges, and random six-digit codes',async()=>{
 const {coordinates,distanceMeters,checkpointCode}=await import('../lib/geofence.ts');
 const hall={latitude:0,longitude:0};
 assert.equal(distanceMeters(hall,hall),0);
 assert.ok(distanceMeters(hall,{latitude:49/6371000*180/Math.PI,longitude:0})<50);
 assert.ok(distanceMeters(hall,{latitude:51/6371000*180/Math.PI,longitude:0})>50);
 for(const [lat,lon] of [[NaN,0],[91,0],[0,181],['0',0],[null,0]])assert.throws(()=>coordinates(lat,lon));
 for(let i=0;i<100;i++)assert.match(checkpointCode(),/^\d{6}$/);
});
async function attendanceFixture(){
 const {startCheckpoint}=await import('../lib/attendance.ts');
 roster();await requestContext.run({},async()=>{const {ensureAcademic}=await import('../lib/academic.ts');await ensureAcademic();});
 sqlite.prepare("INSERT INTO users(id,email,name,role) VALUES('teacher','teacher@gmail.com','Teacher','admin')").run();
 record('class','timetable',{semester:'semester:initial',course:'UP 406',room:'Hall'});
 env.LECTURE_HALL_LATITUDE='-6.773';env.LECTURE_HALL_LONGITUDE='39.208';
 const teacher={id:'teacher',role:'admin'},student={id:'student-1',role:'student'};
 const checkpoint=await startCheckpoint(teacher,{timetable:'class'});
 return {teacher,student,checkpoint,body:{sessionId:checkpoint.id,code:checkpoint.code,latitude:-6.773,longitude:39.208,accuracy:10}};
}
test('checkpoint denies remote, poor/missing location, wrong codes, replay; stores no coordinates',async()=>{
 const {submitCheckpoint}=await import('../lib/attendance.ts');const {student,checkpoint,body}=await attendanceFixture();
 for(const bad of [{...body,latitude:-6.78},{...body,accuracy:80},{code:body.code},{...body,code:'bad'}])await assert.rejects(()=>submitCheckpoint(student,bad));
 assert.equal((await submitCheckpoint(student,body)).status,'Present');
 await assert.rejects(()=>submitCheckpoint(student,body));
 const saved=JSON.parse(sqlite.prepare('SELECT data FROM records WHERE id=?').get(checkpoint.id+':student-1').data);
 assert.equal(saved.status,'Present');assert.equal(saved.latitude,undefined);
});
test('locked, expired, unenrolled and archived checkpoints reject check-ins',async()=>{
 const {submitCheckpoint,lockCheckpoint}=await import('../lib/attendance.ts');const {teacher,student,checkpoint,body}=await attendanceFixture();
 await assert.rejects(()=>lockCheckpoint({id:'other',role:'admin'},checkpoint.id));
 sqlite.prepare('UPDATE attendance_sessions SET code_expires_at=0').run();await assert.rejects(()=>submitCheckpoint(student,body));
 sqlite.prepare('UPDATE attendance_sessions SET code_expires_at=?').run(Date.now()+100000);
 await lockCheckpoint(teacher,checkpoint.id);await assert.rejects(()=>submitCheckpoint(student,body));
 sqlite.exec('UPDATE attendance_sessions SET is_locked=0');
 sqlite.exec("UPDATE records SET data=json_set(data,'$.archived',json('true')) WHERE id='semester:initial'");await assert.rejects(()=>submitCheckpoint(student,body));
 sqlite.exec("UPDATE records SET data=json_set(data,'$.archived',json('false')) WHERE id='semester:initial';DELETE FROM records WHERE kind='enrollment'");await assert.rejects(()=>submitCheckpoint(student,body));
});
test('each checkpoint needs a fresh check-in and missing hall configuration fails closed',async()=>{
 const {startCheckpoint,submitCheckpoint}=await import('../lib/attendance.ts');const {teacher,student,body}=await attendanceFixture();
 await submitCheckpoint(student,body);
 const second=await startCheckpoint(teacher,{timetable:'class'});
 assert.equal(JSON.parse(sqlite.prepare('SELECT data FROM records WHERE id=?').get(second.id+':student-1').data).status,'Absent');
 await assert.rejects(()=>startCheckpoint(student,{timetable:'class'}));
 delete env.LECTURE_HALL_LATITUDE;await assert.rejects(()=>startCheckpoint(teacher,{timetable:'class'}));
});

test('admin invitation endpoint sends a link with only its digest in storage',async()=>{
 const {POST:invite}=await import('../app/api/admin/lecturer-invitations/route.ts');
 const {createSession}=await import('../lib/auth.ts');
 const request=()=>new Request('http://localhost/api/admin/lecturer-invitations',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email:'invitee@gmail.com'})});
 assert.equal((await requestContext.run({},()=>invite(request()))).status,403);
 sqlite.prepare("INSERT INTO users(id,email,name,role) VALUES('admin','admin@gmail.com','Admin','admin')").run();
 const jar={archplaza_session:await createSession('admin')};
 assert.equal((await requestContext.run(jar,()=>invite(request()))).status,200);
 const token=mail.at(-1).text.match(/token=([a-f0-9]{64})/)[1];
 assert.equal(sqlite.prepare('SELECT token FROM lecturer_invitations').get().token,await digest(token));
 assert.equal((await requestContext.run(jar,()=>invite(request()))).status,200);
 assert.notEqual(sqlite.prepare('SELECT token FROM lecturer_invitations').get().token,await digest(token));
});
test('new and legacy submission routes both return 403 for remote coordinates',async()=>{
 const {POST:submit}=await import('../app/api/attendance/submit/route.ts');
 const {createSession}=await import('../lib/auth.ts');
 const {body}=await attendanceFixture(),jar={archplaza_session:await createSession('student-1')};
 const request=()=>new Request('http://localhost/api/attendance/submit',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({...body,latitude:-6.8,action:'checkin'})});
 for(const route of [submit,updateLab])assert.equal((await requestContext.run(jar,()=>route(request()))).status,403);
 const getResponse=await requestContext.run(jar,()=>getLab(new Request('http://localhost/api/lab?portal=student')));
 const data=await getResponse.json();assert.equal(data.records.find(r=>r.kind==='session').code,undefined);
});
