import {attendanceRoute} from '../../../../lib/attendance-route';
import {submitCheckpoint} from '../../../../lib/attendance';
export const POST=(req:Request)=>attendanceRoute(req,submitCheckpoint);
