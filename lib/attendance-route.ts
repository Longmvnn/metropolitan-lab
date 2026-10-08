import {assertOrigin} from './auth';
import {actor} from './lab';
import {AttendanceError} from './attendance';
export async function attendanceRoute<T extends object = Record<string,unknown>>(req:Request,action:(user:{id:string;role:string},body:T)=>Promise<unknown>) {
 try {
  assertOrigin(req);const user=await actor();const body=await req.json() as T;
  return Response.json(await action(user,body),{headers:{'Cache-Control':'no-store'}});
 } catch(error) {return Response.json({error:error instanceof Error?error.message:'Unable to record attendance.'},{status:error instanceof AttendanceError?error.status:400});}
}
