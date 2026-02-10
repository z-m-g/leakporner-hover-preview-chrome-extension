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
- **Progressive Loading**: Shows preview quickly with low-res sprite, upgrades to better quality
- **Time Indicator**: Shows current position and total duration (e.g., "3:25 / 7:50")
- **Portrait Support**: Correctly displays portrait videos centered with black bars
- **Caching**: Detail page results are cached in memory to avoid repeated fetches
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

| Provider | Grid | Frames | Priority |
|----------|------|--------|----------|
| cdnstream | 10x10 | 100 | Highest |
| cdnvids | 10x10 | 100 | Highest |
| short.icu | 6x5 | 30 | Medium |
| lulustream | 4x4 | 16 | Lower |
| bysezoxexe | 4x4 | 16 | Lower |

The extension automatically selects the provider with the most frames for the best preview experience.

## Files

- `manifest.json` - Extension configuration (Manifest V3)
- `background.js` - Service worker for cross-origin fetches
- `contentScript.js` - Main logic for sprite extraction and trickplay
- `contentStyles.css` - Overlay styling
- `popup.html` - Settings popup UI
- `popup.js` - Settings popup logic

## Release

Releases are fully automated via GitHub Actions:

1. Update the version in `manifest.json`
2. Push to `main`
3. A new GitHub Release with the `.zip` is created automatically

## License

[Unlicense](LICENSE) - Public Domain
