// Shared with the administrator provisioning script. Never store plaintext passwords.
export const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
export const normalizeRegistration = (value: unknown) => String(value ?? '').trim().toUpperCase();
export const isGmail = (value: string) => /^[^\s@]+@(gmail|googlemail)\.com$/.test(value);
export const digest = async (value: string) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex');
export const randomToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
export function namesMatch(rosterName: string, names: string[]) {
 const words = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().match(/[\p{L}\p{N}]+/gu)?.sort().join(' ') || '';
 return !!words(rosterName) && words(rosterName) === words(names.join(' '));
}
export async function hashPassword(password: string, salt = randomToken()) {
 if (password.length < 12 || password.length > 128) throw new Error('Use a password between 12 and 128 characters.');
 return derivePasswordHash(password, salt);
}
// Login verifies an administrator-provisioned hash independently of new-password policy.
async function derivePasswordHash(password: string, salt: string) {
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
 const hash = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:new TextEncoder().encode(salt), iterations:100000}, key, 256);
 return `pbkdf2-sha256$100000$${salt}$${Buffer.from(hash).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
 const parts = encoded.split('$');
 if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256' || parts[1] !== '100000' || password.length < 1 || password.length > 128) return false;
 const actual = await derivePasswordHash(password, parts[2]);
 let mismatch = actual.length ^ encoded.length;
 for (let i=0; i<actual.length; i++) mismatch |= actual.charCodeAt(i) ^ (encoded.charCodeAt(i) || 0);
 return mismatch === 0;
}
