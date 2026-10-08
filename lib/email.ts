import {reminderCandidates} from './reminders';
import { env } from 'cloudflare:workers';
import { all, db, get, now, put, uid } from './lab';
import { validEmail } from './imports';
const e=()=>env as any;
// The Gmail account that sends mail. GMAIL_ADDRESS must be the account the App Password was created in.
const senderAddress=()=>String(e().GMAIL_ADDRESS||'archplazalab@gmail.com').trim().toLowerCase();
const appPassword=()=>String(e().GMAIL_APP_PASSWORD||'').replace(/\s+/g,'');
const oauthConfigured=()=>!!(e().GMAIL_CLIENT_ID&&e().GMAIL_CLIENT_SECRET&&e().GMAIL_REFRESH_TOKEN);
// Two ways to send: a Gmail App Password (simplest) or Gmail API OAuth credentials.
export function emailConfigured(){return !!appPassword()||oauthConfigured();}
const b64=(s:string)=>Buffer.from(s,'utf8').toString('base64');
const mime=(to:string,subject:string,text:string)=>[`From: ArchPlaza <${senderAddress()}>`,`To: ${to}`,`Subject: =?UTF-8?B?${b64(subject)}?=`,`Date: ${new Date().toUTCString()}`,`Message-ID: <${crypto.randomUUID()}@archplaza>`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',b64(text).replace(/.{76}/g,'$&\r\n')].join('\r\n');
// Minimal SMTP client over implicit TLS (smtp.gmail.com:465) using Workers TCP sockets.
async function smtpSend(to:string,subject:string,text:string){
 const {connect}=await import('cloudflare:sockets');const socket=connect({hostname:'smtp.gmail.com',port:465},{secureTransport:'on',allowHalfOpen:false});
 const w=socket.writable.getWriter(),r=socket.readable.getReader(),enc=new TextEncoder(),dec=new TextDecoder();let buf='';
 const reply=async()=>{for(;;){const lines=buf.split('\r\n');for(let i=0;i<lines.length-1;i++)if(/^\d{3} /.test(lines[i])){buf=lines.slice(i+1).join('\r\n');return lines.slice(0,i+1).join('\n');}const {value,done}=await r.read();if(done)throw new Error('Gmail closed the connection.');buf+=dec.decode(value,{stream:true});}};
 const step=async(line:string|null,expect:number,fail:string)=>{if(line!==null)await w.write(enc.encode(line+'\r\n'));const res=await reply();if(Number(res.slice(0,3))!==expect)throw new Error(`${fail} (Gmail said: ${res.split('\n').pop()?.slice(0,140)})`);return res;};
 try{await step(null,220,'Could not reach Gmail.');await step('EHLO archplaza',250,'Gmail refused the connection.');await step('AUTH LOGIN',334,'Gmail refused sign-in.');await step(b64(senderAddress()),334,'Gmail refused sign-in.');await step(b64(appPassword()),235,`Gmail rejected the App Password for ${senderAddress()}. Sign in to ${senderAddress()}, create a new App Password there, and put it in GMAIL_APP_PASSWORD.`);await step(`MAIL FROM:<${senderAddress()}>`,250,'Gmail refused the sender.');await step(`RCPT TO:<${to}>`,250,'Gmail refused this recipient address.');await step('DATA',354,'Gmail refused the message.');await step(mime(to,subject,text)+'\r\n.',250,'Gmail did not accept the message.');await step('QUIT',221,'').catch(()=>{});}finally{try{await socket.close();}catch{}}
}
export async function sendMail(to:string,subject:string,text:string){
 if(!emailConfigured())throw new Error('Email sending is not switched on yet.');if(!validEmail(to)||/[\r\n]/.test(to))throw new Error('Invalid recipient email.');
 if(appPassword())return smtpSend(to,subject,text);
 const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:e().GMAIL_CLIENT_ID,client_secret:e().GMAIL_CLIENT_SECRET,refresh_token:e().GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'})});const token:any=await tokenResponse.json();if(!tokenResponse.ok||!token.access_token)throw new Error('Gmail authorization needs to be connected or renewed.');
 const raw=Buffer.from(mime(to,subject,text),'utf8').toString('base64url');
 const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({raw})});if(!response.ok)throw new Error('Gmail did not accept this message. Check the sender authorization and sending limits.');const result:any=await response.json();return result.id;
}
export async function emailStatus(){const status=await get('scheduler-status');return {sender:senderAddress(),configured:emailConfigured(),schedulerReady:!!e().REMINDER_JOB_SECRET,lastRun:status?.lastRun||null};}
// Addresses that can never receive mail (local test and placeholder accounts) are skipped, not counted as failures.
const deliverable=(email:string)=>validEmail(email)&&!/@(sites\.test|example\.(com|org|net|test))$/i.test(email);
async function deliver(key:string,u:any,email:string,subject:string,body:string){const id=key+':'+u.id;const claim=await db().prepare("INSERT OR IGNORE INTO deliveries(id,student,recipient,subject,status,updated) VALUES(?,?,?,?,'Sending',?)").bind(id,u.id,email,subject,now()).run();if(!claim.meta.changes)return 'duplicate';try{await sendMail(email,subject,`Hello ${u.name},\n\n${body}\n\nArchPlaza\nThis is a teaching message, not an official university record.`);await db().prepare("UPDATE deliveries SET status='Accepted by Gmail',updated=? WHERE id=?").bind(now(),id).run();return 'sent';}catch(e:any){await db().prepare("UPDATE deliveries SET status='Needs review',error=?,updated=? WHERE id=?").bind(String(e?.message||'Sending failed.').slice(0,200),now(),id).run();return 'failed';}}
// Students who can be emailed: enrolled this semester, with a verified Gmail on their profile.
async function recipients(){const records=await all();const active=records.find((r:any)=>r.kind==='semester'&&!r.archived);const users=(await db().prepare("SELECT id,name,email FROM users WHERE role='student'").all()).results;const enrolled=(u:any,course?:string)=>records.some((r:any)=>r.kind==='enrollment'&&r.student===u.id&&r.semester===active?.id&&(!course||r.course===course));
 const list=users.filter((u:any)=>enrolled(u)).map((u:any)=>{const p=records.find((r:any)=>r.id==='profile:'+u.id);return {...u,profile:p,to:p?.emailVerified&&deliverable(p.email||'')?p.email:''};});return {records,active,list,enrolled};}
// Email one announcement right away to the students it is for.
export async function emailNotification(n:any){if(!emailConfigured())return {sent:0,failed:0,notVerified:0,skipped:true};const {list,enrolled}=await recipients();const category=n.type==='Marks'?'marks':n.type==='Room / class change'?'roomChanges':'announcements';let sent=0,failed=0,notVerified=0;
 for(const u of list){if(n.student&&n.student!==u.id)continue;if(n.course&&!enrolled(u,n.course))continue;if(!u.to){notVerified++;continue;}if(u.profile?.notifications?.[category]===false)continue;const r=await deliver('notice:'+n.id+':'+(n.revision||1),u,u.to,n.title,n.body);if(r==='sent')sent++;else if(r==='failed')failed++;}
 return {sent,failed,notVerified};}
export async function runReminders(){if(!emailConfigured())throw new Error('Email sending is not switched on yet.');const {records,active,list,enrolled}=await recipients();const current=records.filter((r:any)=>r.semester===active?.id);
 // Announcements are emailed when posted, so the scheduled run only covers classes and deadlines.
 const candidates=reminderCandidates(current).filter((n:any)=>!n.key.startsWith('notice:'));let accepted=0,failed=0,processed=0;const notVerified=list.filter((u:any)=>!u.to).length;
 for(const u of list){if(!u.to)continue;for(const n of candidates){const category=n.key.startsWith('class:')?'classes':'deadlines';if(u.profile?.notifications?.[category]===false)continue;if(n.student&&n.student!==u.id||n.course&&!enrolled(u,n.course))continue;if(processed>=40)break;const r=await deliver(n.key,u,u.to,n.subject,n.body);if(r==='duplicate')continue;processed++;if(r==='sent')accepted++;else failed++;}}
 const old=await get('scheduler-status');await put('scheduler','scheduler-status',{lastRun:now(),accepted,failed},old?.revision);
 return {accepted,failed,unverified:notVerified,verified:list.length-notVerified,due:candidates.length,processed};}

// A lecturer-triggered test message to confirm sending works.
export async function sendTestEmail(to:string){await sendMail(to,'ArchPlaza test email','This is a test from ArchPlaza. If you can read this, email sending works and students will receive verification codes and announcements.');}
