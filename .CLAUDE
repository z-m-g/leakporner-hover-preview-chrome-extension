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

2) bysezoxexe
- Embed examples: https://bysezoxexe.com/e/f95h8ope2trt
- ID: f95h8ope2trt
- Preview sprite URL: https://img-place.com/<id>_xt.jpg
- Grid: 4 x 4 (16 frames)

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

5) short.icu
- Embed examples: https://short.icu/4of3bRPkZ
- ID: 4of3bRPkZ
- Preview sprite URL: https://img.freeimagecdn.net/image/<id>/0.jpg
- Grid: 6 x 5 (30 frames)

6) k.upns.live
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
    - For lulustream/bysezoxexe/cdnstream: path contains /e/<id>
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

CURRENT IMPLEMENTATION STATUS (v1.0.4)

Files created:
- manifest.json (MV3 with service worker)
- background.js (service worker for CORS-free fetching)
- contentScript.js (main trickplay logic)
- contentStyles.css (overlay styling)
- README.md (installation instructions)

ARCHITECTURE:
Due to CORS restrictions when fetching detail pages from subdomains (e.g., w10.leakporner.com from leakporner.com), the extension uses a service worker (background.js) to perform cross-origin fetches. The content script sends messages to the background script which performs the fetch and returns the HTML.

Message flow:
1. contentScript.js detects hover on article
2. contentScript.js sends {type: 'fetch', url} to background.js via chrome.runtime.sendMessage
3. background.js fetches the URL (bypasses CORS due to host_permissions)
4. background.js returns {success: true, html} or {success: false, error}
5. contentScript.js parses HTML and extracts sprite info

FEATURES:
- Time progress indicator: Shows current position and total duration (e.g., "3:25 / 7:50")
  - Extracts duration from `.post-thumbnail .duration` element
  - Supports MM:SS and HH:MM:SS formats
  - Updates in real-time as user moves mouse

- Portrait/aspect ratio handling:
  - For cdnstream/cdnvids: the 10x10 sprite is stretched/deformed
  - Uses the _xt.jpg preview (2x2 grid) to get correct aspect ratio
  - Calculates frame ratio from preview, applies to main sprite display
  - For other providers: uses sprite directly to calculate ratio
  - Portrait videos display centered with black bars on sides
  - Landscape videos in portrait containers are also handled correctly

SUPPORTED PROVIDERS:
- cdnstream (10x10 = 100 frames) - highest priority
  - Sprite: pixoraa.cc/<id>0000.jpg (deformed)
  - Preview for ratio: pixoraa.cc/<id>_xt.jpg (2x2, correct ratio)
- cdnvids (10x10 = 100 frames) - highest priority
  - Sprite: pixibay.cc/<id>0000.jpg (deformed)
  - Preview for ratio: pixibay.cc/<id>_xt.jpg (2x2, correct ratio)
- short.icu (6x5 = 30 frames) - medium priority
- lulustream (4x4 = 16 frames) - lower priority
- bysezoxexe (4x4 = 16 frames) - lower priority
- k.upns.live - NOT SUPPORTED (no known sprite URL pattern)