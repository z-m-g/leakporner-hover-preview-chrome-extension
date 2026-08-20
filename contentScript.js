(function() {
  'use strict';

  // Provider configurations
  const PROVIDERS = {
    lulustream: {
      // The service moved to luluvids.top; pages still mix both hostnames.
      pattern: /^https?:\/\/(?:lulustream\.com|luluvids\.top)\/e\/([a-zA-Z0-9]+)/,
      getSpriteUrl: (id) => `https://img.lulucdn.com/${id}_xt.jpg`,
      cols: 4,
      rows: 4,
      frames: 16
    },
    // bysezoxexe (img-place.com) is intentionally not supported: the host added
    // anti-bot protection that blocks these sprite requests. Do not re-add it.
    cdnstream: {
      pattern: /^https?:\/\/cdnstream\.top\/e\/([a-zA-Z0-9]+)/,
      getSpriteUrl: (id) => `https://pixoraa.cc/${id}0000.jpg`,
      // The 10x10 sprite is stretched/deformed, use _xt.jpg to get correct aspect ratio
      getPreviewUrl: (id) => `https://pixoraa.cc/${id}_xt.jpg`,
      cols: 10,
      rows: 10,
      frames: 100,
      previewCols: 2,
      previewRows: 2
    },
    cdnvids: {
      pattern: /^https?:\/\/cdnvids\.top\/embed\/([a-zA-Z0-9]+)/,
      getSpriteUrl: (id) => `https://pixibay.cc/${id}0000.jpg`,
      // The 10x10 sprite is stretched/deformed, use _xt.jpg to get correct aspect ratio
      getPreviewUrl: (id) => `https://pixibay.cc/${id}_xt.jpg`,
      cols: 10,
      rows: 10,
      frames: 100,
      previewCols: 2,
      previewRows: 2
    },
    // Mirror of cdnvids: different embed host, same IDs and same pixibay.cc sprites.
    morencius: {
      pattern: /^https?:\/\/morencius\.com\/embed\/([a-zA-Z0-9]+)/,
      getSpriteUrl: (id) => `https://pixibay.cc/${id}0000.jpg`,
      getPreviewUrl: (id) => `https://pixibay.cc/${id}_xt.jpg`,
      cols: 10,
      rows: 10,
      frames: 100,
      previewCols: 2,
      previewRows: 2
    },
    hgcloud: {
      pattern: /^https?:\/\/hgcloud\.to\/e\/([a-zA-Z0-9]+)/,
      getSpriteUrl: (id) => `https://huntrexus.com/${id}0000.jpg`,
      // Same URL scheme as cdnstream/cdnvids, so assume the same deformed 10x10
      // sprite and use _xt.jpg for the correct aspect ratio.
      getPreviewUrl: (id) => `https://huntrexus.com/${id}_xt.jpg`,
      cols: 10,
      rows: 10,
      frames: 100,
      previewCols: 2,
      previewRows: 2
    },
    // img.freeimagecdn.net is referer-gated by Cloudflare: it answers 403 unless the
    // Referer is an abyssplayer host, so rules.json rewrites that header for both
    // providers below. Without it neither of them can ever load a sprite.
    shorticu: {
      pattern: /^https?:\/\/short\.icu\/([A-Za-z0-9_-]+)/,
      getSpriteUrl: (id) => `https://img.freeimagecdn.net/image/${id}/0.jpg`,
      cols: 6,
      rows: 5,
      frames: 30
    },
    // Same image backend as short.icu, and by far the most common embed on the site.
    // Its sprites are missing far more often than they exist, so it is marked as a
    // last resort: only requested once every other provider has come up empty.
    // Note the id charset: abyssplayer ids contain '-' and '_'.
    abyssplayer: {
      pattern: /^https?:\/\/abyssplayer\.com\/([A-Za-z0-9_-]+)/,
      getSpriteUrl: (id) => `https://img.freeimagecdn.net/image/${id}/0.jpg`,
      cols: 6,
      rows: 5,
      frames: 30,
      lastResort: true
    }
  };

  // Some hosts answer a missing sprite with a generic 320x240 placeholder instead
  // of a 404. Laid out as a grid it produces a garbled preview, so sheets whose
  // cells are far too small to be real trickplay frames are rejected.
  const MIN_FRAME_WIDTH = 48;
  const MIN_FRAME_HEIGHT = 27;

  // A sprite host that never answers must not hold the hover open forever.
  const IMAGE_TIMEOUT_MS = 8000;

  // Cache for detail page sprite info: Map<detailUrl, Array of sprite candidates sorted by frames>
  const spriteCache = new Map();

  // Probe results per sprite URL, so re-hovering never retries a dead host.
  const probeCache = new Map();

  // Current hover state
  let currentArticle = null;
  let currentOverlay = null;
  let rafId = null;
  // Identifies the active hover: results from an abandoned one are discarded.
  let hoverToken = 0;

  // User settings
  let maxFrames = 100;

  // Load user settings
  chrome.storage.sync.get({ maxFrames: 100 }, (data) => {
    maxFrames = data.maxFrames;
  });

  // Listen for setting changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.maxFrames) {
      maxFrames = changes.maxFrames.newValue;
    }
  });

  /**
   * Parse embed URL and return sprite info if provider is supported
   */
  function parseEmbedUrl(embedUrl) {
    for (const [providerName, config] of Object.entries(PROVIDERS)) {
      const match = embedUrl.match(config.pattern);
      if (match && match[1]) {
        const result = {
          provider: providerName,
          id: match[1],
          spriteUrl: config.getSpriteUrl(match[1]),
          cols: config.cols,
          rows: config.rows,
          frames: config.frames
        };
        if (config.lastResort) result.lastResort = true;

        // Add preview info for providers with deformed sprites
        if (config.getPreviewUrl) {
          result.previewUrl = config.getPreviewUrl(match[1]);
          result.previewCols = config.previewCols;
          result.previewRows = config.previewRows;
        }
        return result;
      }
    }
    return null;
  }

  /**
   * Fetch page via background script (bypasses CORS)
   */
  function fetchViaBackground(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'fetch', url }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response.html);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    });
  }

  /**
   * Fetch detail page and extract sprite candidates sorted by frames (ascending),
   * along with what the page says about the video still having sources at all
   */
  async function fetchPageInfo(detailUrl) {
    // Check cache first
    if (spriteCache.has(detailUrl)) {
      return spriteCache.get(detailUrl);
    }

    try {
      const html = await fetchViaBackground(detailUrl);
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const embedSpans = doc.querySelectorAll('span.change-video[data-embed]');

      const candidates = [];
      const seenProviders = new Set();
      let embedCount = 0;

      for (const span of embedSpans) {
        // The site keeps the player tabs but empties data-embed once a video loses
        // all of its sources, which is the clearest signal that it is gone.
        const embedUrl = span.getAttribute('data-embed');
        if (!embedUrl) continue;
        embedCount++;

        const spriteInfo = parseEmbedUrl(embedUrl);
        if (!spriteInfo) continue;

        // Avoid duplicates from same provider
        if (seenProviders.has(spriteInfo.provider)) continue;
        seenProviders.add(spriteInfo.provider);

        candidates.push(spriteInfo);
      }

      // Sort by frames ascending (lowest first for progressive loading)
      candidates.sort((a, b) => a.frames - b.frames);

      const info = { candidates, embedCount, hasPlayers: embedSpans.length > 0 };
      spriteCache.set(detailUrl, info);
      return info;
    } catch {
      // A failed fetch says nothing about the video, so report no result at all
      return null;
    }
  }

  /**
   * Get detail URL from article element
   */
  function getDetailUrl(article) {
    const link = article.querySelector('a[href]');
    if (!link) return null;

    const href = link.getAttribute('href');
    if (!href) return null;

    // Resolve relative URLs
    try {
      return new URL(href, location.origin).href;
    } catch {
      return null;
    }
  }

  /**
   * Find the thumbnail element inside article
   */
  function findThumbnail(article) {
    // Try to find an img first
    const img = article.querySelector('img');
    if (img) return img;

    // Fallback to any element with background-image
    const thumbContainer = article.querySelector('.thumb, .thumbnail, [class*="thumb"]');
    return thumbContainer || article;
  }

  /**
   * Parse duration string (MM:SS or HH:MM:SS) to seconds
   */
  function parseDuration(durationStr) {
    if (!durationStr) return 0;
    const parts = durationStr.trim().split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  /**
   * Format seconds to MM:SS or HH:MM:SS
   */
  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Get duration from article element
   */
  function getDuration(article) {
    const durationEl = article.querySelector('.post-thumbnail .duration');
    if (!durationEl) return 0;
    // Extract text, removing any icon text
    const text = durationEl.textContent.replace(/[^\d:]/g, '');
    return parseDuration(text);
  }

  /**
   * Load sprite image and get its dimensions
   */
  function loadSpriteImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => {
        img.src = '';
        resolve(null);
      }, IMAGE_TIMEOUT_MS);
      img.onload = () => {
        clearTimeout(timer);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = url;
    });
  }

  /**
   * Calculate overlay dimensions respecting sprite frame aspect ratio
   */
  function calculateOverlayDimensions(spriteInfo, spriteDimensions, containerWidth, containerHeight) {
    // Calculate single frame dimensions from sprite
    const frameWidth = spriteDimensions.width / spriteInfo.cols;
    const frameHeight = spriteDimensions.height / spriteInfo.rows;
    const frameRatio = frameWidth / frameHeight;
    const containerRatio = containerWidth / containerHeight;

    let overlayWidth, overlayHeight, offsetX, offsetY;

    if (Math.abs(frameRatio - containerRatio) < 0.01) {
      // Ratios are close enough, fill the container
      overlayWidth = containerWidth;
      overlayHeight = containerHeight;
      offsetX = 0;
      offsetY = 0;
    } else if (frameRatio > containerRatio) {
      // Frame is wider than container - fit width, center vertically
      overlayWidth = containerWidth;
      overlayHeight = containerWidth / frameRatio;
      offsetX = 0;
      offsetY = (containerHeight - overlayHeight) / 2;
    } else {
      // Frame is taller than container (portrait) - fit height, center horizontally
      overlayHeight = containerHeight;
      overlayWidth = containerHeight * frameRatio;
      offsetX = (containerWidth - overlayWidth) / 2;
      offsetY = 0;
    }

    return { overlayWidth, overlayHeight, offsetX, offsetY };
  }

  /**
   * Create overlay element
   */
  function createOverlay(spriteInfo, containerRect, totalDuration, spriteDimensions) {
    // Create container that matches thumbnail size
    const container = document.createElement('div');
    container.className = 'lp-trickplay-container';
    container.style.width = `${containerRect.width}px`;
    container.style.height = `${containerRect.height}px`;

    // Calculate overlay dimensions respecting aspect ratio
    const dims = spriteDimensions
      ? calculateOverlayDimensions(spriteInfo, spriteDimensions, containerRect.width, containerRect.height)
      : { overlayWidth: containerRect.width, overlayHeight: containerRect.height, offsetX: 0, offsetY: 0 };

    const overlay = document.createElement('div');
    overlay.className = 'lp-trickplay-overlay';

    overlay.style.width = `${dims.overlayWidth}px`;
    overlay.style.height = `${dims.overlayHeight}px`;
    overlay.style.left = `${dims.offsetX}px`;
    overlay.style.top = `${dims.offsetY}px`;
    overlay.style.backgroundImage = `url(${spriteInfo.spriteUrl})`;
    overlay.style.backgroundSize = `${spriteInfo.cols * 100}% ${spriteInfo.rows * 100}%`;
    overlay.style.backgroundPosition = '0% 0%';
    overlay.style.backgroundRepeat = 'no-repeat';

    container.appendChild(overlay);

    // Add time indicator
    const timeIndicator = document.createElement('div');
    timeIndicator.className = 'lp-trickplay-time';
    timeIndicator.textContent = `0:00 / ${formatTime(totalDuration)}`;
    container.appendChild(timeIndicator);

    return container;
  }

  /**
   * Build the overlay shown when no provider could supply a single frame
   */
  function createUnavailableOverlay(containerRect) {
    const container = document.createElement('div');
    container.className = 'lp-trickplay-container lp-trickplay-container--message';
    container.style.width = `${containerRect.width}px`;
    container.style.height = `${containerRect.height}px`;

    const message = document.createElement('div');
    message.className = 'lp-trickplay-message';
    message.textContent = 'No preview available';

    const detail = document.createElement('span');
    detail.className = 'lp-trickplay-message-detail';
    detail.textContent = 'this video has probably been removed';
    message.appendChild(detail);

    container.appendChild(message);
    return container;
  }

  /**
   * Update overlay frame based on mouse X position
   */
  function updateFrame(container, spriteInfo, progress, totalDuration) {
    const overlay = container.querySelector('.lp-trickplay-overlay');
    if (!overlay) return;

    // Limit frames based on user setting
    const effectiveFrames = Math.min(spriteInfo.frames, maxFrames);

    // Calculate which frame to show (evenly distributed across sprite)
    const targetFrame = Math.floor(progress * (effectiveFrames - 1));

    // Map to actual frame index in the sprite (for cases where effectiveFrames < sprite.frames)
    const frameIndex = Math.round(targetFrame * (spriteInfo.frames - 1) / (effectiveFrames - 1));

    const col = frameIndex % spriteInfo.cols;
    const row = Math.floor(frameIndex / spriteInfo.cols);

    const xPercent = spriteInfo.cols > 1 ? (col / (spriteInfo.cols - 1)) * 100 : 0;
    const yPercent = spriteInfo.rows > 1 ? (row / (spriteInfo.rows - 1)) * 100 : 0;

    overlay.style.backgroundPosition = `${xPercent}% ${yPercent}%`;

    // Update time indicator
    const timeIndicator = container.querySelector('.lp-trickplay-time');
    if (timeIndicator && totalDuration > 0) {
      const currentTime = Math.floor(progress * totalDuration);
      timeIndicator.textContent = `${formatTime(currentTime)} / ${formatTime(totalDuration)}`;
    }
  }

  /**
   * Upgrade overlay to use a better sprite
   */
  function upgradeOverlay(container, newSpriteInfo, frameDimensions) {
    const overlay = container.querySelector('.lp-trickplay-overlay');
    if (!overlay) return;

    // Calculate new dimensions
    const containerWidth = parseFloat(container.style.width);
    const containerHeight = parseFloat(container.style.height);

    const dims = frameDimensions
      ? calculateOverlayDimensions(newSpriteInfo, frameDimensions, containerWidth, containerHeight)
      : { overlayWidth: containerWidth, overlayHeight: containerHeight, offsetX: 0, offsetY: 0 };

    // Update overlay with new sprite
    overlay.style.width = `${dims.overlayWidth}px`;
    overlay.style.height = `${dims.overlayHeight}px`;
    overlay.style.left = `${dims.offsetX}px`;
    overlay.style.top = `${dims.offsetY}px`;
    overlay.style.backgroundImage = `url(${newSpriteInfo.spriteUrl})`;
    overlay.style.backgroundSize = `${newSpriteInfo.cols * 100}% ${newSpriteInfo.rows * 100}%`;

    // Update stored sprite info
    container._spriteInfo = newSpriteInfo;
  }

  /**
   * Load sprite ratio info (from preview or sprite itself)
   */
  async function loadSpriteRatioInfo(spriteInfo) {
    if (spriteInfo.previewUrl) {
      // Load preview image to get correct aspect ratio
      const previewDimensions = await loadSpriteImage(spriteInfo.previewUrl);
      if (previewDimensions) {
        return {
          width: (previewDimensions.width / spriteInfo.previewCols) * spriteInfo.cols,
          height: (previewDimensions.height / spriteInfo.previewRows) * spriteInfo.rows
        };
      }
    } else {
      // Load sprite directly for aspect ratio
      const spriteDimensions = await loadSpriteImage(spriteInfo.spriteUrl);
      if (spriteDimensions) {
        return spriteDimensions;
      }
    }
    return null;
  }

  /**
   * Reject sheets that are not usable sprites (missing, or placeholder images)
   */
  function isUsableSprite(spriteInfo, dimensions) {
    if (!dimensions || !dimensions.width || !dimensions.height) return false;
    return dimensions.width / spriteInfo.cols >= MIN_FRAME_WIDTH &&
           dimensions.height / spriteInfo.rows >= MIN_FRAME_HEIGHT;
  }

  /**
   * Load a sprite and its ratio reference, keeping the result for later hovers
   */
  function probeSprite(spriteInfo) {
    if (probeCache.has(spriteInfo.spriteUrl)) {
      return probeCache.get(spriteInfo.spriteUrl);
    }

    const probe = Promise.all([
      loadSpriteImage(spriteInfo.spriteUrl),
      loadSpriteRatioInfo(spriteInfo)
    ]).then(([dimensions, ratioInfo]) => ({
      usable: isUsableSprite(spriteInfo, dimensions),
      ratioInfo
    }));

    probeCache.set(spriteInfo.spriteUrl, probe);
    return probe;
  }

  /**
   * Handle mouse enter on article
   */
  async function handleMouseEnter(article) {
    // Clean up previous overlay
    cleanupOverlay();

    const token = ++hoverToken;
    currentArticle = article;

    const detailUrl = getDetailUrl(article);
    if (!detailUrl) return;

    // Get all sprite candidates sorted by frames (ascending)
    const info = await fetchPageInfo(detailUrl);

    // Check if we're still hovering the same article
    if (token !== hoverToken || !info) return;

    const { candidates, embedCount, hasPlayers } = info;

    const thumbnail = findThumbnail(article);
    const thumbnailRect = thumbnail.getBoundingClientRect();

    // Find positioning parent
    let positionParent = thumbnail.parentElement;
    while (positionParent && positionParent !== article) {
      const style = getComputedStyle(positionParent);
      if (style.position !== 'static') break;
      positionParent = positionParent.parentElement;
    }

    if (!positionParent) positionParent = article;

    // Ensure parent has relative positioning
    const parentStyle = getComputedStyle(positionParent);
    if (parentStyle.position === 'static') {
      positionParent.style.position = 'relative';
    }

    // Calculate overlay position relative to parent
    const parentRect = positionParent.getBoundingClientRect();
    const articleRect = article.getBoundingClientRect();
    const totalDuration = getDuration(article);

    function place(container) {
      container.style.left = `${thumbnailRect.left - parentRect.left}px`;
      container.style.top = `${thumbnailRect.top - parentRect.top}px`;
      positionParent.appendChild(container);
      currentOverlay = container;
    }

    // Probe a tier of candidates at once: a slow or dead provider no longer delays
    // the others, and the first sprite to answer is shown right away.
    let shownFrames = 0;

    function probeTier(tier) {
      return Promise.all(tier.map(async (sprite) => {
        const { usable, ratioInfo } = await probeSprite(sprite);

        // Check if we're still hovering the same article
        if (token !== hoverToken || !usable) return;

        // A richer sprite already won the race
        if (sprite.frames <= shownFrames) return;
        shownFrames = sprite.frames;

        if (!currentOverlay) {
          // First working sprite: create and show overlay
          const container = createOverlay(sprite, thumbnailRect, totalDuration, ratioInfo);

          // Store sprite info and duration on container for mousemove handler
          container._spriteInfo = sprite;
          container._articleRect = articleRect;
          container._totalDuration = totalDuration;

          place(container);
        } else {
          // Better sprite loaded: upgrade overlay
          upgradeOverlay(currentOverlay, sprite, ratioInfo);
        }
      }));
    }

    // Last-resort providers rarely have a sprite at all, so they are only asked
    // once every other provider has come up empty.
    await probeTier(candidates.filter((sprite) => !sprite.lastResort));

    const lastResort = candidates.filter((sprite) => sprite.lastResort);
    if (!currentOverlay && token === hoverToken && lastResort.length) {
      await probeTier(lastResort);
    }

    // Nothing anywhere. Say so only when the page itself points at a dead video:
    // either every player slot is empty, or the sources it does list have lost
    // their sprites. Stay silent when we simply cannot read the providers listed.
    if (currentOverlay || token !== hoverToken) return;
    if ((hasPlayers && embedCount === 0) || candidates.length) {
      place(createUnavailableOverlay(thumbnailRect));
    }
  }

  /**
   * Handle mouse move on article
   */
  function handleMouseMove(e, article) {
    if (!currentOverlay || currentArticle !== article) return;

    if (rafId) {
      cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(() => {
      if (!currentOverlay) return;

      const rect = currentOverlay._articleRect || article.getBoundingClientRect();
      const spriteInfo = currentOverlay._spriteInfo;
      const totalDuration = currentOverlay._totalDuration || 0;

      if (!spriteInfo) return;

      const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      updateFrame(currentOverlay, spriteInfo, progress, totalDuration);
    });
  }

  /**
   * Clean up overlay
   */
  function cleanupOverlay() {
    // Invalidate in-flight probes so a late result cannot resurrect the overlay
    hoverToken++;

    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (currentOverlay) {
      currentOverlay.remove();
      currentOverlay = null;
    }

    currentArticle = null;
  }

  /**
   * Handle mouse leave
   */
  function handleMouseLeave() {
    cleanupOverlay();
  }

  /**
   * Find the closest article element
   */
  function findClosestArticle(target) {
    return target.closest('article.loop-video');
  }

  /**
   * Initialize event delegation
   */
  function init() {
    // Use event delegation on document
    let hoveredArticle = null;

    document.addEventListener('mouseover', (e) => {
      const article = findClosestArticle(e.target);

      if (article && article !== hoveredArticle) {
        hoveredArticle = article;
        handleMouseEnter(article);
      } else if (!article && hoveredArticle) {
        hoveredArticle = null;
        handleMouseLeave();
      }
    }, { passive: true });

    document.addEventListener('mousemove', (e) => {
      if (hoveredArticle) {
        handleMouseMove(e, hoveredArticle);
      }
    }, { passive: true });

    document.addEventListener('mouseout', (e) => {
      const article = findClosestArticle(e.target);
      const relatedArticle = e.relatedTarget ? findClosestArticle(e.relatedTarget) : null;

      if (article && article === hoveredArticle && relatedArticle !== article) {
        // Check if we're leaving the article entirely
        if (!article.contains(e.relatedTarget)) {
          hoveredArticle = null;
          handleMouseLeave();
        }
      }
    }, { passive: true });

    // Handle dynamic content with MutationObserver
    const observer = new MutationObserver(() => {
      // Event delegation handles new articles automatically
      // Observer kept for potential cache invalidation if needed
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();