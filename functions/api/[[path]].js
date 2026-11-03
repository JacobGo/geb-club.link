// All API routes. Auth is enforced in functions/_middleware.js.
import { passwordMatches, loginCookie, logoutCookie, hashPassword, verifyPassword, accountCookie, accountLogoutCookie, currentAccount } from '../../src/auth.js';
import { METHODS, DEBT_PARAMS, replay, tally, debtsFor, weightsFor, attendance } from '../../src/tally.js';

const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
const bad = (msg, status = 400) => json({ error: msg }, status);
const SIGNED_OUT = () => bad('sign in to your account first', 403);
const publicMember = (m) => m && {
  id: m.id, name: m.name, first_name: m.first_name, discord: m.discord, has_password: !!m.pw_hash, created_at: m.created_at,
};

// First name and Discord handle are each optional; at least one is required.
// The display name is "First (@handle)", or whichever one was given.
function identity(body) {
  const first_name = str(body.first_name, 40) || null;
  const discord = str(body.discord, 40).replace(/^@+/, '').trim() || null;
  if (!first_name && !discord) return { error: 'enter a first name or a Discord handle' };
  const name = first_name && discord ? `${first_name} (@${discord})` : first_name || `@${discord}`;
  return { first_name, discord, name };
}
const takenMessage = (err) => (/discord/i.test(String(err?.message)) ? 'that Discord handle is taken' : 'that name is taken');
const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ------------------------------------------------------------ data helpers

async function getElection(db, id) {
  const e = await db.prepare('SELECT * FROM elections WHERE id = ?').bind(id).first();
  if (e?.result) e.result = JSON.parse(e.result);
  return e;
}

const candidatesOf = (db, id) =>
  db.prepare(`SELECT c.*, m.name AS nominator FROM candidates c LEFT JOIN members m ON m.id = c.nominator_id
              WHERE election_id = ? ORDER BY c.id`).bind(id).all().then((r) => r.results);

const ballotsOf = (db, id) =>
  db.prepare('SELECT b.member_id, m.name, b.scores, b.updated_at FROM ballots b JOIN members m ON m.id = b.member_id WHERE election_id = ? ORDER BY m.name')
    .bind(id).all().then((r) => r.results.map((b) => ({ ...b, scores: JSON.parse(b.scores) })));

// Debt state from every closed election, oldest first. Voters/candidates are keyed by id strings.
async function debtState(db, beforeId = null) {
  const closed = (await db.prepare(`SELECT id, winner_id FROM elections WHERE status = 'closed' AND winner_id IS NOT NULL
                                    ${beforeId ? 'AND id != ?' : ''} ORDER BY closed_at, id`)
    .bind(...(beforeId ? [beforeId] : [])).all()).results;
  const history = [];
  for (const e of closed) {
    const cands = (await candidatesOf(db, e.id)).map((c) => String(c.id));
    const ballots = (await ballotsOf(db, e.id)).map((b) => ({ voter: String(b.member_id), scores: b.scores }));
    history.push({ candidates: cands, ballots, winner: String(e.winner_id) });
  }
  return replay(history);
}

// ------------------------------------------------------------ routes

const routes = [];
const route = (method, pattern, fn) =>
  routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

route('POST', '/api/login', async ({ env, body }) => {
  if (!env.CLUB_PASSWORD || !env.SESSION_SECRET) return bad('server is missing its secrets', 500);
  if (!(await passwordMatches(str(body.password, 200), env))) return bad('wrong password', 403);
  return json({ ok: true }, 200, { 'Set-Cookie': await loginCookie(env) });
});

route('POST', '/api/logout', () => {
  const h = new Headers({ 'Content-Type': 'application/json' });
  h.append('Set-Cookie', logoutCookie);
  h.append('Set-Cookie', accountLogoutCookie);
  return new Response(JSON.stringify({ ok: true }), { headers: h });
});

// Public: just the books, in order.
route('GET', '/api/public/books', async ({ db }) =>
  json((await db.prepare('SELECT position, title, author FROM books_read ORDER BY position').all()).results));

route('GET', '/api/books', async ({ db }) =>
  json((await db.prepare('SELECT * FROM books_read ORDER BY position').all()).results));

route('PATCH', '/api/books/:id', async ({ db, params, body }) => {
  const fields = ['title', 'author', 'nominator', 'read_date', 'notes'].filter((f) => f in body);
  if (!fields.length) return bad('nothing to update');
  await db.prepare(`UPDATE books_read SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
    .bind(...fields.map((f) => str(body[f], 1000) || null), params.id).run();
  return json({ ok: true });
});

// Everyone's list: no password info. (has_password is only shown to the account itself, via /api/me.)
route('GET', '/api/members', async ({ db }) =>
  json((await db.prepare('SELECT * FROM members ORDER BY name').all()).results.map(({ id, name, first_name, discord, created_at }) => ({ id, name, first_name, discord, created_at }))));

route('GET', '/api/me', ({ me }) => json({ me: publicMember(me) }));

route('POST', '/api/accounts', async ({ env, db, body }) => {
  const id = identity(body);
  if (id.error) return bad(id.error);
  const pw = typeof body.password === 'string' ? body.password : '';
  const { salt, hash } = pw ? await hashPassword(pw) : {};
  let m;
  try {
    m = await db.prepare(`INSERT INTO members (name, first_name, discord, pw_hash, pw_salt, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now')) RETURNING *`)
      .bind(id.name, id.first_name, id.discord, hash ?? null, salt ?? null).first();
  } catch (err) { return bad(takenMessage(err)); }
  return json({ me: publicMember(m) }, 201, { 'Set-Cookie': await accountCookie(env, m) });
});

route('POST', '/api/accounts/login', async ({ env, db, body }) => {
  const m = await db.prepare('SELECT * FROM members WHERE id = ?').bind(Number(body.member_id)).first();
  if (!m) return bad('no such account', 404);
  if (!(await verifyPassword(typeof body.password === 'string' ? body.password : '', m))) return bad('wrong password', 403);
  return json({ me: publicMember(m) }, 200, { 'Set-Cookie': await accountCookie(env, m) });
});

route('POST', '/api/accounts/logout', () => json({ ok: true }, 200, { 'Set-Cookie': accountLogoutCookie }));

// Update your own first name / Discord handle, and/or password ('' removes it).
route('PATCH', '/api/me', async ({ env, db, me, body }) => {
  if (!me) return SIGNED_OUT();
  let m = me;
  if ('first_name' in body || 'discord' in body) {
    const id = identity({ first_name: body.first_name ?? me.first_name, discord: body.discord ?? me.discord });
    if (id.error) return bad(id.error);
    try {
      m = await db.prepare('UPDATE members SET name = ?, first_name = ?, discord = ? WHERE id = ? RETURNING *')
        .bind(id.name, id.first_name, id.discord, me.id).first();
    } catch (err) { return bad(takenMessage(err)); }
  }
  if (typeof body.password === 'string') {
    const { salt, hash } = body.password ? await hashPassword(body.password) : {};
    m = await db.prepare('UPDATE members SET pw_hash = ?, pw_salt = ? WHERE id = ? RETURNING *')
      .bind(hash ?? null, salt ?? null, me.id).first();
  }
  return json({ me: publicMember(m) }, 200, { 'Set-Cookie': await accountCookie(env, m) });
});

// Current debt/weight standings, for transparency.
route('GET', '/api/standings', async ({ db }) => {
  const members = (await db.prepare('SELECT id, name FROM members WHERE active = 1 ORDER BY name').all()).results;
  const st = await debtState(db);
  const ids = members.map((m) => String(m.id));
  const debts = debtsFor(st, ids), weights = weightsFor(st, ids);
  return json({
    params: DEBT_PARAMS,
    members: members.map((m) => {
      const k = String(m.id);
      return { id: m.id, name: m.name, debt: debts[k], newcomer: !(k in st.debt), roundsSeen: st.seen[k] ?? 0,
        attendance: attendance(st, k), weight: weights[k] };
    }),
  });
});

route('GET', '/api/elections', async ({ db }) => {
  const rows = (await db.prepare(`
    SELECT e.id, e.title, e.method, e.status, e.created_at, e.closed_at, w.title AS winner,
      (SELECT COUNT(*) FROM candidates c WHERE c.election_id = e.id) AS n_candidates,
      (SELECT COUNT(*) FROM ballots b WHERE b.election_id = e.id) AS n_ballots
    FROM elections e LEFT JOIN candidates w ON w.id = e.winner_id
    ORDER BY e.status = 'closed', e.id DESC`).all()).results;
  return json({ elections: rows, methods: METHODS });
});

route('POST', '/api/elections', async ({ db, body }) => {
  const title = str(body.title, 120);
  const method = body.method in METHODS ? body.method : 'debt-star';
  if (!title) return bad('title required');
  const r = await db.prepare('INSERT INTO elections (title, method) VALUES (?, ?) RETURNING id').bind(title, method).first();
  return json(r, 201);
});

route('GET', '/api/elections/:id', async ({ db, params }) => {
  const e = await getElection(db, params.id);
  if (!e) return bad('no such election', 404);
  const candidates = await candidatesOf(db, e.id);
  const ballots = await ballotsOf(db, e.id);
  // While voting is open, show who has voted but not how.
  const shown = e.status === 'closed' ? ballots : ballots.map(({ member_id, name, updated_at }) => ({ member_id, name, updated_at }));
  return json({ election: e, methods: METHODS, candidates, ballots: shown });
});

route('PATCH', '/api/elections/:id', async ({ db, params, body }) => {
  const e = await getElection(db, params.id);
  if (!e) return bad('no such election', 404);
  if (e.status === 'closed') return bad('election is closed');
  if (body.status && ['nominating', 'voting'].includes(body.status)) {
    if (body.status === 'voting' && (await candidatesOf(db, e.id)).length < 2) return bad('need at least two books first');
    await db.prepare('UPDATE elections SET status = ? WHERE id = ?').bind(body.status, e.id).run();
  }
  if (body.title) await db.prepare('UPDATE elections SET title = ? WHERE id = ?').bind(str(body.title, 120), e.id).run();
  if (body.method in METHODS) await db.prepare('UPDATE elections SET method = ? WHERE id = ?').bind(body.method, e.id).run();
  return json({ ok: true });
});

route('DELETE', '/api/elections/:id', async ({ db, params }) => {
  const e = await getElection(db, params.id);
  if (!e) return bad('no such election', 404);
  if (e.status === 'closed') return bad('closed elections are part of the debt history and cannot be deleted');
  await db.batch([
    db.prepare('DELETE FROM ballots WHERE election_id = ?').bind(e.id),
    db.prepare('DELETE FROM candidates WHERE election_id = ?').bind(e.id),
    db.prepare('DELETE FROM elections WHERE id = ?').bind(e.id),
  ]);
  return json({ ok: true });
});

route('POST', '/api/elections/:id/candidates', async ({ db, params, body, me }) => {
  const e = await getElection(db, params.id);
  if (!e) return bad('no such election', 404);
  if (e.status !== 'nominating') return bad('nominations are closed');
  const title = str(body.title, 200);
  if (!title) return bad('title required');
  const int = (v) => (Number.isInteger(v) ? v : null);
  const r = await db.prepare(`INSERT INTO candidates (election_id, title, author, nominator_id, ol_key, cover_id, isbn, year, pitch)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(e.id, title, str(body.author, 200) || null,
    me.id, str(body.ol_key, 60) || null, int(body.cover_id), str(body.isbn, 20) || null,
    int(body.year), str(body.pitch, 1000) || null).first();
  return json(r, 201);
});

route('DELETE', '/api/elections/:id/candidates/:cid', async ({ db, params }) => {
  const e = await getElection(db, params.id);
  if (!e) return bad('no such election', 404);
  if (e.status !== 'nominating') return bad('books can only be removed while nominating');
  await db.prepare('DELETE FROM candidates WHERE id = ? AND election_id = ?').bind(params.cid, e.id).run();
  return json({ ok: true });
});

route('GET', '/api/elections/:id/ballot', async ({ db, params, me }) => {
  if (!me) return SIGNED_OUT();
  const b = await db.prepare('SELECT scores FROM ballots WHERE election_id = ? AND member_id = ?').bind(params.id, me.id).first();
  return json({ scores: b ? JSON.parse(b.scores) : null });
});

route('PUT', '/api/elections/:id/ballot', async ({ db, params, body, me }) => {
  const e = await getElection(db, params.id);
  if (!e) return bad('no such election', 404);
  if (e.status !== 'voting') return bad('voting is not open');
  const cands = await candidatesOf(db, e.id);
  const scores = {};
  for (const c of cands) {
    const v = body.scores?.[c.id];
    if (!Number.isInteger(v) || v < 0 || v > 5) return bad(`score every book 0-5 (missing: ${c.title})`);
    scores[c.id] = v;
  }
  await db.prepare(`INSERT INTO ballots (election_id, member_id, scores) VALUES (?, ?, ?)
    ON CONFLICT (election_id, member_id) DO UPDATE SET scores = excluded.scores, updated_at = datetime('now')`)
    .bind(e.id, me.id, JSON.stringify(scores)).run();
  return json({ ok: true });
});

route('DELETE', '/api/elections/:id/ballot', async ({ db, params, me }) => {
  const e = await getElection(db, params.id);
  if (e?.status !== 'voting') return bad('voting is not open');
  await db.prepare('DELETE FROM ballots WHERE election_id = ? AND member_id = ?').bind(params.id, me.id).run();
  return json({ ok: true });
});

// Count the votes.
async function count(db, e) {
  const cands = await candidatesOf(db, e.id);
  const ballots = (await ballotsOf(db, e.id)).map((b) => ({ voter: String(b.member_id), scores: b.scores }));
  const state = await debtState(db, e.id);
  return tally({ method: e.method, candidates: cands.map((c) => String(c.id)), ballots, seed: `election-${e.id}` }, state);
}

route('POST', '/api/elections/:id/close', async ({ db, params, body }) => {
  const e = await getElection(db, params.id);
  if (!e) return bad('no such election', 404);
  if (e.status !== 'voting') return bad('can only close an election that is voting');
  const result = await count(db, e);
  if (!result.voters) return bad('nobody has voted yet');
  const winner = await db.prepare('SELECT * FROM candidates WHERE id = ?').bind(Number(result.winner)).first();
  const stmts = [db.prepare(`UPDATE elections SET status = 'closed', closed_at = datetime('now'), winner_id = ?, result = ? WHERE id = ?`)
    .bind(winner.id, JSON.stringify(result), e.id)];
  if (body.addToHistory !== false) {
    const nominator = winner.nominator_id
      ? (await db.prepare('SELECT name FROM members WHERE id = ?').bind(winner.nominator_id).first())?.name : null;
    stmts.push(db.prepare(`INSERT INTO books_read (position, title, author, nominator, read_date, notes, election_id)
      VALUES ((SELECT COALESCE(MAX(position), 0) + 1 FROM books_read), ?, ?, ?, strftime('%Y-%m', 'now'), ?, ?)`)
      .bind(winner.title, winner.author, nominator, `${METHODS[e.method]}: "${e.title}"`, e.id));
  }
  await db.batch(stmts);
  return json({ ok: true, winner: winner.title });
});

// ------------------------------------------------------------ dispatch

const ACCOUNTLESS = ['/api/login', '/api/logout', '/api/accounts', '/api/accounts/login', '/api/accounts/logout'];

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  for (const r of routes) {
    const m = r.method === request.method && url.pathname.match(r.re);
    if (!m) continue;
    let body = {};
    if (!['GET', 'HEAD', 'DELETE'].includes(request.method)) {
      try { body = await request.json(); } catch { body = {}; }
    }
    try {
      const me = await currentAccount(request, env, env.DB);
      // Every change needs an account, except signing in/out and creating one.
      if (request.method !== 'GET' && !me && !ACCOUNTLESS.includes(url.pathname)) return SIGNED_OUT();
      return await r.fn({ request, env, db: env.DB, params: m.groups || {}, body, url, me });
    } catch (err) {
      console.error(err);
      return bad('server error: ' + err.message, 500);
    }
  }
  return bad('not found', 404);
}
