import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
const COOKIE='aiads_session';
function sign(value:string){const key=process.env.APP_SESSION_SECRET;if(!key)throw new Error('App session is not configured');return createHmac('sha256',key).update(value).digest('base64url');}
export async function verifyAdminSession(){const raw=cookies().get(COOKIE)?.value;if(!raw)return false;const [payload,signature]=raw.split('.');if(!payload||!signature)return false;const expected=sign(payload);const a=Buffer.from(signature),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return false;const [role,expiry]=Buffer.from(payload,'base64url').toString().split(':');return role==='admin'&&Number(expiry)>Date.now();}
export function validateAdminPassword(value:string){const expected=process.env.APP_ADMIN_PASSWORD;if(!expected)return false;const a=createHmac('sha256','aiads-login').update(value).digest();const b=createHmac('sha256','aiads-login').update(expected).digest();return timingSafeEqual(a,b);}
export function createAdminCookie(){const payload=Buffer.from(`admin:${Date.now()+7*24*60*60*1000}`).toString('base64url');return `${payload}.${sign(payload)}`;}
export const ADMIN_COOKIE=COOKIE;
