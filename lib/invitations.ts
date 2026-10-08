import {and, eq} from 'drizzle-orm';
import {getDb} from '../db/index';
import {lecturerInvitations} from '../db/schema';
import {digest, isGmail, normalizeEmail, randomToken} from './auth-crypto';
import {db} from './lab';
import {sendMail} from './email';

export async function inviteLecturer(value: unknown, origin: string) {
 const email = normalizeEmail(value);
 if (!isGmail(email)) throw new Error('Enter the lecturer’s Gmail address.');
 if (await db().prepare('SELECT id FROM users WHERE lower(email)=?').bind(email).first()) throw new Error('This account already exists.');
 const token = randomToken(), tokenHash = await digest(token);
 const invitation = {id:crypto.randomUUID(), email, token:tokenHash, expiresAt:Date.now()+86400000, isUsed:false};
 await getDb().insert(lecturerInvitations).values(invitation).onConflictDoUpdate({target:lecturerInvitations.email, set:invitation});
 try {
  await sendMail(email, 'Your ArchPlaza lecturer invitation', `You have been invited to join ArchPlaza as a lecturer.\n\n${origin}/signup/lecturer?token=${token}\n\nThis single-use invitation expires in 24 hours. If you were not expecting it, ignore this message.`);
 } catch {
  await getDb().delete(lecturerInvitations).where(and(eq(lecturerInvitations.token,tokenHash),eq(lecturerInvitations.isUsed,false)));
  throw new Error('The invitation could not be sent. Please try again.');
 }
 return {ok:true, expiresAt:invitation.expiresAt};
}
export async function requireInvitation(token: unknown, email: string) {
 if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('A valid lecturer invitation is required.');
 const tokenHash=await digest(token);
 return requireInvitationHash(tokenHash,email);
}
export async function requireInvitationHash(tokenHash:unknown,email:string) {
 if(typeof tokenHash!=='string'||!/^[a-f0-9]{64}$/.test(tokenHash))throw new Error('A valid lecturer invitation is required.');
 const invitation=await db().prepare('SELECT id FROM lecturer_invitations WHERE token=? AND email=? AND is_used=0 AND expires_at>?').bind(tokenHash,email,Date.now()).first();
 if(!invitation)throw new Error('This invitation is invalid, expired, or already used.');
 return tokenHash;
}
// D1 batches are atomic. The INSERT rechecks validity at the write boundary; the
// consumption is conditional on this exact account having been inserted.
export async function registerInvitedLecturer(email:string,name:string,passwordHash:string,tokenHash:string) {
 const id=crypto.randomUUID(), time=Date.now();
 await db().batch([
  db().prepare("INSERT INTO users(id,email,name,role,password_hash,verified_at) SELECT ?,?,?,'admin',?,? FROM lecturer_invitations WHERE token=? AND email=? AND is_used=0 AND expires_at>?").bind(id,email,name,passwordHash,new Date(time).toISOString(),tokenHash,email,time),
  db().prepare('UPDATE lecturer_invitations SET is_used=1 WHERE token=? AND EXISTS(SELECT 1 FROM users WHERE id=?)').bind(tokenHash,id),
 ]);
 if(!await db().prepare('SELECT id FROM users WHERE id=?').bind(id).first())throw new Error('This invitation is invalid, expired, or already used.');
 return id;
}
