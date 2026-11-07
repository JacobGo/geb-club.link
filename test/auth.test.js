import test from 'node:test';
import assert from 'node:assert/strict';
import { isMember, loginCookie } from '../src/auth.js';

const env = { CLUB_PASSWORD: 'pw', SESSION_SECRET: 'secret' };
const withCookie = (cookie) => new Request('https://geb-club.link/members/', { headers: { Cookie: cookie } });

test('the club cookie is recognized wherever it sits in the Cookie header', async () => {
  const member = (await loginCookie(env)).split(';')[0]; // "geb_member=<hex>"
  assert.ok(await isMember(withCookie(member), env));
  assert.ok(await isMember(withCookie(`geb_account=1.abc; ${member}`), env));
  assert.ok(await isMember(withCookie(`a=1;${member}; b=2`), env));
  assert.ok(!(await isMember(withCookie('geb_account=1.abc'), env)));
  assert.ok(!(await isMember(withCookie('geb_member=00ff'), env)));
  assert.ok(!(await isMember(withCookie(`not_${member}`), env)));
});
