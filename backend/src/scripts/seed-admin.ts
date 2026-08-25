/**
 * Creates (or updates) the one admin account this app needs to bootstrap
 * staff login — there is no signup page by design (PLAN.md §8: staff app is
 * login-only), so account #1 has to come from somewhere outside the UI.
 *
 * Upserts on username, so re-running after changing SEED_ADMIN_PASSWORD in
 * .env rotates the password rather than failing on a duplicate.
 */
import { prisma, disconnect } from '../lib/prisma.js';
import { hashPassword } from '../lib/auth.js';

async function main() {
  const name = process.env['SEED_ADMIN_NAME'];
  const username = process.env['SEED_ADMIN_USERNAME'];
  const password = process.env['SEED_ADMIN_PASSWORD'];

  if (name === undefined || username === undefined || password === undefined) {
    throw new Error('SEED_ADMIN_NAME, SEED_ADMIN_USERNAME, and SEED_ADMIN_PASSWORD must all be set in .env');
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { username },
    create: { name, username, passwordHash, role: 'ADMIN' },
    update: { name, passwordHash, role: 'ADMIN', isActive: true },
  });

  console.log(`Admin ready: ${user.username} (${user.id})`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
