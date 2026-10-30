(() => {
  'use strict';
  const cases = window.FWM_CASES || [];
  const byId = new Map(cases.map(item => [item.id, item]));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const play = video => { if (video?.src) video.play().catch(() => {}); };

  const nav = document.querySelector('.nav');
  const progress = document.querySelector('.progress');
  let scrollPending = false;
  function updateScroll() {
    nav.classList.toggle('is-solid', scrollY > 24);
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    scrollPending = false;
  }
  addEventListener('scroll', () => {
    if (!scrollPending) { scrollPending = true; requestAnimationFrame(updateScroll); }
  }, {passive:true});
  addEventListener('resize', updateScroll);
  updateScroll();
  const navLinks = [...document.querySelectorAll('.nav-links a')];
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) navLinks.forEach(link => {
        if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    });
  }, {rootMargin:'-20% 0px -65% 0px'});
  navLinks.forEach(link => sectionObserver.observe(document.querySelector(link.hash)));

  const backdrop = document.querySelector('#backdrop-video');
  const motionToggle = document.querySelector('#motion-toggle');
  let motionPaused = reducedMotion.matches;
  function applyMotion() {
    motionToggle.setAttribute('aria-pressed', String(motionPaused));
    motionToggle.textContent = motionPaused ? 'Play background' : 'Pause background';
    if (motionPaused || document.hidden) backdrop.pause(); else play(backdrop);
  }
  motionToggle.addEventListener('click', () => { motionPaused = !motionPaused; applyMotion(); });
  reducedMotion.addEventListener('change', event => {
    motionPaused = event.matches;
    applyMotion();
    if (event.matches) document.querySelectorAll('.screen-content video').forEach(video => video.pause());
  });
  applyMotion();

  // Only load and play samples when their player is close to the viewport.
  function arm(video) {
    if (video.dataset.src) {
      video.src = video.dataset.src;
      delete video.dataset.src;
      video.load();
    }
  }
  const videoObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const video = entry.target;
      if (entry.isIntersecting) {
        arm(video);
        if (!reducedMotion.matches && !document.hidden && !document.querySelector('dialog[open]')) play(video);
      } else video.pause();
    });
  }, {threshold:.25});

  function playerMarkup(item, eager = false) {
    return `<div class="frame">
      <div class="frame-bar"><span>${escape(item.group)} / ${escape(item.title)}</span><span>Corpus sample</span></div>
      <div class="media-pair">
        <figure class="proxy-view"><video class="proxy-video" muted playsinline loop preload="none" poster="${item.proxyPoster}" data-src="${item.proxy}" aria-label="Interaction proxy for ${escape(item.title)}"></video><span class="video-label">Interaction proxy</span></figure>
        <figure class="output-view"><video class="output-video" controls muted playsinline loop preload="${eager ? 'metadata' : 'none'}" poster="${item.poster}" ${eager ? 'src' : 'data-src'}="${item.video}" aria-label="Edited training video of ${escape(item.title)}"></video><span class="video-label">Edited training video</span></figure>
      </div>
    </div>
    <div class="media-controls"><button type="button" class="compare-toggle" aria-pressed="false">Compare interaction proxy <span aria-hidden="true">↔</span></button><span class="clip-note">Muted · Looping</span></div>
    ${item.reference ? `<div class="reference-strip"><a href="${item.reference}" target="_blank" rel="noopener" aria-label="Open ${escape(item.title)} reference"><img src="${item.reference}" alt="Available training reference for ${escape(item.title)}" loading="lazy"></a><p><span>${item.category === 'Scene' ? 'Arena reference' : 'Character reference'}</span>${item.category === 'Scene' ? 'A clean scene reference specifies the arena appearance.' : 'The supplied reference specifies the edited fighter appearance.'}</p></div>` : '<div class="reference-strip text-only">Text describes the skill appearance. The proxy marks the casting window and recorded interaction.</div>'}`;
  }

  function wirePlayer(container, observe = true) {
    const output = container.querySelector('.output-video');
    const proxy = container.querySelector('.proxy-video');
    const pair = container.querySelector('.media-pair');
    const toggle = container.querySelector('.compare-toggle');
    let comparing = false;
    // The supplied proxies use 20 fps, while edited videos use 24 fps and
    // different clip lengths. Compare normalized clip progress explicitly.
    const ratio = () => Number.isFinite(proxy.duration) && output.duration > 0 ? proxy.duration / output.duration : 1;
    const setRate = () => { proxy.playbackRate = output.playbackRate * ratio(); };
    const sync = () => {
      if (!comparing || proxy.readyState < 1 || output.readyState < 1) return;
      const target = output.currentTime * ratio();
      if (Math.abs(proxy.currentTime - target) > .12) proxy.currentTime = Math.min(target, proxy.duration);
      setRate();
    };
    output.addEventListener('play', () => { if (comparing) { arm(proxy); sync(); play(proxy); } });
    output.addEventListener('pause', () => proxy.pause());
    output.addEventListener('seeking', sync);
    output.addEventListener('timeupdate', sync);
    output.addEventListener('ratechange', setRate);
    output.addEventListener('loadedmetadata', sync);
    proxy.addEventListener('loadedmetadata', () => { sync(); if (!output.paused && comparing) play(proxy); });
    toggle.addEventListener('click', () => {
      comparing = !comparing;
      pair.classList.toggle('is-comparing', comparing);
      toggle.setAttribute('aria-pressed', String(comparing));
      toggle.innerHTML = comparing ? 'Hide interaction proxy <span aria-hidden="true">×</span>' : 'Compare interaction proxy <span aria-hidden="true">↔</span>';
      container.querySelector('.clip-note').textContent = comparing ? 'Normalized clip progress' : 'Muted · Looping';
      if (comparing) { arm(output); arm(proxy); sync(); if (!output.paused) play(proxy); }
      else proxy.pause();
    });
    const errorNote = () => {
      const label = container.querySelector('.clip-note');
      label.textContent = 'Video unavailable';
      label.setAttribute('role', 'status');
    };
    output.addEventListener('error', errorNote);
    proxy.addEventListener('error', errorNote);
    if (observe) videoObserver.observe(output);
  }

  function disposePlayer(container) {
    container.querySelectorAll('video').forEach(video => {
      videoObserver.unobserve(video);
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
  }

  const screenings = {
    characters: [
      ['ryu-naruto','Naruto','Player / Ryu'], ['ryu-saitama','Saitama','Player / Ryu'],
      ['ryu-iron-man','Iron Man','Player / Ryu'], ['guile-superman','Superman','Opponent / Guile'],
      ['guile-darth-vader','Darth Vader','Opponent / Guile'], ['guile-daft-punk','Daft Punk','Opponent / Guile']
    ],
    arenas: [
      ['scene-autumn-shrine','Autumn shrine','Maple & stone'], ['scene-neon-city-night','Neon city','After dark'],
      ['scene-inkwash-mountains','Inkwash mountains','Ink & mist'], ['scene-space-station','Space station','Orbital arena'],
      ['scene-gothic-cathedral','Gothic cathedral','Stone & stained glass'], ['scene-turquoise-lagoon','Turquoise lagoon','Waterfront']
    ],
    skills: [
      ['vfx-ns07-overwatch-reinhardt-earthshatter','Earthshatter','Ground effect'],
      ['vfx-ns16-fate-saber-excalibur','Excalibur','Projectile'],
      ['vfx-ns12-naruto-susanoo','Susanoo','Summoned effect'],
      ['vfx-ns27-final-fantasy-meteor','Meteor','Sky effect'],
      ['vfx-ns26-star-wars-force-lightning','Force lightning','Lightning effect']
    ]
  };
  document.querySelectorAll('[data-screening]').forEach(section => {
    const list = screenings[section.dataset.screening].filter(([id]) => byId.has(id));
    const selection = section.querySelector('.selection');
    const content = section.querySelector('.screen-content');
    const contentId = `screen-${section.dataset.screening}`;
    content.id = contentId;
    selection.innerHTML = list.map(([id,title,label], index) => `<button type="button" data-case="${id}" aria-pressed="${index === 0}" aria-controls="${contentId}"><span>${String(index + 1).padStart(2,'0')}</span><div><b>${escape(title)}</b><small>${escape(label)}</small></div></button>`).join('');
    function select(id) {
      disposePlayer(content);
      selection.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.case === id)));
      content.innerHTML = playerMarkup(byId.get(id));
      wirePlayer(content);
    }
    selection.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button && button.getAttribute('aria-pressed') !== 'true') select(button.dataset.case);
    });
    if (list.length) select(list[0][0]);
  });

  const rules = [
    {name:'Default rules', tag:'Native damage', title:'The original exchange.', description:'The engine applies the original damage. The proxy carries the resulting hit reactions and persistent health to the renderer.', joint:'100.00', health:'0.16'},
    {name:'Damage magnitude', tag:'Reduced / Amplified', title:'Same actions, different damage.', description:'Reduced and amplified damage recompute health loss under the edited rule. Joint fidelity and health error are reported in that order.', joint:'97.76 / 98.84', health:'0.18 / 0.22'},
    {name:'Limited-hit immunity', tag:'React / Protect', title:'A hit can land without health loss.', description:'A configured number of hits retains the reaction event while blocking health loss. Once protection runs out, the next hit deducts health.', joint:'99.92', health:'0.21'},
    {name:'Lifesteal', tag:'Damage / Restore', title:'One hit updates both fighters.', description:'The recipient loses health and the attacker recovers health. The renderer follows both updates and preserves the resulting values.', joint:'99.87', health:'0.19'}
  ];
  const ruleList = document.querySelector('.rule-list');
  const ruleResult = document.querySelector('.rule-result');
  ruleResult.id = 'rule-result';
  ruleList.innerHTML = rules.map((rule,i) => `<button type="button" aria-controls="rule-result" data-rule="${i}" aria-pressed="${i === 0}">${rule.name}<span aria-hidden="true">↗</span></button>`).join('');
  function selectRule(index) {
    const rule = rules[index];
    const metric = (value, unit) => `<b${value.includes(' / ') ? ' class="metric-pair"' : ''}>${value.split(' / ').map(part => `${part}<small>${unit}</small>`).join('<br>')}</b>`;
    ruleList.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(+button.dataset.rule === index)));
    ruleResult.innerHTML = `<p class="overline">${rule.tag}</p><h3>${rule.title}</h3><p>${rule.description}</p><div class="rule-scores"><div>${metric(rule.joint, '%')}<span>Joint rule fidelity ↑</span></div><div>${metric(rule.health, ' pp')}<span>Health MAE ↓</span></div></div>`;
  }
  ruleList.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button) selectRule(+button.dataset.rule);
  });
  selectRule(0);

  // Interleave categories so the first archive view conveys the corpus variety.
  const buckets = ['Ryu','Scene','VFX','Guile'].map(category => cases.filter(item => item.category === category));
  const archive = [];
  for (let i = 0; buckets.some(bucket => i < bucket.length); i++) buckets.forEach(bucket => { if (bucket[i]) archive.push(bucket[i]); });
  let filter = 'all';
  let query = '';
  let shown = 12;
  const gallery = document.querySelector('#gallery');
  const status = document.querySelector('#gallery-status');
  const more = document.querySelector('#load-more');
  function renderGallery() {
    const matching = archive.filter(item => (filter === 'all' || item.category === filter) && `${item.title} ${item.group} ${item.sourceFolder}`.toLowerCase().includes(query));
    const visible = matching.slice(0,shown);
    gallery.innerHTML = visible.map(item => `<button type="button" class="sample-card" data-sample="${item.id}" aria-label="Open ${escape(item.group)} sample: ${escape(item.title)}"><div class="sample-poster"><img src="${item.poster}" width="768" height="594" alt="${escape(item.title)} corpus video still" loading="lazy"><span class="play-icon" aria-hidden="true">▶</span></div><span class="overline">${escape(item.group)} / Corpus sample</span><h4>${escape(item.title)}</h4></button>`).join('') || '<p class="empty-state">No samples match your search.</p>';
    status.textContent = `Showing ${visible.length} of ${matching.length} samples`;
    more.hidden = matching.length <= shown;
    updateScroll();
  }
  document.querySelector('.filters').addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    filter = button.dataset.filter;
    shown = 12;
    document.querySelectorAll('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    renderGallery();
  });
  document.querySelector('#gallery-search').addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); shown = 12; renderGallery(); });
  more.addEventListener('click', () => {
    const firstNew = gallery.children.length;
    shown += 12;
    renderGallery();
    gallery.children[firstNew]?.focus({preventScroll:true});
  });
  renderGallery();

  const dialog = document.querySelector('#sample-dialog');
  const sampleContent = document.querySelector('#sample-content');
  let lastFocused;
  let resumeVideos = [];
  function openSample(id) {
    const item = byId.get(id);
    if (!item) return;
    lastFocused = document.activeElement;
    resumeVideos = [...document.querySelectorAll('.screen-content .output-video')].filter(video => !video.paused);
    resumeVideos.forEach(video => video.pause());
    backdrop.pause();
    document.querySelector('#sample-title').textContent = item.title;
    document.querySelector('#sample-category').textContent = `${item.group} / Sample archive`;
    sampleContent.innerHTML = playerMarkup(item, true) + `<p class="sample-meta">${escape(item.clipId)} · ${escape(item.group)} · Selected corpus asset</p><details class="prompt-details"><summary>Training text condition</summary><p>${escape(item.prompt)}</p></details>`;
    wirePlayer(sampleContent, false);
    dialog.showModal();
    document.body.classList.add('modal-open');
    if (!reducedMotion.matches) play(sampleContent.querySelector('.output-video'));
  }
  gallery.addEventListener('click', event => {
    const card = event.target.closest('[data-sample]');
    if (card) openSample(card.dataset.sample);
  });
  dialog.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    disposePlayer(sampleContent);
    sampleContent.innerHTML = '';
    document.body.classList.remove('modal-open');
    applyMotion();
    if (!reducedMotion.matches && !document.hidden) resumeVideos.forEach(video => {
      const rect = video.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < innerHeight) play(video);
    });
    lastFocused?.focus({preventScroll:true});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.querySelectorAll('video').forEach(video => video.pause());
    else applyMotion();
  });
})();
