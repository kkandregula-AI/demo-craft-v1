 import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const STORAGE_KEY = 'demoCraftSettingsV3';
const PROJECT_KEY = 'demoCraftProjectV3';

const els = {
  scriptProvider: document.getElementById('scriptProvider'),
  voiceProvider: document.getElementById('voiceProvider'),
  openaiKey: document.getElementById('openaiKey'),
  geminiKey: document.getElementById('geminiKey'),
  elevenlabsKey: document.getElementById('elevenlabsKey'),
  elevenlabsVoiceId: document.getElementById('elevenlabsVoiceId'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  clearSettingsBtn: document.getElementById('clearSettingsBtn'),
  settingsStatus: document.getElementById('settingsStatus'),

  productName: document.getElementById('productName'),
  productDescription: document.getElementById('productDescription'),
  targetAudience: document.getElementById('targetAudience'),
  presentationType: document.getElementById('presentationType'),
  cta: document.getElementById('cta'),
  tone: document.getElementById('tone'),
  videoGoal: document.getElementById('videoGoal'),
  keyFeatures: document.getElementById('keyFeatures'),
  buildPrompt: document.getElementById('buildPrompt'),
  optimizedPrompt: document.getElementById('optimizedPrompt'),

  screenshots: document.getElementById('screenshots'),
  screenGrid: document.getElementById('screenGrid'),
  screenTemplate: document.getElementById('screenTemplate'),

  generateBtn: document.getElementById('generateBtn'),
  loadSampleBtn: document.getElementById('loadSampleBtn'),
  optimizePromptBtn: document.getElementById('optimizePromptBtn'),
  generateAllAudioBtn: document.getElementById('generateAllAudioBtn'),
  validateAudioBtn: document.getElementById('validateAudioBtn'),
  generateStatus: document.getElementById('generateStatus'),

  timeline: document.getElementById('timeline'),
  emptyState: document.getElementById('emptyState'),
  sceneTemplate: document.getElementById('sceneTemplate'),
  addSceneBtn: document.getElementById('addSceneBtn'),
  regenerateThumbsBtn: document.getElementById('regenerateThumbsBtn'),

  previewBtn: document.getElementById('previewBtn'),
  exportVideoBtn: document.getElementById('exportVideoBtn'),
  exportProjectBtn: document.getElementById('exportProjectBtn'),
  exportStatus: document.getElementById('exportStatus'),

  previewDialog: document.getElementById('previewDialog'),
  previewCanvas: document.getElementById('previewCanvas'),
  prevSceneBtn: document.getElementById('prevSceneBtn'),
  nextSceneBtn: document.getElementById('nextSceneBtn'),
  playTimelineBtn: document.getElementById('playTimelineBtn'),
  closePreviewBtn: document.getElementById('closePreviewBtn'),

  videoResolution: document.getElementById('videoResolution'),
  videoFps: document.getElementById('videoFps'),
  defaultDuration: document.getElementById('defaultDuration'),
  transitionDuration: document.getElementById('transitionDuration'),
  captionStyle: document.getElementById('captionStyle')
};

const appState = {
  steps: {
    productInfo: 'active',
    prompt: 'locked',
    screens: 'locked',
    storyboard: 'locked',
    audio: 'locked',
    export: 'locked'
  },
  completion: {
    productInfo: false,
    promptOptimized: false,
    screensUploaded: false,
    storyboardReady: false,
    audioReady: false
  }
};

let uploadedScreens = [];
let storyboard = [];
let previewIndex = 0;
let currentAudio = null;
let previewTimer = null;
const imageCache = new Map();

// Optional future MP4 path
let ffmpegInstance = null;
let ffmpegLoaded = false;
let ffmpegEventsAttached = false;

init();

function init() {
  loadSettings();
  loadProject();
  preloadAllScreens();
  bindEvents();
  renderScreens();
  renderTimeline();
  recomputeWorkflow();
}

function bindEvents() {
  els.saveSettingsBtn?.addEventListener('click', saveSettings);
  els.clearSettingsBtn?.addEventListener('click', clearSettings);

  els.screenshots?.addEventListener('change', handleScreenshotUpload);
  els.loadSampleBtn?.addEventListener('click', loadSample);
  els.optimizePromptBtn?.addEventListener('click', optimizePrompt);
  els.generateBtn?.addEventListener('click', generateStoryboard);
  els.generateAllAudioBtn?.addEventListener('click', generateAllAudio);
  els.validateAudioBtn?.addEventListener('click', validateAudioStatus);

  els.addSceneBtn?.addEventListener('click', addScene);
  els.regenerateThumbsBtn?.addEventListener('click', renderTimeline);

  els.previewBtn?.addEventListener('click', openPreview);
  els.exportProjectBtn?.addEventListener('click', exportProject);
  els.exportVideoBtn?.addEventListener('click', exportVideoAndAudio);

  els.prevSceneBtn?.addEventListener('click', () => stepPreview(-1));
  els.nextSceneBtn?.addEventListener('click', () => stepPreview(1));
  els.playTimelineBtn?.addEventListener('click', autoplayPreview);
  els.closePreviewBtn?.addEventListener('click', closePreview);

  [
    'productName',
    'productDescription',
    'targetAudience',
    'presentationType',
    'cta',
    'tone',
    'videoGoal',
    'keyFeatures',
    'buildPrompt',
    'videoResolution',
    'videoFps',
    'defaultDuration',
    'transitionDuration',
    'captionStyle'
  ].forEach((key) => {
    if (els[key]) {
      els[key].addEventListener('input', () => {
        handleProductInfoChange();
        saveProject();
      });
      els[key].addEventListener('change', () => {
        handleProductInfoChange();
        saveProject();
      });
    }
  });
}

function handleProductInfoChange() {
  appState.completion.productInfo = hasMinimumProductInfo();
  appState.completion.promptOptimized = false;
  appState.completion.storyboardReady = false;
  appState.completion.audioReady = false;

  if (els.optimizedPrompt) els.optimizedPrompt.value = '';

  clearAllSceneAudioBlobs();
  storyboard = [];
  renderTimeline();
  recomputeWorkflow();
}

function handleScreensChanged() {
  appState.completion.screensUploaded = uploadedScreens.length > 0;
  appState.completion.storyboardReady = false;
  appState.completion.audioReady = false;

  clearAllSceneAudioBlobs();
  storyboard = [];
  renderTimeline();
  recomputeWorkflow();
  saveProject();
}

function hasMinimumProductInfo() {
  return Boolean(
    els.productName.value.trim() &&
    els.productDescription.value.trim() &&
    els.videoGoal.value.trim() &&
    parseFeatures().length > 0
  );
}

function recomputeWorkflow() {
  const s = appState.steps;
  const c = appState.completion;

  Object.keys(s).forEach((k) => { s[k] = 'locked'; });

  s.productInfo = c.productInfo ? 'done' : 'active';
  if (!c.productInfo) {
    renderStepStates();
    applyLockStates();
    return;
  }

  s.prompt = c.promptOptimized ? 'done' : 'active';
  if (!c.promptOptimized) {
    renderStepStates();
    applyLockStates();
    return;
  }

  s.screens = c.screensUploaded ? 'done' : 'active';
  if (!c.screensUploaded) {
    renderStepStates();
    applyLockStates();
    return;
  }

  s.storyboard = c.storyboardReady ? 'done' : 'active';
  if (!c.storyboardReady) {
    renderStepStates();
    applyLockStates();
    return;
  }

  s.audio = c.audioReady ? 'done' : 'active';
  if (!c.audioReady) {
    renderStepStates();
    applyLockStates();
    return;
  }

  s.export = 'active';
  renderStepStates();
  applyLockStates();
}

function renderStepStates() {
  document.querySelectorAll('.workflow-step').forEach((el) => {
    const step = el.dataset.step;
    el.classList.remove('step-active', 'step-done', 'step-locked');
    const status = appState.steps[step];
    if (status === 'active') el.classList.add('step-active');
    if (status === 'done') el.classList.add('step-done');
    if (status === 'locked') el.classList.add('step-locked');
  });
}

function applyLockStates() {
  const productReady = appState.completion.productInfo;
  const promptReady = appState.completion.promptOptimized;
  const screensReady = appState.completion.screensUploaded;
  const storyboardReady = appState.completion.storyboardReady;
  const audioReady = appState.completion.audioReady;

  if (els.optimizePromptBtn) els.optimizePromptBtn.disabled = !productReady;
  if (els.screenshots) els.screenshots.disabled = !promptReady;
  if (els.generateBtn) els.generateBtn.disabled = !screensReady;
  if (els.addSceneBtn) els.addSceneBtn.disabled = !storyboardReady;
  if (els.generateAllAudioBtn) els.generateAllAudioBtn.disabled = !storyboardReady;
  if (els.validateAudioBtn) els.validateAudioBtn.disabled = !storyboardReady;
  if (els.previewBtn) els.previewBtn.disabled = !storyboardReady;
  if (els.exportVideoBtn) els.exportVideoBtn.disabled = !audioReady;
}

function saveSettings() {
  const payload = {
    scriptProvider: els.scriptProvider?.value || 'mock',
    voiceProvider: els.voiceProvider?.value || 'browser',
    openaiKey: els.openaiKey?.value.trim() || '',
    geminiKey: els.geminiKey?.value.trim() || '',
    elevenlabsKey: els.elevenlabsKey?.value.trim() || '',
    elevenlabsVoiceId: els.elevenlabsVoiceId?.value.trim() || ''
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if (els.settingsStatus) els.settingsStatus.textContent = 'Settings saved in this browser.';
}

function loadSettings() {
  const settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  if (els.scriptProvider) els.scriptProvider.value = settings.scriptProvider || 'mock';
  if (els.voiceProvider) els.voiceProvider.value = settings.voiceProvider || 'browser';
  if (els.openaiKey) els.openaiKey.value = settings.openaiKey || '';
  if (els.geminiKey) els.geminiKey.value = settings.geminiKey || '';
  if (els.elevenlabsKey) els.elevenlabsKey.value = settings.elevenlabsKey || '';
  if (els.elevenlabsVoiceId) els.elevenlabsVoiceId.value = settings.elevenlabsVoiceId || '';
}

function clearSettings() {
  localStorage.removeItem(STORAGE_KEY);
  loadSettings();
  if (els.settingsStatus) els.settingsStatus.textContent = 'Saved settings cleared.';
}

function saveProject() {
  const payload = {
    form: getFormData(),
    uploadedScreens,
    storyboard,
    completion: appState.completion
  };
  localStorage.setItem(PROJECT_KEY, JSON.stringify(payload));
}

function loadProject() {
  const saved = JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}');
  if (!saved || !saved.form) return;

  Object.entries(saved.form).forEach(([key, value]) => {
    if (els[key]) els[key].value = value || '';
  });

  uploadedScreens = Array.isArray(saved.uploadedScreens) ? saved.uploadedScreens : [];
  storyboard = Array.isArray(saved.storyboard) ? saved.storyboard : [];

  if (saved.completion) {
    appState.completion = { ...appState.completion, ...saved.completion };
  }
}

function getFormData() {
  return {
    productName: els.productName?.value.trim() || '',
    productDescription: els.productDescription?.value.trim() || '',
    targetAudience: els.targetAudience?.value.trim() || '',
    presentationType: els.presentationType?.value || 'Product Demo',
    cta: els.cta?.value.trim() || '',
    tone: els.tone?.value.trim() || '',
    videoGoal: els.videoGoal?.value.trim() || '',
    keyFeatures: els.keyFeatures?.value || '',
    buildPrompt: els.buildPrompt?.value || '',
    optimizedPrompt: els.optimizedPrompt?.value || '',
    videoResolution: els.videoResolution?.value || '1280x720',
    videoFps: els.videoFps?.value || '30',
    defaultDuration: els.defaultDuration?.value || '5',
    transitionDuration: els.transitionDuration?.value || '0.6',
    captionStyle: els.captionStyle?.value || 'bottom'
  };
}

function loadSample() {
  els.productName.value = 'VoiceBridge';
  els.productDescription.value =
    'AI voice translator that helps people speak naturally across languages.';
  els.targetAudience.value = 'Travelers, businesses, global teams, product judges';
  els.presentationType.value = 'Product Demo';
  els.cta.value = 'Try VoiceBridge and speak with confidence';
  els.tone.value = 'Premium, modern, launch-ready';
  els.videoGoal.value = '45-second product marketing demo';
  els.keyFeatures.value = [
    'Real-time speech translation',
    'Natural voice playback',
    'Conversation history',
    'Travel phrase shortcuts',
    'One-tap microphone workflow'
  ].join('\n');
  els.buildPrompt.value =
    'Create a clean, screen-by-screen presentation that opens with the problem, shows how the product solves it, highlights the best features, and closes with a strong CTA.';
  handleProductInfoChange();
  els.generateStatus.textContent = 'Sample loaded. Optimize prompt next.';
  saveProject();
}

function parseFeatures() {
  return (els.keyFeatures?.value || '')
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);
}

function buildOptimizedPrompt() {
  const productName = els.productName.value.trim();
  const productDescription = els.productDescription.value.trim();
  const audience = els.targetAudience.value.trim();
  const goal = els.videoGoal.value.trim();
  const features = parseFeatures().join(', ');
  const userPrompt = els.buildPrompt.value.trim();
  const cta = els.cta.value.trim();
  const tone = els.tone.value.trim();
  const presentationType = els.presentationType.value;

  const templates = {
    'Product Demo': 'Use a hook, problem, solution, screen-by-screen feature flow, benefit summary, and CTA.',
    'Marketing Ad': 'Use an emotional hook, pain point, wow moment, benefits, and CTA.',
    'Investor Pitch': 'Use market problem, product solution, value, differentiation, and CTA.',
    'Explainer Video': 'Use what it is, why it matters, how it works, and CTA.',
    'Feature Walkthrough': 'Use screen-by-screen flow with concise narration and clear benefits.',
    'Launch Video': 'Use intro, what is new, why it matters, highlights, and CTA.',
    'Tutorial / How it Works': 'Use step-by-step usage flow, guidance, and end summary.'
  };

  return `Create a ${presentationType} storyboard for ${productName}.

Product summary:
${productDescription}

Target audience:
${audience}

Video goal:
${goal}

Tone:
${tone}

Key features:
${features}

CTA:
${cta}

User intent:
${userPrompt}

Presentation structure:
${templates[presentationType]}

Requirements:
- Use uploaded screens in logical sequence.
- Build scenes using Hook, Problem, Solution, Feature Flow, Value, CTA.
- Keep narration concise, clear, and natural.
- Keep scene bullets short and presentation-ready.
- Map scenes to uploaded screens wherever possible.
- Output clean storyboard scenes suitable for voice-over demo generation.`;
}

function optimizePrompt() {
  if (!appState.completion.productInfo) {
    els.generateStatus.textContent = 'Complete product info first.';
    return;
  }

  els.optimizedPrompt.value = buildOptimizedPrompt();
  appState.completion.promptOptimized = true;
  appState.completion.screensUploaded = uploadedScreens.length > 0;
  appState.completion.storyboardReady = false;
  appState.completion.audioReady = false;

  clearAllSceneAudioBlobs();
  storyboard = [];
  renderTimeline();
  recomputeWorkflow();
  saveProject();

  els.generateStatus.textContent = 'Prompt optimized. Upload screens next.';
}

async function parseApiResponse(response, label = 'Server') {
  const raw = await response.text();

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${label} returned non-JSON response: ${raw.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(data?.error || `${label} request failed with status ${response.status}`);
  }

  return data;
}

async function handleScreenshotUpload(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const existing = [...uploadedScreens];
  const remainingSlots = Math.max(0, 6 - existing.length);

  if (remainingSlots === 0) {
    els.generateStatus.textContent = 'Maximum 6 screens already uploaded.';
    event.target.value = '';
    return;
  }

  const filesToAdd = files.slice(0, remainingSlots);

  for (const file of filesToAdd) {
    const dataUrl = await readFileAsDataURL(file);
    existing.push({
      id: crypto.randomUUID(),
      name: file.name,
      dataUrl,
      label: inferLabel(file.name, existing.length),
      notes: ''
    });
  }

  uploadedScreens = existing;
  preloadAllScreens();
  renderScreens();
  remapScenesToValidScreen();
  handleScreensChanged();
  event.target.value = '';
}

function inferLabel(name, index) {
  const cleaned = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  return cleaned || `Screen ${index + 1}`;
}

function renderScreens() {
  if (!els.screenGrid) return;
  els.screenGrid.innerHTML = '';

  uploadedScreens.forEach((screen, index) => {
    const fragment = els.screenTemplate.content.cloneNode(true);
    const img = fragment.querySelector('.screen-image');
    const name = fragment.querySelector('.screen-name');
    const label = fragment.querySelector('.screen-label');
    const notes = fragment.querySelector('.screen-notes');
    const removeBtn = fragment.querySelector('.screen-remove');

    img.src = screen.dataUrl;
    img.alt = screen.label || `Screen ${index + 1}`;
    warmImage(screen.dataUrl);

    name.textContent = screen.name;
    label.value = screen.label || '';
    notes.value = screen.notes || '';

    label.addEventListener('input', () => {
      uploadedScreens[index].label = label.value;
      handleScreensChanged();
    });

    notes.addEventListener('input', () => {
      uploadedScreens[index].notes = notes.value;
      saveProject();
    });

    removeBtn?.addEventListener('click', () => {
      uploadedScreens.splice(index, 1);
      remapScenesToValidScreen();
      renderScreens();
      handleScreensChanged();
      if (els.previewDialog?.open) renderPreviewScene();
    });

    els.screenGrid.appendChild(fragment);
  });
}

async function generateStoryboard() {
  if (!appState.completion.screensUploaded) {
    els.generateStatus.textContent = 'Optimize prompt and upload screens first.';
    return;
  }

  const payload = {
    provider: els.scriptProvider.value,
    apiKey:
      els.scriptProvider.value === 'openai'
        ? els.openaiKey.value.trim()
        : els.scriptProvider.value === 'gemini'
          ? els.geminiKey.value.trim()
          : '',
    productName: els.productName.value.trim(),
    productDescription: els.productDescription.value.trim(),
    targetAudience: els.targetAudience.value.trim(),
    keyFeatures: parseFeatures(),
    tone: els.tone.value.trim(),
    cta: els.cta.value.trim(),
    videoGoal: els.videoGoal.value.trim(),
    buildPrompt: els.optimizedPrompt.value.trim() || buildOptimizedPrompt(),
    screens: uploadedScreens.map((screen, index) => ({
      index: index + 1,
      name: screen.name,
      label: screen.label || `Screen ${index + 1}`,
      notes: screen.notes || ''
    }))
  };

  els.generateBtn.disabled = true;
  els.generateStatus.textContent = 'Generating storyboard...';

  try {
    const response = await fetch('/api/generate-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await parseApiResponse(response, 'Storyboard API');
    const scenes = Array.isArray(data.storyboard) ? data.storyboard : [];
    if (!scenes.length) throw new Error('Storyboard API returned no scenes.');

    const fallbackDuration = Number(els.defaultDuration.value || 5);

    storyboard = scenes.map((scene, index) => ({
      id: crypto.randomUUID(),
      type: scene.type || guessType(index, scenes.length),
      title: scene.title || `Scene ${index + 1}`,
      voiceover: scene.voiceover || '',
      bullets: Array.isArray(scene.bullets) ? scene.bullets : [],
      visual: scene.visual || '',
      screenId: findScreenId(scene.screenLabel, index),
      duration: Number(scene.duration) || fallbackDuration,
      audioUrl: ''
    }));

    appState.completion.storyboardReady = storyboard.length > 0;
    appState.completion.audioReady = false;

    renderTimeline();
    recomputeWorkflow();
    saveProject();

    const warningText = data.warning ? ` Warning: ${data.warning}` : '';
    els.generateStatus.textContent = `Generated ${storyboard.length} scenes.${warningText}`;
  } catch (error) {
    console.error(error);
    els.generateStatus.textContent = error.message || 'Unable to generate storyboard.';
  } finally {
    els.generateBtn.disabled = false;
  }
}

function findScreenId(screenLabel, index) {
  if (!uploadedScreens.length) return '';

  const normalized = String(screenLabel || '').trim().toLowerCase();
  const byLabel = uploadedScreens.find(
    (screen) => String(screen.label || '').trim().toLowerCase() === normalized
  );

  if (byLabel) return byLabel.id;
  return uploadedScreens[index % uploadedScreens.length]?.id || '';
}

function guessType(index, total) {
  if (index === 0) return 'hook';
  if (index === total - 1) return 'cta';
  if (index === 1) return 'problem';
  if (index === 2) return 'solution';
  return 'screen';
}

function addScene() {
  if (!appState.completion.storyboardReady) return;

  storyboard.push({
    id: crypto.randomUUID(),
    type: 'screen',
    title: `Scene ${storyboard.length + 1}`,
    voiceover: '',
    bullets: [],
    visual: '',
    screenId: uploadedScreens[0]?.id || '',
    duration: Number(els.defaultDuration.value || 5),
    audioUrl: ''
  });

  appState.completion.audioReady = false;
  renderTimeline();
  recomputeWorkflow();
  saveProject();
}

function renderTimeline() {
  if (!els.timeline) return;

  els.timeline.innerHTML = '';
  els.emptyState?.classList.toggle('hidden', storyboard.length > 0);

  storyboard.forEach((scene, index) => {
    const fragment = els.sceneTemplate.content.cloneNode(true);
    const thumbCanvas = fragment.querySelector('.scene-thumb');
    const scenePreviewBtn = fragment.querySelector('.scene-preview');
    const playAudioBtn = fragment.querySelector('.scene-play-audio');
    const indexEl = fragment.querySelector('.scene-index');
    const titleEl = fragment.querySelector('.scene-title');
    const typeEl = fragment.querySelector('.scene-type');
    const durationEl = fragment.querySelector('.scene-duration');
    const imageEl = fragment.querySelector('.scene-image');
    const visualEl = fragment.querySelector('.scene-visual');
    const voiceoverEl = fragment.querySelector('.scene-voiceover');
    const bulletsEl = fragment.querySelector('.scene-bullets');
    const upBtn = fragment.querySelector('.scene-up');
    const downBtn = fragment.querySelector('.scene-down');
    const duplicateBtn = fragment.querySelector('.scene-duplicate');
    const deleteBtn = fragment.querySelector('.scene-delete');
    const generateAudioBtn = fragment.querySelector('.scene-generate-audio');
    const clearAudioBtn = fragment.querySelector('.scene-clear-audio');
    const audioEl = fragment.querySelector('.scene-audio');
    const audioStatus = fragment.querySelector('.scene-audio-status');

    indexEl.value = index + 1;
    titleEl.value = scene.title;
    typeEl.value = scene.type || 'screen';
    durationEl.value = scene.duration || Number(els.defaultDuration.value || 5);
    visualEl.value = scene.visual || '';
    voiceoverEl.value = scene.voiceover || '';
    bulletsEl.value = (scene.bullets || []).join('\n');
    imageEl.innerHTML = buildScreenOptions(scene.screenId);

    if (scene.audioUrl) {
      audioEl.src = scene.audioUrl;
      audioStatus.textContent = 'Audio ready';
    } else {
      audioEl.removeAttribute('src');
      audioStatus.textContent = 'No scene audio yet';
    }

    drawSceneThumbnail(thumbCanvas, scene);

    titleEl.addEventListener('input', () => {
      updateScene(index, 'title', titleEl.value);
      invalidateAudioAndExport();
    });

    typeEl.addEventListener('change', () => {
      updateScene(index, 'type', typeEl.value);
      invalidateAudioAndExport();
    });

    durationEl.addEventListener('input', () => {
      updateScene(index, 'duration', Number(durationEl.value || 5));
      invalidateAudioAndExport();
    });

    imageEl.addEventListener('change', () => updateScene(index, 'screenId', imageEl.value));

    visualEl.addEventListener('input', () => {
      updateScene(index, 'visual', visualEl.value);
    });

    voiceoverEl.addEventListener('input', () => {
      updateScene(index, 'voiceover', voiceoverEl.value);
      invalidateAudioAndExport();
    });

    bulletsEl.addEventListener('input', () => {
      updateScene(
        index,
        'bullets',
        bulletsEl.value.split('\n').map((v) => v.trim()).filter(Boolean)
      );
      invalidateAudioAndExport();
    });

    upBtn.addEventListener('click', () => moveScene(index, -1));
    downBtn.addEventListener('click', () => moveScene(index, 1));
    duplicateBtn.addEventListener('click', () => duplicateScene(index));
    deleteBtn.addEventListener('click', () => deleteScene(index));

    scenePreviewBtn.addEventListener('click', () => {
      previewIndex = index;
      if (!els.previewDialog.open) {
        openPreview();
      } else {
        renderPreviewScene();
      }
    });

    playAudioBtn.addEventListener('click', async () => {
      try {
        await playSceneAudio(index, true);
      } catch (err) {
        audioStatus.textContent = err.message || 'No playable audio';
      }
    });

    generateAudioBtn.addEventListener('click', async () => {
      generateAudioBtn.disabled = true;
      audioStatus.textContent = 'Generating audio...';
      try {
        await generateSceneAudio(index);
        audioStatus.textContent = 'Audio ready';
        validateAudioCompletion();
      } catch (error) {
        audioStatus.textContent = error.message || 'Audio failed';
      } finally {
        generateAudioBtn.disabled = false;
      }
    });

    clearAudioBtn.addEventListener('click', () => {
      if (storyboard[index].audioUrl?.startsWith('blob:')) {
        try { URL.revokeObjectURL(storyboard[index].audioUrl); } catch {}
      }
      storyboard[index].audioUrl = '';
      validateAudioCompletion();
      renderTimeline();
      saveProject();
    });

    els.timeline.appendChild(fragment);
  });

  saveProject();
}

function buildScreenOptions(selectedId = '') {
  const options = ['<option value="">No assigned screen</option>'];
  uploadedScreens.forEach((screen, index) => {
    const label = screen.label || `Screen ${index + 1}`;
    options.push(
      `<option value="${escapeHtml(screen.id)}" ${screen.id === selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`
    );
  });
  return options.join('');
}

function updateScene(index, key, value) {
  storyboard[index] = { ...storyboard[index], [key]: value };
  saveProject();

  if (els.previewDialog?.open && index === previewIndex) {
    renderPreviewScene();
  }

  const card = els.timeline?.children[index];
  const canvas = card?.querySelector('.scene-thumb');
  if (canvas) drawSceneThumbnail(canvas, storyboard[index]);
}

function clearAllSceneAudioBlobs() {
  storyboard.forEach((scene) => {
    if (scene.audioUrl?.startsWith('blob:')) {
      try { URL.revokeObjectURL(scene.audioUrl); } catch {}
    }
    scene.audioUrl = '';
  });
}

function invalidateAudioAndExport() {
  clearAllSceneAudioBlobs();
  appState.completion.audioReady = false;
  recomputeWorkflow();
  renderTimeline();
  saveProject();
}

function moveScene(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= storyboard.length) return;
  const [scene] = storyboard.splice(index, 1);
  storyboard.splice(target, 0, scene);
  appState.completion.audioReady = false;
  renderTimeline();
  recomputeWorkflow();
  if (els.previewDialog?.open) renderPreviewScene();
}

function duplicateScene(index) {
  const duplicate = structuredClone(storyboard[index]);
  duplicate.id = crypto.randomUUID();
  duplicate.title = `${duplicate.title} Copy`;
  duplicate.audioUrl = '';
  storyboard.splice(index + 1, 0, duplicate);
  appState.completion.audioReady = false;
  renderTimeline();
  recomputeWorkflow();
  if (els.previewDialog?.open) renderPreviewScene();
}

function deleteScene(index) {
  const [removed] = storyboard.splice(index, 1);
  if (removed?.audioUrl?.startsWith('blob:')) {
    try { URL.revokeObjectURL(removed.audioUrl); } catch {}
  }
  previewIndex = Math.max(0, Math.min(previewIndex, storyboard.length - 1));
  validateAudioCompletion();
  renderTimeline();
  if (els.previewDialog?.open) renderPreviewScene();
}

function remapScenesToValidScreen() {
  const validIds = new Set(uploadedScreens.map((screen) => screen.id));
  storyboard = storyboard.map((scene, index) => ({
    ...scene,
    screenId: validIds.has(scene.screenId)
      ? scene.screenId
      : uploadedScreens[Math.min(index, uploadedScreens.length - 1)]?.id || ''
  }));
}

function getScreenById(id) {
  return uploadedScreens.find((screen) => screen.id === id);
}

function preloadAllScreens() {
  uploadedScreens.forEach((screen) => warmImage(screen.dataUrl));
}

function drawSceneThumbnail(canvas, scene) {
  const ctx = canvas.getContext('2d');
  drawFrame(ctx, scene, canvas.width, canvas.height, {
    thumbMode: true
  });
}

function openPreview() {
  if (!storyboard.length) {
    els.exportStatus.textContent = 'Create or generate scenes first.';
    return;
  }
  syncPreviewCanvasSize();
  renderPreviewScene();
  els.previewDialog.showModal();
}

function syncPreviewCanvasSize() {
  const [w, h] = (els.videoResolution.value || '1280x720').split('x').map(Number);
  els.previewCanvas.width = w;
  els.previewCanvas.height = h;
}

function renderPreviewScene(progress = 1) {
  syncPreviewCanvasSize();
  const ctx = els.previewCanvas.getContext('2d');
  const scene = storyboard[previewIndex];
  drawFrame(ctx, scene, els.previewCanvas.width, els.previewCanvas.height, {
    progress,
    thumbMode: false
  });
}

function stepPreview(delta) {
  if (!storyboard.length) return;
  previewIndex += delta;
  if (previewIndex < 0) previewIndex = storyboard.length - 1;
  if (previewIndex >= storyboard.length) previewIndex = 0;
  renderPreviewScene();
}

async function autoplayPreview() {
  clearTimeout(previewTimer);
  if (!storyboard.length) return;

  for (let i = previewIndex; i < storyboard.length; i += 1) {
    previewIndex = i;
    renderPreviewScene();
    try {
      await playSceneAudio(i, true);
    } catch (err) {
      console.warn(err);
    }
    await wait((storyboard[i].duration || 5) * 1000);
  }
}

function closePreview() {
  clearTimeout(previewTimer);
  stopAudio();
  els.previewDialog.close();
}

function stopAudio() {
  if (currentAudio && typeof currentAudio.pause === 'function') {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  currentAudio = null;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

async function playSceneAudio(index, allowFallback = true) {
  stopAudio();

  const scene = storyboard[index];
  if (!scene) return;

  if (scene.audioUrl) {
    const audio = new Audio(scene.audioUrl);
    currentAudio = audio;

    try {
      await audio.play();
      return;
    } catch (error) {
      console.error('Audio play failed:', error);
      throw new Error('Scene audio exists, but playback failed.');
    }
  }

  if (
    allowFallback &&
    scene.voiceover &&
    els.voiceProvider.value === 'browser' &&
    window.speechSynthesis
  ) {
    const utterance = new SpeechSynthesisUtterance(scene.voiceover);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return;
  }

  throw new Error('No playable audio for this scene.');
}

async function generateSceneAudio(index) {
  const scene = storyboard[index];
  if (!scene?.voiceover?.trim()) {
    throw new Error('Add voiceover text first.');
  }

  if (els.voiceProvider.value !== 'elevenlabs') {
    throw new Error('Real audio file generation requires ElevenLabs. Browser Speech works only for preview.');
  }

  const apiKey = els.elevenlabsKey.value.trim();
  const voiceId = els.elevenlabsVoiceId.value.trim();

  if (!apiKey || !voiceId) {
    throw new Error('Enter ElevenLabs API key and Voice ID first.');
  }

  const response = await fetch('/api/generate-voice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      apiKey,
      voiceId,
      text: scene.voiceover.trim()
    })
  });

  const data = await parseApiResponse(response, 'Voice API');

  if (!data.audioBase64) {
    throw new Error('Voice API returned no audio.');
  }

  const audioBlob = base64ToBlob(data.audioBase64, data.mimeType || 'audio/mpeg');

  if (!audioBlob.size) {
    throw new Error('Generated audio blob is empty.');
  }

  if (scene.audioUrl?.startsWith('blob:')) {
    try { URL.revokeObjectURL(scene.audioUrl); } catch {}
  }

  scene.audioUrl = URL.createObjectURL(audioBlob);

  renderTimeline();
  saveProject();
}

async function generateAllAudio() {
  if (!appState.completion.storyboardReady) {
    els.generateStatus.textContent = 'Generate storyboard first.';
    return;
  }

  if (els.voiceProvider.value !== 'elevenlabs') {
    els.generateStatus.textContent =
      'Generate All Audio requires ElevenLabs. Browser Speech is preview-only.';
    return;
  }

  els.generateAllAudioBtn.disabled = true;
  els.generateStatus.textContent = 'Generating scene audio...';

  try {
    for (let i = 0; i < storyboard.length; i += 1) {
      els.generateStatus.textContent = `Generating audio for scene ${i + 1} / ${storyboard.length}...`;
      await generateSceneAudio(i);
    }

    validateAudioCompletion();
    els.generateStatus.textContent = 'Audio generated for all scenes.';
  } catch (err) {
    console.error(err);
    validateAudioCompletion();
    els.generateStatus.textContent =
      `Audio failed: ${err.message || 'Unknown error'}`;
  } finally {
    els.generateAllAudioBtn.disabled = false;
  }
}

function validateAudioStatus() {
  try {
    validateSceneAudio();
    els.generateStatus.textContent = 'All scenes have audio attached.';
  } catch (err) {
    els.generateStatus.textContent = err.message || 'Audio validation failed.';
  }
}

function validateSceneAudio() {
  const missing = storyboard.filter(scene => !scene.audioUrl);
  if (missing.length) {
    throw new Error('Some scenes do not have real generated audio files.');
  }

  const empty = storyboard.filter(
    scene => typeof scene.audioUrl !== 'string' || !scene.audioUrl.trim()
  );
  if (empty.length) {
    throw new Error('Some scenes have invalid audio references.');
  }
}

function validateAudioCompletion() {
  appState.completion.audioReady =
    storyboard.length > 0 &&
    storyboard.every(scene => typeof scene.audioUrl === 'string' && scene.audioUrl.trim().length > 0);

  recomputeWorkflow();
  saveProject();
}

/* export */

async function exportVideoAndAudio() {
  if (!storyboard.length) {
    els.exportStatus.textContent = 'No scenes to export.';
    return;
  }

  validateSceneAudio();

  els.exportVideoBtn.disabled = true;
  stopAudio();

  try {
    els.exportStatus.textContent = 'Building narration audio...';
    const audioExport = await buildTimelineAudioFiles();

    if (!audioExport.wavBlob || !audioExport.wavBlob.size) {
      throw new Error('Narration audio export is empty.');
    }

    els.exportStatus.textContent = 'Recording WebM with audio...';
    const finalWebm = await exportMuxedWebMWithAudio(
      audioExport.sceneDurations,
      audioExport.wavBlob
    );

    if (!finalWebm || !finalWebm.size) {
      throw new Error('Final WebM export is empty.');
    }

    const base = slugify(els.productName.value || 'demo');
    downloadBlob(finalWebm, `${base}.webm`);

    els.exportStatus.textContent = '✅ Exported WebM with embedded audio.';
  } catch (err) {
    console.error('Export failed:', err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : JSON.stringify(err, Object.getOwnPropertyNames(err || {}));

    els.exportStatus.textContent = `❌ Export failed: ${message || 'Unknown error'}`;
  } finally {
    els.exportVideoBtn.disabled = false;
  }
}

async function exportMuxedWebMWithAudio(sceneAudioDurations = [], wavBlob) {
  if (!window.MediaRecorder) {
    throw new Error('This browser does not support WebM recording export.');
  }

  const [width, height] = (els.videoResolution.value || '1280x720')
    .split('x')
    .map(Number);

  const fps = Number(els.videoFps.value || 24);
  const transitionSeconds = Number(els.transitionDuration.value || 0.6);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas context could not be created.');
  }

  const canvasStream = canvas.captureStream(fps);

  const audioUrl = URL.createObjectURL(wavBlob);
  const audioEl = new Audio(audioUrl);
  audioEl.preload = 'auto';
  audioEl.crossOrigin = 'anonymous';

  const audioStream =
    typeof audioEl.captureStream === 'function'
      ? audioEl.captureStream()
      : typeof audioEl.mozCaptureStream === 'function'
        ? audioEl.mozCaptureStream()
        : null;

  if (!audioStream) {
    URL.revokeObjectURL(audioUrl);
    throw new Error('This browser cannot capture audio stream from audio element.');
  }

  await new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error('Failed to load narration audio for muxing.'));
    };

    const cleanup = () => {
      audioEl.removeEventListener('canplaythrough', onReady);
      audioEl.removeEventListener('error', onError);
    };

    audioEl.addEventListener('canplaythrough', onReady);
    audioEl.addEventListener('error', onError);
    audioEl.load();
  });

  const mergedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioStream.getAudioTracks()
  ]);

  let mimeType = 'video/webm';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
    mimeType = 'video/webm;codecs=vp8,opus';
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
    mimeType = 'video/webm;codecs=vp9,opus';
  } else if (MediaRecorder.isTypeSupported('video/webm')) {
    mimeType = 'video/webm';
  } else {
    URL.revokeObjectURL(audioUrl);
    throw new Error('This browser cannot record WebM with audio.');
  }

  const recorder = new MediaRecorder(mergedStream, { mimeType });
  const chunks = [];

  const stopPromise = new Promise((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      reject(event?.error || new Error('MediaRecorder error'));
    };

    recorder.onstop = () => resolve();
  });

  recorder.start(250);

  try {
    await audioEl.play();
  } catch (err) {
    URL.revokeObjectURL(audioUrl);
    throw new Error('Failed to start narration playback for export.');
  }

  for (let i = 0; i < storyboard.length; i += 1) {
    const scene = storyboard[i];
    els.exportStatus.textContent = `Rendering scene ${i + 1} / ${storyboard.length}`;

    const sceneAudioDuration = sceneAudioDurations[i] || 0;
    const totalDuration = Math.max(Number(scene.duration || 5), sceneAudioDuration || 0);

    const start = performance.now();
    let rafId = null;

    await new Promise((resolve) => {
      const loop = () => {
        const elapsed = (performance.now() - start) / 1000;
        const progress = Math.min(1, totalDuration ? elapsed / totalDuration : 1);

        drawFrame(ctx, scene, width, height, {
          progress,
          thumbMode: false
        });

        if (elapsed < totalDuration) {
          rafId = requestAnimationFrame(loop);
        } else {
          resolve();
        }
      };
      loop();
    });

    if (rafId) cancelAnimationFrame(rafId);

    const nextScene = storyboard[i + 1];
    if (nextScene && transitionSeconds > 0) {
      await renderTransition(ctx, scene, nextScene, width, height, transitionSeconds);
    }
  }

  await wait(500);

  try {
    recorder.requestData();
  } catch {}

  recorder.stop();
  await stopPromise;

  audioEl.pause();
  audioEl.currentTime = 0;
  URL.revokeObjectURL(audioUrl);

  const finalBlob = new Blob(chunks, { type: mimeType });

  if (!finalBlob.size) {
    throw new Error('Muxed WebM output is empty.');
  }

  return finalBlob;
}

async function buildTimelineAudioFiles() {
  const sampleRate = 48000;
  const transitionSeconds = Number(els.transitionDuration.value || 0.6);

  const sceneDurations = [];
  const sceneBuffers = [];

  for (let i = 0; i < storyboard.length; i += 1) {
    const scene = storyboard[i];

    if (!scene.audioUrl) {
      sceneBuffers.push(null);
      sceneDurations.push(0);
      continue;
    }

    const arrayBuffer = await fetchArrayBuffer(scene.audioUrl);
    const decoded = await decodeAudioArrayBuffer(arrayBuffer);
    const converted = convertAudioBufferSampleRate(decoded, sampleRate);

    sceneBuffers.push(converted);
    sceneDurations.push(converted.duration || 0);
  }

  let totalTimelineSeconds = 0;
  for (let i = 0; i < storyboard.length; i += 1) {
    const baseDuration = Number(storyboard[i].duration || 5);
    const audioDuration = sceneDurations[i] || 0;
    totalTimelineSeconds += Math.max(baseDuration, audioDuration);

    if (i < storyboard.length - 1) totalTimelineSeconds += transitionSeconds;
  }

  if (totalTimelineSeconds <= 0) {
    return { sceneDurations, wavBlob: null };
  }

  const totalSamples = Math.ceil(totalTimelineSeconds * sampleRate);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  let cursorSeconds = 0;

  for (let i = 0; i < storyboard.length; i += 1) {
    const buffer = sceneBuffers[i];
    const baseDuration = Number(storyboard[i].duration || 5);
    const audioDuration = sceneDurations[i] || 0;
    const sceneDuration = Math.max(baseDuration, audioDuration);

    if (buffer) {
      const startSample = Math.floor(cursorSeconds * sampleRate);
      const length = Math.min(buffer.length, totalSamples - startSample);

      const ch0 = buffer.getChannelData(0);
      const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;

      for (let s = 0; s < length; s += 1) {
        left[startSample + s] += ch0[s];
        right[startSample + s] += ch1[s];
      }
    }

    cursorSeconds += sceneDuration;
    if (i < storyboard.length - 1) cursorSeconds += transitionSeconds;
  }

  const wavBlob = pcmToWavBlob(left, right, sampleRate);

  if (!wavBlob.size) {
    throw new Error('Generated WAV file is empty.');
  }

  return { sceneDurations, wavBlob };
}

async function fetchArrayBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch scene audio: ${response.status}`);
  return response.arrayBuffer();
}

async function decodeAudioArrayBuffer(arrayBuffer) {
  const tempContext = new (window.AudioContext || window.webkitAudioContext)();
  try {
    return await tempContext.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    try { await tempContext.close(); } catch {}
  }
}

function convertAudioBufferSampleRate(audioBuffer, targetSampleRate) {
  if (audioBuffer.sampleRate === targetSampleRate) return audioBuffer;

  const channels = audioBuffer.numberOfChannels;
  const newLength = Math.round(audioBuffer.duration * targetSampleRate);
  const converted = new AudioBuffer({
    length: newLength,
    numberOfChannels: channels,
    sampleRate: targetSampleRate
  });

  for (let ch = 0; ch < channels; ch += 1) {
    const input = audioBuffer.getChannelData(ch);
    const output = converted.getChannelData(ch);

    for (let i = 0; i < newLength; i += 1) {
      const sourceIndex = (i * audioBuffer.sampleRate) / targetSampleRate;
      const index0 = Math.floor(sourceIndex);
      const index1 = Math.min(index0 + 1, input.length - 1);
      const frac = sourceIndex - index0;
      output[i] = input[index0] * (1 - frac) + input[index1] * frac;
    }
  }

  return converted;
}

function pcmToWavBlob(left, right, sampleRate) {
  const length = Math.min(left.length, right.length);
  const numberOfChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;

  for (let i = 0; i < length; i += 1) {
    let l = Math.max(-1, Math.min(1, left[i]));
    let r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    offset += 2;
    view.setInt16(offset, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i += 1) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/* optional future mp4 path */

async function ensureFFmpegLoaded() {
  if (ffmpegLoaded && ffmpegInstance) return ffmpegInstance;

  ffmpegInstance = new FFmpeg();

  if (!ffmpegEventsAttached) {
    ffmpegInstance.on('log', ({ message }) => {
      console.log('[ffmpeg]', message);
    });
    ffmpegInstance.on('progress', ({ progress }) => {
      if (els.exportStatus) {
        els.exportStatus.textContent = `Converting to MP4... ${Math.round(progress * 100)}%`;
      }
    });
    ffmpegEventsAttached = true;
  }

  const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
  const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
  const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
  const workerURL = await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript');

  await ffmpegInstance.load({ coreURL, wasmURL, workerURL });
  ffmpegLoaded = true;
  return ffmpegInstance;
}

async function convertWebMToMP4(webmBlob) {
  const ffmpeg = await ensureFFmpegLoaded();
  const input = 'input.webm';
  const output = 'output.mp4';

  await ffmpeg.writeFile(input, await fetchFile(webmBlob));
  await ffmpeg.exec([
    '-i', input,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '128k',
    output
  ]);

  const data = await ffmpeg.readFile(output);
  try { await ffmpeg.deleteFile(input); } catch {}
  try { await ffmpeg.deleteFile(output); } catch {}
  return new Blob([data.buffer], { type: 'video/mp4' });
}

/* rendering */

async function renderTransition(ctx, currentScene, nextScene, width, height, seconds) {
  const start = performance.now();

  await new Promise((resolve) => {
    const loop = () => {
      const elapsed = (performance.now() - start) / 1000;
      const t = Math.min(1, elapsed / seconds);

      ctx.save();
      drawFrame(ctx, currentScene, width, height, {
        progress: 1,
        thumbMode: false
      });
      ctx.globalAlpha = t;
      drawFrame(ctx, nextScene, width, height, {
        progress: 0.15 + t * 0.85,
        thumbMode: false
      });
      ctx.restore();

      if (t < 1) {
        requestAnimationFrame(loop);
      } else {
        resolve();
      }
    };
    loop();
  });
}

function drawFrame(ctx, scene, width, height, options = {}) {
  const { progress = 1, thumbMode = false } = options;
  const screen = getScreenById(scene?.screenId);

  ctx.clearRect(0, 0, width, height);

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#162751');
  grad.addColorStop(0.5, '#0f1730');
  grad.addColorStop(1, '#07101d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const outerPad = width * 0.035;
  const panelGap = width * 0.02;

  const leftX = outerPad;
  const leftY = outerPad;
  const leftW = width * 0.43;
  const leftH = height - outerPad * 2;

  const rightX = leftX + leftW + panelGap;
  const rightY = outerPad;
  const rightW = width - rightX - outerPad;
  const rightH = height - outerPad * 2;

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundedRect(ctx, leftX, leftY, leftW, leftH, Math.min(width, height) * 0.03);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundedRect(ctx, rightX, rightY, rightW, rightH, Math.min(width, height) * 0.03);
  ctx.fill();

  if (screen?.dataUrl) {
    let img = imageCache.get(screen.dataUrl);

    if (!img) {
      img = new Image();
      img.onload = () => {
        if (els.previewDialog?.open) renderPreviewScene();
        renderTimeline();
      };
      img.src = screen.dataUrl;
      imageCache.set(screen.dataUrl, img);
    }

    if (img.complete && img.naturalWidth > 0) {
      drawContainImage(
        ctx,
        img,
        rightX + rightW * 0.04,
        rightY + rightH * 0.04,
        rightW * 0.92,
        rightH * 0.92
      );
    }
  }

  const titleSize = thumbMode ? Math.max(12, width * 0.038) : Math.max(26, width * 0.028);
  const bodySize = thumbMode ? Math.max(9, width * 0.02) : Math.max(18, width * 0.0165);
  const smallSize = thumbMode ? Math.max(8, width * 0.017) : Math.max(15, width * 0.014);

  const textX = leftX + leftW * 0.07;
  const titleY = leftY + leftH * 0.12;
  const maxTextW = leftW * 0.86;

  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.82 + progress * 0.18;
  ctx.font = `700 ${titleSize}px Inter, Arial, sans-serif`;
  drawWrappedText(
    ctx,
    scene?.title || 'Untitled Scene',
    textX,
    titleY,
    maxTextW,
    titleSize * 1.2,
    3
  );

  let bodyY = titleY + titleSize * 2.2;

  const bullets = Array.isArray(scene?.bullets) ? scene.bullets : [];
  if (bullets.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `500 ${bodySize}px Inter, Arial, sans-serif`;

    bullets.slice(0, 5).forEach((bullet, i) => {
      const y = bodyY + i * bodySize * 1.7;
      drawWrappedText(ctx, `• ${bullet}`, textX, y, maxTextW, bodySize * 1.35, 2);
    });
  }

  if (!thumbMode && scene?.visual) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `400 ${smallSize}px Inter, Arial, sans-serif`;
    drawWrappedText(
      ctx,
      scene.visual,
      textX,
      leftY + leftH * 0.9,
      maxTextW,
      smallSize * 1.3,
      3
    );
  }

  ctx.globalAlpha = 1;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 999) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '';
  let lineCount = 0;

  for (let i = 0; i < words.length; i += 1) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = words[i];
      lineCount += 1;

      if (lineCount >= maxLines - 1) {
        const rest = [line, ...words.slice(i + 1)].join(' ');
        let clipped = rest;
        while (ctx.measureText(`${clipped}…`).width > maxWidth && clipped.length > 0) {
          clipped = clipped.slice(0, -1);
        }
        ctx.fillText(`${clipped}…`, x, y + lineCount * lineHeight);
        return;
      }
    } else {
      line = testLine;
    }
  }

  if (line && lineCount < maxLines) {
    ctx.fillText(line, x, y + lineCount * lineHeight);
  }
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawContainImage(ctx, img, x, y, width, height) {
  const scale = Math.min(width / img.width, height / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const offsetX = x + (width - drawWidth) / 2;
  const offsetY = y + (height - drawHeight) / 2;

  ctx.save();
  roundedRect(ctx, x, y, width, height, Math.min(width, height) * 0.03);
  ctx.clip();

  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(x, y, width, height);
  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

  ctx.restore();
}

function warmImage(dataUrl) {
  if (!dataUrl) return;

  let img = imageCache.get(dataUrl);
  if (img) return;

  img = new Image();
  img.onload = () => {
    if (els.previewDialog?.open) renderPreviewScene();
    renderTimeline();
  };
  img.src = dataUrl;
  imageCache.set(dataUrl, img);
}

function exportProject() {
  const payload = {
    form: getFormData(),
    uploadedScreens,
    storyboard,
    completion: appState.completion
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json'
  });

  downloadBlob(blob, `${slugify(els.productName.value || 'demo')}-project.json`);
  els.exportStatus.textContent = 'Project exported as JSON.';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(value) {
  return String(value || 'demo')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function base64ToBlob(base64, mimeType = 'application/octet-stream') {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}