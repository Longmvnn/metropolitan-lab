import Link from 'next/link';
import AuthForm from '../../components/AuthForm';
export const metadata = {referrer:'no-referrer'};
export default async function LecturerSignup({searchParams}:{searchParams:Promise<{token?:string}>}) {
 const {token}=await searchParams;
 if(!token || !/^[a-f0-9]{64}$/.test(token))return <main className="card"><h1>Invitation required</h1><p>Ask an administrator to email you a lecturer invitation.</p><Link href="/?portal=lecturer">Lecturer login</Link></main>;
 return <AuthForm portal="lecturer" invitationToken={token}/>;
}
