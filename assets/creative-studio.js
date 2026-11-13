(function () {
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const KEYS = { assets: 'penmuse.creative.assets', projects: 'penmuse.creative.projects', workflows: 'penmuse.creative.workflows' };
  const samples = { product: 'assets/campaign/product-dropper.png', portrait: 'assets/campaign/campaign-portrait.png', headphones: 'assets/campaign/headphones-ad.png', night: 'assets/campaign/night-campaign.png', audio: 'assets/campaign/studio-microphone.png' };
  let sourceData = samples.product, activeLibrary = 'assets', currentScenes = [], speechVoices = [];
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
  const write = (key, data) => { try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { notice('Storage is full. Export or remove older items before saving.'); return false; } };
  function notice(message) { const box = $('#studioToast'); if (!box) return; box.textContent = message; box.classList.add('show'); clearTimeout(notice.timer); notice.timer = setTimeout(() => box.classList.remove('show'), 3000); }
  function setTool(name, setHash) {
    const panel = $('[data-panel="' + name + '"]'); if (!panel) return;
    $$('.studio-panel').forEach(item => item.classList.toggle('active', item === panel));
    $$('.tool-nav').forEach(button => button.classList.toggle('active', button.dataset.tool === name));
    const labels = { create: 'Create', image: 'Image Studio', video: 'Video Storyboard', audio: 'Audio Studio', ads: 'Ad Studio', library: 'Asset Library', workflows: 'Workflows' };
    $('#currentToolName').textContent = labels[name] || 'Create';
    $('#workspaceTitle').textContent = name === 'create' ? 'Make the whole campaign.' : labels[name];
    $('#workspaceSub').textContent = name === 'create' ? 'Build image, video, and audio pieces around one clear brief.' : 'A practical tool in your local PenMuse workspace.';
    if (setHash) history.replaceState(null, '', '#' + name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name === 'library') renderLibrary();
    if (name === 'workflows') renderWorkflows();
  }
  $$('.tool-nav').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool, true)));
  const initialTool = location.hash.slice(1);
  setTool(['create','image','video','audio','ads','library','workflows'].includes(initialTool) ? initialTool : 'create', false);
  $('#newCampaign').addEventListener('click', () => { $('#campaignForm').reset(); $('#campaignResult').hidden = true; setTool('create', true); $('#campaignName').focus({ preventScroll: true }); });

  function saveProject(type, title, data, cover = '') {
    const projects = read(KEYS.projects);
    projects.unshift({ id: 'pm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), type, title: String(title || 'Untitled project').slice(0, 100), data, cover, savedAt: new Date().toISOString() });
    if (write(KEYS.projects, projects.slice(0, 60))) notice('Saved to your local project library.');
  }
  function download(name, text, type = 'application/json') {
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([text], { type })); anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
  }
  function formatTitle(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 100) || 'Untitled campaign'; }
  async function requestCreativeAI(kind, payload) {
    if (typeof apiFetch !== 'function') throw new Error('Hosted AI is not connected.');
    const response = await apiFetch('/.netlify/functions/generatev2', { method: 'POST', body: JSON.stringify({ kind, ...payload }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'AI is unavailable.');
    return data;
  }

  $('#campaignForm').addEventListener('submit', event => {
    event.preventDefault();
    const name = formatTitle($('#campaignName').value), brief = $('#campaignBrief').value.trim(), audience = $('#campaignAudience').value.trim();
    const formats = $$('input[name="campaignFormat"]:checked').map(input => input.value);
    if (!formats.length) return notice('Choose at least one campaign format.');
    const result = { campaign: name, brief, audience, formats, steps: formats.map(format => ({ format, next: ({ Image: 'Choose a source image and create local crops.', Video: 'Build an editable scene-by-scene storyboard.', Audio: 'Draft a voiceover and preview it with a device voice.', Ads: 'Write and compare three campaign copy directions.' })[format] })), savedAt: new Date().toISOString() };
    $('#campaignResult').innerHTML = '<div class="campaign-result-head"><div><span class="eyebrow">CAMPAIGN PLAN</span><h2>' + esc(name) + '</h2><p>' + esc(brief) + (audience ? ' <span>For ' + esc(audience) + '</span>' : '') + '</p></div><button id="saveCampaignPlan" class="outline-action" type="button">Save project</button></div><div class="campaign-step-grid">' + result.steps.map(step => '<article><small>' + esc(step.format.toUpperCase()) + '</small><b>' + esc(step.next) + '<button type="button" data-open-tool="' + esc(step.format === 'Video' ? 'video' : step.format === 'Audio' ? 'audio' : step.format === 'Ads' ? 'ads' : 'image') + '">Open tool →</button></b></article>').join('') + '</div>';
    $('#campaignResult').hidden = false;
    $('#saveCampaignPlan').onclick = () => saveProject('Campaign plan', name, result, samples.product);
    $$('[data-open-tool]', $('#campaignResult')).forEach(button => button.addEventListener('click', () => setTool(button.dataset.openTool, true)));
    notice('Campaign plan ready. Choose any piece to continue.');
  });

  const sourcePreview = $('#sourcePreview');
  $$('[data-sample]').forEach(button => button.addEventListener('click', () => { sourceData = samples[button.dataset.sample]; sourcePreview.src = sourceData; notice('Sample image selected.'); }));
  $('#assetUpload').addEventListener('change', event => {
    const file = event.target.files && event.target.files[0]; if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return notice('Choose a PNG, JPEG, or WebP image.');
    const reader = new FileReader(); reader.onload = () => { sourceData = reader.result; sourcePreview.src = sourceData; notice('Your image is ready to edit in this browser.'); }; reader.readAsDataURL(file);
  });
  function createVariation(image, size, filter) {
    const dimensions = size === 'portrait' ? [720, 900] : size === 'wide' ? [960, 540] : [800, 800];
    const canvas = document.createElement('canvas'); canvas.width = dimensions[0]; canvas.height = dimensions[1];
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#07132c'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.filter = filter;
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height); ctx.filter = 'none';
    return canvas.toDataURL('image/jpeg', 0.82);
  }
  $('#makeVariants').addEventListener('click', () => {
    const image = new Image(); image.onload = () => {
      const edits = [{ name: 'Clean', filter: 'none' }, { name: 'Deep blue', filter: 'saturate(1.24) contrast(1.12)' }, { name: 'Bright studio', filter: 'brightness(1.12) saturate(1.08)' }];
      const variants = edits.map(edit => ({ ...edit, data: createVariation(image, $('#imageFormat').value, edit.filter) }));
      $('#imageResultCount').textContent = variants.length + ' locally edited crops';
      $('#imageVariants').innerHTML = variants.map((item, index) => '<article class="variation-card"><img src="' + item.data + '" alt="' + esc(item.name) + ' image variation"><div><b>' + esc(item.name) + '</b><div class="variation-actions"><button type="button" data-save-variation="' + index + '">Save</button><button type="button" data-download-variation="' + index + '">Download</button></div></div></article>').join('');
      $$('#imageVariants [data-save-variation]').forEach(button => button.onclick = () => saveAsset(variants[Number(button.dataset.saveVariation)], 'Image edit'));
      $$('#imageVariants [data-download-variation]').forEach(button => button.onclick = () => { const item = variants[Number(button.dataset.downloadVariation)]; const anchor = document.createElement('a'); anchor.href = item.data; anchor.download = 'penmuse-' + item.name.toLowerCase().replace(/\s+/g, '-') + '.jpg'; anchor.click(); });
      notice('Three image variations created on this device.');
    }; image.onerror = () => notice('Could not open this image. Choose another file.'); image.src = sourceData;
  });
  function saveAsset(item, kind) {
    const assets = read(KEYS.assets); assets.unshift({ id: 'asset-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5), name: item.name || 'Edited visual', kind, data: item.data, savedAt: new Date().toISOString() });
    if (write(KEYS.assets, assets.slice(0, 24))) notice('Image saved in your local asset library.');
  }

  const frameImages = [samples.product, samples.night, samples.portrait, samples.headphones];
  const sceneBeats = {
    product: ['Start with a close product detail.', 'Reveal the full product in its best light.', 'Show the product in a lived-in moment.', 'End on the benefit and next step.'],
    social: ['Open with a visual hook.', 'Show the everyday problem.', 'Share the simple change.', 'Close with a question or invitation.'],
    explainer: ['Name the idea in one line.', 'Show the first important step.', 'Make the result easy to picture.', 'End with the key takeaway.']
  };
  function renderScenes() {
    $('#storyboard').innerHTML = currentScenes.map((scene, index) => '<article class="scene-card"><div class="scene-image"><img src="' + scene.image + '" alt="Scene ' + (index + 1) + ' visual reference"><span>SCENE ' + String(index + 1).padStart(2, '0') + '</span><button type="button" data-remove-scene="' + index + '" aria-label="Remove scene ' + (index + 1) + '">Remove</button></div><label for="scene-' + index + '">Scene description</label><textarea id="scene-' + index + '" data-scene="' + index + '" maxlength="320">' + esc(scene.text) + '</textarea><small>Shot · ' + (index + 1) + '</small></article>').join('') || '<div class="storyboard-empty">No scenes yet. Build a storyboard from your idea.</div>';
    $$('#storyboard [data-scene]').forEach(input => input.addEventListener('input', () => { currentScenes[Number(input.dataset.scene)].text = input.value; }));
    $$('#storyboard [data-remove-scene]').forEach(button => button.addEventListener('click', () => { currentScenes.splice(Number(button.dataset.removeScene), 1); renderScenes(); }));
  }
  $('#buildStoryboard').addEventListener('click', async () => {
    const idea = $('#videoIdea').value.trim(); if (!idea) return notice('Add a video idea first.');
    const style = $('#videoStyle').value;
    const button = $('#buildStoryboard'); button.disabled = true;
    try {
      const result = await requestCreativeAI('storyboard', { brief: idea + ' (' + style + ' format)' });
      currentScenes = result.scenes.slice(0, 6).map((scene, index) => ({ text: [scene.shot, scene.visual, scene.voiceover].filter(Boolean).join(' — '), image: frameImages[index % frameImages.length] }));
      $('#storyboardTitle').textContent = formatTitle(result.title || idea) + ' · AI storyboard'; renderScenes(); notice('AI storyboard created. Review every scene before production.');
    } catch {
      currentScenes = sceneBeats[style].map((text, index) => ({ text: text + ' Campaign: ' + idea, image: frameImages[index] }));
      $('#storyboardTitle').textContent = formatTitle(idea) + ' · Local template'; renderScenes(); notice('Local storyboard template created. Hosted AI is not connected or enabled.');
    } finally { button.disabled = false; }
  });
  $('#addScene').addEventListener('click', () => { currentScenes.push({ text: 'Describe the next shot and what it should show.', image: frameImages[currentScenes.length % frameImages.length] }); renderScenes(); });
  $('#exportStoryboard').addEventListener('click', () => {
    if (!currentScenes.length) return notice('Build a storyboard before exporting.');
    download('penmuse-storyboard.json', JSON.stringify({ title: $('#videoIdea').value, format: $('#videoStyle').value, scenes: currentScenes.map(scene => ({ text: scene.text, visualReference: scene.image })) }, null, 2)); notice('Storyboard downloaded.');
  });
  $('#saveStoryboard').addEventListener('click', () => { if (!currentScenes.length) return notice('Build a storyboard before saving.'); saveProject('Storyboard', formatTitle($('#videoIdea').value), { format: $('#videoStyle').value, scenes: currentScenes.map(scene => ({ text: scene.text, visualReference: scene.image })) }, frameImages[0]); });

  const voiceSamples = ['Meet your next favorite.', 'Made for the moments that move you.', 'A small change. A better everyday.'];
  $('#draftVoiceover').addEventListener('click', async () => {
    const source = $('#audioBrief').value.trim(); if (!source) return notice('Add a voiceover idea or draft first.');
    const button = $('#draftVoiceover'); button.disabled = true;
    try { const result = await requestCreativeAI('voiceover', { brief: source }); $('#voiceOutput').textContent = result.script.slice(0, 900); $('#voiceStatus').textContent = (result.direction ? result.direction + ' · ' : '') + 'AI script draft. Review before use.'; }
    catch { const lines = source.split(/(?<=[.!?])\s+/).filter(Boolean); const intro = lines.length > 1 ? '' : 'A better way to bring your idea to life. '; $('#voiceOutput').textContent = (intro + source).slice(0, 900); $('#voiceStatus').textContent = 'Local template draft. Hosted AI is not connected or enabled.'; }
    finally { button.disabled = false; }
  });
  function loadVoices() {
    if (!window.speechSynthesis) return;
    speechVoices = speechSynthesis.getVoices();
    $('#voiceSelect').innerHTML = '<option value="">Default device voice</option>' + speechVoices.map((voice, index) => '<option value="' + index + '">' + esc(voice.name + (voice.lang ? ' · ' + voice.lang : '')) + '</option>').join('');
  }
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.addEventListener('voiceschanged', loadVoices); }
  $('#previewVoice').addEventListener('click', () => {
    if (!window.speechSynthesis) return notice('Speech preview is not available in this browser.');
    const script = $('#voiceOutput').textContent.trim(); if (!script || script.startsWith('Your drafted')) return notice('Draft a voiceover before previewing it.');
    speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(script); const selected = $('#voiceSelect').value; if (selected !== '' && speechVoices[Number(selected)]) utterance.voice = speechVoices[Number(selected)]; utterance.onstart = () => { $('#voiceStatus').textContent = 'Playing with a device voice…'; }; utterance.onend = () => { $('#voiceStatus').textContent = 'Voice preview finished.'; }; utterance.onerror = () => { $('#voiceStatus').textContent = 'Voice preview could not play.'; }; speechSynthesis.speak(utterance);
  });
  $('#stopVoice').addEventListener('click', () => { if (window.speechSynthesis) speechSynthesis.cancel(); $('#voiceStatus').textContent = 'Voice preview stopped.'; });
  $('#downloadVoiceScript').addEventListener('click', () => { const script = $('#voiceOutput').textContent.trim(); if (!script || script.startsWith('Your drafted')) return notice('Draft a voiceover before downloading.'); download('penmuse-voiceover.txt', script, 'text/plain'); notice('Voiceover script downloaded.'); });

  $('#adForm').addEventListener('submit', async event => {
    event.preventDefault();
    const product = $('#adProduct').value.trim(), benefit = $('#adBenefit').value.trim(), audience = $('#adAudience').value.trim() || 'people who value a thoughtful upgrade', cta = $('#adCta').value.trim() || 'Explore it today';
    const submit = $('#adForm button[type="submit"]'); submit.disabled = true;
    let aiDraft = false;
    let variants;
    try { const result = await requestCreativeAI('ad-copy', { product, benefit, audience, cta }); variants = result.variants.slice(0, 3); aiDraft = true; }
    catch { variants = [
      { tone: 'Direct', headline: product + ', made for your everyday.', body: benefit + ' Designed for ' + audience + '.', cta },
      { tone: 'Curious', headline: 'What if your everyday felt a little better?', body: product + ' brings you ' + benefit.toLowerCase() + ' — a fresh choice for ' + audience + '.', cta },
      { tone: 'Story-led', headline: 'The small detail you notice every day.', body: 'Meet ' + product + '. ' + benefit + ' A thoughtful pick for ' + audience + '.', cta }
    ]; }
    finally { submit.disabled = false; }
    $('#adVariants').innerHTML = '<p class="local-hint">' + (aiDraft ? 'AI draft · Review claims and wording before publishing.' : 'Local template draft · Hosted AI is not connected or enabled.') + '</p>' + variants.map((item, index) => '<article class="ad-variant"><div><span class="eyebrow">' + esc(String(item.tone || 'Direction').toUpperCase()) + ' DIRECTION ' + (index + 1) + '</span><h3>' + esc(item.headline) + '</h3><p>' + esc(item.body) + '</p><b>' + esc(item.cta) + '</b></div><div class="variation-actions"><button type="button" data-copy-ad="' + index + '">Copy</button><button type="button" data-save-ad="' + index + '">Save draft</button></div></article>').join('');
    $$('#adVariants [data-copy-ad]').forEach(button => button.onclick = async () => { const item = variants[Number(button.dataset.copyAd)], text = item.headline + '\n\n' + item.body + '\n\n' + item.cta; try { await navigator.clipboard.writeText(text); notice('Ad copy copied.'); } catch { download('penmuse-ad-copy.txt', text, 'text/plain'); notice('Clipboard unavailable; downloaded the draft instead.'); } });
    $$('#adVariants [data-save-ad]').forEach(button => button.onclick = () => saveProject('Ad draft', product + ' · ' + variants[Number(button.dataset.saveAd)].tone, variants[Number(button.dataset.saveAd)], samples.headphones));
    notice(aiDraft ? 'AI ad copy created. Review it before use.' : 'Local ad copy templates created.');
  });

  function renderLibrary() {
    const host = $('#libraryContent'); if (!host) return;
    const data = read(activeLibrary === 'assets' ? KEYS.assets : KEYS.projects);
    if (!data.length) { host.innerHTML = '<div class="library-empty"><p class="eyebrow">NOTHING SAVED YET</p><h3>Your next project will live here.</h3><p>Save an image edit, storyboard, ad direction, or campaign plan to start your library.</p><button type="button" class="outline-action" data-open="image">Open Image Studio</button></div>'; host.querySelector('[data-open]').onclick = () => setTool('image', true); return; }
    host.innerHTML = data.map(item => activeLibrary === 'assets'
      ? '<article class="library-item"><img src="' + item.data + '" alt="' + esc(item.name) + '"><div><span>' + esc(item.kind) + '</span><b>' + esc(item.name) + '</b><small>' + new Date(item.savedAt).toLocaleDateString() + '</small></div><button type="button" data-download-asset="' + esc(item.id) + '">Download</button><button type="button" data-delete-asset="' + esc(item.id) + '">Remove</button></article>'
      : '<article class="library-item project-item">' + (item.cover ? '<img src="' + esc(item.cover) + '" alt="">' : '<div class="project-cover">' + esc(String(item.type || 'Project').slice(0, 2).toUpperCase()) + '</div>') + '<div><span>' + esc(item.type) + '</span><b>' + esc(item.title) + '</b><small>' + new Date(item.savedAt).toLocaleDateString() + '</small></div><button type="button" data-export-project="' + esc(item.id) + '">Export</button><button type="button" data-delete-project="' + esc(item.id) + '">Remove</button></article>').join('');
    $$('[data-download-asset]', host).forEach(button => button.onclick = () => { const item = read(KEYS.assets).find(x => x.id === button.dataset.downloadAsset); if (item) { const a = document.createElement('a'); a.href = item.data; a.download = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.jpg'; a.click(); } });
    $$('[data-export-project]', host).forEach(button => button.onclick = () => { const item = read(KEYS.projects).find(x => x.id === button.dataset.exportProject); if (item) download('penmuse-' + item.type.toLowerCase().replace(/\s+/g, '-') + '.json', JSON.stringify(item, null, 2)); });
    $$('[data-delete-asset]', host).forEach(button => button.onclick = () => { if (write(KEYS.assets, read(KEYS.assets).filter(x => x.id !== button.dataset.deleteAsset))) { renderLibrary(); notice('Asset removed from this browser.'); } });
    $$('[data-delete-project]', host).forEach(button => button.onclick = () => { if (write(KEYS.projects, read(KEYS.projects).filter(x => x.id !== button.dataset.deleteProject))) { renderLibrary(); notice('Project removed from this browser.'); } });
  }
  $$('.library-tab').forEach(button => button.addEventListener('click', () => { activeLibrary = button.dataset.libraryTab; $$('.library-tab').forEach(tab => tab.classList.toggle('active', tab === button)); renderLibrary(); }));
  $('#exportWorkspace').addEventListener('click', () => download('penmuse-workspace.json', JSON.stringify({ exportedAt: new Date().toISOString(), assets: read(KEYS.assets).map(({ data, ...meta }) => meta), projects: read(KEYS.projects), workflows: read(KEYS.workflows) }, null, 2)));

  function workflowCard(item) { return '<article class="saved-workflow"><div><span class="eyebrow">SAVED WORKFLOW</span><h3>' + esc(item.name) + '</h3><p>' + item.steps.map(esc).join(' → ') + '</p></div><button type="button" data-run-workflow="' + esc(item.id) + '">Load steps</button><button type="button" data-delete-workflow="' + esc(item.id) + '">Remove</button></article>'; }
  function renderWorkflows() {
    const host = $('#savedWorkflows'); if (!host) return;
    const flows = read(KEYS.workflows); host.innerHTML = flows.length ? flows.map(workflowCard).join('') : '<div class="library-empty"><p>No workflows saved yet. Start with one of the two recipes above.</p></div>';
    $$('[data-run-workflow]', host).forEach(button => button.onclick = () => { const flow = read(KEYS.workflows).find(x => x.id === button.dataset.runWorkflow); if (!flow) return; $$('#workflowForm input[type="checkbox"]').forEach(box => { box.checked = flow.steps.includes(box.value); }); $('#workflowName').value = flow.name; setTool('create', true); notice('Workflow loaded. Add a brief to begin.'); });
    $$('[data-delete-workflow]', host).forEach(button => button.onclick = () => { write(KEYS.workflows, read(KEYS.workflows).filter(x => x.id !== button.dataset.deleteWorkflow)); renderWorkflows(); notice('Workflow removed.'); });
  }
  $$('#workflowForm').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault(); const name = $('#workflowName').value.trim(), steps = $$('#workflowForm input[type="checkbox"]:checked').map(input => input.value);
    if (!steps.length) return notice('Choose at least one workflow step.');
    const items = read(KEYS.workflows); items.unshift({ id: 'flow-' + Date.now(), name: name.slice(0, 80), steps }); if (write(KEYS.workflows, items.slice(0, 30))) { form.reset(); renderWorkflows(); notice('Workflow saved on this device.'); }
  }));
  $$('[data-workflow-template]').forEach(button => button.addEventListener('click', () => {
    const templates = { launch: { name: 'Product launch', steps: ['Image variation', 'Storyboard', 'Ad copy', 'Voiceover'] }, reel: { name: 'Creator reel', steps: ['Storyboard', 'Voiceover', 'Ad copy'] } }, selected = templates[button.dataset.workflowTemplate];
    $('#workflowName').value = selected.name; $$('#workflowForm input[type="checkbox"]').forEach(box => { box.checked = selected.steps.includes(box.value); }); $('#workflowName').focus(); notice('Recipe loaded into the workflow builder. Save it to reuse.');
  }));
})();
