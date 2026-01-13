(function() {
  'use strict';

  const slider = document.getElementById('maxFrames');
  const valueDisplay = document.getElementById('maxFramesValue');

  // Load saved value
  chrome.storage.sync.get({ maxFrames: 100 }, (data) => {
    slider.value = data.maxFrames;
    valueDisplay.textContent = data.maxFrames;
  });

  // Update on change
  slider.addEventListener('input', () => {
    valueDisplay.textContent = slider.value;
  });

  // Save on release
  slider.addEventListener('change', () => {
    chrome.storage.sync.set({ maxFrames: parseInt(slider.value, 10) });
  });
})();
