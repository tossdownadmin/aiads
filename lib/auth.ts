import { paidSourceSession } from './competitors/auth';

export async function verifyAdminSession(): Promise<boolean> {
  return Boolean(await paidSourceSession());
}
