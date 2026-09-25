'use strict';
// Usage: npm run create-admin -- <username>
// Asks for the password without echoing it. Running it again for the same username resets the password.
const readline = require('node:readline');
const { db, init, close } = require('../src/db');
const { hashSecret } = require('../src/auth');

const username = (process.argv[2] || '').trim();
if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) {
  console.error('Usage: npm run create-admin -- <username>   (3-40 letters, digits, _ . -)');
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    if (process.env.ADMIN_PASSWORD) return resolve(process.env.ADMIN_PASSWORD);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

(async () => {
  const pass = await askHidden('Password (at least 10 characters): ');
  if (pass.length < 10) {
    console.error('Password too short.');
    process.exit(1);
  }
  const again = process.env.ADMIN_PASSWORD ? pass : await askHidden('Repeat password: ');
  if (again !== pass) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
  const hash = await hashSecret(pass);
  await init();
  await db.run(`INSERT INTO admins(username, pass_hash) VALUES(?, ?)
    ON CONFLICT(username) DO UPDATE SET pass_hash = excluded.pass_hash, token_version = admins.token_version + 1`, username, hash);
  await close();
  console.log(`Admin "${username}" is ready. Log in at /admin`);
})();
