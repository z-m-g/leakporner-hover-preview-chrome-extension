# LeakPorner Trickplay Preview

Chrome Extension (Manifest V3) that adds video preview on hover for thumbnails on leakporner.com, similar to YouTube's hover scrub feature.

## Installation

### Option 1: Download ZIP (Easiest)

1. Download the latest `.zip` from [Releases](../../releases)
2. Extract the ZIP to a folder
3. Open Chrome and go to `chrome://extensions/`
4. Enable **Developer mode** (toggle in the top-right corner)
5. Click **Load unpacked**
6. Select the extracted folder
7. Done! The extension is now active on leakporner.com

### Option 2: Clone Repository

```bash
git clone https://github.com/z-m-g/leakporner-hover-preview-chrome-extension.git
```

Then follow steps 3-7 from Option 1.

## How It Works

When you hover over a video thumbnail on leakporner.com:

1. The extension fetches the video's detail page
2. Extracts embed URLs from available video sources
3. Determines the best sprite sheet based on frame count
4. Displays an overlay that shows preview frames
5. Moving your mouse left/right scrubs through the video preview

## Features

- **Up to 100 Frame Preview**: Smooth scrubbing with cdnstream/cdnvids providers
- **Configurable Frame Count**: Adjust max frames via extension popup (10-100)
- **Progressive Loading**: Every provider is probed in parallel; the first sprite to answer shows immediately and is upgraded when a richer one arrives
- **Time Indicator**: Shows current position and total duration (e.g., "3:25 / 7:50")
- **Portrait Support**: Correctly displays portrait videos centered with black bars
- **Caching**: Detail pages and sprite probe results are cached in memory, so a dead host is never retried
- **Infinite Scroll**: Works with dynamically loaded content
- **Performance**: Frame updates are throttled using requestAnimationFrame

## Settings

Click the extension icon in your browser toolbar to open the settings popup.

**Max frames in preview** (slider: 10-100)
- Controls how many frames are used when scrubbing
- Lower values = faster loading, less bandwidth
- Higher values = smoother scrubbing experience
- The extension won't load sprites with more frames than needed

## Supported Providers

| Provider | Embed host(s) | Grid | Frames | Priority |
|----------|---------------|------|--------|----------|
| cdnstream | `cdnstream.top` | 10x10 | 100 | Highest |
| cdnvids | `cdnvids.top` | 10x10 | 100 | Highest |
| morencius | `morencius.com` | 10x10 | 100 | Highest |
| hgcloud | `hgcloud.to` | 10x10 | 100 | Highest |
| short.icu | `short.icu` | 6x5 | 30 | Medium |
| lulustream | `lulustream.com`, `luluvids.top` | 4x4 | 16 | Lower |
| abyssplayer | `abyssplayer.com` | 6x5 | 30 | Last resort |

Every candidate is probed at once and the richest sprite that actually loads is
shown, so a provider that is slow or down no longer costs you the preview.

`abyssplayer` is the most common embed on the site but very rarely has a sprite,
so it is only requested once every other provider has come up empty. It shares
short.icu's image host, `img.freeimagecdn.net`, which only serves images to
requests refered from an abyssplayer host; `rules.json` sets that header for
these requests, which is why the extension asks for `declarativeNetRequest`.

### Unsupported providers

- `bysezoxexe` (sprites on `img-place.com`): that host added anti-bot protection
  that blocks the requests.
- `k.upns.live`: no known sprite URL pattern.

Videos whose only embeds are unsupported simply show no preview, as do videos the
site publishes with empty `data-embed` attributes.

### Missing sprites

A provider may list a video it never generated a sprite for. Those URLs either
404 or return a generic 320x240 placeholder; the placeholder is detected by its
cell size and rejected, so it never renders as a garbled preview.

When no provider yields a single frame, the overlay reads **"No preview
available - this video has probably been removed"**. It is only shown when the
detail page itself points at a dead video: either every player tab is empty, or
the sources it lists have lost their sprites. If the page only carries providers
the extension cannot read, it stays silent rather than blaming the video.

## Files

- `manifest.json` - Extension configuration (Manifest V3)
- `background.js` - Service worker for cross-origin fetches
- `contentScript.js` - Main logic for sprite extraction and trickplay
- `contentStyles.css` - Overlay styling
- `rules.json` - Referer rule for the referer-gated sprite host
- `popup.html` - Settings popup UI
- `popup.js` - Settings popup logic

## Release

Releases are fully automated via GitHub Actions:

1. Update the version in `manifest.json`
2. Push to `main`
3. A new GitHub Release with the `.zip` is created automatically

## License

[Unlicense](LICENSE) - Public Domain
