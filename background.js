// Service worker for handling cross-origin fetches
// Background scripts bypass CORS restrictions when host_permissions are granted

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'fetch') {
    fetchPage(request.url, request.signal)
      .then(html => sendResponse({ success: true, html }))
      .catch(err => sendResponse({ success: false, error: err.message }));

    // Return true to indicate we'll respond asynchronously
    return true;
  }

  if (request.type === 'stream') {
    fetchStreamUrl(request)
      .then(url => sendResponse({ success: true, url }))
      .catch(err => sendResponse({ success: false, error: err.message }));

    return true;
  }
});

async function fetchPage(url) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

// Same request as the site's own player: trade a player key for its embed URL.
// Resolves with '' when the tab has no source.
async function fetchStreamUrl({ api, nonce, postId, player }) {
  // The endpoint address is read from a fetched page, so only ever post to the site
  const { protocol, hostname } = new URL(api);
  if (protocol !== 'https:' ||
      !(hostname === 'leakporner.com' || hostname.endsWith('.leakporner.com'))) {
    throw new Error('Unexpected stream endpoint');
  }

  const response = await fetch(api, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-WP-Nonce': nonce
    },
    body: JSON.stringify({ id: postId, p: player })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return data && typeof data.u === 'string' ? data.u : '';
}
