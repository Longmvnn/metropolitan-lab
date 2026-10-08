export const mail=[];
export const emailConfigured=()=>true;
export async function sendMail(to,subject,text){mail.push({to,subject,text});}

export async function emailNotification(){return {sent:0};}
