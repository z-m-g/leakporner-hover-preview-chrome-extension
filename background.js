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