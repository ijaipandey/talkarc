(function () {
  'use strict';
  const $ = (selector, root) => (root || document).querySelector(selector);
  const KEY = 'penmuse.agency.clients.v1';
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const list = () => { try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  const toast = message => { const el = $('#agencyToast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3000); };
  let currentSite = '', currentClient = null;

  function formData() {
    const data = Object.fromEntries(new FormData($('#clientBrief')).entries());
    data.businessName = data.businessName.trim(); data.businessIntro = data.businessIntro.trim();
    data.businessServices = data.businessServices.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 12);
    for (const field of ['businessArea', 'businessAddress', 'businessPhone', 'businessEmail']) data[field] = String(data[field] || '').trim();
    return data;
  }
  function siteHTML(data) {
    const palettes = {
      warm: { paper: '#f7f1e6', ink: '#243b35', accent: '#b75f3b', pale: '#e8ddc8' },
      clean: { paper: '#f5f7f9', ink: '#1f2d42', accent: '#4168d8', pale: '#e2e9f5' },
      bold: { paper: '#fbf3e9', ink: '#291f31', accent: '#dc563e', pale: '#f1d9ca' }
    };
    const p = palettes[data.businessLook] || palettes.warm;
    const name = esc(data.businessName), type = esc(data.businessType), area = esc(data.businessArea);
    const services = data.businessServices.length ? data.businessServices : ['Friendly service', 'Quality you can count on', 'Made for the neighbourhood'];
    const serviceMarkup = services.map(item => '<li>' + esc(item) + '</li>').join('');
    const phone = data.businessPhone.replace(/[^+\d]/g, '');
    let actionHref = '#contact', actionText = 'Get in touch';
    if (data.businessAction === 'call' && phone) { actionHref = 'tel:' + esc(phone); actionText = 'Call us'; }
    else if (data.businessAction === 'email' && data.businessEmail) { actionHref = 'mailto:' + esc(data.businessEmail); actionText = 'Email us'; }
    else if (data.businessAction === 'visit' && data.businessAddress) { actionHref = '#contact'; actionText = 'Plan your visit'; }
    const location = [data.businessAddress, data.businessArea].filter(Boolean).map(esc).join(' · ');
    const contactPhone = phone ? '<a href="tel:' + esc(phone) + '">' + esc(data.businessPhone) + '</a>' : '';
    const contactEmail = data.businessEmail ? '<a href="mailto:' + esc(data.businessEmail) + '">' + esc(data.businessEmail) + '</a>' : '';
    const profile = JSON.stringify({ name: data.businessName, services, area: data.businessArea, address: data.businessAddress, phone: data.businessPhone, email: data.businessEmail }).replace(/</g, '\\u003c');
    const chatbot = '<style>.help-open{position:fixed;right:20px;bottom:20px;z-index:5;border:0;border-radius:99px;background:' + p.accent + ';color:#fff;padding:13px 17px;font-weight:700;box-shadow:0 8px 28px #10182835;cursor:pointer}.help-box{position:fixed;right:20px;bottom:78px;z-index:5;width:min(340px,calc(100vw - 28px));background:#fff;color:#243044;border-radius:13px;box-shadow:0 15px 48px #10182835;overflow:hidden;font:14px system-ui,sans-serif}.help-box[hidden]{display:none}.help-head{padding:13px 15px;background:' + p.accent + ';color:#fff;font-weight:700}.help-msg{padding:15px;min-height:82px;max-height:220px;overflow:auto;line-height:1.5;font-size:13px}.help-form{display:flex;padding:10px;gap:6px;border-top:1px solid #e5e7eb}.help-form input{min-width:0;flex:1;padding:10px;border:1px solid #dce1ea;border-radius:7px}.help-form button{border:0;background:' + p.accent + ';color:#fff;border-radius:7px;padding:9px 11px}.help-caption{padding:0 15px 12px;color:#778195;font-size:10px}</style><button class="help-open" id="helpOpen" type="button" aria-expanded="false" aria-controls="helpBox">Ask a question</button><section class="help-box" id="helpBox" hidden aria-label="Business website helper"><div class="help-head">' + name + ' · website helper</div><div class="help-msg" id="helpReply" aria-live="polite">Hi! Ask about the services or how to contact the business.</div><form class="help-form" id="helpForm"><input id="helpQuestion" maxlength="180" aria-label="Your question" placeholder="Type a question…" required><button type="submit">Ask</button></form><div class="help-caption">Answers use the business details shown on this page.</div></section><script>(function(){const info=' + profile + ';const btn=document.getElementById("helpOpen"),box=document.getElementById("helpBox"),reply=document.getElementById("helpReply");btn.addEventListener("click",()=>{const open=box.hidden;box.hidden=!open;btn.setAttribute("aria-expanded",String(open));if(open)document.getElementById("helpQuestion").focus()});document.getElementById("helpForm").addEventListener("submit",e=>{e.preventDefault();const q=document.getElementById("helpQuestion").value.toLowerCase();let answer;if(/service|offer|menu|product|do you/.test(q))answer="Here are the services listed: "+info.services.join(", ")+". Ask the business directly if you need more details.";else if(/where|location|address|area|visit/.test(q))answer=info.address||info.area?"Location details: "+[info.address,info.area].filter(Boolean).join(" · "):"The address has not been added yet. Please contact the business for location details.";else if(/call|phone|contact|email|reach/.test(q))answer=[info.phone?"Phone: "+info.phone:"",info.email?"Email: "+info.email:""].filter(Boolean).join(" · ")||"Contact details have not been added yet.";else if(/price|cost|rate|hour|open|close/.test(q))answer="Please contact the business for current prices and opening hours.";else answer="I can help with the services, location, or contact details listed on this website.";reply.textContent=answer;document.getElementById("helpQuestion").value=""})})();</script>';
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="' + esc(data.businessIntro.slice(0, 150)) + '"><title>' + name + (area ? ' — ' + area : '') + '</title><style>' +
      '*{box-sizing:border-box}body{margin:0;background:' + p.paper + ';color:' + p.ink + ';font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}a{color:inherit}.wrap{max-width:1100px;margin:auto;padding:0 24px}.nav{height:76px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ' + p.ink + '22}.brand{font-size:20px;font-weight:800;letter-spacing:-.05em}.nav a:last-child,.button{background:' + p.accent + ';color:white;padding:12px 17px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:700}.hero{min-height:490px;display:flex;align-items:center;position:relative;overflow:hidden}.hero:after{content:"";position:absolute;width:min(42vw,390px);height:min(42vw,390px);right:3%;top:12%;border-radius:50%;background:radial-gradient(circle at 33% 30%,' + p.pale + ',' + p.accent + '55);z-index:0}.hero-inner{position:relative;z-index:1;max-width:580px;padding:78px 0}.kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:' + p.accent + ';font-weight:800}.hero h1{font-size:clamp(46px,7vw,80px);line-height:.98;letter-spacing:-.07em;margin:18px 0}.hero p{font-size:16px;line-height:1.7;color:' + p.ink + 'c9;max-width:510px}.button{display:inline-block;margin-top:15px}.services{padding:65px 0}.services h2,.contact h2{font-size:38px;letter-spacing:-.05em}.service-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}.service-grid li{list-style:none;min-height:125px;padding:19px;border-radius:12px;background:' + p.pale + ';font-weight:700}.contact{padding:55px 0;border-top:1px solid ' + p.ink + '20}.contact p{line-height:1.7}.contact-links{display:flex;gap:18px;flex-wrap:wrap}.contact-links a{font-weight:700}.foot{padding:22px 0;border-top:1px solid ' + p.ink + '20;font-size:12px;color:' + p.ink + 'ad}@media(max-width:650px){.wrap{padding:0 18px}.hero{min-height:480px}.hero:after{width:220px;height:220px;right:-70px;top:25%}.hero-inner{padding:62px 0}.hero h1{font-size:52px}.hero p{font-size:14px}.service-grid{grid-template-columns:1fr}.service-grid li{min-height:75px}.services h2,.contact h2{font-size:31px}}</style></head><body><header class="wrap nav"><span class="brand">' + name + '</span><a href="' + actionHref + '">' + actionText + '</a></header><main><section class="wrap hero"><div class="hero-inner"><span class="kicker">' + type + (area ? ' · ' + area : '') + '</span><h1>' + name + '</h1><p>' + esc(data.businessIntro) + '</p><a class="button" href="' + actionHref + '">' + actionText + ' →</a></div></section><section class="wrap services"><span class="kicker">WHAT WE OFFER</span><h2>Good work. Right around here.</h2><ul class="service-grid">' + serviceMarkup + '</ul></section><section class="wrap contact" id="contact"><span class="kicker">COME SAY HELLO</span><h2>We would love to hear from you.</h2><p>' + (location || 'Get in touch to find us.') + '</p><div class="contact-links">' + contactPhone + contactEmail + '</div></section></main><footer class="wrap foot">' + name + (area ? ' · ' + area : '') + '</footer>' + chatbot + '</body></html>';
  }
  function renderSite(data, status) {
    currentClient = data; currentSite = siteHTML(data);
    $('#websitePreview').srcdoc = currentSite;
    $('#previewPlaceholder').hidden = true; $('#previewFrameWrap').classList.add('show');
    $('#downloadWebsite').disabled = false;
    $('#previewStatus').textContent = status || (data.businessName + ' · website draft');
  }
  const examplePrompt = 'Create a warm website for Luna Salon in Bengaluru. We offer haircuts, colour, and bridal styling. Call +91 98765 43210.';
  $('#fillExample').addEventListener('click', () => { $('#websitePrompt').value = examplePrompt; $('#promptStatus').textContent = 'Example added. Select “Create my website” to make the draft.'; $('#websitePrompt').focus(); });
  $('#promptForm').addEventListener('submit', event => {
    event.preventDefault();
    const prompt = $('#websitePrompt').value.trim();
    const nameMatch = prompt.match(/\b(?:for|called|named)\s+["“]?(.+?)["”]?(?=\s+(?:in|near|based\s+in|located\s+in|offering|with|that|which|we\s+offer|we\s+provide)\b|[,.;!?]|$)/i)
      || prompt.match(/^\s*(?:create|build|make)\s+(?:a|an|the)?\s*(?:\w+\s+){0,3}?(?:website|site)\s+(?:for|of)\s+(.+?)(?=\s+(?:in|near|offering|with)\b|[,.;!?]|$)/i);
    const businessName = nameMatch && nameMatch[1].replace(/^["“']|["”']$/g, '').trim();
    if (!businessName) { $('#promptStatus').textContent = 'Add the business name, for example: “website for Luna Salon in Bengaluru”.'; $('#websitePrompt').focus(); return; }
    const lower = prompt.toLowerCase();
    const type = /salon|beauty|stylist|haircut/.test(lower) ? 'Salon or beauty studio'
      : /cafe|café|restaurant|bakery|coffee/.test(lower) ? 'Café or restaurant'
      : /shop|store|boutique|maker/.test(lower) ? 'Shop or local maker'
      : /electrician|plumb|cleaning|repair|home service/.test(lower) ? 'Home service'
      : /gym|yoga|fitness|wellness|trainer/.test(lower) ? 'Fitness or wellness' : 'Other local business';
    let area = (prompt.match(/\b(?:in|near|based\s+in|located\s+in|serving)\s+([^,.!?;\n]+)/i) || [,''])[1].trim();
    area = area.replace(/\s+(?:offering|offers|with|we\s+offer|we\s+provide|and\s+we\s+offer)\b.*$/i, '').trim();
    const phone = (prompt.match(/\+?\d[\d\s().-]{7,18}\d/) || [''])[0].trim();
    const email = (prompt.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/) || [''])[0];
    const serviceMatch = prompt.match(/\b(?:offering|offers|services(?:\s+include)?|provide|provides|providing|we\s+(?:offer|provide|do)|speciali[sz]ing\s+in)\s+(.+?)(?=[.!?;\n]|$)/i);
    const services = serviceMatch ? serviceMatch[1].split(/,|\band\b|&|\//i).map(item => item.trim()).filter(Boolean).slice(0, 12) : [];
    const intro = 'A local ' + type.toLowerCase() + (area ? ' in ' + area : '') + (services.length ? ' offering ' + services.join(', ') : '') + '.';
    const fields = { businessName, businessType: type, businessArea: area, businessIntro: intro, businessServices: services.join('\n'), businessPhone: phone, businessEmail: email,
      businessAddress: '', businessAction: phone ? 'call' : email ? 'email' : 'visit',
      businessLook: /clean|minimal|modern/.test(lower) ? 'clean' : /bold|playful|vibrant|energetic/.test(lower) ? 'bold' : 'warm' };
    for (const [key, value] of Object.entries(fields)) { const field = $('#clientBrief').elements.namedItem(key); if (field) field.value = value; }
    renderSite(formData(), businessName + ' · prompt website draft');
    $('#promptStatus').textContent = 'Draft created from your prompt. Review and edit the details before download.';
    $('#previewFrameWrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#clientBrief').addEventListener('submit', event => { event.preventDefault(); renderSite(formData()); toast('Website draft ready. Review the details, then download the HTML.'); });
  $('#saveProject').addEventListener('click', () => {
    const form = $('#clientBrief'); if (!form.reportValidity()) return;
    const data = formData(), projects = list();
    const existing = currentClient && currentClient.id && projects.findIndex(item => item.id === currentClient.id);
    data.id = existing >= 0 ? currentClient.id : 'client-' + Date.now();
    data.status = existing >= 0 ? projects[existing].status : 'New brief'; data.updatedAt = new Date().toISOString();
    data.site = siteHTML(data);
    if (existing >= 0) projects[existing] = data; else projects.unshift(data);
    try { localStorage.setItem(KEY, JSON.stringify(projects.slice(0, 30))); currentClient = data; renderSite(data, data.businessName + ' · saved project'); renderProjects(); toast('Client project saved in this browser.'); }
    catch { toast('Could not save: browser storage is full. Download the site HTML to keep a copy.'); }
  });
  $('#downloadWebsite').addEventListener('click', () => {
    if (!currentSite) return;
    const fileName = (currentClient.businessName || 'client-website').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.html';
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([currentSite], { type: 'text/html;charset=utf-8' })); anchor.download = fileName; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000); toast('Website HTML downloaded.');
  });
  $('#desktopPreview').addEventListener('click', () => setPreview(false));
  $('#mobilePreview').addEventListener('click', () => setPreview(true));
  function setPreview(mobile) { $('#previewFrameWrap').classList.toggle('mobile', mobile); $('#mobilePreview').classList.toggle('active', mobile); $('#desktopPreview').classList.toggle('active', !mobile); }
  $('#newProject').addEventListener('click', () => { $('#clientBrief').reset(); currentClient = null; currentSite = ''; $('#previewFrameWrap').classList.remove('show'); $('#previewPlaceholder').hidden = false; $('#downloadWebsite').disabled = true; $('#previewStatus').textContent = 'No website draft yet'; $('#businessName').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#clearBrief').addEventListener('click', () => { $('#clientBrief').reset(); toast('Brief cleared.'); });
  function renderProjects() {
    const projects = list(), host = $('#projectList');
    $('#projectCount').textContent = projects.length + (projects.length === 1 ? ' project' : ' projects');
    if (!projects.length) { host.innerHTML = '<div class="project-empty">Your saved client briefs will show up here.</div>'; return; }
    host.innerHTML = projects.map(item => '<article class="client-project"><div><b>' + esc(item.businessName) + '</b><small>' + esc([item.businessType, item.businessArea].filter(Boolean).join(' · ')) + '</small></div><select data-status="' + esc(item.id) + '" aria-label="Project status for ' + esc(item.businessName) + '"><option' + (item.status === 'New brief' ? ' selected' : '') + '>New brief</option><option' + (item.status === 'In progress' ? ' selected' : '') + '>In progress</option><option' + (item.status === 'Client review' ? ' selected' : '') + '>Client review</option><option' + (item.status === 'Delivered' ? ' selected' : '') + '>Delivered</option></select><button type="button" data-load="' + esc(item.id) + '">Open</button><button type="button" data-remove="' + esc(item.id) + '">Remove</button></article>').join('');
    host.querySelectorAll('[data-status]').forEach(select => select.addEventListener('change', () => { const rows = list(), item = rows.find(row => row.id === select.dataset.status); if (item) { item.status = select.value; item.updatedAt = new Date().toISOString(); localStorage.setItem(KEY, JSON.stringify(rows)); toast('Project status updated.'); } }));
    host.querySelectorAll('[data-load]').forEach(button => button.addEventListener('click', () => { const item = list().find(row => row.id === button.dataset.load); if (!item) return; const form = $('#clientBrief'); for (const [key, value] of Object.entries(item)) { const field = form.elements.namedItem(key); if (!field) continue; field.value = Array.isArray(value) ? value.join('\n') : value; } renderSite(formData(), item.businessName + ' · saved project'); currentClient = item; window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    host.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { localStorage.setItem(KEY, JSON.stringify(list().filter(item => item.id !== button.dataset.remove))); renderProjects(); toast('Project removed from this browser.'); }));
  }
  renderProjects();
})();
