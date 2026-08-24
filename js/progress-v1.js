const $ = s => document.querySelector(s);

const style = document.createElement('style');
style.textContent = `
  .atlas-generator-progress-banner{
    position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:100500;
    width:min(640px,calc(100vw - 28px));display:none;padding:16px 18px 14px;
    border:1px solid rgba(255,255,255,.16);border-radius:16px;background:#0c1823;color:#fff;
    box-shadow:0 24px 70px rgba(0,0,0,.55)
  }
  .atlas-generator-progress-banner.show{display:block}
  .atlas-generator-progress-head{display:flex;justify-content:space-between;gap:14px;align-items:baseline;margin-bottom:10px}
  .atlas-generator-progress-head strong{font-size:15px}.atlas-generator-progress-head b{font-size:18px;color:#fff}
  .atlas-generator-progress-banner progress{display:block;width:100%;height:18px;accent-color:#d9273f}
  .atlas-generator-progress-banner small{display:block;margin-top:8px;color:#9db0bf;font-size:12px}
`;
document.head.appendChild(style);

const banner = document.createElement('div');
banner.className = 'atlas-generator-progress-banner';
banner.setAttribute('role','status');
banner.setAttribute('aria-live','polite');
banner.innerHTML = `
  <div class="atlas-generator-progress-head"><strong>Generazione calendario in corso</strong><b id="atlasGenBannerPct">0%</b></div>
  <progress id="atlasGenBannerProgress" max="100" value="0">0%</progress>
  <small id="atlasGenBannerLabel">Preparazione delle rotazioni 3 mattina + 3 pomeriggio…</small>`;
document.body.appendChild(banner);

let timer = null;
let started = false;

function showBanner(){
  started = true;
  banner.classList.add('show');
  $('#atlasGenBannerProgress').value = 0;
  $('#atlasGenBannerPct').textContent = '0%';
  $('#atlasGenBannerLabel').textContent = 'Preparazione delle rotazioni 3 mattina + 3 pomeriggio…';
  if (timer) clearInterval(timer);
  timer = setInterval(syncFromGenerator,120);
}

function syncFromGenerator(){
  const pctText = $('#atlasProgressPct')?.textContent || '';
  const match = pctText.match(/(\d{1,3})/);
  if (match){
    const pct = Math.max(0,Math.min(100,Number(match[1])));
    $('#atlasGenBannerProgress').value = pct;
    $('#atlasGenBannerPct').textContent = `${pct}%`;
  }
  const label = $('#atlasProgressLabel')?.textContent;
  const busyText = $('#atlasBusyText')?.textContent;
  if (label || busyText) $('#atlasGenBannerLabel').textContent = [label,busyText].filter(Boolean).join(' · ');

  const overlay = $('.atlas-busy-overlay');
  if (started && overlay && !overlay.classList.contains('show')) hideBanner();
}

function hideBanner(){
  started = false;
  banner.classList.remove('show');
  if (timer){clearInterval(timer);timer=null;}
}

// Registrato prima del generatore: mostra la barra immediatamente al submit.
document.addEventListener('submit', event => {
  if (event.target?.id === 'generatorForm') showBanner();
}, true);

window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer);});
