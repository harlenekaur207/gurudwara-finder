(() => {
  const PAATHS = {
    japji: {name: "Japji Sahib", timeLabel: "Morning", defaultTime: "06:00", baniId: 2},
    rehras: {name: "Rehras Sahib", timeLabel: "Evening", defaultTime: "18:00", baniId: 21},
    sohila: {name: "Kirtan Sohila", timeLabel: "Before rest", defaultTime: "22:00", baniId: 23}
  };
  const BANI_API = "https://api.banidb.com/v2/banis/";
  const HUKAM_API = "https://api.gurbaninow.com/v2/hukamnama/today";
  const el = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const defaults = Object.fromEntries(Object.entries(PAATHS).map(([id, p]) => [id, {time:p.defaultTime, enabled:true}]));
  let reminders = {...defaults, ...JSON.parse(localStorage.getItem("sangat-paath-reminders") || "{}")};
  let currentPaath = "japji", currentLanguage = "punjabi", currentVerses = [], wordTimer = null, activeAlertPaath = "japji", hukamData = null;

  function saveReminders() {
    localStorage.setItem("sangat-paath-reminders", JSON.stringify(reminders));
    updateNextReminder();
  }
  function formatTime(value) {
    const [hour, minute] = value.split(":").map(Number);
    return new Intl.DateTimeFormat([], {hour:"numeric", minute:"2-digit"}).format(new Date(2000, 0, 1, hour, minute));
  }
  function updateNextReminder() {
    const now = new Date();
    const upcoming = Object.entries(reminders).filter(([, r]) => r.enabled).map(([id, r]) => {
      const [h, m] = r.time.split(":").map(Number), when = new Date(now); when.setHours(h, m, 0, 0); if (when <= now) when.setDate(when.getDate() + 1);
      return {id, when, time:r.time};
    }).sort((a, b) => a.when - b.when)[0];
    el("next-paath").textContent = upcoming ? `Next: ${PAATHS[upcoming.id].name} at ${formatTime(upcoming.time)}` : "Turn on a reminder";
  }
  function hydrateReminders() {
    Object.entries(PAATHS).forEach(([id, p]) => {
      reminders[id] = {...defaults[id], ...(reminders[id] || {})};
      const time = document.querySelector(`[data-reminder-time="${id}"]`), toggle = document.querySelector(`[data-reminder-toggle="${id}"]`);
      time.value = reminders[id].time; toggle.checked = reminders[id].enabled;
      time.addEventListener("change", () => { reminders[id].time = time.value || p.defaultTime; saveReminders(); });
      toggle.addEventListener("change", () => { reminders[id].enabled = toggle.checked; saveReminders(); });
    });
    updateNextReminder();
  }
  function playChime() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass(), gain = context.createGain(); gain.connect(context.destination); gain.gain.setValueAtTime(.0001, context.currentTime);
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator(); oscillator.type = "sine"; oscillator.frequency.value = frequency; oscillator.connect(gain); oscillator.start(context.currentTime + index * .18); oscillator.stop(context.currentTime + .65 + index * .18);
    });
    gain.gain.exponentialRampToValueAtTime(.16, context.currentTime + .03); gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + 1.05); setTimeout(() => context.close(), 1300);
  }
  async function enableNotifications() {
    if (!("Notification" in window)) { el("reminder-status").textContent = "This browser does not support notifications. The on-page alarm will still work while the app is open."; return; }
    const permission = await Notification.requestPermission();
    el("reminder-status").textContent = permission === "granted" ? "Alarm notifications are enabled. Keep the app open for scheduled chimes." : "Notifications were not enabled. The on-page alarm will still work while the app is open.";
  }
  function triggerReminder(id) {
    const paath = PAATHS[id]; activeAlertPaath = id; playChime();
    el("alert-title").textContent = `It is time for ${paath.name}`; el("alert-copy").textContent = `Take a quiet moment for your ${paath.timeLabel.toLowerCase()} Paath.`;
    if (!el("paath-alert").open) el("paath-alert").showModal();
    if ("Notification" in window && Notification.permission === "granted") new Notification(`Time for ${paath.name}`, {body:"Your Paath reminder from Sangat.", tag:`sangat-${id}`});
  }
  function checkReminders() {
    const now = new Date(), current = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`, day = now.toISOString().slice(0,10);
    Object.entries(reminders).forEach(([id, reminder]) => {
      const key = `sangat-paath-fired-${id}`;
      if (reminder.enabled && reminder.time === current && localStorage.getItem(key) !== day) { localStorage.setItem(key, day); triggerReminder(id); }
    });
  }

  function verseText(item, language) {
    const verse = item.verse || item;
    if (language === "hindi") return verse.transliteration?.hindi || verse.transliteration?.hi || "";
    if (language === "roman") return verse.transliteration?.english || verse.transliteration?.en || "";
    return verse.verse?.unicode || verse.gurmukhi?.unicode || "";
  }
  async function loadPaath(id) {
    const response = await fetch(`${BANI_API}${PAATHS[id].baniId}`);
    if (!response.ok) throw new Error("Paath source unavailable");
    const data = await response.json();
    return (data.verses || []).filter(item => id === "japji" || item.existsSGPC === 1);
  }
  function renderReader() {
    const lines = currentVerses.map(item => verseText(item, currentLanguage)).filter(Boolean);
    if (!lines.length) { el("paath-text").innerHTML = '<p class="reader-loading">Loading the verified Paath text…</p>'; return; }
    let wordIndex = 0;
    el("paath-text").innerHTML = lines.map(line => `<span class="paath-line">${line.split(/\s+/).map(word => `<span class="paath-word" data-word="${wordIndex++}">${esc(word)}</span>`).join(" ")}</span>`).join("");
  }
  function stopSpeech() {
    speechSynthesis.cancel(); clearInterval(wordTimer); wordTimer = null; document.querySelectorAll(".paath-word.active").forEach(word => word.classList.remove("active")); el("play-paath").textContent = "▶ Play & follow";
  }
  function highlightWord(index) {
    document.querySelector(".paath-word.active")?.classList.remove("active");
    const word = document.querySelector(`.paath-word[data-word="${index}"]`); if (!word) return;
    word.classList.add("active"); word.scrollIntoView({block:"center", behavior:"smooth"});
  }
  function speakPaath() {
    stopSpeech();
    const words = [...document.querySelectorAll(".paath-word")]; if (!words.length) return;
    const utterance = new SpeechSynthesisUtterance(words.map(word => word.textContent).join(" "));
    utterance.lang = currentLanguage === "hindi" ? "hi-IN" : currentLanguage === "roman" ? "en-IN" : "pa-IN"; utterance.rate = .78;
    const voices = speechSynthesis.getVoices(), preferred = voices.find(voice => voice.lang.toLowerCase().startsWith(utterance.lang.slice(0,2).toLowerCase())); if (preferred) utterance.voice = preferred;
    let index = 0; el("play-paath").textContent = "Playing…"; highlightWord(0);
    wordTimer = setInterval(() => { index += 1; if (index < words.length) highlightWord(index); }, 560);
    utterance.onboundary = event => { if (event.name === "word") { const before = utterance.text.slice(0, event.charIndex).trim(); highlightWord(before ? before.split(/\s+/).length : 0); } };
    utterance.onend = stopSpeech; utterance.onerror = stopSpeech; speechSynthesis.speak(utterance);
  }
  async function openReader(id, autoplay = false) {
    currentPaath = id; stopSpeech(); const paath = PAATHS[id];
    el("reader-title").textContent = paath.name; el("reader-time").textContent = `${paath.timeLabel} Paath`; currentLanguage = el("reader-language").value; currentVerses = []; renderReader();
    if (!el("paath-reader").open) el("paath-reader").showModal();
    try { currentVerses = await loadPaath(id); renderReader(); if (autoplay) speakPaath(); }
    catch { el("paath-text").innerHTML = '<p class="reader-loading">The verified text source is temporarily unavailable. Please try again, or use the complete reader at <a href="https://www.sikhitothemax.org/" target="_blank" rel="noopener noreferrer">SikhiToTheMax ↗</a>.</p>'; }
  }

  function hukamLine(line, language) {
    if (language === "hindi") return line.transliteration?.devanagari?.text || "";
    if (language === "english") return line.translation?.english?.default || line.transliteration?.english?.text || "";
    return line.gurmukhi?.unicode || "";
  }
  function renderHukam(language = "punjabi") {
    if (!hukamData) return;
    const lines = (hukamData.hukamnama || []).slice(0, 5).map(entry => hukamLine(entry.line || entry, language)).filter(Boolean);
    el("hukam-lines").innerHTML = lines.length ? lines.map(line => `<p>${esc(line)}</p>`).join("") : "<p>The selected language is not available for this Hukamnama.</p>";
  }
  async function loadHukam() {
    try {
      const response = await fetch(HUKAM_API); if (!response.ok) throw new Error(); hukamData = await response.json();
      const date = hukamData.date?.gregorian, info = hukamData.hukamnamainfo || {}, sourceDate = date ? new Date(date.year, date.monthno - 1, date.date) : null, isToday = sourceDate?.toDateString() === new Date().toDateString();
      el("hukam-date").textContent = date ? `${isToday ? "Today" : "Latest available"} · ${date.month} ${date.date}, ${date.year}` : "Latest available selection";
      el("hukam-ang").textContent = info.pageno ? `Ang ${info.pageno}` : "Sri Darbar Sahib";
      el("hukam-meta").textContent = [info.writer?.english, info.raag?.english].filter(Boolean).join(" · ") || "Sri Darbar Sahib, Amritsar"; renderHukam();
    } catch {
      el("hukam-date").textContent = "Open the official source for today’s selection"; el("hukam-ang").textContent = "SGPC";
      el("hukam-lines").innerHTML = '<p>The daily feed is temporarily unavailable. Use “Read the complete Hukamnama” or the official SGPC audio link below.</p>';
    }
  }

  hydrateReminders(); loadHukam(); checkReminders(); setInterval(checkReminders, 20000);
  el("enable-reminders").addEventListener("click", enableNotifications); el("test-chime").addEventListener("click", playChime);
  document.querySelectorAll("[data-open-paath]").forEach(button => button.addEventListener("click", () => openReader(button.dataset.openPaath, button.dataset.mode === "listen")));
  el("reader-language").addEventListener("change", event => { currentLanguage = event.target.value; stopSpeech(); renderReader(); }); el("play-paath").addEventListener("click", speakPaath); el("stop-paath").addEventListener("click", stopSpeech);
  document.querySelectorAll("[data-hukam-language]").forEach(button => button.addEventListener("click", () => { document.querySelectorAll("[data-hukam-language]").forEach(item => item.classList.toggle("active", item === button)); renderHukam(button.dataset.hukamLanguage); }));
  el("dismiss-alert").addEventListener("click", () => el("paath-alert").close()); el("alert-read").addEventListener("click", () => { el("paath-alert").close(); openReader(activeAlertPaath); }); el("alert-listen").addEventListener("click", () => { el("paath-alert").close(); openReader(activeAlertPaath, true); });
  el("paath-reader").addEventListener("close", stopSpeech);
})();
