# `site/` — the Deephold landing page

Static. No build step, no framework, no dependencies. Three files and a media
folder; open `index.html` through any static server and it works.

```sh
# from the repo root
python -m http.server 8099 --directory site --bind 127.0.0.1
# http://127.0.0.1:8099/
```

Use a *threaded* server if you have one. The stock single-threaded
`http.server` stalls when several `<video>` elements request byte ranges at
once, and the page then renders with clips missing, which looks like broken
files rather than a busy server.

## What it is selling

One argument, in this order: *idle games left you alone → other players run the
market → here are those players, by name → here is what you actually do → it
still runs while you are gone.* The status section near the bottom is
deliberate. This audience has been burned by roadmaps, and saying plainly what
is not built yet buys more trust than another feature bullet.

Nine sections: hero, item strip, the three-things ledger, trade, people, the
bento, the rail, status, close. `Install` and `Wishlist on Steam` appear in the
nav, the hero, the trade section, the close and the footer.

## Three rules the layout follows

**No card containers.** Bordered rounded boxes in a grid are the house style of
every generated landing page, and the page reads as one even when the content
is good. Hierarchy comes from type scale, hairlines and negative space instead:
a numbered ledger, a scroll rail, two columns of prose. If you add a section,
do not reach for a `.card`; there are none left to copy.

**No section-header split.** Big headline on the left with a small paragraph
floating off to the right aligns to nothing and is the other tell. Stack it.

**Frame each clip on its subject, and never upscale it.** A clip is captured
at 1280x800 and shown in a 590-1180px column. Scaled into 590px, 14px game text
renders at 6.4px, which is not text any more, it is texture — the footage
existed to prove the game is real and nobody could read it. A third of every
frame was also the same left sidebar, so nine clips down the page read as one
dark rectangle repeated nine times.

So every clip is cropped to what it is actually about, in the source viewport's
pixels, and keeps whatever shape that subject has. The boxes are in
`apps/web/e2e/site-media-frames.mjs`; the ratios run from 1.10 to 4.07 and that
spread is what gives the page its rhythm.

The markup carries each clip's `width`/`height`, and the CSS is `width: auto;
max-width: 100%`. A clip therefore draws at its captured size and only ever
scales DOWN, on a narrow screen. Blowing a 656px panel up to fill a 1180px
column would undo the crop: large and soft instead of small and sharp.

Those same attributes reserve the box (see **Weight**), so there is no CLS.

## The media is real

Every clip and still is the actual client, captured from the production build.
Nothing is a mockup. The leaderboard, friends, guild and chat clips show real
seeded players with real XP, real presence and real messages, because "you are
not alone" is the whole pitch and it has to be shown rather than claimed.

Regenerate after any UI change — the point is that the page shows the game as
it currently is:

```sh
# 1. API + a built client
cd apps/api && pnpm dev                       # :8787, DEV_GRANT=1, PGLITE_DIR set
cd apps/web && npx vite build && npx vite preview --port 5299 --strictPort

# 2. the account, the market and the people that get filmed
node apps/web/e2e/seed-showcase-account.mjs   # believable veteran, not the dev faucet
node apps/web/e2e/seed-showcase-gear.mjs      # armour, so "gear you can see" is true
node apps/web/e2e/seed-showcase-passives.mjs  # a tree somebody has actually walked
node apps/web/e2e/seed-showcase-market.mjs    # two-sided books from a pool of sellers
node apps/web/e2e/seed-showcase-social.mjs    # friends, a guild, a roster, a treasury

# 3. in a SECOND terminal, put those people online and talking
node apps/web/e2e/hold-showcase-presence.mjs  # leave running for the whole capture

# 4. capture, then frame
node apps/web/e2e/capture-site-media.mjs      # → site/media/{clips,shots}
node apps/web/e2e/reframe-site-clips.mjs      # crop each clip to its subject

# re-shoot part of the set instead of all of it
SITE_MEDIA_ONLY=friends,guild,chat node apps/web/e2e/capture-site-media.mjs
node apps/web/e2e/reframe-site-clips.mjs --disk friends guild chat
```

`reframe-site-clips.mjs` sources each clip from **git HEAD**, not from disk, so
adjusting a frame by ten pixels and re-running does not stack a second
generation of VP9 loss. Straight after a re-shoot the new capture is on disk and
the committed one is the old framing, which is what `--disk` is for. Posters are
re-extracted from the cropped clip, so a poster can never again show a wider
scene than the video behind it.

Flags: `SITE_MEDIA_ONLY` (comma list of clip/still names), `SITE_MEDIA_NO_START=1`,
`SITE_MEDIA_HEADED=1`, `SITE_MEDIA_OUT`, `SITE_MEDIA_EMAIL` / `SITE_MEDIA_PASSWORD`.

### Why each seed script exists

`seed-showcase-account.mjs` builds a believable veteran. The `test` account has
1.1M items, every stack at 10,000 and a billion gold, which photographs as a
cheat menu rather than as a game.

`seed-showcase-market.mjs` needs AGED accounts: an order is refused for the
first five minutes of an account's life and until total level 12. Both are
anti-RMT rules working correctly. Re-run it after the pool has aged and it tops
the books up as order-cap slots free (8 per account).

`seed-showcase-gear.mjs` exists because the equipment clip was filmed on a
character wearing tools and nothing else, so six slots read "Empty" under a
caption that says "gear you can see". Gear is INSTANCED, not stacked, and that
distinction is the whole trick: `/v1/dev/grant` takes equippables under
`items`, not `stacks`. Passing them as stacks returns **200** with every key in
`skipped`, which looks like success until you read the response body.

`seed-showcase-social.mjs` exists because the People section claims "277 of
them, by name" and the two panels under that headline were filming "No friends
yet" and "You are not in a guild". Idempotent.

`hold-showcase-presence.mjs` exists because presence and chat are not database
rows. A player is online iff they hold an open WebSocket, so a seeded friends
list is still seven grey dots reading `0 / 7 online`; and chat history is
short-lived, so a clip captioned "the hold is loud" was filming silence. It
opens a socket per player, reports an activity so each reads `online` rather
than `away`, and plays a conversation across global, trade and guild on a loop.
Kill it and everyone goes offline again, which is correct rather than a leak.

### Gotchas that cost a re-shoot

**Check there is only ONE API on 8787.** Two dev servers can hold that port at
once on Windows — one bound to `[::]` and one to `127.0.0.1` — and they are
different processes with different databases. PowerShell resolves `localhost`
to `::1` and a browser resolves it to `127.0.0.1`, so the seed scripts and the
capture can talk to *different games*: the seeds report success, the client
shows "The hold is temporarily unreachable", and the leaderboard that had 277
players has five. `Get-NetTCPConnection -LocalPort 8787 -State Listen` lists
every owner; kill the extra one and pass `E2E_API_URL=http://127.0.0.1:8787`.

`SITE_MEDIA_NO_START=1` skips the "start an action" step. Needed for the queue
clip specifically: starting an action replaces the active one and drops the
queue with it, so the shot came back reading `Queue 0/30`, the one number the
section exists to show. Build the queue first, then capture with that flag.

Login is rate-limited to 10/min/IP and the seed scripts use one per account, so
a capture started straight after them used to die on a 429. The capture script
and the seeds all back off and retry now.

Widgets below the fold need scrolling into frame before they are filmed. The
tree clip spent its whole run panning a map that was off-camera, under a
caption about spending points.

**Combat lives at `#/game/venture/zones`, and there is no `dungeons` view at
all** — `GAME_HUB_VIEWS.venture` is bestiary / collection / achievements /
zones / expeditions / breach. Asking for a view that does not exist does not
error; the router silently lands back on the Hold, so the clip comes back as a
nine-second film of the home screen. The button that starts a fight reads
**"Fight here"**, one per zone card; an exact `/^fight$/` matches nothing and
you get a film of the menu instead.

ffmpeg is spawned with one retry. On Windows a spawn immediately after
Playwright closes a browser can fail with `errno -4094 UNKNOWN` before ffmpeg
starts, with the binary on PATH and the same command working a moment later.
Losing to it costs a whole re-capture, because the destination has already been
deleted by then.

Posters are converted to WebP inside `still()`. Do not add a hand-run ffmpeg
step for it; the page references `.webp` and a forgotten conversion leaves the
poster 404ing.

The page uses eleven clips and eleven posters, named alike: `hero`, `combat`,
`trade`, `leaderboard`, `friends`, `guild`, `queue`, `items`, `character`,
`chat`, `tree`. **There are no still pictures on the page at all** — every
image file is either one of those posters or a 96px item icon in the moving
strip. The folder holds exactly those and nothing else — alternate takes under other names
(`market`, `skilling`, `hold`, `items-hover`) were deleted once the posters
were renamed to match their clips, and git still has them if a layout ever
wants one back.

Item icons in `media/icons/` are **all 239 of them**, copied from
`apps/web/public/assets/items/` and resized to 96px WebP (549 KB for the set).
`manifest.json` beside them is what `main.js` reads to build the two marquee
rows; regenerate it after adding icons or the new ones are invisible. The page
claims "240+ items", so the strip shows the actual set rather than a sample of
thirty, and the images are `loading="lazy"` so only the rows near the viewport
are ever fetched.

## Weight

**406 KB on first load. 1.6 MB if you scroll the whole page.** Cropping the
clips to their subjects removed about 60% of their pixels, which halved the
video weight (2.4 MB -> 1.0 MB) while making them legible.

Three things have to stay true for that to hold, and each one silently undoes
the saving on its own:

- **No `autoplay` on the clips.** A browser cannot honour both `autoplay` and
  `preload="none"`, so it honours autoplay and fetches all nine immediately.
  The markup still looks correct and the page still pulls 2.8 MB before the
  first scroll. `main.js` starts playback instead.
- **No `poster` attribute in the markup** — use `data-poster`. A `poster`
  attribute is fetched as soon as the element renders whatever `preload` says,
  and nine of them is more than the hero art.
- **`width` and `height` attributes on every `<video>`.** With the poster
  deferred, a `<video>` has no intrinsic size and renders at 300x150, so the
  page grows under the reader as each clip lands. The attributes reserve the
  box and keep cumulative layout shift at ~0.01. They are printed by
  `reframe-site-clips.mjs`; if you change a frame, update the markup.

Clips are VP9, crf 34 on capture and 32 on the crop, 72–189 KB each with their
boot trimmed off; posters are WebP at q82. If you add media, keep that budget.
A landing page for an idle game that takes four seconds to paint argues against
itself.

## Motion

All of it is transform/opacity, so none of it costs layout. Custom ease-out
(`cubic-bezier(0.23, 1, 0.32, 1)`), nothing over 300ms except the deliberately
slow pieces (headline wipe, marquee, embers). Hover effects are behind
`(hover: hover) and (pointer: fine)` so a tap never triggers one. Everything is
off, not degraded, under `prefers-reduced-motion`.

One trap worth knowing: scroll reveals are driven by an IntersectionObserver
against the VIEWPORT, so anything inside a horizontal scroller is never seen.
The rail's items used to carry `.reveal` each, and the four parked off the
right edge sat at opacity 0 permanently. The rail carries the trigger now and
its children stagger off it.

## Before it goes public

- `main.js` reads `data-play-url` / `data-steam-url` off `<html>`. Until the
  client URL exists every Install button is **Join the waitlist** and points
  at the form; until the Steam page exists the Wishlist buttons are hidden.
  Set the two attributes when the URLs exist and everything comes back on
  its own, including the generated pages (rebuild them).
- **The waitlist** (`#waitlist` on the landing, `/waitlist/` for links from
  outside) is `waitlist.js` + the `.wl-*` block in `styles.css`. It POSTs
  `email`, `source` and a honeypot as `application/x-www-form-urlencoded` to
  `data-waitlist-url` on `<html>`. **The endpoint is the game API**:
  `POST /v1/waitlist` (`apps/api/src/routes/waitlist.ts`, table
  `waitlist_signups`, migration 0071). It answers with
  `Access-Control-Allow-Origin: *` itself, so the site's origin does not need
  to be in the API's `CORS_ORIGINS`; it is rate-limited per IP, idempotent per
  address, drops honeypot posts, and stores the lower-cased address plus the
  `source` tag — nothing else. Point the form at it with
  `node tools/site/set-origin.mjs https://your.domain --api https://api.your.domain`
  (then rebuild the pages). Staff pull the list with a game login:
  `GET /v1/waitlist/export?format=csv` (`include=all` adds unsubscribed rows);
  every row carries a `leave_token`, and `GET /v1/waitlist/leave/<token>` is
  the one-click unsubscribe link for the launch mail. (Any endpoint that takes
  a form post would also work — `tools/site/waitlist-worker.mjs` is a
  stand-alone Cloudflare Worker alternative for a static-only deploy.)
  Until an endpoint is set the form hands over to the
  visitor's mail app via `data-waitlist-mail` (real only after `set-origin`,
  because the placeholder host has no dot). `check-site --release` fails a
  pre-launch site whose form has nowhere to post. Once `data-play-url` is set
  the form folds away everywhere and `/waitlist/` shows the install block.
- **Three head values need the real origin** and a crawler never runs the
  page's JavaScript, so they have to be edited by hand: `canonical`, `og:url`,
  and absolute `og:image` / `twitter:image`. There is a comment in `<head>`
  marking the spot. Twitter rejects relative image URLs outright.
- There is no `media/art/`. The hero backdrop used to be a generated painting
  and is now `hero.webm`: the 3D fight stage, captured at 1080p, framed on the
  stage alone at 2:1 so no panel or sidebar creeps in from the edges, and
  encoded at crf 42 because it sits under a veil where artefacts do not show.
  It is the only clip that loads eagerly, behind a 17 KB poster — the painting
  it replaced was 266 KB, so the first paint got *lighter*.

### Legibility is a measurement, not a feeling

`scratchpad` has a `legibility.mjs` shape worth keeping: for each clip, divide
the rendered width by the `width` attribute and multiply the game's own 14px UI
text by it. Under about **9px** the glyphs stop resolving.

That measurement is what caught the pairs. Two clips side by side put a ~950px
crop in a 599px column — 0.63, or 8.7px text — so three of the ten clips were
below the floor **on desktop**, the widest viewport, while the tablet layout
that stacks them was fine. Cropping them tighter does not survive the content:
a friends row IS the full width. They stack now and draw at 1.00.

Desktop and tablet are at zero below the floor. **A phone cannot be**: the
widest clip draws at 350px, a scale of 0.36. So on a coarse pointer every clip
is tappable and goes fullscreen, where it gets the whole display in landscape.
Nothing is wired on a desktop, where a click that swallowed the page would be a
surprise.

### Known, not fixed
*(The sparse passive tree is fixed: `seed-showcase-passives.mjs` walks 18
points outward across all three roots before capture, so the map reads as one
somebody has walked and the counter still shows points banked. Allocation is
one call per point and the tree enforces connectivity, so it cannot pick nodes
off a list; and the body key is `nodeKey`, not `key` — the wrong name returns
422 `error.generic`, which looks like the node refusing rather than the request
being malformed.)*


## Generated pages (P85)

- `tools/site/build-pages.ts` writes `patch-notes/` (+ `feed.xml`), `press/`, `legal/privacy/`, `legal/terms/`, `waitlist/`, `404.html`, `sitemap.xml` and `robots.txt`. Re-run it after every content release: the patch notes come from the game's content pack. It reads the launch attributes and the `styles.css?v=` / `waitlist.js?v=` versions off `index.html`, so bump them there only.
  `node node_modules/.pnpm/tsx@4.23.0/node_modules/tsx/dist/cli.mjs tools/site/build-pages.ts` (repo root)
- Press assets live in `press/shots` and `press/art` (copied from `_release/steam`); `press/deephold-press-kit.zip` bundles them.
- Owner values (domain, legal name, jurisdiction, e-mails) are in `tools/site/site-shared.ts`. When the domain is known: `node tools/site/set-origin.mjs https://your.domain --api https://api.your.domain` (the `--api` part points the waitlist form at the game API), fill the legal name and jurisdiction by hand, then rebuild the guides and the pages.
- `node tools/site/check-site.mjs` checks every local link, image and alt text; add `--release` before an upload to also fail on any `YOUR-*` placeholder, and on a site that is neither open (Install + Steam set) nor has a waitlist endpoint.
- `404.html` uses root-absolute links, so the site must be served from the domain root (Cloudflare Pages / Netlify pick up `404.html` automatically).
