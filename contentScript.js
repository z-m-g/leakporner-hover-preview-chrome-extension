(function() {
  'use strict';

  // Provider configurations
  const PROVIDERS = {
    lulustream: {
      pattern: /^https?:\/\/lulustream\.com\/e\/([a-zA-Z0-9]+)/,
      getSpriteUrl: (id) => `https://img.lulucdn.com/${id}_xt.jpg`,
      cols: 4,
      rows: 4,
      frames: 16
    },
    bysezoxexe: {
      pattern: /^https?:\/\/bysezoxexe\.com\/e\/([a-zA-Z0-9]+)/,
      getSpriteUrl: (id) => `https://img-place.com/${id}_xt.jpg`,
      cols: 4,
      rows: 4,
      frames: 16
    },
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
    shorticu: {
      pattern: /^https?:\/\/short\.icu\/([a-zA-Z0-9]+)/,
      getSpriteUrl: (id) => `https://img.freeimagecdn.net/image/${id}/0.jpg`,
      cols: 6,
      rows: 5,
      frames: 30
    }
  };

  // Cache for detail page sprite info: Map<detailUrl, Array of sprite candidates sorted by frames>
  const spriteCache = new Map();

  // Current hover state
  let currentArticle = null;
  let currentOverlay = null;
  let currentAbortController = null;
  let rafId = null;

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
   * Fetch detail page and extract all sprite candidates sorted by frames (ascending)
   */
  async function fetchAllSpriteCandidates(detailUrl) {
    // Check cache first
    if (spriteCache.has(detailUrl)) {
      return spriteCache.get(detailUrl);
    }

    try {
      const html = await fetchViaBackground(detailUrl);
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const embedSpans = doc.querySelectorAll('span.change-video[data-embed]');
      if (!embedSpans.length) return [];

      const candidates = [];
      const seenProviders = new Set();

      for (const span of embedSpans) {
        const embedUrl = span.getAttribute('data-embed');
        if (!embedUrl) continue;

        const spriteInfo = parseEmbedUrl(embedUrl);
        if (!spriteInfo) continue;

        // Avoid duplicates from same provider
        if (seenProviders.has(spriteInfo.provider)) continue;
        seenProviders.add(spriteInfo.provider);

        candidates.push(spriteInfo);
      }

      // Sort by frames ascending (lowest first for progressive loading)
      candidates.sort((a, b) => a.frames - b.frames);

      spriteCache.set(detailUrl, candidates);
      return candidates;
    } catch {
      return [];
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
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
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
   * Update overlay frame based on mouse X position
   */
  function updateFrame(container, spriteInfo, progress, totalDuration) {
    const overlay = container.querySelector('.lp-trickplay-overlay');
    if (!overlay) return;

    const frameIndex = Math.floor(progress * (spriteInfo.frames - 1));
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
   * Handle mouse enter on article
   */
  async function handleMouseEnter(article) {
    // Abort any previous fetch
    if (currentAbortController) {
      currentAbortController.abort();
    }

    // Clean up previous overlay
    cleanupOverlay();

    currentArticle = article;
    currentAbortController = new AbortController();

    const detailUrl = getDetailUrl(article);
    if (!detailUrl) return;

    // Get all sprite candidates sorted by frames (ascending)
    const candidates = await fetchAllSpriteCandidates(detailUrl);
    if (!candidates.length) return;

    // Check if we're still hovering the same article
    if (currentArticle !== article) return;

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
    const totalDuration = getDuration(article);

    // Start with the first (lowest quality) sprite for fast display
    const firstSprite = candidates[0];
    const firstRatioInfo = await loadSpriteRatioInfo(firstSprite);

    // Check again if we're still hovering the same article
    if (currentArticle !== article) return;

    // Create and show overlay immediately with first sprite
    const container = createOverlay(firstSprite, thumbnailRect, totalDuration, firstRatioInfo);

    container.style.left = `${thumbnailRect.left - parentRect.left}px`;
    container.style.top = `${thumbnailRect.top - parentRect.top}px`;

    positionParent.appendChild(container);
    currentOverlay = container;

    // Store sprite info and duration on container for mousemove handler
    container._spriteInfo = firstSprite;
    container._articleRect = article.getBoundingClientRect();
    container._totalDuration = totalDuration;

    // If there are better sprites, load them in background and upgrade
    if (candidates.length > 1) {
      // Load better sprites progressively (skip the first one we already loaded)
      for (let i = 1; i < candidates.length; i++) {
        const betterSprite = candidates[i];

        // Load the better sprite's ratio info
        const betterRatioInfo = await loadSpriteRatioInfo(betterSprite);

        // Check if we're still hovering the same article and overlay exists
        if (currentArticle !== article || !currentOverlay) return;

        // Upgrade to better sprite
        upgradeOverlay(currentOverlay, betterSprite, betterRatioInfo);
      }
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
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
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