import {cookies} from 'next/headers';
import {db} from '../../../../lib/lab';
import {SESSION_COOKIE,CHALLENGE_COOKIE,setAuthCookie,assertOrigin} from '../../../../lib/auth';
import {digest} from '../../../../lib/auth-crypto';
export async function POST(req:Request){
 try{assertOrigin(req);}catch{return new Response('Invalid origin',{status:403});}
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(token)await db().prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await digest(token)).run();
 const response=Response.json({ok:true});
 setAuthCookie(response,req,SESSION_COOKIE,'',0);setAuthCookie(response,req,CHALLENGE_COOKIE,'',0);
 return response;
}
