// SpectralTerrain main script (module-friendly but keeps globals)
(() => {
    const params = {
        windowSize: 2048,
        hopSize: 512,
        targetFreqBins: 128,
        maxTimeSlices: 256,
        heightScale: 18,
        terrainWidth: 50,
        terrainDepth: 80
    };

    const ui = {
        fileInput: document.getElementById("fileInput"),
        analyzeBtn: document.getElementById("analyzeBtn"),
        resetViewBtn: document.getElementById("resetViewBtn"),
        statusText: document.getElementById("statusText"),
        spinner: document.getElementById("spinner"),
        fileName: document.getElementById("fileName"),
        container: document.getElementById("threeContainer"),
        playBtn: document.getElementById("playBtn"),
        seekBar: document.getElementById("seekBar"),
        timeLabel: document.getElementById("timeLabel"),
        audio: document.getElementById("audioPlayer")
    };

    let audioCtx;
    let selectedFile = null;
    let scene, camera, renderer, controls;
    let terrainMesh = null;
    let axisGroup = null;
    let playbackLine = null;
    let audioUrl = null;
    let playbackDuration = 0;
    let isSeeking = false;

    bootstrap();

    async function bootstrap() {
        try {
            await ensureLibs();
            guardDom();
            setupGlobalErrorHandlers();
            initScene();
            bindUI();
            initPlayerUI();
            updateStatus(`準備完了 (three r${THREE.REVISION}, FFT ready)。音源を選択してください。`);
            animate();
        } catch (err) {
            console.error(err);
            if (ui.statusText) ui.statusText.textContent = `初期化エラー: ${err.message}`;
        }
    }

    async function ensureLibs() {
        // Three.js と OrbitControls は HTML で読み込み済み
        // FFT のフォールバック読み込み
        if (typeof FFT === "undefined") {
            await loadScript("https://unpkg.com/dsp.js@1.0.1/dsp.min.js");
        }
        if (typeof THREE === "undefined") {
            throw new Error("three.js が読み込めませんでした。ネットワーク接続を確認してください。");
        }
        if (typeof OrbitControls === "undefined") {
            throw new Error("OrbitControls が読み込めませんでした。CDN を確認してください。");
        }
        if (typeof FFT === "undefined") {
            throw new Error("dsp.js (FFT) が読み込めませんでした。CDN への接続状況を確認してください。");
        }
    }

    function guardDom() {
        const missing = Object.entries(ui)
            .filter(([_, el]) => !el)
            .map(([key]) => key);
        if (missing.length) {
            throw new Error(`必須の要素が見つかりません: ${missing.join(", ")}`);
        }
    }

    function bindUI() {
        ui.fileInput.addEventListener("change", handleFileSelect);
        ui.analyzeBtn.addEventListener("click", handleAnalyze);
        ui.resetViewBtn.addEventListener("click", resetView);
        window.addEventListener("resize", handleResize);
    }

    function initPlayerUI() {
        ui.playBtn.addEventListener("click", togglePlayback);
        ui.seekBar.addEventListener("pointerdown", () => (isSeeking = true));
        ui.seekBar.addEventListener("pointerup", () => (isSeeking = false));
        ui.seekBar.addEventListener("input", handleSeekInput);
        ui.seekBar.addEventListener("change", handleSeekCommit);
        ui.audio.addEventListener("ended", handleAudioEnded);
        resetPlayerState();
    }

    function handleFileSelect(e) {
        const file = e.target.files?.[0];
        if (!file) {
            selectedFile = null;
            ui.fileName.textContent = "未選択";
            ui.analyzeBtn.disabled = true;
            resetPlayerState();
            updateStatus("音源を選択してください。");
            return;
        }
        selectedFile = file;
        ui.fileName.textContent = file.name;
        ui.analyzeBtn.disabled = false;
        prepareAudioElement(file);
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        updateStatus(`ファイル準備完了: ${file.name} (${sizeMB} MB)。Analyze ボタンで解析を開始できます。`);
        console.log("[SpectralTerrain] file selected", { name: file.name, size: file.size, type: file.type });
    }

    async function handleAnalyze() {
        if (!selectedFile) {
            updateStatus("先に音源ファイルを選択してください。");
            return;
        }
        toggleBusy(true, "ファイルを読み込み中...");
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            await audioCtx.resume();
            const { data, sampleRate } = await decodeFile(selectedFile);
            updateStatus("FFT 解析中...");
            const { frames, maxMag, axisMeta } = await runStft(data, sampleRate);
            if (!frames.length) {
                throw new Error("解析結果が空です。別の音源を試してください。");
            }
            playbackDuration = axisMeta?.durationSec || ui.audio.duration || playbackDuration;
            buildTerrain(frames, maxMag, axisMeta);
            updateTimeLabel(0);
            movePlaybackLine(0);
            updateStatus("解析完了。ドラッグで回転、ホイールでズームできます。");
        } catch (err) {
            console.error(err);
            updateStatus(`エラー: ${err.message}`);
        } finally {
            toggleBusy(false);
        }
    }

    async function decodeFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const channelData = mixToMono(audioBuffer);
        return { data: channelData, sampleRate: audioBuffer.sampleRate };
    }

    function mixToMono(buffer) {
        if (buffer.numberOfChannels === 1) {
            return buffer.getChannelData(0);
        }
        const length = buffer.length;
        const tmp = new Float32Array(length);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                tmp[i] += data[i];
            }
        }
        for (let i = 0; i < length; i++) {
            tmp[i] /= buffer.numberOfChannels;
        }
        return tmp;
    }

    async function runStft(data, sampleRate) {
        if (data.length < params.windowSize) {
            throw new Error("音源が短すぎます。少なくとも数秒の音源を選んでください。");
        }
        const frames = [];
        const fft = new FFT(params.windowSize, sampleRate);
        const window = createHann(params.windowSize);
        const hop = params.hopSize;
        const totalFrames = Math.max(1, Math.floor((data.length - params.windowSize) / hop) + 1);
        const temp = new Float32Array(params.windowSize);
        const freqBins = params.targetFreqBins;
        const bandSize = Math.max(1, Math.floor((params.windowSize / 2) / freqBins));
        let maxMag = 0;

        for (let frame = 0; frame < totalFrames; frame++) {
            const start = frame * hop;
            for (let i = 0; i < params.windowSize; i++) {
                // nullish coalescing prevents NaN when the tail runs past the buffer
                temp[i] = (data[start + i] ?? 0) * window[i];
            }

            // dsp.js sometimes returns the spectrum via the instance property instead of the return value
            const spectrum = fft.forward(temp) || fft.spectrum;
            if (!spectrum) {
                throw new Error("FFT 結果の取得に失敗しました (spectrum undefined)");
            }

            const magnitudes = new Float32Array(freqBins);
            for (let f = 0; f < freqBins; f++) {
                const binStart = f * bandSize;
                const binEnd = f === freqBins - 1 ? params.windowSize / 2 : binStart + bandSize;
                let sum = 0;
                let count = 0;
                for (let b = binStart; b < binEnd; b++) {
                    const mag = spectrum[b] ?? 0;
                    sum += mag;
                    count++;
                }
                const mag = count > 0 ? sum / count : 0;
                magnitudes[f] = mag;
                if (mag > maxMag) maxMag = mag;
            }
            frames.push(magnitudes);
            if (frame % 10 === 0) {
                updateStatus(`解析中... ${Math.round((frame / totalFrames) * 100)}%`);
                await nextFrame();
            }
        }

        const reduced = reduceTime(frames, maxMag, params.maxTimeSlices);
        const axisMeta = {
            sampleRate,
            durationSec: data.length / sampleRate,
            timeSlices: reduced.frames.length,
            freqBins
        };
        return { frames: reduced.frames, maxMag: reduced.maxMag, axisMeta };
    }

    function reduceTime(frames, currentMax, maxSlices) {
        if (!frames.length) return { frames: [], maxMag: currentMax };
        if (frames.length <= maxSlices) return { frames, maxMag: currentMax };

        const freqCount = frames[0].length;
        const step = frames.length / maxSlices;
        const reduced = [];
        let maxMag = 0;

        for (let i = 0; i < maxSlices; i++) {
            const start = Math.floor(i * step);
            const end = Math.min(frames.length, Math.floor((i + 1) * step));
            const bucket = new Float32Array(freqCount);
            const count = Math.max(1, end - start);

            for (let t = start; t < end; t++) {
                const row = frames[t];
                for (let f = 0; f < freqCount; f++) {
                    bucket[f] += row[f];
                }
            }
            for (let f = 0; f < freqCount; f++) {
                bucket[f] /= count;
                if (bucket[f] > maxMag) maxMag = bucket[f];
            }
            reduced.push(bucket);
        }
        return { frames: reduced, maxMag: maxMag || currentMax };
    }

    function createHann(size) {
        const window = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
        }
        return window;
    }

    function buildTerrain(frames, maxMag, axisMeta) {
        if (terrainMesh) {
            terrainMesh.geometry.dispose();
            terrainMesh.material.dispose();
            scene.remove(terrainMesh);
            terrainMesh = null;
        }

        const timeCount = frames.length;
        const freqCount = frames[0].length;
        const vertexCount = timeCount * freqCount;
        const positions = new Float32Array(vertexCount * 3);
        const colors = new Float32Array(vertexCount * 3);
        const indices = [];
        const width = params.terrainWidth;
        const depth = params.terrainDepth;
        const heightScale = params.heightScale;

        let ptr = 0;
        for (let t = 0; t < timeCount; t++) {
            for (let f = 0; f < freqCount; f++) {
                const normF = f / (freqCount - 1);
                const normT = t / (timeCount - 1);
                const magnitude = frames[t][f];
                const normMag = maxMag > 0 ? Math.pow(magnitude / maxMag, 0.6) : 0;
                const x = (normF - 0.5) * width;
                const z = (normT - 0.5) * depth;
                const y = normMag * heightScale;

                positions[ptr * 3] = x;
                positions[ptr * 3 + 1] = y;
                positions[ptr * 3 + 2] = z;

                const col = colorMap(normMag);
                colors[ptr * 3] = col.r;
                colors[ptr * 3 + 1] = col.g;
                colors[ptr * 3 + 2] = col.b;
                ptr++;
            }
        }

        for (let t = 0; t < timeCount - 1; t++) {
            for (let f = 0; f < freqCount - 1; f++) {
                const a = t * freqCount + f;
                const b = a + 1;
                const c = a + freqCount;
                const d = c + 1;
                indices.push(a, c, b, b, c, d);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(indices);
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: false,
            side: THREE.DoubleSide,
            metalness: 0.05,
            roughness: 0.6
        });

        terrainMesh = new THREE.Mesh(geometry, material);
        terrainMesh.castShadow = true;
        terrainMesh.receiveShadow = true;
        scene.add(terrainMesh);

        if (axisMeta) updateAxes(axisMeta);
        movePlaybackLine(0);
    }

    function updateAxes(axisMeta) {
        if (!scene) return;
        disposeAxes();

        const width = params.terrainWidth;
        const depth = params.terrainDepth;
        axisGroup = new THREE.Group();

        const freqLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-width / 2, 0, depth / 2 + 2),
                new THREE.Vector3(width / 2, 0, depth / 2 + 2)
            ]),
            new THREE.LineBasicMaterial({ color: "#60a5fa" })
        );
        axisGroup.add(freqLine);

        const freqTicks = 5;
        for (let i = 0; i <= freqTicks; i++) {
            const t = i / freqTicks;
            const x = (t - 0.5) * width;
            const z = depth / 2 + 2;
            axisGroup.add(
                new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(x, 0, z),
                        new THREE.Vector3(x, 0, z + 1.2)
                    ]),
                    new THREE.LineBasicMaterial({ color: "#93c5fd" })
                )
            );

            const freqHz = Math.round(t * (axisMeta.sampleRate / 2));
            const label = makeTextSprite(`${freqHz} Hz`, "#dbeafe");
            label.position.set(x, 0.1, z + 1.6);
            axisGroup.add(label);
        }

        const freqTitle = makeTextSprite("Frequency", "#bfdbfe");
        freqTitle.position.set(0, 0.2, depth / 2 + 4);
        axisGroup.add(freqTitle);

        const timeLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-width / 2 - 2, 0, -depth / 2),
                new THREE.Vector3(-width / 2 - 2, 0, depth / 2)
            ]),
            new THREE.LineBasicMaterial({ color: "#34d399" })
        );
        axisGroup.add(timeLine);

        const tickCount = Math.max(2, Math.min(6, axisMeta.timeSlices));
        for (let i = 0; i <= tickCount; i++) {
            const t = i / tickCount;
            const z = (t - 0.5) * depth;
            const x = -width / 2 - 2;
            axisGroup.add(
                new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(x, 0, z),
                        new THREE.Vector3(x - 1.2, 0, z)
                    ]),
                    new THREE.LineBasicMaterial({ color: "#6ee7b7" })
                )
            );

            const secs = axisMeta.durationSec * t;
            const label = makeTextSprite(`${secs.toFixed(1)} s`, "#d1fae5");
            label.position.set(x - 1.6, 0.1, z);
            axisGroup.add(label);
        }

        const timeTitle = makeTextSprite("Time", "#a7f3d0");
        timeTitle.position.set(-width / 2 - 4, 0.2, 0);
        axisGroup.add(timeTitle);

        scene.add(axisGroup);
    }

    function disposeAxes() {
        if (!axisGroup) return;
        axisGroup.traverse((node) => {
            if (node.material?.map) node.material.map.dispose();
            if (node.material?.dispose) node.material.dispose();
            if (node.geometry?.dispose) node.geometry.dispose();
        });
        scene.remove(axisGroup);
        axisGroup = null;
    }

    function makeTextSprite(text, color = "#e5e7eb") {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const padding = 12;
        const fontSize = 36;
        ctx.font = `${fontSize}px 'Segoe UI', sans-serif`;
        const textWidth = ctx.measureText(text).width;
        const width = Math.ceil(textWidth + padding * 2);
        const height = Math.ceil(fontSize + padding * 2);
        canvas.width = width;
        canvas.height = height;

        ctx.font = `${fontSize}px 'Segoe UI', sans-serif`;
        ctx.fillStyle = "rgba(12, 18, 33, 0.75)";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, width / 2, height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        const scale = 0.05;
        sprite.scale.set(width * scale, height * scale, 1);
        return sprite;
    }

    function colorMap(v) {
        const stops = [
            { value: 0.0, color: [10 / 255, 26 / 255, 66 / 255] },
            { value: 0.35, color: [30 / 255, 94 / 255, 140 / 255] },
            { value: 0.6, color: [108 / 255, 92 / 255, 231 / 255] },
            { value: 0.8, color: [255 / 255, 166 / 255, 43 / 255] },
            { value: 1.0, color: [255 / 255, 211 / 255, 112 / 255] }
        ];
        const clamped = Math.min(1, Math.max(0, v));
        for (let i = 0; i < stops.length - 1; i++) {
            const a = stops[i];
            const b = stops[i + 1];
            if (clamped >= a.value && clamped <= b.value) {
                const t = (clamped - a.value) / (b.value - a.value);
                return {
                    r: lerp(a.color[0], b.color[0], t),
                    g: lerp(a.color[1], b.color[1], t),
                    b: lerp(a.color[2], b.color[2], t)
                };
            }
        }
        const last = stops[stops.length - 1].color;
        return { r: last[0], g: last[1], b: last[2] };
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function initScene() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color("#0c1221");
        scene.fog = new THREE.Fog("#0c1221", 60, 140);

        const aspect = ui.container.clientWidth / Math.max(1, ui.container.clientHeight);
        camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 400);
        camera.position.set(0, 32, 70);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(ui.container.clientWidth, ui.container.clientHeight);
        renderer.shadowMap.enabled = true;
        ui.container.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 20;
        controls.maxDistance = 140;
        controls.maxPolarAngle = Math.PI * 0.9;
        resetView();

        const ambient = new THREE.AmbientLight("#6b7280", 0.65);
        scene.add(ambient);

        const dirLight = new THREE.DirectionalLight("#e5e7eb", 1.1);
        dirLight.position.set(24, 36, 26);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(2048, 2048);
        scene.add(dirLight);

        const backLight = new THREE.DirectionalLight("#38bdf8", 0.5);
        backLight.position.set(-18, 20, -14);
        scene.add(backLight);

        const groundGeo = new THREE.PlaneGeometry(180, 180);
        const groundMat = new THREE.MeshStandardMaterial({
            color: "#0f1629",
            metalness: 0.05,
            roughness: 0.9
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.1;
        ground.receiveShadow = true;
        scene.add(ground);
    }

    function resetView() {
        if (!camera) return;
        camera.position.set(0, 32, 70);
        if (controls) {
            controls.target.set(0, 10, 0);
            controls.update();
        }
    }

    function handleResize() {
        if (!renderer || !camera) return;
        const { clientWidth, clientHeight } = ui.container;
        camera.aspect = clientWidth / Math.max(1, clientHeight);
        camera.updateProjectionMatrix();
        renderer.setSize(clientWidth, clientHeight);
    }

    function animate() {
        requestAnimationFrame(animate);
        syncPlaybackUI();
        if (controls) controls.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
    }

    function updateStatus(text) {
        ui.statusText.textContent = text;
    }

    function toggleBusy(isBusy, message) {
        if (typeof message === "string") updateStatus(message);
        ui.spinner.classList.toggle("active", isBusy);
        ui.analyzeBtn.disabled = isBusy || !selectedFile;
        ui.fileInput.disabled = isBusy;
    }

    function nextFrame() {
        return new Promise((resolve) => requestAnimationFrame(resolve));
    }

    function setupGlobalErrorHandlers() {
        window.addEventListener("error", (ev) => {
            console.error("[SpectralTerrain] error", ev.error || ev.message);
            updateStatus(`エラー: ${ev.message}`);
        });
        window.addEventListener("unhandledrejection", (ev) => {
            console.error("[SpectralTerrain] unhandled rejection", ev.reason);
            updateStatus(`エラー: ${ev.reason?.message || ev.reason}`);
        });
    }

    // --- Playback helpers ---
    function prepareAudioElement(file) {
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
            audioUrl = null;
        }
        audioUrl = URL.createObjectURL(file);
        ui.audio.src = audioUrl;
        ui.audio.load();
        ui.playBtn.disabled = false;
        ui.seekBar.disabled = false;
        ui.audio.onloadedmetadata = () => {
            playbackDuration = ui.audio.duration || playbackDuration;
            updateTimeLabel(ui.audio.currentTime);
        };
    }

    function resetPlayerState() {
        ui.audio.pause();
        ui.audio.currentTime = 0;
        playbackDuration = 0;
        ui.seekBar.value = 0;
        ui.seekBar.disabled = true;
        ui.playBtn.textContent = "Play";
        ui.playBtn.disabled = true;
        updateTimeLabel(0);
        movePlaybackLine(0);
    }

    function togglePlayback() {
        if (!ui.audio.src) return;
        if (ui.audio.paused) {
            ui.audio.play();
            ui.playBtn.textContent = "Pause";
        } else {
            ui.audio.pause();
            ui.playBtn.textContent = "Play";
        }
    }

    function handleSeekInput() {
        const progress = Number(ui.seekBar.value) / 100;
        const target = progress * getDuration();
        movePlaybackLine(progress);
        updateTimeLabel(target);
    }

    function handleSeekCommit() {
        isSeeking = false;
        const progress = Number(ui.seekBar.value) / 100;
        const target = progress * getDuration();
        ui.audio.currentTime = target;
        movePlaybackLine(progress);
        updateTimeLabel(target);
    }

    function handleAudioEnded() {
        ui.playBtn.textContent = "Play";
        updateSeekUI(1);
        movePlaybackLine(1);
        updateTimeLabel(getDuration());
    }

    function syncPlaybackUI() {
        const total = getDuration();
        if (!total) return;
        const progress = Math.min(1, Math.max(0, ui.audio.currentTime / total));
        if (!isSeeking) updateSeekUI(progress);
        movePlaybackLine(progress);
        updateTimeLabel(ui.audio.currentTime);
    }

    function updateSeekUI(progress) {
        ui.seekBar.value = (progress * 100).toFixed(2);
    }

    function getDuration() {
        return playbackDuration || ui.audio.duration || 0;
    }

    function updateTimeLabel(currentSec) {
        const total = getDuration();
        const current = formatTime(currentSec || 0);
        const totalTxt = formatTime(total || 0);
        ui.timeLabel.textContent = `${current} / ${totalTxt}`;
    }

    function formatTime(sec) {
        const s = Math.max(0, sec);
        const m = Math.floor(s / 60);
        const rem = Math.floor(s % 60)
            .toString()
            .padStart(2, "0");
        return `${m}:${rem}`;
    }

    function ensurePlaybackLine() {
        if (playbackLine) return playbackLine;
        const height = params.heightScale * 1.8;
        const width = params.terrainWidth;
        const geom = new THREE.PlaneGeometry(width, height);
        const mat = new THREE.MeshBasicMaterial({
            color: "#f472b6",
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide
        });
        playbackLine = new THREE.Mesh(geom, mat);
        playbackLine.position.y = height * 0.5;
        scene.add(playbackLine);
        return playbackLine;
    }

    function movePlaybackLine(progress) {
        if (!scene) return;
        const line = ensurePlaybackLine();
        const depth = params.terrainDepth;
        const zPos = (progress - 0.5) * depth;
        line.position.z = zPos;
    }

    function disposePlaybackLine() {
        if (!playbackLine) return;
        if (playbackLine.material?.dispose) playbackLine.material.dispose();
        if (playbackLine.geometry?.dispose) playbackLine.geometry.dispose();
        scene.remove(playbackLine);
        playbackLine = null;
    }

    // --- Utilities ---
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`スクリプトを読み込めませんでした: ${src}`));
            document.head.appendChild(script);
        });
    }
})();
