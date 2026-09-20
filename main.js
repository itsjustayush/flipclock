/**
 * FLIP CLOCK - Core Engine
 * High-performance Vanilla JS with CSS 3D Transforms, PWA Offline, WakeLock,
 * Web Audio Synthesized Alarms, Snooze, Live Date Display, and Custom Color Themes.
 */

// -----------------------------------------------------------------------------
// State Management & Local Storage Persistence
// -----------------------------------------------------------------------------
const STORAGE_KEY = 'flip_clock_preferences_v3';

const defaultState = {
  theme: 'dark-charcoal',
  clockFont: 'bebas-neue', // 'bebas-neue' | 'oswald' | 'space-mono' | 'anton' | 'system'
  customColors: {
    cardBg: '#161616',
    textColor: '#e5e5e5',
    bgColor: '#050505',
    splitColor: '#050505'
  },
  showDate: true,
  dateFormat: 'full', // 'full' | 'short' | 'numeric'
  is24h: false,
  ampmPos: 'bottom-left', // 'bottom-left' (Image 1) or 'top-left' (Image 2)
  leadingZero: false,
  showSeconds: false,
  soundEnabled: false,
  hapticEnabled: true,
  wakeLockEnabled: true,
  dimmerValue: 0,
  autoDim: {
    enabled: false,
    startTime: '22:00',
    endTime: '06:30',
    nightDimmerLevel: 70
  },
  flipSpeed: '0.55s',
  snoozeMinutes: 5,
  snoozeUntil: null,
  snoozeAlarmId: null,
  alarms: [
    { id: 'alarm-1', time: '07:00', label: 'Morning Wakeup', enabled: false, sound: 'classic-beep' },
    { id: 'alarm-2', time: '08:30', label: 'Work / Study', enabled: false, sound: 'zen-bell' }
  ]
};

let state = { ...defaultState };

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('flip_clock_preferences_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      
      // Migrate previous single alarm if needed
      let alarmsList = Array.isArray(parsed.alarms) ? parsed.alarms : [];
      if (alarmsList.length === 0 && parsed.alarm && parsed.alarm.time) {
        alarmsList.push({
          id: 'alarm-migrated-' + Date.now(),
          time: parsed.alarm.time,
          label: 'Morning Alarm',
          enabled: Boolean(parsed.alarm.enabled),
          sound: parsed.alarm.sound || 'classic-beep'
        });
      }
      if (alarmsList.length === 0) {
        alarmsList = [...defaultState.alarms];
      }

      state = {
        ...defaultState,
        ...parsed,
        customColors: { ...defaultState.customColors, ...(parsed.customColors || {}) },
        autoDim: { ...defaultState.autoDim, ...(parsed.autoDim || {}) },
        alarms: alarmsList,
        clockFont: parsed.clockFont || 'bebas-neue',
        hapticEnabled: parsed.hapticEnabled !== undefined ? Boolean(parsed.hapticEnabled) : true,
        snoozeMinutes: Number(parsed.snoozeMinutes) || (parsed.alarm && Number(parsed.alarm.snoozeMinutes)) || 5
      };
    }
  } catch (e) {
    console.warn('Could not load preferences from localStorage', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save preferences to localStorage', e);
  }
}

// -----------------------------------------------------------------------------
// Web Audio API Synthesizer (100% Offline, Zero External Sound Assets)
// -----------------------------------------------------------------------------
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// -----------------------------------------------------------------------------
// Tactile Mechanical Haptic Feedback Service (navigator.vibrate)
// Provides tactile clicks, micro-ticks, relay latches, and toggle sensations
// -----------------------------------------------------------------------------
const hapticService = {
  isSupported() {
    return typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function';
  },

  /**
   * Triggers a vibration pattern if enabled in user preferences.
   * @param {number|number[]} pattern - Vibration duration or sequence in ms.
   */
  trigger(pattern) {
    if (state.hapticEnabled === false) return false;
    if (!this.isSupported()) return false;
    try {
      return navigator.vibrate(pattern);
    } catch (err) {
      return false;
    }
  },

  // Crisp mechanical tactile click for buttons, nav, modal controls (12ms)
  click() {
    this.playAudioMicroClick();
    return this.trigger(12);
  },

  // Ultra-short micro-tick for sliders, time adjustment, and minute steppers (6ms)
  tick() {
    return this.trigger(6);
  },

  // Solid mechanical latch / spring impact for Add Alarm, Dismiss, Reset
  heavyClick() {
    this.playAudioMicroClick(true);
    return this.trigger([18, 12, 16]);
  },

  // Bi-stable mechanical toggle flip sensation for switches
  toggle() {
    this.playAudioMicroClick();
    return this.trigger([10, 15, 10]);
  },

  // Destructive delete action tactile pulse
  delete() {
    return this.trigger([16, 25, 20]);
  },

  // Soft double tap for Snooze action
  snooze() {
    return this.trigger([20, 35, 20]);
  },

  // Audible mechanical click complement if sound is enabled
  playAudioMicroClick(heavy = false) {
    if (!state.soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(heavy ? 1200 : 2200, now);
      osc.frequency.exponentialRampToValueAtTime(heavy ? 180 : 300, now + 0.012);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.014);
    } catch (e) {}
  }
};

// Mechanical flip sound when flap folds down
function playMechanicalFlipSound() {
  if (!state.soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    // 1. Mechanical flap impact burst (Bandpassed noise)
    const bufferSize = audioCtx.sampleRate * 0.04;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.Q.setValueAtTime(1.5, now);

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.18, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);

    whiteNoise.start(now);
    whiteNoise.stop(now + 0.04);

    // 2. Low mechanical plastic body resonant thud (90Hz)
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.045);

    oscGain.gain.setValueAtTime(0.25, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  } catch (err) {
    // Non-blocking
  }
}

// Synthesized Default Alarm Sounds
function playAlarmSoundPattern(soundType) {
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;

  switch (soundType) {
    case 'zen-bell': {
      // Meditative singing bowl / bell (Fundamental 440Hz + harmonics with long gentle decay)
      const freqs = [440, 882, 1324];
      const gains = [0.35, 0.15, 0.08];

      freqs.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(gains[idx], now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 2.3);
      });
      break;
    }

    case 'marimba-chime': {
      // Melodic ascending 4-note marimba arpeggio (C5, E5, G5, C6)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const noteTime = now + (i * 0.14);
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.3, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.4);
      });
      break;
    }

    case 'mechanical-buzz': {
      // Vintage mechanical buzzer alarm clock (140Hz with rapid frequency tremolo)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(160, now + 0.25);
      osc.frequency.linearRampToValueAtTime(140, now + 0.5);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.setValueAtTime(0.28, now + 0.55);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.65);
      break;
    }

    case 'classic-beep':
    default: {
      // Classic digital alarm twin-beep (880Hz / 1050Hz)
      const beeps = [0, 0.16];
      beeps.forEach((offset) => {
        const t = now + offset;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(950, t);

        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(t);
        osc.stop(t + 0.11);
      });
      break;
    }
  }
}

// -----------------------------------------------------------------------------
// DOM Elements Cache
// -----------------------------------------------------------------------------
const appRoot = document.getElementById('app');
const clockStage = document.getElementById('clock-stage');

// Dynamic Island Floating Status Bar Elements
const dynamicIsland = document.getElementById('dynamic-island');
const islandIcon = document.getElementById('island-icon');
const islandTitle = document.getElementById('island-title');
const islandStatus = document.getElementById('island-status');
const islandAction = document.getElementById('island-action');

const hoursCard = document.getElementById('hours-card');
const minutesCard = document.getElementById('minutes-card');
const secondsCard = document.getElementById('seconds-card');
const ampmBadge = document.getElementById('ampm-badge');

// Date element
const dateContainer = document.getElementById('date-container');
const dateText = document.getElementById('date-text');

// Dimmer and Alarm Banner
const dimmerOverlay = document.getElementById('dimmer-overlay');
const alarmBanner = document.getElementById('alarm-banner');
const alarmBannerTime = document.getElementById('alarm-banner-time');
const alarmSnoozeBtn = document.getElementById('alarm-snooze-btn');
const alarmDismissBtn = document.getElementById('alarm-dismiss-btn');

// Modals
const settingsBackdrop = document.getElementById('settings-backdrop');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const alarmBackdrop = document.getElementById('alarm-backdrop');
const alarmCloseBtn = document.getElementById('alarm-close-btn');
const timerBackdrop = document.getElementById('timer-backdrop');
const timerCloseBtn = document.getElementById('timer-close-btn');

// Bottom Nav
const btnAlarm = document.getElementById('btn-alarm');
const btnTimer = document.getElementById('btn-timer');
const btnClock = document.getElementById('btn-clock');
const btnSettings = document.getElementById('btn-settings');

// Settings Inputs
const themeOptions = document.querySelectorAll('.theme-option');
const pickerCardBg = document.getElementById('picker-card-bg');
const pickerTextColor = document.getElementById('picker-text-color');
const pickerBgColor = document.getElementById('picker-bg-color');
const pickerSplitColor = document.getElementById('picker-split-color');
const btnResetCustomColors = document.getElementById('btn-reset-custom-colors');
const selectClockFont = document.getElementById('select-clock-font');

const toggleDate = document.getElementById('toggle-date');
const selectDateStyle = document.getElementById('select-date-style');
const dateStyleRow = document.getElementById('date-style-row');

const toggle24h = document.getElementById('toggle-24h');
const selectAmpmPos = document.getElementById('select-ampm-pos');
const ampmSettingRow = document.getElementById('ampm-setting-row');
const toggleLeadingZero = document.getElementById('toggle-leading-zero');
const toggleSeconds = document.getElementById('toggle-seconds');
const toggleSound = document.getElementById('toggle-sound');
const toggleHaptics = document.getElementById('toggle-haptics');
const toggleWakeLock = document.getElementById('toggle-wakelock');
const inputDimmer = document.getElementById('input-dimmer');
const dimmerValueText = document.getElementById('dimmer-value-text');

// Battery Status Widget Elements (Battery Status API)
const batteryCorner = document.getElementById('battery-corner');
const batteryPill = document.getElementById('battery-pill');
const batteryLevelFill = document.getElementById('battery-level-fill');
const batteryBolt = document.getElementById('battery-bolt');
const batteryText = document.getElementById('battery-text');
const batteryPopover = document.getElementById('battery-popover');
const batteryStateBadge = document.getElementById('battery-state-badge');
const batteryPopoverLevel = document.getElementById('battery-popover-level');
const batteryPopoverTime = document.getElementById('battery-popover-time');

// Auto-Dimming Feature Elements (Gradual Nighttime Screen Dimming via Device Clock)
const toggleAutoDim = document.getElementById('toggle-auto-dim');
const autoDimOptions = document.getElementById('auto-dim-options');
const autoDimStart = document.getElementById('auto-dim-start');
const autoDimEnd = document.getElementById('auto-dim-end');
const autoDimLevel = document.getElementById('auto-dim-level');
const autoDimLevelText = document.getElementById('auto-dim-level-text');
const autoDimStatusText = document.getElementById('auto-dim-status-text');
const autoDimIndicator = document.getElementById('auto-dim-indicator');

const selectFlipSpeed = document.getElementById('select-flip-speed');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnInstallPwa = document.getElementById('btn-install-pwa');

// Multiple Alarms Manager Elements
const newAlarmTime = document.getElementById('new-alarm-time');
const newAlarmLabel = document.getElementById('new-alarm-label');
const newAlarmSound = document.getElementById('new-alarm-sound');
const btnAddAlarm = document.getElementById('btn-add-alarm');
const alarmsList = document.getElementById('alarms-list');
const alarmsCountBadge = document.getElementById('alarms-count-badge');
const btnPreviewSound = document.getElementById('btn-preview-sound');
const selectSnoozeDuration = document.getElementById('select-snooze-duration');
const snoozeIndicator = document.getElementById('snooze-indicator');
const snoozeStatusText = document.getElementById('snooze-status-text');
const cancelSnoozeBtn = document.getElementById('cancel-snooze-btn');
const notifStatusBadge = document.getElementById('notif-status-badge');
const btnRequestNotif = document.getElementById('btn-request-notif');

// Stopwatch Elements
const stopwatchDisplay = document.getElementById('stopwatch-display');
const stopwatchStartBtn = document.getElementById('stopwatch-start-btn');
const stopwatchResetBtn = document.getElementById('stopwatch-reset-btn');

// -----------------------------------------------------------------------------
// 3D Flip Card Animation Controller
// -----------------------------------------------------------------------------
function setCardDirect(cardEl, value) {
  if (!cardEl) return;
  cardEl.dataset.value = value;
  const topStatic = cardEl.querySelector('.card-half.top.static .digit-glyph');
  const bottomStatic = cardEl.querySelector('.card-half.bottom.static .digit-glyph');
  const topFlap = cardEl.querySelector('.card-half.top.flap .digit-glyph');
  const bottomFlap = cardEl.querySelector('.card-half.bottom.flap .digit-glyph');

  if (topStatic) topStatic.textContent = value;
  if (bottomStatic) bottomStatic.textContent = value;
  if (topFlap) topFlap.textContent = value;
  if (bottomFlap) bottomFlap.textContent = value;
}

function flipCard(cardEl, nextValue) {
  if (!cardEl) return;
  const currentValue = cardEl.dataset.value;
  if (currentValue === nextValue) return;

  const topStatic = cardEl.querySelector('.card-half.top.static .digit-glyph');
  const bottomStatic = cardEl.querySelector('.card-half.bottom.static .digit-glyph');
  const topFlap = cardEl.querySelector('.card-half.top.flap .digit-glyph');
  const bottomFlap = cardEl.querySelector('.card-half.bottom.flap .digit-glyph');

  if (!topStatic || !bottomStatic || !topFlap || !bottomFlap) return;

  // 1. Prepare card halves:
  topStatic.textContent = nextValue;
  bottomStatic.textContent = currentValue;
  topFlap.textContent = currentValue;
  bottomFlap.textContent = nextValue;

  // 2. Play mechanical sound & tactile flap click
  playMechanicalFlipSound();
  hapticService.tick();

  // 3. Trigger CSS 3D animation
  cardEl.classList.remove('flipping');
  void cardEl.offsetWidth; // Force reflow
  cardEl.classList.add('flipping');
  cardEl.dataset.value = nextValue;

  // 4. Conclude animation cleanly
  const durationSec = parseFloat(state.flipSpeed) || 0.55;
  const durationMs = durationSec * 1000;

  clearTimeout(cardEl._flipTimeout);
  cardEl._flipTimeout = setTimeout(() => {
    bottomStatic.textContent = nextValue;
    cardEl.classList.remove('flipping');
  }, durationMs + 20);
}

// -----------------------------------------------------------------------------
// Live Date Display & Time Synchronization
// -----------------------------------------------------------------------------
let isInitialized = false;
let lastRenderedDateString = '';

function getFormattedDate(now) {
  const weekdayLong = now.toLocaleDateString('en-US', { weekday: 'long' });
  const weekdayShort = now.toLocaleDateString('en-US', { weekday: 'short' });
  const monthLong = now.toLocaleDateString('en-US', { month: 'long' });
  const monthShort = now.toLocaleDateString('en-US', { month: 'short' });
  const day = now.getDate();
  const year = now.getFullYear();

  if (state.dateFormat === 'short') {
    return `${weekdayShort}, ${monthShort} ${day}`;
  } else if (state.dateFormat === 'numeric') {
    const dayPad = day < 10 ? '0' + day : day;
    const monthPad = (now.getMonth() + 1) < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1);
    return `${weekdayShort}, ${dayPad}/${monthPad}/${year}`;
  }

  // Default 'full'
  return `${weekdayLong}, ${monthLong} ${day}`;
}

function updateDateDisplay(now) {
  if (!state.showDate) {
    if (dateContainer) dateContainer.classList.add('hidden');
    return;
  }

  if (dateContainer) dateContainer.classList.remove('hidden');
  const dateStr = getFormattedDate(now);
  if (dateStr !== lastRenderedDateString) {
    if (dateText) {
      // If updating after initial render (e.g. at midnight or on format change), trigger subtle entrance animation
      if (lastRenderedDateString !== '') {
        dateText.classList.remove('date-entrance');
        void dateText.offsetWidth; // Force CSS reflow to re-trigger animation seamlessly
        dateText.classList.add('date-entrance');
      }
      dateText.textContent = dateStr;
    }
    lastRenderedDateString = dateStr;
  }
}

function getFormattedTime() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  let ampm = 'AM';
  if (hours >= 12) {
    ampm = 'PM';
  }

  if (!state.is24h) {
    hours = hours % 12;
    if (hours === 0) hours = 12;
  }

  let hoursStr = hours.toString();
  if (state.leadingZero && hoursStr.length === 1) {
    hoursStr = '0' + hoursStr;
  }

  const minutesStr = minutes < 10 ? '0' + minutes : minutes.toString();
  const secondsStr = seconds < 10 ? '0' + seconds : seconds.toString();

  return {
    hours: hoursStr,
    minutes: minutesStr,
    seconds: secondsStr,
    ampm: ampm,
    rawHours: now.getHours(),
    rawMinutes: now.getMinutes(),
    rawSeconds: now.getSeconds(),
    nowObj: now
  };
}

function updateClock() {
  const time = getFormattedTime();

  if (!isInitialized) {
    setCardDirect(hoursCard, time.hours);
    setCardDirect(minutesCard, time.minutes);
    setCardDirect(secondsCard, time.seconds);
    updateAmPmBadge(time.ampm);
    updateDateDisplay(time.nowObj);
    updateDimmerScreen();
    isInitialized = true;
    return;
  }

  flipCard(hoursCard, time.hours);
  flipCard(minutesCard, time.minutes);

  if (state.showSeconds) {
    flipCard(secondsCard, time.seconds);
  }

  updateAmPmBadge(time.ampm);
  updateDateDisplay(time.nowObj);

  // Update gradual screen auto-dimmer based on device clock
  updateDimmerScreen();

  // Check alarm
  checkAlarm(time);
}

function updateAmPmBadge(ampm) {
  if (state.is24h || state.ampmPos === 'hidden') {
    ampmBadge.classList.add('hidden');
  } else {
    ampmBadge.classList.remove('hidden');
    ampmBadge.textContent = ampm;

    ampmBadge.classList.remove('pos-bottom-left', 'pos-top-left');
    if (state.ampmPos === 'top-left') {
      ampmBadge.classList.add('pos-top-left');
    } else {
      ampmBadge.classList.add('pos-bottom-left');
    }
  }
}

// -----------------------------------------------------------------------------
// Dynamic Island Floating Status Bar Engine
// -----------------------------------------------------------------------------
let dynamicIslandActionType = null; // 'timer' | 'alarm' | 'snooze'

function updateDynamicIsland() {
  if (!dynamicIsland) return;

  // Case 1: Active Ringing Alarm (Highest Priority)
  if (isAlarmRinging) {
    dynamicIsland.classList.remove('collapsed');
    islandIcon.textContent = '🔔';
    islandTitle.textContent = 'Alarm';
    islandStatus.textContent = activeRingingAlarm ? `${activeRingingAlarm.label || 'Ringing'}` : 'Ringing Now!';
    islandAction.textContent = 'Dismiss';
    dynamicIslandActionType = 'alarm-ringing';
    return;
  }

  // Case 2: Active Snooze Countdown
  if (state.snoozeUntil && Date.now() < state.snoozeUntil) {
    const diffMs = state.snoozeUntil - Date.now();
    const diffMins = Math.ceil(diffMs / (60 * 1000));
    dynamicIsland.classList.remove('collapsed');
    islandIcon.textContent = '⏳';
    islandTitle.textContent = 'Snooze';
    islandStatus.textContent = `${diffMins}m remaining`;
    islandAction.textContent = 'View';
    dynamicIslandActionType = 'snooze';
    return;
  }

  // Case 3: Stopwatch Active or Paused with Time
  if (stopwatchRunning || stopwatchElapsed > 0) {
    dynamicIsland.classList.remove('collapsed');
    islandIcon.textContent = '⏱️';
    islandTitle.textContent = stopwatchRunning ? 'Stopwatch' : 'Paused';
    const currentMs = stopwatchRunning ? (Date.now() - stopwatchStart + stopwatchElapsed) : stopwatchElapsed;
    islandStatus.textContent = formatStopwatchTime(currentMs);
    islandAction.textContent = 'View';
    dynamicIslandActionType = 'timer';
    return;
  }

  // Case 4: Next Active Enabled Alarm approaching within 12 hours
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  let nextAlarm = null;
  let minDiff = Infinity;

  if (Array.isArray(state.alarms)) {
    for (const alm of state.alarms) {
      if (!alm.enabled) continue;
      const [ah, am] = alm.time.split(':').map(Number);
      let targetMinutes = ah * 60 + am;
      let diff = targetMinutes - nowMinutes;
      if (diff < 0) diff += 1440; // Next day
      if (diff < minDiff) {
        minDiff = diff;
        nextAlarm = alm;
      }
    }
  }

  if (nextAlarm && minDiff <= 720) { // within 12 hours
    dynamicIsland.classList.remove('collapsed');
    islandIcon.textContent = '⏰';
    islandTitle.textContent = nextAlarm.label ? nextAlarm.label.slice(0, 14) : 'Alarm';
    const hoursRemaining = Math.floor(minDiff / 60);
    const minsRemaining = minDiff % 60;
    const timeLabel = hoursRemaining > 0 ? `${hoursRemaining}h ${minsRemaining}m` : `${minsRemaining}m`;
    islandStatus.textContent = `${formatAlarmDisplayTime(nextAlarm.time)} (in ${timeLabel})`;
    islandAction.textContent = 'Alarms';
    dynamicIslandActionType = 'alarm-upcoming';
    return;
  }

  // Case 5: Idle - Collapse smoothly
  dynamicIsland.classList.add('collapsed');
  dynamicIslandActionType = null;
}

if (dynamicIsland) {
  dynamicIsland.addEventListener('click', () => {
    if (dynamicIslandActionType === 'alarm-ringing') {
      dismissAlarm();
    } else if (dynamicIslandActionType === 'timer') {
      openModal(timerBackdrop);
    } else {
      openModal(alarmBackdrop);
    }
  });
}

// -----------------------------------------------------------------------------
// Multiple Alarms & Snooze Engine (with Background & Offline Support)
// -----------------------------------------------------------------------------
let alarmAlarmedMinute = -1;
let alarmLoopInterval = null;
let isAlarmRinging = false;
let activeRingingAlarm = null;

function formatAlarmDisplayTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  if (state.is24h) {
    return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;
  }
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = (h % 12) || 12;
  return `${h12}:${m < 10 ? '0' + m : m} ${suffix}`;
}

function getSoundName(soundKey) {
  switch (soundKey) {
    case 'zen-bell': return 'Zen Bell';
    case 'marimba-chime': return 'Marimba';
    case 'mechanical-buzz': return 'Mechanical Buzz';
    default: return 'Classic Beep';
  }
}

function renderAlarmsList() {
  if (!alarmsList) return;
  alarmsList.innerHTML = '';

  const alarms = state.alarms || [];
  const activeCount = alarms.filter(a => a.enabled).length;

  if (alarmsCountBadge) {
    alarmsCountBadge.textContent = `${activeCount} active`;
  }

  // Update bottom nav button tint
  if (btnAlarm) {
    if (state.snoozeUntil && Date.now() < state.snoozeUntil) {
      btnAlarm.style.color = '#f59e0b';
    } else if (activeCount > 0) {
      btnAlarm.style.color = '#3b82f6';
    } else {
      btnAlarm.style.color = '';
    }
  }

  if (alarms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'alarms-empty-state';
    empty.textContent = 'No alarms configured. Add an alarm time above.';
    alarmsList.appendChild(empty);
    updateDynamicIsland();
    return;
  }

  alarms.forEach((alarm) => {
    const item = document.createElement('div');
    item.className = `alarm-item ${alarm.enabled ? 'active' : ''}`;
    item.dataset.id = alarm.id;

    const displayTime = formatAlarmDisplayTime(alarm.time);
    const soundName = getSoundName(alarm.sound);

    item.innerHTML = `
      <div class="alarm-item-info">
        <span class="alarm-item-time">${displayTime}</span>
        <span class="alarm-item-label">
          <span>${alarm.label ? escapeHtml(alarm.label) : 'Alarm'}</span>
          <span class="alarm-sound-badge">♫ ${soundName}</span>
        </span>
      </div>
      <div class="alarm-item-controls">
        <label class="switch" title="Toggle Alarm">
          <input type="checkbox" class="alarm-toggle-checkbox" data-id="${alarm.id}" ${alarm.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
        <button type="button" class="alarm-delete-btn" data-id="${alarm.id}" title="Delete alarm">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    alarmsList.appendChild(item);
  });

  updateDynamicIsland();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addAlarm() {
  if (!newAlarmTime || !newAlarmTime.value) return;

  const timeVal = newAlarmTime.value;
  const labelVal = (newAlarmLabel && newAlarmLabel.value.trim()) || 'Alarm';
  const soundVal = (newAlarmSound && newAlarmSound.value) || 'classic-beep';

  const newAlarm = {
    id: 'alarm-' + Date.now(),
    time: timeVal,
    label: labelVal,
    enabled: true,
    sound: soundVal
  };

  state.alarms.push(newAlarm);
  saveState();
  renderAlarmsList();
  hapticService.heavyClick();

  if (newAlarmLabel) newAlarmLabel.value = '';

  // Proactively request background notification permission if not yet decided
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(updateNotifBadge).catch(() => {});
  }
}

if (btnAddAlarm) {
  btnAddAlarm.addEventListener('click', addAlarm);
}

if (alarmsList) {
  alarmsList.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.alarm-delete-btn');
    if (deleteBtn) {
      hapticService.delete();
      const alarmId = deleteBtn.dataset.id;
      state.alarms = state.alarms.filter(a => a.id !== alarmId);
      saveState();
      renderAlarmsList();
      return;
    }
  });

  alarmsList.addEventListener('change', (e) => {
    if (e.target.classList.contains('alarm-toggle-checkbox')) {
      hapticService.toggle();
      const alarmId = e.target.dataset.id;
      const alarm = state.alarms.find(a => a.id === alarmId);
      if (alarm) {
        alarm.enabled = e.target.checked;
        saveState();
        renderAlarmsList();

        // If enabling, ensure notification permission prompt is shown
        if (alarm.enabled && 'Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().then(updateNotifBadge).catch(() => {});
        }
      }
    }
  });
}

function checkAlarm(time) {
  const nowMs = Date.now();

  // 1. Check active Snooze trigger
  if (state.snoozeUntil && nowMs >= state.snoozeUntil) {
    const snoozedAlarm = state.alarms.find(a => a.id === state.snoozeAlarmId) || {
      time: '07:00',
      label: 'Snooze Expired',
      sound: 'classic-beep'
    };
    state.snoozeUntil = null;
    state.snoozeAlarmId = null;
    saveState();
    updateSnoozeUI();
    triggerAlarm(snoozedAlarm, 'Snooze Expired');
    return;
  }

  // 2. Check scheduled alarms in array
  if (!Array.isArray(state.alarms)) return;

  const currentMinuteId = time.rawHours * 60 + time.rawMinutes;

  if (alarmAlarmedMinute === currentMinuteId) {
    return; // Already triggered during this minute
  }

  for (const alarm of state.alarms) {
    if (!alarm.enabled) continue;
    const [alarmH, alarmM] = alarm.time.split(':').map(Number);
    if (time.rawHours === alarmH && time.rawMinutes === alarmM && time.rawSeconds < 2) {
      if (!isAlarmRinging) {
        alarmAlarmedMinute = currentMinuteId;
        triggerAlarm(alarm, alarm.label || 'Scheduled Alarm');
        break;
      }
    }
  }

  updateDynamicIsland();
}

function triggerAlarm(alarm, sourceLabel = 'Alarm') {
  if (isAlarmRinging) return;
  isAlarmRinging = true;
  activeRingingAlarm = alarm;

  const displayTime = formatAlarmDisplayTime(alarm.time);

  alarmBannerTime.textContent = displayTime;
  const labelEl = alarmBanner.querySelector('.alarm-label-display');
  if (labelEl) {
    labelEl.textContent = alarm.label ? `${alarm.label} - Ringing!` : 'Alarm Ringing!';
  }

  alarmSnoozeBtn.textContent = `Snooze (${state.snoozeMinutes}m)`;
  alarmBanner.classList.remove('hidden');

  // Trigger vibration if supported on tablet
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([400, 200, 400, 200, 800]);
    } catch (e) {}
  }

  // Play alarm sound in loop
  const soundKey = alarm.sound || 'classic-beep';
  playAlarmSoundPattern(soundKey);
  clearInterval(alarmLoopInterval);

  const loopGap = soundKey === 'zen-bell' ? 2400 : 1500;
  alarmLoopInterval = setInterval(() => {
    playAlarmSoundPattern(soundKey);
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([300, 150, 300]);
      } catch (e) {}
    }
  }, loopGap);

  updateDynamicIsland();

  // If in background, send notification via Service Worker
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(`⏰ ${alarm.label || 'Alarm'}: ${displayTime}`, {
          body: `Tap to open or snooze for ${state.snoozeMinutes} minutes`,
          icon: '/icon.svg',
          badge: '/icon.svg',
          tag: 'flip-clock-alarm-' + alarm.id,
          renotify: true,
          requireInteraction: true,
          vibrate: [400, 200, 400, 200, 800],
          actions: [
            { action: 'snooze', title: `Snooze (${state.snoozeMinutes}m)` },
            { action: 'dismiss', title: 'Dismiss' }
          ]
        });
      });
    }
  }
}

function snoozeAlarm() {
  hapticService.snooze();
  const snoozedAlarmId = activeRingingAlarm ? activeRingingAlarm.id : null;
  stopAlarmRinging();

  const snoozeMs = state.snoozeMinutes * 60 * 1000;
  state.snoozeUntil = Date.now() + snoozeMs;
  state.snoozeAlarmId = snoozedAlarmId;
  saveState();

  updateSnoozeUI();
}

function cancelSnooze() {
  hapticService.click();
  state.snoozeUntil = null;
  state.snoozeAlarmId = null;
  saveState();
  updateSnoozeUI();
}

function dismissAlarm() {
  hapticService.heavyClick();
  stopAlarmRinging();
  state.snoozeUntil = null;
  state.snoozeAlarmId = null;
  saveState();
  updateSnoozeUI();
}

function stopAlarmRinging() {
  isAlarmRinging = false;
  activeRingingAlarm = null;
  alarmBanner.classList.add('hidden');
  if (alarmLoopInterval) {
    clearInterval(alarmLoopInterval);
    alarmLoopInterval = null;
  }
  updateDynamicIsland();
}

function updateSnoozeUI() {
  if (state.snoozeUntil && Date.now() < state.snoozeUntil) {
    const targetDate = new Date(state.snoozeUntil);
    let h = targetDate.getHours();
    const m = targetDate.getMinutes();
    let timeStr = '';
    if (!state.is24h) {
      const suffix = h >= 12 ? 'PM' : 'AM';
      h = (h % 12) || 12;
      timeStr = `${h}:${m < 10 ? '0' + m : m} ${suffix}`;
    } else {
      timeStr = `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;
    }

    snoozeStatusText.textContent = `⏳ Snoozed until ${timeStr}`;
    snoozeIndicator.classList.remove('hidden');
    if (btnAlarm) btnAlarm.style.color = '#f59e0b';
  } else {
    snoozeIndicator.classList.add('hidden');
    renderAlarmsList();
  }
  updateDynamicIsland();
}

// Alarm Banner Event Listeners
if (alarmSnoozeBtn) {
  alarmSnoozeBtn.addEventListener('click', snoozeAlarm);
}
if (alarmDismissBtn) {
  alarmDismissBtn.addEventListener('click', dismissAlarm);
}
if (cancelSnoozeBtn) {
  cancelSnoozeBtn.addEventListener('click', cancelSnooze);
}

// Listen for service worker background notification actions
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ALARM_NOTIFICATION_ACTION') {
      if (event.data.action === 'snooze') {
        snoozeAlarm();
      } else if (event.data.action === 'dismiss') {
        dismissAlarm();
      }
    }
  });
}

// -----------------------------------------------------------------------------
// Notification Permission Support
// -----------------------------------------------------------------------------
function updateNotifBadge() {
  if (!('Notification' in window)) {
    notifStatusBadge.textContent = 'Not supported in this browser';
    btnRequestNotif.style.display = 'none';
    return;
  }

  const perm = Notification.permission;
  if (perm === 'granted') {
    notifStatusBadge.textContent = 'Active (Background alerts enabled)';
    notifStatusBadge.classList.add('granted');
    btnRequestNotif.textContent = 'Alerts Allowed ✓';
    btnRequestNotif.disabled = true;
    btnRequestNotif.style.opacity = '0.6';
  } else if (perm === 'denied') {
    notifStatusBadge.textContent = 'Blocked in browser settings';
    notifStatusBadge.classList.remove('granted');
    btnRequestNotif.textContent = 'Permission Denied';
    btnRequestNotif.disabled = true;
  } else {
    notifStatusBadge.textContent = 'Permission not yet granted';
    notifStatusBadge.classList.remove('granted');
    btnRequestNotif.textContent = 'Enable Alerts';
    btnRequestNotif.disabled = false;
  }
}

if (btnRequestNotif) {
  btnRequestNotif.addEventListener('click', async () => {
    if ('Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        updateNotifBadge();
      } catch (err) {
        console.warn('Could not request notification permission:', err);
      }
    }
  });
}

// -----------------------------------------------------------------------------
// Stopwatch / Timer Logic
// -----------------------------------------------------------------------------
let stopwatchRunning = false;
let stopwatchStart = 0;
let stopwatchElapsed = 0;
let stopwatchTimer = null;

function formatStopwatchTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);

  const mStr = minutes < 10 ? '0' + minutes : minutes;
  const sStr = seconds < 10 ? '0' + seconds : seconds;
  return `${mStr}:${sStr}.${tenths}`;
}

function updateStopwatch() {
  const current = Date.now() - stopwatchStart + stopwatchElapsed;
  stopwatchDisplay.textContent = formatStopwatchTime(current);
  if (dynamicIslandActionType === 'timer' && islandStatus) {
    islandStatus.textContent = formatStopwatchTime(current);
  }
}

if (stopwatchStartBtn) {
  stopwatchStartBtn.addEventListener('click', () => {
    initAudio();
    if (!stopwatchRunning) {
      stopwatchRunning = true;
      stopwatchStart = Date.now();
      stopwatchTimer = setInterval(updateStopwatch, 50);
      stopwatchStartBtn.textContent = 'Pause';
      stopwatchStartBtn.style.backgroundColor = '#f59e0b';
    } else {
      stopwatchRunning = false;
      stopwatchElapsed += Date.now() - stopwatchStart;
      clearInterval(stopwatchTimer);
      stopwatchStartBtn.textContent = 'Resume';
      stopwatchStartBtn.style.backgroundColor = '#2563eb';
    }
    updateDynamicIsland();
  });
}

if (stopwatchResetBtn) {
  stopwatchResetBtn.addEventListener('click', () => {
    stopwatchRunning = false;
    clearInterval(stopwatchTimer);
    stopwatchElapsed = 0;
    stopwatchDisplay.textContent = '00:00.0';
    stopwatchStartBtn.textContent = 'Start';
    stopwatchStartBtn.style.backgroundColor = '#2563eb';
    updateDynamicIsland();
  });
}

// -----------------------------------------------------------------------------
// WakeLock API (Desk Tablet Mode)
// -----------------------------------------------------------------------------
let wakeLock = null;

async function requestWakeLock() {
  if (!state.wakeLockEnabled) return;
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch (err) {
      // Non-blocking
    }
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null;
    });
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    requestWakeLock();
    isInitialized = false;
    updateClock();
  }
});

// -----------------------------------------------------------------------------
// Nightstand Dimmer & Device Clock Gradual Auto-Dimming (Night Mode)
// -----------------------------------------------------------------------------
/**
 * Calculates gradual light falloff factor (0.0 to 1.0) using device clock.
 * Features a 45-minute smooth ramp-in at bedtime and 45-minute ramp-out at wake time.
 */
function calculateAutoDimFactor(now, startTimeStr, endTimeStr) {
  if (!startTimeStr || !endTimeStr) return 0;
  const [sH, sM] = startTimeStr.split(':').map(Number);
  const [eH, eM] = endTimeStr.split(':').map(Number);

  const nowM = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const startM = sH * 60 + sM;
  const endM = eH * 60 + eM;

  // 45-minute gradual transition ramp for organic, eye-safe light falloff
  const rampDuration = 45;

  let isNight = false;
  let elapsed = 0;
  let totalNightDuration = 0;
  let remaining = 0;

  if (startM > endM) {
    totalNightDuration = (1440 - startM) + endM;
    isNight = (nowM >= startM || nowM < endM);
    if (isNight) {
      elapsed = (nowM >= startM) ? (nowM - startM) : ((1440 - startM) + nowM);
      remaining = totalNightDuration - elapsed;
    }
  } else {
    totalNightDuration = endM - startM;
    isNight = (nowM >= startM && nowM < endM);
    if (isNight) {
      elapsed = nowM - startM;
      remaining = endM - nowM;
    }
  }

  if (isNight) {
    // Check morning sunrise ramp-out: gradually restore screen brightness
    if (remaining < rampDuration) {
      return Math.max(0, Math.min(1, remaining / rampDuration));
    }
    // Deep night: full dimming
    return 1.0;
  }

  // Check evening sunset ramp-in: gradually dim down as night approaches
  let diffBeforeStart = startM - nowM;
  if (diffBeforeStart < 0) {
    diffBeforeStart += 1440;
  }

  if (diffBeforeStart <= rampDuration && diffBeforeStart > 0) {
    return Math.max(0, Math.min(1, 1 - (diffBeforeStart / rampDuration)));
  }

  return 0.0;
}

function getEffectiveDimmer() {
  const baseLevel = Number(state.dimmerValue) || 0;
  if (!state.autoDim || !state.autoDim.enabled) {
    return {
      value: baseLevel,
      isAuto: false,
      factor: 0
    };
  }

  const factor = calculateAutoDimFactor(new Date(), state.autoDim.startTime, state.autoDim.endTime);
  const targetLevel = Number(state.autoDim.nightDimmerLevel) || 70;
  // Gradually lower screen brightness: smoothly interpolates from baseLevel up to nightDimmerLevel
  const effectiveValue = Math.round(baseLevel + (Math.max(baseLevel, targetLevel) - baseLevel) * factor);

  return {
    value: effectiveValue,
    isAuto: true,
    factor: factor,
    targetLevel: targetLevel
  };
}

function updateDimmerScreen() {
  const current = getEffectiveDimmer();
  const opacity = current.value / 100;
  dimmerOverlay.style.opacity = opacity.toString();

  if (current.value > 0) {
    appRoot.classList.add('dimmed');
  } else {
    appRoot.classList.remove('dimmed');
  }

  updateAutoDimUI(current);
}

function applyDimmer(val) {
  state.dimmerValue = Number(val);
  dimmerValueText.textContent = `${state.dimmerValue}%`;
  updateDimmerScreen();
}

function updateAutoDimUI(current) {
  if (!toggleAutoDim) return;
  const enabled = Boolean(state.autoDim && state.autoDim.enabled);
  toggleAutoDim.checked = enabled;

  if (autoDimOptions) {
    if (enabled) {
      autoDimOptions.style.opacity = '1';
      autoDimOptions.style.pointerEvents = 'auto';
    } else {
      autoDimOptions.style.opacity = '0.45';
      autoDimOptions.style.pointerEvents = 'none';
    }
  }

  if (autoDimStart && state.autoDim) autoDimStart.value = state.autoDim.startTime || '22:00';
  if (autoDimEnd && state.autoDim) autoDimEnd.value = state.autoDim.endTime || '06:30';
  if (autoDimLevel && state.autoDim) autoDimLevel.value = state.autoDim.nightDimmerLevel || 70;
  if (autoDimLevelText && state.autoDim) autoDimLevelText.textContent = `${state.autoDim.nightDimmerLevel || 70}%`;

  if (autoDimStatusText && autoDimIndicator) {
    if (!enabled) {
      autoDimStatusText.textContent = 'Auto-dimming off (Manual slider active)';
      autoDimIndicator.className = 'auto-dim-indicator';
      autoDimIndicator.style.backgroundColor = '#6b7280';
    } else {
      const cur = current || getEffectiveDimmer();
      if (cur.factor >= 0.95) {
        autoDimStatusText.textContent = `🌙 Night Mode Active (Screen dimmed to ${cur.value}%)`;
        autoDimIndicator.className = 'auto-dim-indicator active';
        autoDimIndicator.style.backgroundColor = '';
      } else if (cur.factor > 0) {
        const percent = Math.round(cur.factor * 100);
        autoDimStatusText.textContent = `🌇 Gradual Dimming in Progress (${percent}% transition, now ${cur.value}%)`;
        autoDimIndicator.className = 'auto-dim-indicator active';
        autoDimIndicator.style.backgroundColor = '';
      } else {
        const sTime = formatAlarmDisplayTime(state.autoDim.startTime);
        autoDimStatusText.textContent = `☀️ Day Mode (Gradual auto-dimming starts before ${sTime})`;
        autoDimIndicator.className = 'auto-dim-indicator day';
        autoDimIndicator.style.backgroundColor = '';
      }
    }
  }
}

if (inputDimmer) {
  inputDimmer.addEventListener('input', (e) => {
    applyDimmer(e.target.value);
    saveState();
  });
}

dimmerOverlay.addEventListener('click', () => {
  const current = getEffectiveDimmer();
  if (current.value > 0) {
    dimmerOverlay.style.opacity = '0';
    setTimeout(() => {
      updateDimmerScreen();
    }, 4000);
  }
});

// -----------------------------------------------------------------------------
// Theme Management & Custom Color Picker
// -----------------------------------------------------------------------------
function applyCustomPalette(colors) {
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty('--card-bg', colors.cardBg);
  rootStyle.setProperty('--card-top-bg', colors.cardBg);
  rootStyle.setProperty('--card-bottom-bg', colors.cardBg);
  rootStyle.setProperty('--text-color', colors.textColor);
  rootStyle.setProperty('--bg-color', colors.bgColor);
  rootStyle.setProperty('--card-split-color', colors.splitColor);
  rootStyle.setProperty('--axis-line-color', `${colors.textColor}1a`);
}

function clearCustomPaletteStyles() {
  const rootStyle = document.documentElement.style;
  rootStyle.removeProperty('--card-bg');
  rootStyle.removeProperty('--card-top-bg');
  rootStyle.removeProperty('--card-bottom-bg');
  rootStyle.removeProperty('--text-color');
  rootStyle.removeProperty('--bg-color');
  rootStyle.removeProperty('--card-split-color');
  rootStyle.removeProperty('--axis-line-color');
}

function applyTheme(themeName) {
  state.theme = themeName;

  if (themeName === 'custom') {
    document.documentElement.removeAttribute('data-theme');
    applyCustomPalette(state.customColors);
  } else {
    clearCustomPaletteStyles();
    document.documentElement.setAttribute('data-theme', themeName);
  }

  themeOptions.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === themeName);
  });
}

function applySettings() {
  // Theme & Custom Colors
  if (state.theme === 'custom') {
    applyTheme('custom');
  } else {
    applyTheme(state.theme);
  }

  // Update Color Picker input values
  if (pickerCardBg) pickerCardBg.value = state.customColors.cardBg;
  if (pickerTextColor) pickerTextColor.value = state.customColors.textColor;
  if (pickerBgColor) pickerBgColor.value = state.customColors.bgColor;
  if (pickerSplitColor) pickerSplitColor.value = state.customColors.splitColor;

  // Date settings
  if (toggleDate) toggleDate.checked = state.showDate;
  if (selectDateStyle) selectDateStyle.value = state.dateFormat;
  if (dateStyleRow) {
    dateStyleRow.style.opacity = state.showDate ? '1' : '0.4';
    selectDateStyle.disabled = !state.showDate;
  }
  updateDateDisplay(new Date());

  // 24h toggle
  toggle24h.checked = state.is24h;
  if (state.is24h) {
    ampmSettingRow.style.opacity = '0.4';
    selectAmpmPos.disabled = true;
  } else {
    ampmSettingRow.style.opacity = '1';
    selectAmpmPos.disabled = false;
  }

  selectAmpmPos.value = state.ampmPos;
  toggleLeadingZero.checked = state.leadingZero;

  toggleSeconds.checked = state.showSeconds;
  if (state.showSeconds) {
    secondsCard.classList.remove('hidden');
    clockStage.classList.add('with-seconds');
  } else {
    secondsCard.classList.add('hidden');
    clockStage.classList.remove('with-seconds');
  }

  toggleSound.checked = state.soundEnabled;
  if (toggleHaptics) {
    toggleHaptics.checked = state.hapticEnabled !== false;
  }

  toggleWakeLock.checked = state.wakeLockEnabled;
  if (state.wakeLockEnabled) {
    requestWakeLock();
  } else {
    releaseWakeLock();
  }

  inputDimmer.value = state.dimmerValue;
  applyDimmer(state.dimmerValue);
  updateAutoDimUI();

  selectFlipSpeed.value = state.flipSpeed;
  document.documentElement.style.setProperty('--flip-duration', state.flipSpeed);

  // Clock Font Setting
  applyClockFont(state.clockFont || 'bebas-neue');

  // Alarm settings
  if (selectSnoozeDuration) {
    selectSnoozeDuration.value = (state.snoozeMinutes || 5).toString();
  }
  renderAlarmsList();
  updateSnoozeUI();
  updateNotifBadge();
  updateDynamicIsland();

  // Re-render clock
  isInitialized = false;
  updateClock();
}

function applyClockFont(fontName) {
  state.clockFont = fontName || 'bebas-neue';
  document.documentElement.dataset.font = state.clockFont;
  if (selectClockFont) {
    selectClockFont.value = state.clockFont;
  }
}

// -----------------------------------------------------------------------------
// Event Listeners for Theme & Custom Color Controls
// -----------------------------------------------------------------------------
themeOptions.forEach((btn) => {
  btn.addEventListener('click', () => {
    applyTheme(btn.dataset.theme);
    saveState();
  });
});

function handleCustomColorInput() {
  state.customColors = {
    cardBg: pickerCardBg.value,
    textColor: pickerTextColor.value,
    bgColor: pickerBgColor.value,
    splitColor: pickerSplitColor.value
  };
  state.theme = 'custom';
  applyTheme('custom');
  saveState();
}

if (pickerCardBg) pickerCardBg.addEventListener('input', handleCustomColorInput);
if (pickerTextColor) pickerTextColor.addEventListener('input', handleCustomColorInput);
if (pickerBgColor) pickerBgColor.addEventListener('input', handleCustomColorInput);
if (pickerSplitColor) pickerSplitColor.addEventListener('input', handleCustomColorInput);

if (btnResetCustomColors) {
  btnResetCustomColors.addEventListener('click', () => {
    state.theme = 'dark-charcoal';
    state.customColors = { ...defaultState.customColors };
    applyTheme('dark-charcoal');
    if (pickerCardBg) pickerCardBg.value = state.customColors.cardBg;
    if (pickerTextColor) pickerTextColor.value = state.customColors.textColor;
    if (pickerBgColor) pickerBgColor.value = state.customColors.bgColor;
    if (pickerSplitColor) pickerSplitColor.value = state.customColors.splitColor;
    saveState();
  });
}

// Clock Font selector listener
if (selectClockFont) {
  selectClockFont.addEventListener('change', (e) => {
    applyClockFont(e.target.value);
    saveState();
  });
}

// Date settings listeners
if (toggleDate) {
  toggleDate.addEventListener('change', (e) => {
    state.showDate = e.target.checked;
    if (dateStyleRow) {
      dateStyleRow.style.opacity = state.showDate ? '1' : '0.4';
      selectDateStyle.disabled = !state.showDate;
    }
    updateDateDisplay(new Date());
    saveState();
  });
}

if (selectDateStyle) {
  selectDateStyle.addEventListener('change', (e) => {
    state.dateFormat = e.target.value;
    lastRenderedDateString = ''; // force re-render
    updateDateDisplay(new Date());
    saveState();
  });
}

// Alarm Modal Sound Preview & Snooze duration
if (btnPreviewSound) {
  btnPreviewSound.addEventListener('click', () => {
    const soundKey = (newAlarmSound && newAlarmSound.value) || 'classic-beep';
    playAlarmSoundPattern(soundKey);
  });
}

if (selectSnoozeDuration) {
  selectSnoozeDuration.addEventListener('change', (e) => {
    state.snoozeMinutes = Number(e.target.value);
    saveState();
  });
}

// General Settings Listeners
toggle24h.addEventListener('change', (e) => {
  state.is24h = e.target.checked;
  if (state.is24h) {
    ampmSettingRow.style.opacity = '0.4';
    selectAmpmPos.disabled = true;
  } else {
    ampmSettingRow.style.opacity = '1';
    selectAmpmPos.disabled = false;
  }
  saveState();
  isInitialized = false;
  updateClock();
});

selectAmpmPos.addEventListener('change', (e) => {
  state.ampmPos = e.target.value;
  saveState();
  updateAmPmBadge(getFormattedTime().ampm);
});

toggleLeadingZero.addEventListener('change', (e) => {
  state.leadingZero = e.target.checked;
  saveState();
  isInitialized = false;
  updateClock();
});

toggleSeconds.addEventListener('change', (e) => {
  state.showSeconds = e.target.checked;
  if (state.showSeconds) {
    secondsCard.classList.remove('hidden');
    clockStage.classList.add('with-seconds');
  } else {
    secondsCard.classList.add('hidden');
    clockStage.classList.remove('with-seconds');
  }
  saveState();
  isInitialized = false;
  updateClock();
});

toggleSound.addEventListener('change', (e) => {
  state.soundEnabled = e.target.checked;
  if (state.soundEnabled) {
    initAudio();
    playMechanicalFlipSound();
  }
  saveState();
});

if (toggleHaptics) {
  toggleHaptics.addEventListener('change', (e) => {
    state.hapticEnabled = e.target.checked;
    saveState();
    if (state.hapticEnabled) {
      hapticService.toggle();
    }
  });
}

toggleWakeLock.addEventListener('change', (e) => {
  state.wakeLockEnabled = e.target.checked;
  if (state.wakeLockEnabled) {
    requestWakeLock();
  } else {
    releaseWakeLock();
  }
  saveState();
});

// Auto-Dimming Event Listeners
if (toggleAutoDim) {
  toggleAutoDim.addEventListener('change', (e) => {
    if (!state.autoDim) state.autoDim = { ...defaultState.autoDim };
    state.autoDim.enabled = e.target.checked;
    saveState();
    updateDimmerScreen();
  });
}

if (autoDimStart) {
  autoDimStart.addEventListener('change', (e) => {
    if (!state.autoDim) state.autoDim = { ...defaultState.autoDim };
    state.autoDim.startTime = e.target.value;
    saveState();
    updateDimmerScreen();
  });
}

if (autoDimEnd) {
  autoDimEnd.addEventListener('change', (e) => {
    if (!state.autoDim) state.autoDim = { ...defaultState.autoDim };
    state.autoDim.endTime = e.target.value;
    saveState();
    updateDimmerScreen();
  });
}

if (autoDimLevel) {
  autoDimLevel.addEventListener('input', (e) => {
    if (!state.autoDim) state.autoDim = { ...defaultState.autoDim };
    state.autoDim.nightDimmerLevel = Number(e.target.value);
    if (autoDimLevelText) autoDimLevelText.textContent = `${state.autoDim.nightDimmerLevel}%`;
    saveState();
    updateDimmerScreen();
  });
}

selectFlipSpeed.addEventListener('change', (e) => {
  state.flipSpeed = e.target.value;
  document.documentElement.style.setProperty('--flip-duration', state.flipSpeed);
  saveState();
});

// Fullscreen
btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.warn('Fullscreen request failed:', err);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
});

// -----------------------------------------------------------------------------
// Modal Navigation Handlers
// -----------------------------------------------------------------------------
function openModal(modalEl) {
  modalEl.classList.remove('hidden');
}

function closeModal(modalEl) {
  modalEl.classList.add('hidden');
}

btnSettings.addEventListener('click', () => {
  hapticService.click();
  openModal(settingsBackdrop);
});

settingsCloseBtn.addEventListener('click', () => {
  hapticService.click();
  closeModal(settingsBackdrop);
});

settingsBackdrop.addEventListener('click', (e) => {
  if (e.target === settingsBackdrop) {
    hapticService.click();
    closeModal(settingsBackdrop);
  }
});

btnAlarm.addEventListener('click', () => {
  hapticService.click();
  openModal(alarmBackdrop);
});

alarmCloseBtn.addEventListener('click', () => {
  hapticService.click();
  closeModal(alarmBackdrop);
});

alarmBackdrop.addEventListener('click', (e) => {
  if (e.target === alarmBackdrop) {
    hapticService.click();
    closeModal(alarmBackdrop);
  }
});

btnTimer.addEventListener('click', () => {
  hapticService.click();
  openModal(timerBackdrop);
});

timerCloseBtn.addEventListener('click', () => {
  hapticService.click();
  closeModal(timerBackdrop);
});

timerBackdrop.addEventListener('click', (e) => {
  if (e.target === timerBackdrop) {
    hapticService.click();
    closeModal(timerBackdrop);
  }
});

btnClock.addEventListener('click', () => {
  hapticService.click();
  closeModal(settingsBackdrop);
  closeModal(alarmBackdrop);
  closeModal(timerBackdrop);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal(settingsBackdrop);
    closeModal(alarmBackdrop);
    closeModal(timerBackdrop);
    dismissAlarm();
  }
});

// -----------------------------------------------------------------------------
// Battery Status API Service (Top-Right Corner Indicator)
// -----------------------------------------------------------------------------
let batteryManager = null;
let isBatterySimulated = false;

function updateBatteryUI(isCharging, levelPercent, chargingTime, dischargingTime) {
  if (!batteryCorner || !batteryLevelFill || !batteryText) return;

  const clampedLevel = Math.max(0, Math.min(100, Math.round(levelPercent)));
  batteryLevelFill.style.width = `${clampedLevel}%`;
  batteryText.textContent = `${clampedLevel}%`;

  // Reset indicator state classes
  batteryCorner.classList.remove('charging', 'battery-low', 'battery-critical');

  if (isCharging) {
    // When running on external power: show charging bolt icon & active cyan power theme
    batteryCorner.classList.add('charging');
    if (batteryBolt) batteryBolt.classList.remove('hidden');
    batteryCorner.setAttribute('title', `Running on Power (Charging: ${clampedLevel}%)`);
  } else {
    // When running on battery: hide charging bolt, apply subtle color changes based on charge level
    if (batteryBolt) batteryBolt.classList.add('hidden');

    if (clampedLevel <= 10) {
      // Critical charge level: soft red with gentle breathing warning pulse
      batteryCorner.classList.add('battery-critical');
      batteryCorner.setAttribute('title', `Critical Battery: ${clampedLevel}% (Please connect power)`);
    } else if (clampedLevel <= 20) {
      // Low charge level: subtle warm amber color indicator
      batteryCorner.classList.add('battery-low');
      batteryCorner.setAttribute('title', `Low Battery: ${clampedLevel}%`);
    } else {
      batteryCorner.setAttribute('title', `Battery: ${clampedLevel}%`);
    }
  }

  // Update Popover Details if present
  if (batteryStateBadge) {
    batteryStateBadge.textContent = isCharging ? 'AC Power' : 'Battery';
    batteryStateBadge.style.color = isCharging ? '#38bdf8' : (clampedLevel <= 20 ? '#fbbf24' : '#d1d5db');
  }
  if (batteryPopoverLevel) {
    batteryPopoverLevel.textContent = `${clampedLevel}%`;
    batteryPopoverLevel.style.color = isCharging ? '#38bdf8' : (clampedLevel <= 10 ? '#ef4444' : (clampedLevel <= 20 ? '#f59e0b' : '#ffffff'));
  }
  if (batteryPopoverTime) {
    if (isCharging) {
      if (chargingTime && isFinite(chargingTime) && chargingTime > 0) {
        const mins = Math.round(chargingTime / 60);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        batteryPopoverTime.textContent = h > 0 ? `${h}h ${m}m to full` : `${m}m to full`;
      } else {
        batteryPopoverTime.textContent = 'Running on Power';
      }
    } else {
      if (dischargingTime && isFinite(dischargingTime) && dischargingTime > 0) {
        const mins = Math.round(dischargingTime / 60);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        batteryPopoverTime.textContent = h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
      } else {
        batteryPopoverTime.textContent = clampedLevel <= 20 ? 'Low Charge Level' : 'Discharging';
      }
    }
  }
}

async function initBatteryStatus() {
  if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
    try {
      batteryManager = await navigator.getBattery();

      const refresh = () => {
        if (isBatterySimulated) return;
        updateBatteryUI(
          Boolean(batteryManager.charging),
          batteryManager.level * 100,
          batteryManager.chargingTime,
          batteryManager.dischargingTime
        );
      };

      batteryManager.addEventListener('chargingchange', refresh);
      batteryManager.addEventListener('levelchange', refresh);
      batteryManager.addEventListener('chargingtimechange', refresh);
      batteryManager.addEventListener('dischargingtimechange', refresh);

      refresh();
      return;
    } catch (err) {
      console.warn('Battery Status API initialization notice:', err);
    }
  }

  // Graceful fallback for non-battery / desktop browser environments
  updateBatteryUI(true, 100, 0, Infinity);
}

// Battery Popover & Test Simulation Controls
if (batteryPill) {
  batteryPill.addEventListener('click', (e) => {
    e.stopPropagation();
    hapticService.click();
    if (batteryPopover) {
      batteryPopover.classList.toggle('hidden');
    }
  });
}

document.addEventListener('click', (e) => {
  if (batteryPopover && !batteryPopover.classList.contains('hidden')) {
    if (!batteryCorner || !batteryCorner.contains(e.target)) {
      batteryPopover.classList.add('hidden');
    }
  }
});

// Universal tactile haptic feedback delegation on all settings & alarm panel controls
function attachHapticFeedbackDelegation() {
  const panelContainers = [
    document.getElementById('settings-sheet'),
    document.getElementById('alarm-sheet'),
    document.getElementById('timer-sheet'),
    document.getElementById('bottom-bar'),
    document.getElementById('alarm-banner')
  ];

  panelContainers.forEach((container) => {
    if (!container) return;

    // Pointerdown / Click provides instant tactile click
    container.addEventListener('pointerdown', (e) => {
      const target = e.target.closest('button, .action-btn, .theme-option, .nav-btn, .modal-close-btn, .alarm-delete-btn, .btn-sound-preview, .switch, input[type="range"]');
      if (!target) return;

      if (target.classList.contains('alarm-delete-btn')) {
        hapticService.delete();
      } else if (target.id === 'btn-add-alarm' || target.id === 'alarm-dismiss-btn' || target.id === 'btn-reset-custom-colors') {
        hapticService.heavyClick();
      } else if (target.id === 'alarm-snooze-btn') {
        hapticService.snooze();
      } else if (target.classList.contains('switch')) {
        hapticService.toggle();
      } else if (target.matches('input[type="range"]')) {
        hapticService.tick();
      } else {
        hapticService.click();
      }
    });

    // Slider scrubbing micro-ticks
    container.addEventListener('input', (e) => {
      if (e.target.matches('input[type="range"], input[type="color"], input[type="time"]')) {
        hapticService.tick();
      }
    });

    // Select dropdown & checkbox toggle sensations
    container.addEventListener('change', (e) => {
      if (e.target.matches('select')) {
        hapticService.click();
      } else if (e.target.matches('input[type="checkbox"]')) {
        hapticService.toggle();
      }
    });
  });
}

// -----------------------------------------------------------------------------
// PWA BeforeInstallPrompt & Service Worker Registration
// -----------------------------------------------------------------------------
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (btnInstallPwa) {
    btnInstallPwa.classList.remove('hidden');
  }
});

if (btnInstallPwa) {
  btnInstallPwa.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      btnInstallPwa.classList.add('hidden');
    }
    deferredPrompt = null;
  });
}

window.addEventListener('appinstalled', () => {
  if (btnInstallPwa) btnInstallPwa.classList.add('hidden');
  deferredPrompt = null;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('PWA ServiceWorker registered:', reg.scope);
    }).catch((err) => {
      console.log('PWA ServiceWorker registration failed:', err);
    });
  });
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------
loadState();
applySettings();

// Initialize Battery Status API & Haptic delegation
initBatteryStatus();
attachHapticFeedbackDelegation();

// Initial clock update immediately
updateClock();

// Tick interval: every 250ms ensures sub-second accuracy on minute flips
setInterval(updateClock, 250);

// Request WakeLock
requestWakeLock();
