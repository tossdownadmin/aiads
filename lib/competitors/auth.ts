import { getServerSession, type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

function allowedEmails() {
  return (process.env.AUTH_ALLOWED_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
}

export const authOptions: NextAuthOptions = {
  providers: [GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID || 'unconfigured',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'unconfigured',
  })],
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  callbacks: {
    async signIn({ account, profile }) {
      const googleProfile = profile as { email?: string; email_verified?: boolean } | undefined;
      return account?.provider === 'google' && googleProfile?.email_verified === true && allowedEmails().includes((googleProfile.email || '').toLowerCase());
    },
  },
};

export async function paidSourceSession() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.NEXTAUTH_SECRET || !allowedEmails().length) return null;
  const session = await getServerSession(authOptions);
  return session?.user?.email && allowedEmails().includes(session.user.email.toLowerCase()) ? session : null;
}
