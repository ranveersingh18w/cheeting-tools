document.addEventListener('DOMContentLoaded', async () => {
  // Load saved settings
  const result = await chrome.storage.local.get(['captureMode', 'activationMode', 'fontColor', 'fontSize', 'autoClickEnabled', 'answerDuration']);

  if (result.captureMode) {
    const radio = document.querySelector(`input[name="captureMode"][value="${result.captureMode}"]`);
    if (radio) radio.checked = true;
  }

  if (result.activationMode) {
    const radio = document.querySelector(`input[name="activationMode"][value="${result.activationMode}"]`);
    if (radio) radio.checked = true;
  } else {
    // Default to tripleclick
    const radio = document.querySelector(`input[name="activationMode"][value="tripleclick"]`);
    if (radio) radio.checked = true;
  }

  if (result.fontColor) document.getElementById('fontColor').value = result.fontColor;
  if (result.fontSize) document.getElementById('fontSize').value = result.fontSize;
  if (result.answerDuration) document.getElementById('answerDuration').value = result.answerDuration;

  // Auto Click Load
  if (result.autoClickEnabled !== undefined) {
    document.getElementById('autoClickEnabled').checked = result.autoClickEnabled;
  }

  // --- AUTO SAVE FUNCTION ---
  const saveSettings = async () => {
    const captureMode = document.querySelector('input[name="captureMode"]:checked').value;
    const activationMode = document.querySelector('input[name="activationMode"]:checked').value;
    const fontColor = document.getElementById('fontColor').value;
    const fontSize = document.getElementById('fontSize').value;
    const answerDuration = document.getElementById('answerDuration').value;
    const autoClickEnabled = document.getElementById('autoClickEnabled').checked;

    await chrome.storage.local.set({
      captureMode,
      activationMode,
      fontColor,
      fontSize,
      answerDuration,
      autoClickEnabled
    });

    // Notify active tab about mode change or background
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'updateSettings',
        activationMode: activationMode,
        autoClickEnabled: autoClickEnabled
      }).catch(() => { });
    }
    console.log("Settings Auto-Saved");
  };

  // Attach Listeners to ALL inputs
  document.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('change', saveSettings);
    el.addEventListener('input', saveSettings); // For text/color inputs
  });

  // Manual Save Button (Visual Feedback Only)
  document.getElementById('saveBtn').addEventListener('click', async () => {
    await saveSettings();
    const btn = document.getElementById('saveBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>✅</span> Saved!';
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 1500);
  });

  // Start Button
  const startBtn = document.getElementById('startBtn');
  
  // Logic: Only show start button if Manual Mode is selected?
  // User request: "no need of start button only when in the settings manual is on"
  // This implies we hide it normally?
  
  function updateStartButtonVisibility() {
      const mode = document.querySelector('input[name="activationMode"]:checked').value;
      if (mode === 'manual') {
          startBtn.style.display = 'block';
      } else {
          startBtn.style.display = 'none';
      }
  }

  // Initial Check
  setTimeout(updateStartButtonVisibility, 100); // Wait for storage load

  // Listen for changes
  document.querySelectorAll('input[name="activationMode"]').forEach(el => {
      el.addEventListener('change', updateStartButtonVisibility);
  });

  startBtn.addEventListener('click', async () => {
    const captureMode = document.querySelector('input[name="captureMode"]:checked').value;

    // Changes: Always trigger capture regardless of mode when Start is clicked
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        chrome.runtime.sendMessage({
            action: 'capture',
            captureMode: captureMode
        });
        window.close(); // Close popup
    }
  });

  // --- SETTINGS VIEW TOGGLE ---
  const settingsBtn = document.getElementById('settingsToggle');
  const homeView = document.getElementById('homeView');
  const settingsView = document.getElementById('settingsView');
  let isSettingsOpen = false;

  settingsBtn.addEventListener('click', () => {
    isSettingsOpen = !isSettingsOpen;
    if (isSettingsOpen) {
      homeView.classList.add('hidden');
      settingsView.classList.remove('hidden');
      settingsBtn.classList.add('active');
    } else {
      homeView.classList.remove('hidden');
      settingsView.classList.add('hidden');
      settingsBtn.classList.remove('active');
    }
  });
});
