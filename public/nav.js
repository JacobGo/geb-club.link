// Shows "My page" in the top bar while a member account is signed in.
// Pages that sign in or out dispatch `geb:account` to update it without a reload.
const nav = document.querySelector('header.site nav');

function setMyPage(signedIn) {
  let link = nav.querySelector('a[href="/members/me"]');
  if (!signedIn) { link?.remove(); return; }
  if (link) return;
  link = document.createElement('a');
  link.href = '/members/me';
  link.textContent = 'My page';
  if (location.pathname.replace(/\.html$/, '') === '/members/me') link.setAttribute('aria-current', 'page');
  nav.querySelector('a[href="/members/"]').after(link);
}

fetch('/api/me', { credentials: 'same-origin' })
  .then((r) => (r.ok ? r.json() : { me: null }))
  .then((r) => setMyPage(!!r.me))
  .catch(() => {});

addEventListener('geb:account', (e) => setMyPage(!!e.detail));
