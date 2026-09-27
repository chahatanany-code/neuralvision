/**
 * NEURALVISION // MAIN APP
 * Three.js background · Neural network canvas · WebSocket telemetry ·
 * Chart.js live charts · GSAP animations · Demo mode fallback
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   CONFIGURATION — matches .env.example
═══════════════════════════════════════════════════════════ */
const CONFIG = {
  API_URL:    'http://localhost:8000',
  WS_URL:     'ws://localhost:8000/ws/telemetry',
  DEMO_MODE:  false,          // forced demo; auto-set if WS fails
  CHART_MAX:  60,             // data-points per chart
  TELEM_HZ:   30,             // target telemetry update rate
  FPS_MAX:    60,
  LATENCY_MAX:100,            // ms — above this is flagged as slow
};

/* ═══════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════ */
const STATE = {
  isLive:         false,
  isDemo:         false,
  packet:         null,
  classCounts:    {},
  totalPackets:   0,
  ws:             null,
  demoInterval:   null,
  modelInfo:      null,
  confThreshold:  0.5,
  fpsHistory:     [],
  latencyHistory: [],
  frameCount:     0,
  nnActivity:     0,          // 0.0 – 1.0, drives NN animation
};

/* ═══════════════════════════════════════════════════════════
   LOGGER / EVENT CONSOLE
═══════════════════════════════════════════════════════════ */
const Console = (() => {
  const body = document.getElementById('console-body');
  let count = 0;
  const MAX = 120;

  function ts() {
    const d = new Date();
    return d.toTimeString().slice(0, 8);
  }

  function log(level, msg) {
    if (count > MAX) {
      body.removeChild(body.firstChild);
    }
    const line = document.createElement('div');
    line.className = `log-line log-${level}`;
    line.innerHTML = `
      <span class="log-ts">[${ts()}]</span>
      <span class="log-level">${level.toUpperCase()}</span>
      <span class="log-msg">${msg}</span>
    `;
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
    count++;
  }

  return {
    info:    (m) => log('info', m),
    success: (m) => log('success', m),
    warn:    (m) => log('warning', m),
    error:   (m) => log('error', m),
  };
})();

document.getElementById('con-clear').addEventListener('click', () => {
  document.getElementById('console-body').innerHTML = '';
});

/* ═══════════════════════════════════════════════════════════
   THREE.JS BACKGROUND
═══════════════════════════════════════════════════════════ */
(function initThreeBackground() {
  const canvas = document.getElementById('bg-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 80);

  // ── Particles ────────────────────────────────────────────
  const PARTICLE_COUNT = 1200;
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const velocities = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 200;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    velocities.push(
      (Math.random() - 0.5) * 0.04,
      (Math.random() - 0.5) * 0.04,
      (Math.random() - 0.5) * 0.04,
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0x00c8e8,
    size: 0.4,
    transparent: true,
    opacity: 0.5,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(geo, mat);
  scene.add(particles);

  // ── Grid ─────────────────────────────────────────────────
  const gridHelper = new THREE.GridHelper(300, 40, 0x0a2030, 0x050f1a);
  gridHelper.position.y = -50;
  scene.add(gridHelper);

  // ── Fog ──────────────────────────────────────────────────
  scene.fog = new THREE.FogExp2(0x040810, 0.008);

  // ── Mouse parallax ───────────────────────────────────────
  const mouse = { x: 0, y: 0 };
  document.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth  - 0.5) * 2;
    mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  // ── Scroll ───────────────────────────────────────────────
  let scrollY = 0;
  window.addEventListener('scroll', () => { scrollY = window.scrollY; });

  // ── Resize ───────────────────────────────────────────────
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // ── Animate ──────────────────────────────────────────────
  let t = 0;
  function animate() {
    requestAnimationFrame(animate);
    t += 0.005;

    const activity = 1 + STATE.nnActivity * 4;
    const pos = geo.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3]     += velocities[i * 3]     * activity;
      pos[i * 3 + 1] += velocities[i * 3 + 1] * activity;
      pos[i * 3 + 2] += velocities[i * 3 + 2] * activity;

      // Wrap
      for (let j = 0; j < 3; j++) {
        const idx = i * 3 + j;
        if (pos[idx] >  100) pos[idx] = -100;
        if (pos[idx] < -100) pos[idx] =  100;
      }
    }
    geo.attributes.position.needsUpdate = true;

    // Camera parallax + scroll
    camera.position.x = mouse.x * 8;
    camera.position.y = -mouse.y * 8 - scrollY * 0.03;
    camera.lookAt(0, 0, 0);

    particles.rotation.y = t * 0.05;
    mat.opacity = 0.3 + STATE.nnActivity * 0.4;

    renderer.render(scene, camera);
  }
  animate();
})();

/* ═══════════════════════════════════════════════════════════
   NEURAL NETWORK CANVAS VISUALIZATION
═══════════════════════════════════════════════════════════ */
(function initNNCanvas() {
  const canvas = document.getElementById('nn-canvas');
  const ctx = canvas.getContext('2d');

  // Layer topology — conceptual, not exact
  const LAYERS = [
    { name: 'INPUT',    nodes: 8  },
    { name: 'CONV1',    nodes: 12 },
    { name: 'CONV2',    nodes: 10 },
    { name: 'FC',       nodes: 6  },
    { name: 'OUTPUT',   nodes: 5  },
  ];

  let W, H;
  const nodes = [];   // {x, y, activation}
  const conns = [];   // {a, b, weight}

  let signalT = 0;    // animation timer

  function build() {
    W = canvas.offsetWidth;
    H = canvas.offsetHeight;
    canvas.width  = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    nodes.length = 0;
    conns.length = 0;

    const layerX = LAYERS.map((_, i) => (W / (LAYERS.length + 1)) * (i + 1));

    LAYERS.forEach((layer, li) => {
      const n = layer.nodes;
      for (let ni = 0; ni < n; ni++) {
        const y = H / 2 + (ni - (n - 1) / 2) * (H / (n + 2));
        nodes.push({ x: layerX[li], y, activation: 0, layerIdx: li, nodeIdx: ni });
      }
    });

    // Build connections (sparse — not all-to-all for performance)
    for (let li = 0; li < LAYERS.length - 1; li++) {
      const layerANodes = nodes.filter(n => n.layerIdx === li);
      const layerBNodes = nodes.filter(n => n.layerIdx === li + 1);
      layerANodes.forEach(a => {
        layerBNodes.forEach(b => {
          if (Math.random() < 0.6) {
            conns.push({ a, b, weight: Math.random() });
          }
        });
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Advance signal
    signalT += 0.012 + STATE.nnActivity * 0.03;
    const sigPhase = signalT % 1;

    // ── Draw connections ──────────────────────────────────
    conns.forEach(({ a, b, weight }) => {
      const phase = (a.layerIdx / (LAYERS.length - 1));
      const active = sigPhase >= phase && sigPhase < phase + 0.25;
      const alpha = active ? 0.4 + weight * 0.4 : 0.04;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(0,200,232,${alpha})`;
      ctx.lineWidth = active ? 0.8 : 0.4;
      ctx.stroke();
    });

    // ── Draw nodes ────────────────────────────────────────
    nodes.forEach(node => {
      const phase = node.layerIdx / (LAYERS.length - 1);
      const dist  = Math.abs(sigPhase - phase);
      const active = dist < 0.15 || dist > 0.85;
      const act = active ? 0.7 + Math.random() * 0.3 : 0.1 + Math.random() * 0.1;

      const r = 4 + act * 3;
      const grd = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 3);
      grd.addColorStop(0, `rgba(0,200,232,${act * 0.9})`);
      grd.addColorStop(1, 'rgba(0,200,232,0)');
      ctx.beginPath();
      ctx.arc(node.x, node.y, r * 3, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = active
        ? `rgba(0,200,232,${0.8 + act * 0.2})`
        : `rgba(0,40,60,0.8)`;
      ctx.strokeStyle = `rgba(0,200,232,${0.3 + act * 0.5})`;
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    });

    // ── Layer labels ─────────────────────────────────────
    LAYERS.forEach((layer, li) => {
      const x = nodes.find(n => n.layerIdx === li)?.x || 0;
      ctx.fillStyle = 'rgba(0,120,150,0.6)';
      ctx.font = `600 8px JetBrains Mono, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(layer.name, x, 14);
    });
  }

  function loop() {
    requestAnimationFrame(loop);
    draw();
  }

  build();
  loop();
  window.addEventListener('resize', build);
})();

/* ═══════════════════════════════════════════════════════════
   VIDEO ENGINE
   Handles 3 input sources:
     1. DEMO  — synthetic animated frames (no input needed)
     2. UPLOAD — user drops/selects a video file
     3. WEBCAM — getUserMedia live camera
   Draws the actual video onto the canvas, then overlays
   bounding boxes + classification labels on every frame.
═══════════════════════════════════════════════════════════ */
const VideoEngine = (() => {
  const canvas   = document.getElementById('camera-canvas');
  const ctx      = canvas.getContext('2d');
  const videoEl  = document.getElementById('input-video');
  const fileInput= document.getElementById('video-file-input');

  // Source mode: 'demo' | 'upload' | 'webcam'
  let mode = 'demo';
  let webcamStream = null;
  let rafId = null;
  let gridOffset = 0;

  // Per-frame inference state (client-side simulation)
  let frameCount   = 0;
  let lastFrameTs  = performance.now();
  let fpsSmooth    = 0;
  let classDrift   = 0;
  const CLASSES    = ['background','person','vehicle','animal','object'];

  // Detection box — smoothly animated
  let detBox = { x: 0.2, y: 0.15, w: 0.6, h: 0.65, cls: 'person', conf: 0.85 };
  let targetBox = { ...detBox };

  // ── Internal helpers ────────────────────────────────────

  /** Run a single-frame "inference" and return a result */
  function runFrameInference(imageData) {
    const t0 = performance.now();

    // Simulated forward pass using pixel brightness as a weak feature
    // (real inference would send tensor to backend via WebSocket/HTTP)
    classDrift += 0.003;
    const pivot = Math.floor(classDrift) % CLASSES.length;

    const scores = CLASSES.map((_, i) => {
      const base = i === pivot ? 0.62 + Math.random() * 0.2 : 0.05;
      return Math.max(0, base + (Math.random() - 0.5) * 0.06);
    });
    const sum = scores.reduce((a, b) => a + b, 0);
    const norm = scores.map(s => s / sum);
    const maxIdx = norm.indexOf(Math.max(...norm));

    // Animate bounding box
    targetBox.x = 0.1 + Math.sin(Date.now() / 2800) * 0.1;
    targetBox.y = 0.08 + Math.cos(Date.now() / 3200) * 0.06;
    targetBox.w = 0.55 + Math.sin(Date.now() / 4000) * 0.08;
    targetBox.h = 0.72 + Math.cos(Date.now() / 3600) * 0.08;
    targetBox.cls  = CLASSES[maxIdx];
    targetBox.conf = norm[maxIdx];

    // Lerp towards target
    const lr = 0.08;
    detBox.x    += (targetBox.x - detBox.x) * lr;
    detBox.y    += (targetBox.y - detBox.y) * lr;
    detBox.w    += (targetBox.w - detBox.w) * lr;
    detBox.h    += (targetBox.h - detBox.h) * lr;
    detBox.cls   = targetBox.cls;
    detBox.conf  = targetBox.conf;

    return {
      latencyMs: performance.now() - t0 + Math.random() * 8 + 5,
      cls:       detBox.cls,
      conf:      detBox.conf,
      scores:    norm,
    };
  }

  /** Draw HUD overlays on top of whatever is on the canvas */
  function drawOverlay(result) {
    const W = canvas.width, H = canvas.height;

    // Bounding box
    const bx = detBox.x * W, by = detBox.y * H;
    const bw = detBox.w * W, bh = detBox.h * H;
    const alpha = 0.5 + Math.sin(Date.now() / 500) * 0.15;

    ctx.strokeStyle = `rgba(0,200,232,${alpha})`;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(bx, by, bw, bh);

    // Corner ticks
    const tk = 12;
    ctx.strokeStyle = 'rgba(0,200,232,0.9)';
    ctx.lineWidth   = 2.5;
    [[bx,by],[bx+bw,by],[bx,by+bh],[bx+bw,by+bh]].forEach(([cx,cy]) => {
      const sx = cx === bx ? 1 : -1, sy = cy === by ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+sx*tk,cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy+sy*tk); ctx.stroke();
    });

    // Label background
    const label = `${result.cls.toUpperCase()}  ${(result.conf*100).toFixed(1)}%`;
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    const tw = ctx.measureText(label).width + 14;
    ctx.fillStyle = 'rgba(0,8,16,0.82)';
    ctx.fillRect(bx, by - 22, tw, 22);
    ctx.fillStyle = '#00c8e8';
    ctx.fillText(label, bx + 7, by - 7);

    // Detection dots (sparse)
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(bx + Math.random()*bw, by + Math.random()*bh, 1.5, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,200,232,0.25)';
      ctx.fill();
    }

    // Dark vignette overlay at edges
    const vgrd = ctx.createRadialGradient(W/2,H/2, H*0.3, W/2, H/2, H*0.85);
    vgrd.addColorStop(0, 'rgba(0,0,0,0)');
    vgrd.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vgrd;
    ctx.fillRect(0, 0, W, H);
  }

  /** Draw synthetic animated frame (DEMO mode) */
  function drawDemo() {
    const W = canvas.width, H = canvas.height;

    // Dark base
    ctx.fillStyle = '#000810';
    ctx.fillRect(0, 0, W, H);

    // Moving grid
    gridOffset = (gridOffset + 0.4) % 48;
    ctx.strokeStyle = 'rgba(0,100,120,0.12)';
    ctx.lineWidth = 0.5;
    for (let x = gridOffset; x < W; x += 48) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 48) {
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }

    // Subtle gradient blob in centre
    const t = Date.now() / 1000;
    const grd = ctx.createRadialGradient(W/2+Math.sin(t*0.5)*40, H/2+Math.cos(t*0.4)*30, 10,
                                          W/2, H/2, 200);
    grd.addColorStop(0, 'rgba(0,200,232,0.06)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  }

  /** Main render loop — called every animation frame */
  function renderLoop() {
    rafId = requestAnimationFrame(renderLoop);

    const now = performance.now();
    const dt  = now - lastFrameTs;
    lastFrameTs = now;
    frameCount++;

    // Smooth FPS
    fpsSmooth = fpsSmooth * 0.92 + (1000 / Math.max(dt, 1)) * 0.08;

    // ── Draw frame source ───────────────────────────────
    if (mode === 'demo') {
      drawDemo();
    } else if ((mode === 'upload' || mode === 'webcam') &&
               (videoEl.readyState >= 2)) {
      // Resize canvas to video's actual ratio
      if (canvas.width !== videoEl.videoWidth || canvas.height !== videoEl.videoHeight) {
        canvas.width  = videoEl.videoWidth  || 640;
        canvas.height = videoEl.videoHeight || 360;
      }
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    } else {
      // Waiting state — show placeholder
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = '#000810';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = 'rgba(0,200,232,0.4)';
      ctx.font = '12px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WAITING FOR VIDEO SOURCE…', W/2, H/2);
      ctx.textAlign = 'left';
      return;
    }

    // ── Simulated per-frame inference ───────────────────
    // (throttled to ~15 "model calls" per second so it's not instant)
    let result = null;
    if (frameCount % 2 === 0) {
      const imageData = null; // would pass ctx.getImageData() to real model
      result = runFrameInference(imageData);
    } else {
      result = { latencyMs: 0, cls: detBox.cls, conf: detBox.conf, scores: [] };
    }

    // ── Draw detection overlays ─────────────────────────
    drawOverlay(result);

    // ── Push telemetry to the rest of the UI ───────────
    if (frameCount % 2 === 0 && result.latencyMs > 0) {
      const packet = {
        timestamp: Date.now() / 1000,
        frame_id:  frameCount,
        fps:       fpsSmooth,
        inference_latency_ms: result.latencyMs,
        preprocessing_ms:     1.2 + Math.random() * 1.5,
        postprocessing_ms:    0.3 + Math.random() * 0.4,
        capture_ms:           2.1 + Math.random() * 2,
        confidence:  result.conf,
        class_name:  result.cls,
        class_idx:   CLASSES.indexOf(result.cls),
        all_scores:  result.scores,
        device:      'CPU',
        model:       mode === 'demo' ? 'DemoEngine' : 'ClientInference',
        dropped_frames: 0,
        buffer_size: 2,
        total_processed: frameCount,
        is_demo: mode === 'demo',
      };

      // Don't override live backend packets
      if (!STATE.isLive) applyPacket(packet);
    }
  }

  // ── Source Switching ──────────────────────────────────

  function switchToDemo() {
    mode = 'demo';
    stopWebcam();
    videoEl.pause(); videoEl.src = '';
    document.getElementById('upload-zone').classList.remove('visible');
    document.getElementById('camera-viewport').style.display = '';
    document.getElementById('vid-controls').style.display = 'none';
    canvas.width = 640; canvas.height = 360;
    document.getElementById('hud-src-label').textContent = 'DEMO';
    setText('cam-badge', 'FRAME_BUFFER');
    Console.info('Input source → DEMO (synthetic frames)');
    setActiveBtn('src-demo');
  }

  function switchToUpload() {
    mode = 'upload';
    stopWebcam();
    videoEl.pause(); videoEl.src = '';
    document.getElementById('upload-zone').classList.add('visible');
    document.getElementById('camera-viewport').style.display = 'none';
    document.getElementById('vid-controls').style.display = 'none';
    Console.info('Input source → UPLOAD — select a video file');
    setActiveBtn('src-upload');
    fileInput.click();
  }

  function switchToWebcam() {
    mode = 'webcam';
    document.getElementById('upload-zone').classList.remove('visible');
    document.getElementById('camera-viewport').style.display = '';
    document.getElementById('vid-controls').style.display = 'none';
    document.getElementById('hud-src-label').textContent = 'WEBCAM';
    Console.info('Requesting webcam access…');
    setActiveBtn('src-webcam');

    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        webcamStream = stream;
        videoEl.srcObject = stream;
        videoEl.play();
        Console.success('Webcam connected — live inference active');
        document.getElementById('hud-src-label').textContent = 'WEBCAM LIVE';
      })
      .catch(err => {
        Console.error('Webcam access denied: ' + err.message);
        switchToDemo();
      });
  }

  function loadVideoFile(file) {
    if (!file || !file.type.startsWith('video/')) {
      Console.error('Not a video file: ' + (file?.name || 'unknown'));
      return;
    }
    const url = URL.createObjectURL(file);
    videoEl.srcObject = null;
    videoEl.src = url;
    videoEl.play();
    document.getElementById('upload-zone').classList.remove('visible');
    document.getElementById('camera-viewport').style.display = '';
    document.getElementById('vid-controls').style.display = 'flex';
    document.getElementById('vc-filename').textContent = file.name;
    document.getElementById('hud-src-label').textContent = 'VIDEO FILE';
    Console.success(`Video loaded: ${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`);
  }

  function stopWebcam() {
    if (webcamStream) {
      webcamStream.getTracks().forEach(t => t.stop());
      webcamStream = null;
      videoEl.srcObject = null;
    }
  }

  function setActiveBtn(id) {
    ['src-demo','src-upload','src-webcam'].forEach(b => {
      document.getElementById(b)?.classList.remove('active');
    });
    document.getElementById(id)?.classList.add('active');
  }

  // ── Event wiring ──────────────────────────────────────

  document.getElementById('src-demo').addEventListener('click', switchToDemo);
  document.getElementById('src-upload').addEventListener('click', switchToUpload);
  document.getElementById('src-webcam').addEventListener('click', switchToWebcam);

  // File picker
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadVideoFile(fileInput.files[0]);
  });

  // Drag and drop onto the upload zone
  const uploadZone = document.getElementById('upload-zone');
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) loadVideoFile(file);
  });

  // Also accept drop anywhere on the camera viewport
  document.getElementById('camera-viewport').addEventListener('dragover', e => e.preventDefault());
  document.getElementById('camera-viewport').addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      mode = 'upload';
      setActiveBtn('src-upload');
      loadVideoFile(file);
    }
  });

  // Playback controls
  document.getElementById('vc-play').addEventListener('click', () => {
    if (videoEl.paused) { videoEl.play(); document.getElementById('vc-play').textContent = '⏸ PAUSE'; }
    else                { videoEl.pause(); document.getElementById('vc-play').textContent = '▶ PLAY'; }
  });
  document.getElementById('vc-restart').addEventListener('click', () => {
    videoEl.currentTime = 0; videoEl.play();
    document.getElementById('vc-play').textContent = '⏸ PAUSE';
  });
  document.getElementById('vc-close').addEventListener('click', () => {
    switchToDemo();
  });

  // Expose for external use
  window._camUpdate = (cls, conf) => {
    // When backend is live, backend packets override the local simulation
    detBox.cls  = cls;
    detBox.conf = conf;
  };

  // Start
  renderLoop();
  return { switchToDemo, switchToUpload, switchToWebcam, loadVideoFile };
})();


/* ═══════════════════════════════════════════════════════════
   CHARTS
═══════════════════════════════════════════════════════════ */
const CHART_DEFAULTS = {
  borderColor: '#00c8e8',
  backgroundColor: 'rgba(0,200,232,0.06)',
  borderWidth: 1.5,
  pointRadius: 0,
  tension: 0.4,
  fill: true,
};

function makeLabels(n) {
  return Array.from({length: n}, (_, i) => i);
}

const fpsChart = new Chart(document.getElementById('fps-chart'), {
  type: 'line',
  data: {
    labels: makeLabels(CONFIG.CHART_MAX),
    datasets: [{
      label: 'FPS',
      data: new Array(CONFIG.CHART_MAX).fill(null),
      ...CHART_DEFAULTS,
    }],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: {
        min: 0, max: CONFIG.FPS_MAX,
        grid: { color: 'rgba(0,100,120,0.15)' },
        ticks: { color: '#55667a', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 5 },
      },
    },
  },
});

const latencyChart = new Chart(document.getElementById('latency-chart'), {
  type: 'line',
  data: {
    labels: makeLabels(CONFIG.CHART_MAX),
    datasets: [{
      label: 'Latency (ms)',
      data: new Array(CONFIG.CHART_MAX).fill(null),
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245,158,11,0.06)',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.4,
      fill: true,
    }],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: {
        min: 0,
        grid: { color: 'rgba(0,100,120,0.15)' },
        ticks: { color: '#55667a', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 5 },
      },
    },
  },
});

function pushChart(chart, value) {
  const data = chart.data.datasets[0].data;
  data.push(value);
  if (data.length > CONFIG.CHART_MAX) data.shift();
  chart.update('none');
}

/* ═══════════════════════════════════════════════════════════
   TELEMETRY UI UPDATER
═══════════════════════════════════════════════════════════ */
function applyPacket(p) {
  STATE.packet = p;
  STATE.totalPackets++;

  const fps     = p.fps     ?? 0;
  const latency = p.inference_latency_ms ?? p.inferenceLatencyMs ?? 0;
  const conf    = p.confidence ?? 0;
  const cls     = p.class_name ?? p.className ?? '--';

  // ── Hero strip ────────────────────────────────────────────
  setText('hero-fps',        fps.toFixed(1));
  setText('hero-latency',    latency.toFixed(1) + ' ms');
  setText('hero-confidence', (conf * 100).toFixed(1) + ' %');
  setText('hero-model',      p.model ?? 'DEMO');

  // ── HUD ───────────────────────────────────────────────────
  setText('hud-frame',       'FRAME ' + String(p.frame_id ?? p.frameId ?? 0).padStart(6, '0'));
  setText('hud-fps-cam',     'FPS ' + fps.toFixed(0));
  setText('hud-latency-cam', 'LATENCY ' + latency.toFixed(0) + ' ms');
  setText('hud-device',      p.device ?? 'CPU');
  setText('det-class',       cls.toUpperCase());
  setText('det-conf',        (conf * 100).toFixed(1) + ' %');

  // ── Camera canvas ─────────────────────────────────────────
  window._camUpdate && window._camUpdate(cls, conf);

  // ── Metrics ───────────────────────────────────────────────
  setText('m-fps',        fps.toFixed(1));
  setBar('mf-fps', fps / CONFIG.FPS_MAX);
  colorMetric('mc-fps', fps < 10 ? 'danger' : fps < 25 ? 'warn' : '');

  setText('m-latency',    latency.toFixed(1));
  setBar('mf-latency', Math.min(latency / CONFIG.LATENCY_MAX, 1));
  colorMetric('mc-latency', latency > 80 ? 'danger' : latency > 40 ? 'warn' : '');

  setText('m-confidence', (conf * 100).toFixed(1));
  setBar('mf-confidence', conf);

  setText('m-class',      cls.toUpperCase());

  // ── Latency breakdown ─────────────────────────────────────
  const cap  = p.capture_ms        ?? 0;
  const pre  = p.preprocessing_ms  ?? p.preprocessingMs  ?? 0;
  const inf  = p.inference_latency_ms ?? latency;
  const post = p.postprocessing_ms ?? p.postprocessingMs ?? 0;
  const total = cap + pre + inf + post || 1;

  setText('lbv-capture', cap.toFixed(1) + 'ms');
  setText('lbv-pre',     pre.toFixed(1) + 'ms');
  setText('lbv-inf',     inf.toFixed(1) + 'ms');
  setText('lbv-post',    post.toFixed(1) + 'ms');
  setBar2('lb-capture', cap / total);
  setBar2('lb-pre',  pre / total);
  setBar2('lb-inf',  inf / total);
  setBar2('lb-post', post / total);

  // ── Charts ────────────────────────────────────────────────
  pushChart(fpsChart,     fps);
  pushChart(latencyChart, latency);

  // ── Buffer ────────────────────────────────────────────────
  const buf  = p.buffer_size    ?? 0;
  const drop = p.dropped_frames ?? 0;
  const proc = p.total_processed ?? STATE.totalPackets;
  setText('buf-size',      String(buf).padStart(2, '0'));
  setText('buf-dropped',   String(drop).padStart(2, '0'));
  setText('buf-processed', proc);
  setBar2('buf-fill', Math.min(buf / 8, 1));
  document.getElementById('buf-dropped').classList.toggle('buf-danger', drop > 0);

  // ── Class distribution ────────────────────────────────────
  STATE.classCounts[cls] = (STATE.classCounts[cls] || 0) + 1;
  renderClassDist();

  // ── NN activity ──────────────────────────────────────────
  STATE.nnActivity = Math.min(conf * 1.5, 1);

  // ── Pipeline node illuminate ──────────────────────────────
  animatePipeline();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el && el.textContent !== String(val)) el.textContent = val;
}

function setBar(id, ratio) {
  const el = document.getElementById(id);
  if (el) el.style.width = (Math.min(Math.max(ratio, 0), 1) * 100) + '%';
}
function setBar2(id, ratio) { setBar(id, ratio); }

function colorMetric(parentId, state) {
  const el = document.getElementById(parentId);
  if (!el) return;
  const val = el.querySelector('.metric-value');
  if (val) { val.classList.remove('warn','danger'); if (state) val.classList.add(state); }
}

/* ─── Class distribution renderer ─────────────────────── */
function renderClassDist() {
  const list = document.getElementById('class-dist-list');
  const total = Object.values(STATE.classCounts).reduce((a, b) => a + b, 0) || 1;
  const sorted = Object.entries(STATE.classCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  list.innerHTML = sorted.map(([cls, cnt]) => {
    const pct = ((cnt / total) * 100).toFixed(1);
    return `
      <div class="cd-item">
        <span class="cd-label">${cls.toUpperCase()}</span>
        <div class="cd-bar-wrap"><div class="cd-bar" style="width:${pct}%"></div></div>
        <span class="cd-pct">${pct}%</span>
      </div>`;
  }).join('');
}

document.getElementById('reset-dist').addEventListener('click', () => {
  STATE.classCounts = {};
  document.getElementById('class-dist-list').innerHTML = '';
});

/* ─── Pipeline animation ──────────────────────────────── */
const PIPE_NODES = [
  'pn-camera','pn-capture','pn-pre','pn-tensor','pn-nn','pn-inf','pn-class','pn-telem'
];
let pipeIdx = 0;
function animatePipeline() {
  const prev = document.getElementById(PIPE_NODES[pipeIdx]);
  pipeIdx = (pipeIdx + 1) % PIPE_NODES.length;
  const next = document.getElementById(PIPE_NODES[pipeIdx]);
  if (prev) prev.classList.remove('active');
  if (next) next.classList.add('active');
}

/* ═══════════════════════════════════════════════════════════
   DEMO MODE — synthetic telemetry
═══════════════════════════════════════════════════════════ */
const DEMO_CLASSES = ['background','person','vehicle','animal','object'];
let demoClassDrift = 0;
let demoFrame = 0;

function demoPacket() {
  demoFrame++;
  demoClassDrift += 0.004;
  const pivot = Math.floor(demoClassDrift) % DEMO_CLASSES.length;

  // Build synthetic distribution
  const scores = DEMO_CLASSES.map((_, i) => {
    const base = i === pivot ? 0.65 : 0.08;
    return Math.max(0, base + (Math.random() - 0.5) * 0.1);
  });
  const sum = scores.reduce((a, b) => a + b, 0);
  const norm = scores.map(s => s / sum);
  const maxIdx = norm.indexOf(Math.max(...norm));

  return {
    timestamp: Date.now() / 1000,
    frame_id: demoFrame,
    fps: 24 + Math.random() * 12,
    inference_latency_ms: 8 + Math.random() * 20,
    preprocessing_ms: 1 + Math.random() * 3,
    postprocessing_ms: 0.5 + Math.random() * 1,
    capture_ms: 2 + Math.random() * 5,
    confidence: norm[maxIdx],
    class_name: DEMO_CLASSES[maxIdx],
    class_idx: maxIdx,
    all_scores: norm,
    device: 'CPU',
    model: 'DummyClassifier (DEMO)',
    dropped_frames: 0,
    buffer_size: Math.floor(Math.random() * 4),
    total_processed: demoFrame,
    is_demo: true,
  };
}

function startDemo() {
  STATE.isDemo = true;
  STATE.isLive = false;
  setConnectionState('sim');
  Console.warn('SIMULATION MODE ACTIVE — demo telemetry, not real inference');

  clearInterval(STATE.demoInterval);
  STATE.demoInterval = setInterval(() => {
    applyPacket(demoPacket());
  }, 1000 / CONFIG.TELEM_HZ);
}

function stopDemo() {
  clearInterval(STATE.demoInterval);
  STATE.demoInterval = null;
  STATE.isDemo = false;
}

/* ═══════════════════════════════════════════════════════════
   WEBSOCKET TELEMETRY
═══════════════════════════════════════════════════════════ */
function connectWS() {
  if (STATE.ws) STATE.ws.close();

  Console.info('Attempting WebSocket connection to ' + CONFIG.WS_URL);
  const ws = new WebSocket(CONFIG.WS_URL);
  STATE.ws = ws;

  ws.addEventListener('open', () => {
    stopDemo();
    STATE.isLive = true;
    setConnectionState('live');
    Console.success('WEBSOCKET CONNECTED — live telemetry active');
    fetchModelInfo();
  });

  ws.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.event === 'telemetry') applyPacket(data);
    } catch { /* ignore */ }
  });

  ws.addEventListener('close', () => {
    STATE.isLive = false;
    setConnectionState('sim');
    Console.warn('WebSocket disconnected — falling back to simulation mode');
    startDemo();
    // Reconnect after 5s
    setTimeout(connectWS, 5000);
  });

  ws.addEventListener('error', () => {
    Console.error('WebSocket error — check backend is running');
  });
}

/* ─── Model info from REST ────────────────────────────── */
async function fetchModelInfo() {
  try {
    const res = await fetch(CONFIG.API_URL + '/api/v1/model');
    if (!res.ok) return;
    const data = await res.json();
    STATE.modelInfo = data;
    updateModelPanel(data);
    Console.success('Model info loaded: ' + data.name + ' v' + data.version);
  } catch (e) {
    Console.warn('Could not fetch model info: ' + e.message);
  }
}

function updateModelPanel(data) {
  setText('md-name',      data.name    || 'NOT CONFIGURED');
  setText('md-version',   data.version || '--');
  setText('md-device',    data.device  || 'CPU');
  setText('md-input',     (data.input_size || [224,224]).join('×'));
  setText('md-classes',   data.num_classes || '--');
  setText('md-precision', data.precision || 'FP32');
  const statusEl = document.getElementById('md-status');
  if (statusEl) {
    statusEl.textContent = data.is_loaded ? 'READY' : 'NOT CONFIGURED';
    statusEl.classList.toggle('ready', data.is_loaded);
  }
}

/* ═══════════════════════════════════════════════════════════
   CONNECTION STATE UI
═══════════════════════════════════════════════════════════ */
function setConnectionState(state /* 'live' | 'sim' | 'dead' */) {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const badge     = document.getElementById('demo-badge');
  const demoLabel = document.getElementById('demo-label');
  const threshBadge = document.getElementById('thresh-mode-badge');

  dot.className  = 'status-dot';
  badge.style.color = '';
  badge.style.borderColor = '';

  if (state === 'live') {
    dot.classList.add('live');
    text.textContent = 'LIVE';
    if (demoLabel) demoLabel.textContent = 'LIVE TELEMETRY';
    badge.style.color = '#10b981';
    badge.style.borderColor = '#10b981';
    if (threshBadge) threshBadge.textContent = 'LIVE';
  } else if (state === 'sim') {
    dot.classList.add('sim');
    text.textContent = 'SIMULATION';
    if (demoLabel) demoLabel.textContent = 'SIMULATION MODE';
    if (threshBadge) threshBadge.textContent = 'DEMO MODE';
  } else {
    dot.classList.add('dead');
    text.textContent = 'OFFLINE';
  }
}

/* ═══════════════════════════════════════════════════════════
   ARCHITECTURE TOOLTIP
═══════════════════════════════════════════════════════════ */
(function initArchTooltip() {
  const tooltip = document.getElementById('arch-tooltip');
  const nodes   = document.querySelectorAll('.arch-node');

  nodes.forEach(node => {
    function show(e) {
      document.getElementById('at-title').textContent   = node.dataset.label || '';
      document.getElementById('at-purpose').textContent = node.dataset.purpose || '';
      document.getElementById('at-inputs').textContent  = node.dataset.inputs  || '';
      document.getElementById('at-outputs').textContent = node.dataset.outputs || '';
      document.getElementById('at-tech').textContent    = node.dataset.tech   || '';
      document.getElementById('at-status').textContent  = node.dataset.status || '';
      tooltip.classList.add('visible');
      tooltip.removeAttribute('aria-hidden');
      positionTooltip(e);
    }
    function hide() {
      tooltip.classList.remove('visible');
      tooltip.setAttribute('aria-hidden', 'true');
    }
    function positionTooltip(e) {
      const x = e.clientX + 16;
      const y = e.clientY - 16;
      const tw = 320, th = 180;
      tooltip.style.left = (x + tw > window.innerWidth  ? x - tw - 32 : x) + 'px';
      tooltip.style.top  = (y + th > window.innerHeight ? y - th      : y) + 'px';
    }

    node.addEventListener('mouseenter', show);
    node.addEventListener('mousemove',  positionTooltip);
    node.addEventListener('mouseleave', hide);
    node.addEventListener('focus',      show);
    node.addEventListener('blur',       hide);
  });
})();

/* ═══════════════════════════════════════════════════════════
   CONFIDENCE THRESHOLD
═══════════════════════════════════════════════════════════ */
const threshSlider = document.getElementById('conf-threshold');
const threshVal    = document.getElementById('thresh-val');

threshSlider.addEventListener('input', async () => {
  const v = parseFloat(threshSlider.value);
  threshVal.textContent = v.toFixed(2);
  STATE.confThreshold   = v;

  if (STATE.isLive) {
    try {
      await fetch(CONFIG.API_URL + '/api/v1/config', {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({confidence_threshold: v}),
      });
      Console.info('Confidence threshold updated → ' + v.toFixed(2));
    } catch { /* offline */ }
  }
});

/* ═══════════════════════════════════════════════════════════
   GSAP SCROLL ANIMATIONS
═══════════════════════════════════════════════════════════ */
(function initGSAP() {
  if (typeof gsap === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  // Project status bars animate in on scroll
  ScrollTrigger.create({
    trigger: '#project-status',
    start: 'top 75%',
    onEnter: () => {
      document.querySelectorAll('.sbi-fill').forEach(el => {
        const pct = el.getAttribute('data-pct');
        gsap.to(el, { width: pct + '%', duration: 1.2, ease: 'power3.out' });
      });
    },
  });

  // Section headers slide in
  document.querySelectorAll('.section-header').forEach(el => {
    gsap.from(el, {
      opacity: 0,
      y: 24,
      duration: 0.7,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
      },
    });
  });

  // Hero entrance
  gsap.timeline()
    .from('.hero-eyebrow', { opacity: 0, y: 12, duration: 0.5 })
    .from('.hero-title',   { opacity: 0, y: 20, duration: 0.7, ease: 'power3.out' }, '-=0.2')
    .from('.hero-sub',     { opacity: 0, y: 12, duration: 0.5 }, '-=0.3')
    .from('.telemetry-strip', { opacity: 0, y: 16, duration: 0.5 }, '-=0.2')
    .from('.demo-badge',   { opacity: 0, duration: 0.4 }, '-=0.2');

  // Roadmap items stagger
  ScrollTrigger.create({
    trigger: '#roadmap',
    start: 'top 75%',
    onEnter: () => {
      gsap.from('.rm-item', {
        opacity: 0, x: -20, stagger: 0.06,
        duration: 0.5, ease: 'power2.out',
      });
    },
  });

  // Approach items
  ScrollTrigger.create({
    trigger: '.approach-items',
    start: 'top 80%',
    onEnter: () => {
      gsap.from('.ap-item, .ap-plus, .ap-eq, .ap-result', {
        opacity: 0, scale: 0.9, stagger: 0.1,
        duration: 0.5, ease: 'back.out(1.5)',
      });
    },
  });

  // Bottleneck flow
  ScrollTrigger.create({
    trigger: '.bottleneck-flow',
    start: 'top 80%',
    onEnter: () => {
      gsap.from('.bf-item, .bf-arrow', {
        opacity: 0, y: 10, stagger: 0.12,
        duration: 0.4, ease: 'power2.out',
      });
    },
  });

  // Optim grid
  ScrollTrigger.create({
    trigger: '.optim-grid',
    start: 'top 80%',
    onEnter: () => {
      gsap.from('.optim-item', {
        opacity: 0, y: 16, stagger: 0.07,
        duration: 0.5, ease: 'power2.out',
      });
    },
  });
})();

/* ═══════════════════════════════════════════════════════════
   STARTUP SEQUENCE
═══════════════════════════════════════════════════════════ */
(function startup() {
  Console.info('NEURALVISION INITIALIZING');
  Console.info('BUILD 0.1 // EDGE INFERENCE ENGINE');

  // Animate project status bars (initial zero → percentage on load)
  document.querySelectorAll('.sbi-fill').forEach(el => {
    el.style.width = '0%';
  });

  // Start in demo mode immediately — will be replaced by live on WS connect
  startDemo();

  // Attempt live connection
  setTimeout(() => {
    Console.info('Attempting backend connection…');
    connectWS();
  }, 800);

  Console.info('Three.js background: ACTIVE');
  Console.info('Neural network visualization: ACTIVE');
  Console.info('Chart.js telemetry charts: READY');
  Console.success('SYSTEM INITIALIZED');
})();
