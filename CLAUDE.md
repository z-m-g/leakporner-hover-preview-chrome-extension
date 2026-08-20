You are Claude Code. Build a Chrome Extension (Manifest V3) that adds "trickplay" video preview on hover for thumbnails on leakporner.com and any subdomain or domain ending with leakporner.com.

GOAL
When the user hovers a video card on leakporner pages, show a preview that updates as the mouse moves horizontally over the card, using a sprite-sheet (contact sheet) image extracted from the video's embed providers. The preview should feel like YouTube hover scrub: move cursor left/right to jump across frames.

TARGET SITE(S)
- Match: https://leakporner.com/* and https://*.leakporner.com/*
- On pages containing: `.videos-list > article` elements.

HOVER TARGET
For each `.videos-list > article`:
- Get the first <a> inside the article, take its href as the detail page URL.
- On hover, fetch the detail page HTML (same-origin). Parse it.
- Find all `span.change-video` elements and read their `data-embed` attribute.
- Each `data-embed` is an embed URL. From each embed URL, extract an ID and derive a preview sprite URL using provider-specific rules below.

PROVIDER -> PREVIEW SPRITE RULES
From a data-embed URL, extract the provider and the ID:

1) lulustream
- Embed examples: https://lulustream.com/e/sue812j2tlpv
- ID: sue812j2tlpv
- Preview sprite URL: https://img.lulucdn.com/<id>_xt.jpg
- Grid: 4 x 4 (16 frames)

2) bysezoxexe - DO NOT SUPPORT
- Embed examples: https://bysezoxexe.com/e/f95h8ope2trt
- Sprites would come from img-place.com, but that host added anti-bot
  protection that blocks the requests. Never load images from img-place.com
  and do not re-add this provider.

3) cdnstream
- Embed examples: https://cdnstream.top/e/uc1i1srhtpbo
- ID: uc1i1srhtpbo
- Preview sprite URL: https://pixoraa.cc/<id>0000.jpg
- Grid: 10 x 10 (100 frames)

4) cdnvids
- Embed examples: https://cdnvids.top/embed/a0ekqmkdx8xa
- ID: a0ekqmkdx8xa
- Preview sprite URL: https://pixibay.cc/<id>0000.jpg
- Grid: 10 x 10 (100 frames)

5) morencius (mirror of cdnvids)
- Embed examples: https://morencius.com/embed/nijf07xzhvci
- ID: nijf07xzhvci
- Preview sprite URL: https://pixibay.cc/<id>0000.jpg (same host as cdnvids)
- Grid: 10 x 10 (100 frames)

6) hgcloud
- Embed examples: https://hgcloud.to/e/lmydi3gz4ski
- ID: lmydi3gz4ski
- Preview sprite URL: https://huntrexus.com/<id>0000.jpg
- Grid: 10 x 10 (100 frames)

7) short.icu
- Embed examples: https://short.icu/4of3bRPkZ
- ID: 4of3bRPkZ
- Preview sprite URL: https://img.freeimagecdn.net/image/<id>/0.jpg
- Grid: 6 x 5 (30 frames)

8) k.upns.live
- Embed example: https://k.upns.live/#biy6de
- ID: biy6de
- NOTE: no preview image pattern provided; ignore this provider unless you can confidently derive a sprite URL from the same pattern as others (otherwise skip).

CHOOSING THE BEST SPRITE
A detail page may contain multiple `span.change-video[data-embed]` with different providers.
- Build candidate sprites for all known providers.
- Choose the candidate with the largest number of frames (grid cells). (Prefer 10x10 over 6x5 over 4x4.)
- If multiple candidates have the same frame count, pick the first encountered.

TRICKPLAY BEHAVIOR
When user hovers an article:
- Show an overlay preview inside the article card (default), positioned over the existing thumbnail area.
- The overlay is a div that uses the sprite image as background.
- The overlay acts like a "viewport" showing exactly one frame at a time using CSS background-position and background-size.
- As the mouse moves within the article horizontally, compute progress = clamp((mouseX - left)/width, 0..1).
- Map progress to a frame index: idx = floor(progress * (framesCount-1)).
- Convert idx to (row, col) based on grid columns.
- Set background-position so the viewport displays that cell.

SPRITE SIZING / VIEWPORT
- The viewport size should match the existing thumbnail's displayed size if possible:
  - Find an <img> inside the article (or a thumbnail container), get its rendered box (getBoundingClientRect).
  - Create overlay viewport div with same width/height and absolute positioning to cover the thumbnail.
- Set background-size to (cols*100% , rows*100%) so each cell maps cleanly to the viewport.
- background-position should be computed in percent:
  - xPercent = (col/(cols-1))*100 (if cols>1 else 0)
  - yPercent = (row/(rows-1))*100 (if rows>1 else 0)
  - Use background-position: `${xPercent}% ${yPercent}%`
(Alternative acceptable: use pixel math with natural image size after load; but percent approach is preferred to avoid needing image dimensions.)

EVENTS
- On mouseenter over `.videos-list > article`: start loading sprite for that article (if not cached), create overlay, show a loading state (optional).
- On mousemove: update frame via background-position.
- On mouseleave: remove/hide overlay and cleanup listeners.

PERFORMANCE REQUIREMENTS
- Avoid fetching detail pages repeatedly:
  - Cache per detail-page URL: store chosen sprite URL + grid info.
  - Use an in-memory Map for the session.
- Avoid excessive DOM listeners:
  - Use event delegation: attach listeners once to the container and detect closest article.
- Throttle mousemove updates with requestAnimationFrame.

ROBUSTNESS
- If fetch fails, HTML parse fails, or no supported embeds found: do nothing (no overlay).
- Ensure it works on infinite scroll / dynamic content:
  - Use event delegation and/or MutationObserver to ensure new articles are handled without re-binding many listeners.
- Prevent layout shifts:
  - Overlay should be absolutely positioned and pointer-events:none so it doesn't block clicks/hover.
- Respect CSP:
  - Load sprite images as normal <div background-image> from allowed hosts. If blocked, fail gracefully.

EXTENSION REQUIREMENTS (MV3)
Deliver a complete working extension with:
- manifest.json (MV3)
- content script injected on matching leakporner domains
- minimal CSS for overlay
- No external libraries.

PERMISSIONS
- Use the minimum necessary.
- You will need host_permissions for:
  - https://leakporner.com/*
  - https://*.leakporner.com/*
- If cross-origin image loads need permissions, add them only if required by MV3 (generally images load without host permissions, but keep minimal; no webRequest).
- For fetching detail pages, it's same-origin, so no extra permissions beyond matches.

FILES / OUTPUT
Provide:
1) Full source code for:
- manifest.json
- contentScript.js
- contentStyles.css (or inject CSS via JS, but prefer separate CSS)
2) A concise README.md:
- How to load unpacked extension
- What it does
- Notes about caching and supported providers

IMPLEMENTATION DETAILS
- Parsing HTML: use DOMParser on fetched text.
- Extract first <a> href inside article; if relative, resolve with location.origin.
- Candidate extraction:
  - querySelectorAll('span.change-video[data-embed]')
  - For each, parse URL:
    - For lulustream/cdnstream/hgcloud: path contains /e/<id>
    - For cdnvids: path contains /embed/<id>
    - For short.icu: path is /<id>
    - For upns: hash contains #<id> (ignore for now)
- Choose best candidate by frame count.
- Create overlay:
  - Find best target box inside article:
    - Prefer: article.querySelector('img') then use its parent as positioning context
    - If not found, use article itself
  - Ensure container is position:relative.
  - Overlay div: class `lp-trickplay-overlay`
  - Set style backgroundImage = `url(spriteUrl)`
  - Set backgroundRepeat:no-repeat; backgroundSize: `${cols*100}% ${rows*100}%`
  - Initialize at frame 0.
- Update on move with rAF.

EDGE CASES
- Articles reused/re-rendered: ensure overlay is removed cleanly.
- If user moves quickly between articles, abort prior fetch using AbortController.

---

CURRENT IMPLEMENTATION STATUS (v1.2.1)

Files created:
- manifest.json (MV3 with service worker)
- background.js (service worker for CORS-free fetching)
- contentScript.js (main trickplay logic)
- contentStyles.css (overlay styling)
- popup.html / popup.js (max-frames setting)
- README.md (installation instructions)

ARCHITECTURE:
Due to CORS restrictions when fetching detail pages from subdomains (e.g.,
w10.leakporner.com from leakporner.com), the extension uses a service worker
(background.js) to perform cross-origin fetches. The content script sends
messages to the background script which performs the fetch and returns the HTML.

Message flow:
1. contentScript.js detects hover on article
2. contentScript.js sends {type: 'fetch', url} to background.js
3. background.js fetches the URL (bypasses CORS due to host_permissions)
4. background.js returns {success: true, html} or {success: false, error}
5. contentScript.js parses HTML and extracts sprite info

SPRITE SELECTION:
All candidates are probed concurrently (sprite image + ratio reference). The
first usable one is displayed immediately and replaced whenever a sprite with
more frames finishes loading. Probe results are cached per sprite URL, so a
host that is down is never retried during the session. Every image load is
capped by IMAGE_TIMEOUT_MS so an unresponsive host cannot stall the hover.

PLACEHOLDER SPRITES:
pixibay.cc / huntrexus.com answer with a generic 320x240 image (instead of a
404) when a sprite was never generated for that id. A real 10x10 sheet is
2000x1120 (200x112 cells). Sprites are therefore rejected when a cell would be
smaller than MIN_FRAME_WIDTH x MIN_FRAME_HEIGHT (48x27), which discards the
placeholder without hardcoding its exact size.

FEATURES:
- Time progress indicator: Shows current position and total duration (e.g., "3:25 / 7:50")
  - Extracts duration from `.post-thumbnail .duration` element
  - Supports MM:SS and HH:MM:SS formats
  - Updates in real-time as user moves mouse

- Portrait/aspect ratio handling:
  - For the 10x10 providers the sprite is stretched: the sheet is 2000x1120 even
    for portrait videos
  - Uses the _xt.jpg preview to get the correct aspect ratio (its own grid is
    square, so only its width/height ratio matters)
  - Portrait videos display centered with black bars on sides
  - Landscape videos in portrait containers are also handled correctly

SUPPORTED PROVIDERS:
- cdnstream (10x10 = 100 frames) - highest priority
  - Embed host: cdnstream.top/e/<id>
  - Sprite: pixoraa.cc/<id>0000.jpg (deformed)
  - Preview for ratio: pixoraa.cc/<id>_xt.jpg
- cdnvids (10x10 = 100 frames) - highest priority
  - Embed host: cdnvids.top/embed/<id>
  - Sprite: pixibay.cc/<id>0000.jpg (deformed)
  - Preview for ratio: pixibay.cc/<id>_xt.jpg
- morencius (10x10 = 100 frames) - highest priority
  - Embed host: morencius.com/embed/<id> (mirror of cdnvids, same IDs)
  - Sprite: pixibay.cc/<id>0000.jpg (deformed)
  - Preview for ratio: pixibay.cc/<id>_xt.jpg
  - Grid confirmed from the player's own thumbnail VTT: 100 cues of 200x112
- hgcloud (10x10 = 100 frames) - highest priority
  - Embed host: hgcloud.to/e/<id>
  - Sprite: huntrexus.com/<id>0000.jpg (deformed, 2000x1120)
  - Preview for ratio: huntrexus.com/<id>_xt.jpg - VERIFIED
- short.icu (6x5 = 30 frames) - medium priority
  - Sprite: img.freeimagecdn.net/image/<id>/0.jpg
  - WARNING: that host is behind a Cloudflare referer rule (see NOT SUPPORTED),
    so in practice these requests are answered with 403 from a leakporner page.
- lulustream (4x4 = 16 frames) - lower priority
  - Embed hosts: lulustream.com/e/<id> AND luluvids.top/e/<id>
    The service moved to luluvids.top; pages still mix both hostnames.
  - Sprite: img.lulucdn.com/<id>_xt.jpg, not deformed (1200px on the long side)

- abyssplayer (6x5 = 30 frames) - LAST RESORT, only probed when everything else
  came up empty (see lastResort in PROVIDERS)
  - Embed host: abyssplayer.com/<id>. ids contain '-' and '_', so the pattern must
    be [A-Za-z0-9_-]+ ; [a-zA-Z0-9]+ silently truncates them.
  - Sprite: img.freeimagecdn.net/image/<id>/0.jpg, same backend as short.icu
  - Measured on the reference page: of the 10 articles whose ONLY embed is
    abyssplayer, 10/10 sprites are 404. Only 3 of 7 sampled ids that also have
    another provider have one, and those are already covered at 100 frames. It is
    supported purely so a video that has nothing else still gets a chance.
  - Do NOT try to inspect abyssplayer.com/<id> as a top-level page: it redirects to
    the abyss.to homepage (whose demo player is K8R6OOjS7 - not the video), with or
    without a Referer. It only serves the real player inside an iframe.

REFERER GATE (rules.json):
img.freeimagecdn.net sits behind Cloudflare with a referer rule. Measured with
curl from an outside host:
  Referer abyssplayer.com or player.abyssplayer.com -> 200
  no Referer, short.icu, or leakporner                -> 403
A content script can only send the page's own referer, so rules.json uses
declarativeNetRequest to set Referer: https://abyssplayer.com/ on image requests
to that host initiated from leakporner. Without this rule BOTH short.icu and
abyssplayer are permanently dead. This is why the manifest needs
declarativeNetRequestWithHostAccess plus host access to img.freeimagecdn.net.

UNAVAILABLE OVERLAY:
When no provider yields a frame, a message overlay replaces the preview. It is
only shown when the page itself points at a dead video: hasPlayers && embedCount
=== 0 (every player tab shipped empty), or candidates.length (real sources whose
sprites are gone). When the page only lists providers we cannot read, stay
silent - that says nothing about the video.

NOT SUPPORTED:
- bysezoxexe - img-place.com blocks bots; never load from it
- k.upns.live - no known sprite URL pattern

KNOWN COVERAGE LIMITS:
Some detail pages ship `span.change-video` elements with an empty `data-embed`,
so they carry no video source at all. Some ids also have no sprite on the CDN
(404 or placeholder). Both cases correctly produce no overlay.
