const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let state = {
  events: [],
  discoveries: [],
  workspace: 'Workspace',
  sensitivity: 70,
  mapping: {},
  fileName: 'sample_events.csv'
};

const aliasMap = {
  user: ['user_id', 'userid', 'user', 'customer_id', 'customer'],
  session: ['session_id', 'session', 'sessionid', 'visit_id'],
  page: ['page', 'page_name', 'screen', 'url', 'path', 'step'],
  event: ['event', 'event_name', 'action', 'type'],
  timestamp: ['timestamp', 'time', 'datetime', 'date', 'created_at'],
  device: ['device', 'device_type', 'platform'],
  product: ['product', 'product_name', 'item']
};

function seedData() {
  const results = [];
  const devices = ['Mobile', 'Desktop', 'Tablet'];
  const products = ['Wireless Headset', 'Mechanical Keyboard', 'Gaming Mouse', 'Power Bank', 'Controller Grip'];

  for (let userIndex = 1; userIndex <= 620; userIndex += 1) {
    const sessionId = 'S' + userIndex;
    const device = devices[userIndex % 3];
    const isProblemSession = userIndex % 5 === 0 || userIndex % 17 === 0;
    let flow = isProblemSession
      ? ['Home', 'Product', 'Cart', 'Product', 'Cart', 'Checkout']
      : ['Home', 'Product', 'Cart', 'Checkout', 'Confirmation'];

    if (userIndex % 11 === 0) flow = ['Home', 'Product', 'Product', 'Product', 'Cart', 'Checkout'];
    if (userIndex % 13 === 0) flow = ['Home', 'Product', 'Cart', 'Checkout', 'Checkout'];

    const baseTime = Date.now() - ((userIndex % 7) * 86400000) - (userIndex % 240) * 360000;

    flow.forEach((pageName, index) => {
      const eventName = index === 0 ? 'page_view' : index === flow.length - 1 ? 'complete' : 'click';
      results.push({
        user_id: 'U' + userIndex,
        session_id: sessionId,
        timestamp: new Date(baseTime + index * 42000).toISOString(),
        page: pageName,
        event: eventName,
        device,
        product: products[userIndex % products.length]
      });
    });

    if (userIndex % 9 === 0) {
      results.push({
        user_id: 'U' + userIndex,
        session_id: sessionId,
        timestamp: new Date(baseTime + 250000).toISOString(),
        page: 'Checkout',
        event: 'abandon',
        device,
        product: products[userIndex % products.length]
      });
    }
  }

  return results;
}

function csvParse(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((line) => line.trim());
  if (!lines.length) return [];

  const parseLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];

      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    values.push(current);
    return values;
  };

  const headers = parseLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header.trim()] = (values[index] ?? '').trim();
    });

    return row;
  });
}

function buildFieldMap(sampleRow) {
  const keys = Object.keys(sampleRow || {}).map((key) => key.toLowerCase().trim());

  const detect = (aliases) => {
    for (const alias of aliases) {
      const lowercaseAlias = alias.toLowerCase();
      const match = keys.find((key) => key === lowercaseAlias);
      if (match) {
        return Object.keys(sampleRow).find((key) => key.toLowerCase().trim() === match) || null;
      }
    }
    return null;
  };

  const mapping = {};
  Object.entries(aliasMap).forEach(([field, aliases]) => {
    mapping[field] = detect(aliases);
  });
  return mapping;
}

function readMappedValue(row, key, fallback) {
  if (!key) return fallback;
  const value = row[key];
  return value === undefined || value === null || value === '' ? fallback : value;
}

function normalizeTimestamp(value) {
  const stringValue = String(value).trim();
  if (!stringValue) return new Date(Date.now()).toISOString();

  const parsed = Date.parse(stringValue);
  if (Number.isNaN(parsed)) return new Date(Date.now()).toISOString();

  return new Date(parsed).toISOString();
}

function normalizeRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('The uploaded file is empty or contains no rows.');
  }

  const sampleRow = rows[0];
  const mapping = buildFieldMap(sampleRow);
  state.mapping = mapping;

  const required = ['user', 'session', 'timestamp', 'page', 'event', 'device'];
  const missing = required.filter((field) => !mapping[field]);

  if (missing.length) {
    throw new Error(
      'Missing required columns. Please include at least: user_id, session_id, timestamp, page, event, device.'
    );
  }

  return rows.map((row, index) => ({
    user_id: String(readMappedValue(row, mapping.user, 'U' + index)).trim() || 'U' + index,
    session_id: String(readMappedValue(row, mapping.session, 'S' + index)).trim() || 'S' + index,
    timestamp: normalizeTimestamp(readMappedValue(row, mapping.timestamp, new Date(Date.now() - index * 1000).toISOString())),
    page: String(readMappedValue(row, mapping.page, 'Unknown')).trim() || 'Unknown',
    event: String(readMappedValue(row, mapping.event, 'interaction')).trim() || 'interaction',
    device: String(readMappedValue(row, mapping.device, 'Unknown')).trim() || 'Unknown',
    product: String(readMappedValue(row, mapping.product, '')).trim()
  }));
}

function pct(numerator, denominator) {
  if (!denominator) return '0.0';
  return ((numerator / denominator) * 100).toFixed(1);
}

function topDevice(sessions) {
  const counts = {};
  sessions.forEach((session) => {
    session.forEach((event) => {
      counts[event.device] = (counts[event.device] || 0) + 1;
    });
  });

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'All users';
}

function analyze(events) {
  const bySession = {};
  events.forEach((event) => {
    if (!bySession[event.session_id]) bySession[event.session_id] = [];
    bySession[event.session_id].push(event);
  });

  const sessions = Object.values(bySession);
  const discoveries = [];

  const loops = sessions.filter((session) => {
    const pages = session.map((item) => item.page);
    return pages.some((page, index) => index >= 2 && pages[index - 1] === pages[index - 2]) ||
      (pages.length >= 3 && new Set(pages).size < pages.length * 0.6);
  });

  if (loops.length) {
    discoveries.push({
      title: 'Repeated navigation loop detected',
      summary: `${pct(loops.length, sessions.length)}% of sessions revisit the same steps or page sequence repeatedly.`,
      impact: 'Higher abandonment among looping sessions',
      affected: topDevice(loops),
      cause: 'A step may be unclear or failing to provide the expected information.',
      confidence: Math.min(96, 70 + Math.round((loops.length / sessions.length) * 100)),
      level: 'High',
      status: 'New',
      type: 'loop'
    });
  }

  const checkout = sessions.filter((session) => session.some((item) => /checkout/i.test(item.page)));
  const abandoned = checkout.filter((session) => {
    return !session.some((item) => /confirm|complete|success/i.test(item.page)) ||
      session.some((item) => /abandon/i.test(item.event));
  });

  if (checkout.length) {
    discoveries.push({
      title: 'Checkout drop-off pattern detected',
      summary: `${pct(abandoned.length, checkout.length)}% of sessions reaching Checkout do not reach confirmation.`,
      impact: 'Potential lost conversions',
      affected: topDevice(abandoned),
      cause: 'Investigate shipping, payment, validation or trust friction at checkout.',
      confidence: Math.min(94, 72 + Math.round((abandoned.length / checkout.length) * 40)),
      level: 'High',
      status: 'Investigating',
      type: 'dropoff'
    });
  }

  const slow = sessions.filter((session) => session.length >= 6);
  if (slow.length) {
    discoveries.push({
      title: 'Unusually long journeys detected',
      summary: `${pct(slow.length, sessions.length)}% of sessions contain 6+ interaction steps.`,
      impact: 'Users take longer to complete their goal',
      affected: topDevice(slow),
      cause: 'Users may be searching, comparing, or getting stuck before completion.',
      confidence: 82,
      level: 'Medium',
      status: 'New',
      type: 'long'
    });
  }

  const repeat = sessions.filter((session) => {
    const pages = session.map((item) => item.page);
    return new Set(pages).size < pages.length * 0.6;
  });

  if (repeat.length) {
    discoveries.push({
      title: 'High repetition on a small set of pages',
      summary: `${pct(repeat.length, sessions.length)}% of sessions show unusually repetitive behavior.`,
      impact: 'Possible usability friction',
      affected: topDevice(repeat),
      cause: 'One or more pages may not make the next action obvious.',
      confidence: 76,
      level: 'Medium',
      status: 'New',
      type: 'repeat'
    });
  }

  return discoveries;
}

function renderMainDiscovery() {
  const d = state.discoveries[0] || { summary: 'No significant patterns detected yet.', confidence: 0, impact: 'No measurable impact', affected: '—', cause: 'Keep collecting events.' };
  $('#discoverySummary').textContent = d.summary;
  $('#confidence').textContent = d.confidence + '%';
  $('#impact').textContent = d.impact;
  $('#affected').textContent = d.affected;
  $('#cause').textContent = d.cause;
}

function renderIssues() {
  const names = state.discoveries.length ? state.discoveries.map((item) => item.title) : ['No major issues yet'];
  $('#issues').innerHTML = names.slice(0, 5).map((name, index) => `
    <div class="issue">
      <div class="issue-top"><span>${name}</span><b>${Math.max(1, state.discoveries.length - index)}</b></div>
      <div class="bar"><i style="width:${90 - index * 16}%"></i></div>
    </div>
  `).join('');
}

function statusClass(value) {
  return value.toLowerCase().replace(/\s/g, '');
}

function row(item) {
  return `
    <div class="row">
      <strong>${item.title}</strong>
      <span class="badge ${item.level.toLowerCase()}">${item.level}</span>
      <span>${item.affected}</span>
      <span class="badge ${statusClass(item.status)}">${item.status}</span>
      <span>${item.confidence}%</span>
      <span>›</span>
    </div>
  `;
}

function renderTables() {
  $('#recentTable').innerHTML = `
    <div class="row head">
      <span>ISSUE</span><span>IMPACT</span><span>AFFECTED</span><span>STATUS</span><span>CONFIDENCE</span><span></span>
    </div>
    ${state.discoveries.slice(0, 5).map(row).join('')}
  `;
}

function renderAll(filter = 'all') {
  let discoveries = state.discoveries;
  if (filter === 'high') discoveries = discoveries.filter((item) => item.level === 'High');
  if (filter === 'new') discoveries = discoveries.filter((item) => item.status === 'New');
  if (filter === 'investigating') discoveries = discoveries.filter((item) => item.status === 'Investigating');

  $('#allDiscoveries').innerHTML = discoveries.map((item) => `
    <article class="d-item">
      <div>
        <h3>${item.title}</h3>
        <p>${item.summary}</p>
        <div class="d-meta">
          <span>Impact: <b>${item.impact}</b></span>
          <span>Affected: <b>${item.affected}</b></span>
          <span>Confidence: <b>${item.confidence}%</b></span>
        </div>
      </div>
      <button class="primary detail" data-type="${item.type}">View details →</button>
    </article>
  `).join('') || '<div class="panel"><p class="muted">No discoveries match this filter.</p></div>';

  $$('.detail').forEach((button) => {
    button.onclick = () => openDiscovery(state.discoveries.find((item) => item.type === button.dataset.type) || state.discoveries[0]);
  });
}

function renderSignals() {
  const sessionCount = new Set(state.events.map((event) => event.session_id)).size;
  const alertSignal = state.discoveries.find((item) => item.type === 'loop');

  $('#signals').innerHTML = [
    ['Sessions analyzed', sessionCount.toLocaleString()],
    ['Repeated-navigation signal', alertSignal ? alertSignal.confidence + '% confidence' : 'Low'],
    ['Checkout events', state.events.filter((event) => /checkout/i.test(event.page)).length],
    ['Unique pages', new Set(state.events.map((event) => event.page)).size],
    ['Devices observed', new Set(state.events.map((event) => event.device)).size]
  ].map(([label, value]) => `<div class="signal">${label}<b>${value}</b></div>`).join('');
}

function renderJourney() {
  const names = [...new Set(state.events.map((event) => event.page))].slice(0, 6);
  $('#journeyMap').innerHTML = names.map((name, index) => `
    <div class="step">
      <div class="node">${index + 1}</div>
      <b>${name}</b>
      <span>${Math.max(1, Math.round(100 - index * 15))}% continue</span>
    </div>
    ${index < names.length - 1 ? '<div class="arrow"></div>' : ''}
  `).join('');
}

function renderMapping() {
  const mapping = state.mapping || {
    user: 'user_id',
    session: 'session_id',
    page: 'page',
    event: 'event',
    timestamp: 'timestamp',
    device: 'device'
  };

  $('#mappingPreview').innerHTML = Object.entries(mapping)
    .map(([key, value]) => `<span>${key} → ${value || 'not found'}</span>`)
    .join('');
}

function drawJourneyChart() {
  const canvas = $('#journeyChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dims = devicePixel(canvas, rect.width, rect.height);

  ctx.clearRect(0, 0, dims.w, dims.h);
  ctx.lineWidth = 2;

  const labels = ['Home', 'Product', 'Cart', 'Checkout', 'Complete'];
  const normal = [100, 92, 78, 61, 54];
  const problem = [100, 79, 58, 35, 18];

  drawLine(ctx, dims.w, dims.h, normal, '#668fff');
  drawLine(ctx, dims.w, dims.h, problem, '#a65dff');

  ctx.fillStyle = '#718099';
  ctx.font = '9px sans-serif';
  labels.forEach((label, index) => {
    ctx.fillText(label, (index / (labels.length - 1)) * (dims.w - 30) + 5, dims.h - 5);
  });

  function drawLine(context, width, height, series, color) {
    context.strokeStyle = color;
    context.beginPath();
    series.forEach((value, index) => {
      const x = 8 + (index / (series.length - 1)) * (width - 16);
      const y = 10 + (100 - value) / 100 * (height - 28);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    series.forEach((value, index) => {
      const x = 8 + (index / (series.length - 1)) * (width - 16);
      const y = 10 + (100 - value) / 100 * (height - 28);
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, 3, 0, Math.PI * 2);
      context.fill();
    });
  }
}

function drawEventChart() {
  const canvas = $('#eventChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dims = devicePixel(canvas, rect.width, rect.height);

  ctx.clearRect(0, 0, dims.w, dims.h);

  const counts = new Array(12).fill(0);
  state.events.forEach((event, index) => {
    counts[index % 12] += 1;
  });

  const max = Math.max(...counts, 1);
  ctx.strokeStyle = '#4f73ff';
  ctx.lineWidth = 2;
  ctx.beginPath();

  counts.forEach((value, index) => {
    const x = 8 + (index / (counts.length - 1)) * (dims.w - 16);
    const y = dims.h - 20 - (value / max) * (dims.h - 45);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

function devicePixel(canvas, width, height) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  return { w: width, h: height };
}

function openDiscovery(item) {
  if (!item) return;

  $('#modalBody').innerHTML = `
    <div style="color:#8074ff;font-size:9px">AI INVESTIGATION</div>
    <h2>${item.title}</h2>
    <p>${item.summary}</p>
    <div class="mini">
      <div><b>Impact</b><span>${item.impact}</span></div>
      <div><b>Affected</b><span>${item.affected}</span></div>
      <div><b>Confidence</b><span>${item.confidence}%</span></div>
    </div>
    <p><b style="color:#dce5f4">Hypothesis:</b> ${item.cause}</p>
    <p>The engine found this from interaction patterns rather than a user complaint. Treat it as a lead for human investigation, not as an automatic diagnosis.</p>
    <button class="primary" onclick="document.getElementById('modal').classList.remove('open')">Mark as investigating</button>
  `;
  $('#modal').classList.add('open');
}

function showView(name) {
  $$('.view').forEach((view) => view.classList.remove('active'));
  const target = $('#view-' + name);
  if (target) target.classList.add('active');

  $$('.nav').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === name);
  });
}

function setUploadMessage(message, isError = false) {
  $('#uploadStatus').innerHTML = `<p class="${isError ? 'error' : 'muted'}">${message}</p>`;
}

function render() {
  state.discoveries = analyze(state.events);
  $('#mDiscoveries').textContent = state.discoveries.length;
  $('#mUsers').textContent = new Set(state.events.map((event) => event.user_id)).size.toLocaleString();
  $('#mSystems').textContent = '1';
  $('#systemName').textContent = state.workspace;
  $('#systemLabel').textContent = state.workspace;
  $('#systemCardName').textContent = state.workspace;
  $('#navCount').textContent = state.discoveries.length;

  renderMainDiscovery();
  renderIssues();
  renderTables();
  renderAll();
  renderSignals();
  renderJourney();
  drawJourneyChart();
  drawEventChart();
  renderMapping();
}

$$('.nav').forEach((button) => {
  button.onclick = () => showView(button.dataset.view);
});

$$('[data-go]').forEach((button) => {
  button.onclick = () => showView(button.dataset.go);
});

$('#viewDiscovery').onclick = () => openDiscovery(state.discoveries[0]);
$('#closeModal').onclick = () => $('#modal').classList.remove('open');
$('#modal').onclick = (event) => {
  if (event.target.id === 'modal') $('#modal').classList.remove('open');
};
$('#runAnalysis').onclick = () => {
  render();
  openDiscovery(state.discoveries[0]);
};

$$('.filter').forEach((button) => {
  button.onclick = () => {
    $$('.filter').forEach((filterButton) => filterButton.classList.remove('active'));
    button.classList.add('active');
    renderAll(button.dataset.filter);
  };
});

$('#fileInput').onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.name.toLowerCase().endsWith('.csv')) {
    setUploadMessage('Only CSV files are accepted for upload. Use a UTF-8 encoded file with one event per row.', true);
    return;
  }

  try {
    const text = await file.text();
    const rows = csvParse(text);
    state.events = normalizeRows(rows);
    state.fileName = file.name;
    setUploadMessage(`✓ Imported ${state.events.length.toLocaleString()} events from <b>${file.name}</b>. Analysis refreshed.`);
    render();
  } catch (error) {
    setUploadMessage(`Could not import file: ${error.message}`, true);
  }
};

$('#loadSample').onclick = async () => {
  try {
    const response = await fetch('sample_events.csv', { cache: 'no-store' });
    if (!response.ok) throw new Error('Sample CSV could not be loaded.');
    const rows = csvParse(await response.text());
    state.events = normalizeRows(rows);
    state.fileName = 'sample_events.csv';
    setUploadMessage(`✓ Loaded the included sample dataset: <b>${state.fileName}</b>.`);
    render();
  } catch (error) {
    setUploadMessage(`Sample dataset could not be loaded: ${error.message}`, true);
  }
};

$('#saveSettings').onclick = () => {
  state.workspace = $('#workspaceName').value.trim() || 'My System';
  render();
  alert('Workspace settings saved.');
};

$('#sensitivity').oninput = (event) => {
  $('#rangeValue').textContent = event.target.value + '%';
};

$('#addSystem').onclick = () => showView('settings');

$('#globalSearch').oninput = (event) => {
  const query = event.target.value.toLowerCase();
  if (query.length < 2) return;

  showView('discoveries');
  const filtered = state.discoveries.filter((item) => {
    return (item.title + item.summary + item.cause).toLowerCase().includes(query);
  });

  $('#allDiscoveries').innerHTML = filtered.map((item) => `
    <article class="d-item">
      <div>
        <h3>${item.title}</h3>
        <p>${item.summary}</p>
      </div>
      <button class="primary detail" data-type="${item.type}">View details →</button>
    </article>
  `).join('') || '<div class="panel"><p class="muted">No matching discoveries.</p></div>';
};

window.addEventListener('resize', () => {
  drawJourneyChart();
  drawEventChart();
});

state.events = seedData();
render();
