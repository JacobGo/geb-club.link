# geb-club.link

The GEB Club website: reading history, how we vote, and members-only elections.

Static pages in `public/`, API in `functions/` (Cloudflare Pages Functions), data in Cloudflare D1 (SQLite).

## Run it locally

Needs Node 20+.

```sh
npm install
cp .dev.vars.example .dev.vars   # local club password + session secret
npm run db:init:local            # creates the local database with the book list
npm run dev                      # http://localhost:8788
```

The members area uses the `CLUB_PASSWORD` from your `.dev.vars`.

## Tests

```sh
npm test
```

## Layout

| Path | What |
|---|---|
| `public/` | Pages. `public/members/` is behind the club password. |
| `functions/_middleware.js` | Club password gate. |
| `functions/api/[[path]].js` | All API routes. |
| `src/tally.js` | Vote counting: debt-weighted STAR and plain STAR. |
| `src/auth.js` | Club password cookie, member accounts, password hashing. |
| `db/schema.sql` | Database schema. `db/migrations/` holds changes already applied to the live database. |
| `db/book_media.sql` | Cover image source and StoryGraph link for each book read. Re-runnable. |
| `db/tags.sql` | Starting tags for the books read (members add more on `/members/almanac`). |
| `public/triplet.js` | The trip-let in the top bar: a block whose shadows spell G, E and B. |
| `public/palette.js` | Main colors of each cover, for the home page shelf and the almanac. |
| `public/data/almanac.json` | Open Library data for each book read. Re-fetch after adding a book: `node scripts/almanac.mjs`. |
| `functions/covers/[id].js` | Serves covers from our own copy (D1 `cover_cache`), fetching from the source once. |
| `test/` | Unit tests. |

## Changing the database

Don't edit `db/schema.sql` alone. Add a new numbered file in `db/migrations/` with the change, and update `db/schema.sql` to match.

## Pull requests

Open a PR against `main`. Run `npm test` before you do. Jake reviews, merges and deploys (`npm run deploy` builds `dist/` with cache-busted asset links, then uploads it).

Don't commit real member names, Discord handles or ballot data. The detailed history is members-only and isn't in this repo.
