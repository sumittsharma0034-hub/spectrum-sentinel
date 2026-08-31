const bandsSlider = document.getElementById('bands');
const stepsSlider = document.getElementById('steps');
const hotSlider = document.getElementById('hotspots');
const epsSlider = document.getElementById('epsilon');
const runBtn = document.getElementById('runBtn');

const bandsVal = document.getElementById('bandsVal');
const stepsVal = document.getElementById('stepsVal');
const hotVal = document.getElementById('hotVal');
const epsVal = document.getElementById('epsVal');

function syncLabels() {
  bandsVal.textContent = bandsSlider.value;
  stepsVal.textContent = stepsSlider.value;
  hotVal.textContent = hotSlider.value;
  epsVal.textContent = (epsSlider.value / 100).toFixed(2);
}
[bandsSlider, stepsSlider, hotSlider, epsSlider].forEach(s => s.addEventListener('input', syncLabels));
syncLabels();

function buildGrid(container, n) {
  container.innerHTML = '';
  const cells = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div');
    c.className = 'cell';
    container.appendChild(c);
    cells.push(c);
  }
  return cells;
}
buildGrid(document.getElementById('gridOld'), 30);
buildGrid(document.getElementById('gridNew'), 30);

function drawChart(canvas, seqCum, smartCum, steps) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = 260;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const maxVal = Math.max(...seqCum, ...smartCum, 1);
  const padL = 40, padB = 24, padT = 10, padR = 10;
  const plotW = w - padL - padR, plotH = h - padT - padB;

  ctx.strokeStyle = '#1d2b24';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH - (i / 4) * plotH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillStyle = '#7f9a8d';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillText(Math.round((i / 4) * maxVal), 6, y + 4);
  }

  function drawLine(data, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    data.forEach((v, i) => {
      const x = padL + (i / (steps - 1)) * plotW;
      const y = padT + plotH - (v / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  drawLine(seqCum, '#ff5d5d');
  drawLine(smartCum, '#5ee6a8');
}

async function animateGrid(cells, scanHistory, hitHistory, hotspots, source) {
  cells.forEach((c, i) => { c.className = 'cell' + (hotspots.includes(i) ? ' hotspot' : ''); });
  const total = scanHistory.length;
  const frameSkip = Math.max(1, Math.floor(total / 80));
  for (let i = 0; i < total; i++) {
    const band = scanHistory[i];
    const hit = hitHistory[i];
    cells.forEach((c, idx) => {
      c.classList.remove('scanning');
      if (idx === band) c.classList.add(hit ? 'hit' : 'scanning');
    });
    if (hit) logAlert(source, i, band);
    if (i % frameSkip === 0) {
      await new Promise(r => setTimeout(r, 4));
    }
  }
}

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  runBtn.textContent = 'Running on server…';

  const payload = {
    num_bands: parseInt(bandsSlider.value),
    num_steps: parseInt(stepsSlider.value),
    num_hotspots: parseInt(hotSlider.value),
    epsilon: parseInt(epsSlider.value) / 100
  };

  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Server error: ' + res.status);
    const data = await res.json();

    const gridOld = buildGrid(document.getElementById('gridOld'), data.num_bands);
    const gridNew = buildGrid(document.getElementById('gridNew'), data.num_bands);

    document.getElementById('oldDetections').textContent = data.sequential.detections;
    document.getElementById('newDetections').textContent = data.smart.detections;
    document.getElementById('oldAvgDelay').textContent = data.sequential.avg_delay ?? '—';
    document.getElementById('newAvgDelay').textContent = data.smart.avg_delay ?? '—';

    drawChart(document.getElementById('chart'), data.sequential.cumulative, data.smart.cumulative, data.num_steps);

    document.getElementById('summaryText').innerHTML =
      `Across <b>${data.num_steps}</b> scan steps over <b>${data.num_bands}</b> frequency bands (hotspots: ${data.hotspots.join(', ')}), ` +
      `the Smart Adaptive strategy logged <b>${data.smart.detections}</b> detections versus <b>${data.sequential.detections}</b> for Sequential scanning — ` +
      `a <b>${data.improvement_pct >= 0 ? '+' : ''}${data.improvement_pct}%</b> change in total detections. Results computed live by scan_engine.py on the server.`;

    await Promise.all([
      animateGrid(gridOld, data.sequential.scan_history, data.sequential.hit_history, data.hotspots,'seq'),
      animateGrid(gridNew, data.smart.scan_history, data.smart.hit_history, data.hotspots)
    ]);
  } catch (err) {
    document.getElementById('summaryText').textContent = 'Error contacting the server: ' + err.message;
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = '▶ Run Simulation';
  }
});
const alertBanner = document.getElementById('alertBanner');
const alertLog = document.getElementById('alertLog');
const soundToggle = document.getElementById('soundToggle');
const bandHitCounts = {};
const HIGH_CONFIDENCE_THRESHOLD = 3;
const MAX_LOG_ENTRIES = 60;

function playBeep(freq, duration) {
  if (!soundToggle.checked) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = playBeep._ctx || (playBeep._ctx = new Ctx());
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000 + 0.02);
  } catch (e) { /* audio blocked, ignore */ }
}

function showBanner(text, isHighConfidence) {
  alertBanner.textContent = text;
  alertBanner.classList.toggle('high', isHighConfidence);
  alertBanner.classList.add('show');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => alertBanner.classList.remove('show'), 1200);
}

function logAlert(source, step, band) {
  const key = source + '-' + band;
  bandHitCounts[key] = (bandHitCounts[key] || 0) + 1;
  const isHigh = bandHitCounts[key] >= HIGH_CONFIDENCE_THRESHOLD;

  const li = document.createElement('li');
  li.className = source + (isHigh ? ' high-confidence' : '');
  const label = source === 'seq' ? 'Sequential' : 'Smart Adaptive';
  li.textContent = `[Step ${step}] ${label} — Threat on Band ${band}` +
    (isHigh ? ` ⚠ HIGH CONFIDENCE (${bandHitCounts[key]}x)` : '');
  alertLog.appendChild(li);

  while (alertLog.children.length > MAX_LOG_ENTRIES) {
    alertLog.removeChild(alertLog.firstChild);
  }

  showBanner(
    isHigh ? `⚠ HIGH CONFIDENCE THREAT — Band ${band} (${label})` : `⚠ Threat detected — Band ${band} (${label})`,
    isHigh
  );
  playBeep(isHigh ? 660 : 880, isHigh ? 140 : 80);
}