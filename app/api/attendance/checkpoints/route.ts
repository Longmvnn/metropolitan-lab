import {attendanceRoute} from '../../../../lib/attendance-route';
import {startCheckpoint,lockCheckpoint} from '../../../../lib/attendance';
export const POST=(req:Request)=>attendanceRoute(req,startCheckpoint);
export const PATCH=(req:Request)=>attendanceRoute(req,(user,body)=>lockCheckpoint(user,String(body.id||'')));
