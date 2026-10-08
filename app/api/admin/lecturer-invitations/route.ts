import {assertOrigin, limit, sessionUser} from '../../../../lib/auth';
import {inviteLecturer} from '../../../../lib/invitations';
export async function POST(req:Request) {
 try {
  assertOrigin(req);
  const user=await sessionUser();
  if(!user || user.role!=='admin')return Response.json({error:'Administrator access required.'},{status:403});
  await limit('invitations:'+user.id,20,3600000);
  const body=await req.json() as {email?:unknown};
  return Response.json(await inviteLecturer(body.email,new URL(req.url).origin),{headers:{'Cache-Control':'no-store'}});
 } catch(error) {return Response.json({error:error instanceof Error?error.message:'Unable to invite lecturer.'},{status:400});}
}
