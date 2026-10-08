import {requireInvitation,requireInvitationHash,registerInvitedLecturer} from '../../../lib/invitations';
import {cookies} from 'next/headers';
import {db,get} from '../../../lib/lab';
import {assertOrigin,CHALLENGE_COOKIE,SESSION_COOKIE,createSession,setAuthCookie,limit} from '../../../lib/auth';
import {digest,normalizeEmail,isGmail,randomToken,verifyPassword,hashPassword} from '../../../lib/auth-crypto';
import {registrationDetails,activateStudent} from '../../../lib/student-registration';
import {sendMail,emailConfigured} from '../../../lib/email';
const json=(body:any,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function signedIn(req:Request,id:string,role:string) {
 const response=json({ok:true,redirect:'/?portal='+(role==='admin'?'lecturer':'student')});
 setAuthCookie(response,req,SESSION_COOKIE,await createSession(id),7*86400);
 setAuthCookie(response,req,CHALLENGE_COOKIE,'',0);
 return response;
}
async function sendCode(req:Request,email:string,purpose:string,payload:any) {
 if(!emailConfigured())throw new Error('Email verification is temporarily unavailable. Please contact your lecturer.');
 await limit('otp-minute:'+email,1,60000);await limit('otp-day:'+email,10,86400000);
 const token=randomToken(),tokenHash=await digest(token),code=String(100000+crypto.getRandomValues(new Uint32Array(1))[0]%900000);
 await db().prepare('INSERT INTO auth_challenges(token_hash,email,purpose,payload,code_hash,expires) VALUES(?,?,?,?,?,?)').bind(tokenHash,email,purpose,JSON.stringify(payload),await digest(token+code),Date.now()+600000).run();
 try{await sendMail(email,'Your ArchPlaza verification code',`Your ArchPlaza code is ${code}. It expires in 10 minutes. Do not share it. If you did not request this code, ignore this email.`);}catch{await db().prepare('DELETE FROM auth_challenges WHERE token_hash=?').bind(tokenHash).run();throw new Error('We could not send your code. Please try again in a minute.');}
 return setAuthCookie(json({ok:true,step:'verify',email}),req,CHALLENGE_COOKIE,token,600);
}
export async function POST(req:Request){try{
 assertOrigin(req);const b:any=await req.json();
 // The edge supplies this header in production; never trust a client-provided forwarding chain.
 await limit('request:'+(req.headers.get('cf-connecting-ip')||'local'),100,600000);
 if(b.action==='lecturerLogin'){
  const email=normalizeEmail(b.email),password=String(b.password||'');
  if(!isGmail(email)||password.length>128)throw new Error('Incorrect Gmail or password.');
  await limit('password:'+email,10,900000);
  const u=await db().prepare("SELECT id,password_hash FROM users WHERE lower(email)=? AND role='admin'").bind(email).first();
  if(!u?.password_hash||!await verifyPassword(password,u.password_hash))throw new Error('Incorrect Gmail or password. Ask your administrator if your account needs a password.');
  return await signedIn(req,u.id,'admin');
 }
 if(b.action==='lecturerRegister'){
  const email=normalizeEmail(b.email),name=String(b.firstName||'').trim().replace(/\s+/g,' ');
  if(!isGmail(email))throw new Error('Enter your Gmail address.');
  if(name.length<2||name.length>150)throw new Error('Enter your full name (2–150 characters).');
  if(await db().prepare('SELECT id FROM users WHERE lower(email)=?').bind(email).first())throw new Error('An account already uses this Gmail. Log in with your existing account.');
  const invitationHash=await requireInvitation(b.token,email);
  return await sendCode(req,email,'lecturerRegister',{name,invitationHash});
 }
 if(b.action==='register'){const details=await registrationDetails(b);return await sendCode(req,details.email,'register',details);}
 if(b.action==='studentLogin'){
  const email=normalizeEmail(b.email),password=String(b.password||'');
  if(!isGmail(email))throw new Error('Enter your Gmail address.');
  await limit('password:'+email,10,900000);
  const u=await db().prepare("SELECT id,verified_at,password_hash FROM users WHERE lower(email)=? AND role='student'").bind(email).first();
  if(!u?.verified_at)return json({ok:true,step:'register',email,message:'Confirm your names and registration number to claim your class-list record.'});
  if(!u.password_hash)return json({ok:true,step:'reset',email,message:'Use Forgot password to verify your Gmail and choose a password.'});
  if(!await verifyPassword(password,u.password_hash))throw new Error('Incorrect Gmail or password. Use Forgot password if you need to reset it.');
  return await signedIn(req,u.id,'student');
 }
 if(b.action==='studentCode'){
  const email=normalizeEmail(b.email);if(!isGmail(email))throw new Error('Enter your Gmail address.');
  const u=await db().prepare("SELECT id,verified_at FROM users WHERE lower(email)=? AND role='student'").bind(email).first();
  if(u?.verified_at)return await sendCode(req,email,'reset',{userId:u.id});
  const pending=await db().prepare("SELECT payload FROM auth_challenges WHERE email=? AND purpose='register' AND used=0 AND expires>? ORDER BY expires DESC LIMIT 1").bind(email,Date.now()).first();
  if(pending)return await sendCode(req,email,'register',await registrationDetails(JSON.parse(pending.payload)));
  return json({ok:true,step:'register',email,message:'Confirm your names and registration number to claim your class-list record.'});
 }
 const token=(await cookies()).get(CHALLENGE_COOKIE)?.value;
 if(!token)throw new Error('Request a new code to continue.');
 const tokenHash=await digest(token),c=await db().prepare('SELECT * FROM auth_challenges WHERE token_hash=?').bind(tokenHash).first();
 if(!c||c.used)throw new Error('Request a new code to continue.');
 if(b.action==='setPassword'){
  if(!['setPassword','lecturerPassword'].includes(c.purpose)||c.expires<=Date.now())throw new Error('Verify your Gmail again before setting a password.');
  const password=String(b.password||'');
  if(password!==String(b.confirmPassword||''))throw new Error('Passwords do not match.');
  const passwordHash=await hashPassword(password),payload=JSON.parse(c.payload);
  const consumed=await db().prepare('UPDATE auth_challenges SET used=1 WHERE token_hash=? AND used=0 AND expires>? RETURNING token_hash').bind(tokenHash,Date.now()).first();
  if(!consumed)throw new Error('Verify your Gmail again before setting a password.');
  if(c.purpose==='lecturerPassword'){
   const invitationHash=await requireInvitationHash(payload.invitationHash,c.email);
   const id=await registerInvitedLecturer(c.email,payload.name,passwordHash,invitationHash);
   return await signedIn(req,id,'admin');
  }
  const updated=await db().prepare("UPDATE users SET password_hash=? WHERE id=? AND lower(email)=? AND role='student' AND verified_at IS NOT NULL AND password_hash IS ? RETURNING id").bind(passwordHash,payload.userId,c.email,payload.passwordVersion).first();
  if(!updated)throw new Error('Your account changed. Verify your Gmail again.');
  await db().prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(updated.id).run();
  return await signedIn(req,updated.id,'student');
 }
 if(['setPassword','lecturerPassword'].includes(c.purpose))throw new Error('Create your password to continue.');
 if(b.action==='resend')return await sendCode(req,c.email,c.purpose,JSON.parse(c.payload));
 if(b.action!=='verify')throw new Error('Unknown authentication action.');
 const attempt=await db().prepare('UPDATE auth_challenges SET attempts=attempts+1 WHERE token_hash=? AND used=0 AND attempts<5 AND expires>? RETURNING attempts').bind(tokenHash,Date.now()).first();
 if(!attempt)throw new Error('This code expired or reached its attempt limit. Request a new code.');
 if(!/^\d{6}$/.test(String(b.code))||await digest(token+String(b.code))!==c.code_hash)throw new Error('Incorrect code. Check your inbox and try again.');
 const consumed=await db().prepare('UPDATE auth_challenges SET used=1 WHERE token_hash=? AND used=0 RETURNING token_hash').bind(tokenHash).first();
 if(!consumed)throw new Error('This code has already been used. Log in again.');
 const payload=JSON.parse(c.payload);
 if(c.purpose==='lecturerRegister'){
  await requireInvitationHash(payload.invitationHash,c.email);
  if(await db().prepare('SELECT id FROM users WHERE lower(email)=?').bind(c.email).first())throw new Error('An account already uses this Gmail. Log in with your existing account.');
  const grant=randomToken();
  await db().prepare('INSERT INTO auth_challenges(token_hash,email,purpose,payload,code_hash,expires) VALUES(?,?,?,?,?,?)').bind(await digest(grant),c.email,'lecturerPassword',JSON.stringify({name:payload.name,invitationHash:payload.invitationHash}),'',Date.now()+600000).run();
  return setAuthCookie(json({ok:true,step:'password',email:c.email}),req,CHALLENGE_COOKIE,grant,600);
 }
 let userId:string;
 if(c.purpose==='register')userId=await activateStudent(payload);
 else {
  const u=await db().prepare("SELECT id FROM users WHERE id=? AND lower(email)=? AND role='student' AND verified_at IS NOT NULL").bind(payload.userId,c.email).first();
  const profile=u?await get('profile:'+u.id):null;
  if(!u||!profile?.emailVerified)throw new Error('Your account details changed. Please contact your lecturer.');
  userId=u.id;
 }
 const account=await db().prepare('SELECT password_hash FROM users WHERE id=?').bind(userId).first();
 const grant=randomToken();
 await db().prepare('INSERT INTO auth_challenges(token_hash,email,purpose,payload,code_hash,expires) VALUES(?,?,?,?,?,?)').bind(await digest(grant),c.email,'setPassword',JSON.stringify({userId,passwordVersion:account.password_hash}),'',Date.now()+600000).run();
 return setAuthCookie(json({ok:true,step:'password',email:c.email}),req,CHALLENGE_COOKIE,grant,600);
}catch(e:any){const message=String(e.message||'Unable to sign in.');return json({error:/constraint|SQLITE|D1_ERROR/i.test(message)?'This account was just claimed or its details changed. Try logging in, or contact your lecturer.':message},400);}}
