import {cookies} from 'next/headers';
import {env} from 'cloudflare:workers';
import {digest, randomToken} from './auth-crypto';
const database = () => (env as any).DB;
export const SESSION_COOKIE = 'archplaza_session';
export const CHALLENGE_COOKIE = 'archplaza_challenge';
export async function sessionUser() {
 const token = (await cookies()).get(SESSION_COOKIE)?.value;
 if (!token) return null;
 return database().prepare('SELECT u.id,u.email,u.name,u.role,u.identity,u.verified_at FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?').bind(await digest(token),Date.now()).first();
}
export async function createSession(userId: string) {
 const token=randomToken();
 await database().prepare('INSERT INTO auth_sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await digest(token),userId,Date.now()+7*86400000).run();
 return token;
}
export function setAuthCookie(response: Response, req: Request, name: string, value: string, maxAge: number) {
 response.headers.append('Set-Cookie',`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(req.url).protocol==='https:'?'; Secure':''}`);
 return response;
}
export function assertOrigin(req: Request) {
 if(req.headers.get('origin')!==new URL(req.url).origin) throw new Error('Invalid origin.');
}
export async function limit(key: string, maximum: number, windowMs: number) {
 const t=Date.now();
 const row=await database().prepare(`INSERT INTO auth_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END WHERE expires<=? OR count<? RETURNING count`).bind(await digest(key),t+windowMs,t,t,t,maximum).first();
 if(!row)throw new Error('Too many attempts. Please wait before trying again.');
}
