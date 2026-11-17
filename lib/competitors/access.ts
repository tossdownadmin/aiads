import { paidSourceSession } from './auth';

export async function verifyPaidSourceSession(): Promise<boolean> {
  return Boolean(await paidSourceSession());
}
