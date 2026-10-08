// Run locally as the database administrator; the password is never a command argument.
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {hashPassword,normalizeEmail,isGmail} from '../lib/auth-crypto.ts';
const rl=createInterface({input:stdin,output:stdout});
try {
 const email=normalizeEmail(await rl.question('Lecturer Gmail: '));
 if(!isGmail(email))throw new Error('A Gmail address is required.');
 const name=(await rl.question('Full name: ')).trim();if(!name)throw new Error('A full name is required.');
 stdout.write('Password (12–128 characters, hidden): ');
 const original=rl._writeToOutput;rl._writeToOutput=()=>{};
 const password=await rl.question('');stdout.write('\nConfirm password (hidden): ');
 const confirmation=await rl.question('');rl._writeToOutput=original;stdout.write('\n');
 if(password!==confirmation)throw new Error('Passwords do not match.');
 const passwordHash=await hashPassword(password);
 const sqlString=v=>"'"+v.replaceAll("'","''")+"'";
 const sql=`-- Administrator provisioning. No plaintext password is stored.\nBEGIN;\nINSERT INTO users(id,email,name,role,password_hash) VALUES(${sqlString(crypto.randomUUID())},${sqlString(email)},${sqlString(name)},'admin',${sqlString(passwordHash)}) ON CONFLICT DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash WHERE users.role='admin';\nDELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE lower(email)=${sqlString(email)} AND role='admin');\nCOMMIT;\n`;
 if(process.argv.includes('--local')) {
  const {DatabaseSync}=await import('node:sqlite');
  const root='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
  const candidates=existsSync(root)?readdirSync(root).filter(p=>p.endsWith('.sqlite')&&p!=='metadata.sqlite'):[];
  if(candidates.length!==1)throw new Error('Could not identify exactly one local teaching database. Use SQL export and choose the database explicitly.');
  const database=new DatabaseSync(root+'/'+candidates[0]);
  try {
   const existing=database.prepare('SELECT role FROM users WHERE lower(email)=?').get(email);
   if(existing&&existing.role!=='admin')throw new Error('That Gmail belongs to a student; it cannot be provisioned as a lecturer.');
   database.exec(sql);
   stdout.write('Lecturer password saved in the local database. You can now log in.\n');
  } finally {database.close();}
 } else {
  mkdirSync('.sites-runtime',{recursive:true});writeFileSync('.sites-runtime/lecturer.sql',sql,{mode:0o600});
  stdout.write('Saved .sites-runtime/lecturer.sql. Apply it to the intended database, then delete the file. Existing student accounts are never promoted.\n');
 }
} catch(e){console.error(e.message);process.exitCode=1;} finally{rl.close();}
