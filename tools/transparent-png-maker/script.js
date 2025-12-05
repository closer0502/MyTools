const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileSelect = document.getElementById("fileSelect");
const fileName = document.getElementById("fileName");
const thresholdInput = document.getElementById("threshold");
const thresholdValue = document.getElementById("thresholdValue");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const selectedColorChip = document.getElementById("selectedColor");
const selectedColorLabel = document.getElementById("selectedColorLabel");
const downloadBtn = document.getElementById("downloadBtn");
const resetBtn = document.getElementById("resetBtn");
const statusDot = document.getElementById("statusDot");
const statusLabel = document.getElementById("statusLabel");
const helperText = document.getElementById("helperText");

let img = null;
let targetColor = null;

const Status = {
  idle: "idle",
  ready: "ready",
  applied: "applied",
  error: "error",
};

function setStatus(message, state = Status.idle) {
  statusLabel.textContent = message;
  const colorMap = {
    [Status.idle]: "var(--muted)",
    [Status.ready]: "var(--accent)",
    [Status.applied]: "var(--accent-strong)",
    [Status.error]: "#fda4af",
  };
  statusDot.style.background = colorMap[state] || "var(--muted)";
}

function setSelectedColor(color) {
  if (!color) {
    selectedColorChip.style.background = "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03))";
    selectedColorLabel.textContent = "未選択";
    targetColor = null;
    downloadBtn.disabled = true;
    return;
  }

  const { r, g, b } = color;
  selectedColorChip.style.background = `rgb(${r}, ${g}, ${b})`;
  selectedColorLabel.textContent = `RGB(${r}, ${g}, ${b})`;
  targetColor = color;
}

function handleFiles(files) {
  const file = files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setStatus("画像ファイルを選択してください。", Status.error);
    return;
  }

  fileName.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (event) => {
    loadImage(event.target.result);
  };
  reader.readAsDataURL(file);
}

function loadImage(src) {
  const image = new Image();
  image.onload = () => {
    img = image;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    ctx.imageSmoothingEnabled = true;

    setSelectedColor(null);
    resetBtn.disabled = false;
    helperText.textContent = "キャンバスをクリックして透過する色を指定してください。";
    setStatus("透過したい色をクリックしてください。", Status.ready);
  };
  image.onerror = () => {
    setStatus("画像の読み込みに失敗しました。", Status.error);
  };
  image.src = src;
}

function applyTransparency() {
  if (!img || !targetColor) return;

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const t = Number(thresholdInput.value);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const dr = r - targetColor.r;
    const dg = g - targetColor.g;
    const db = b - targetColor.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist <= t) {
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  downloadBtn.disabled = false;
  setStatus("透過処理を適用しました。", Status.applied);
  helperText.textContent = "別の色をクリックすると再計算します。";
}

function resetImage() {
  if (!img) return;
  ctx.drawImage(img, 0, 0);
  setSelectedColor(null);
  helperText.textContent = "キャンバスをクリックして透過する色を指定してください。";
  setStatus("元の画像に戻しました。色を選択してください。", Status.ready);
}

// Event bindings
fileSelect.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

thresholdInput.addEventListener("input", () => {
  thresholdValue.textContent = thresholdInput.value;
  if (img && targetColor) {
    applyTransparency();
  }
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("is-dragover");
});

dropZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dropZone.classList.remove("is-dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("is-dragover");
  const files = e.dataTransfer?.files;
  handleFiles(files);
});

dropZone.addEventListener("click", () => fileInput.click());

canvas.addEventListener("click", (e) => {
  if (!img) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor((e.clientX - rect.left) * scaleX);
  const y = Math.floor((e.clientY - rect.top) * scaleY);

  const pixel = ctx.getImageData(x, y, 1, 1).data;
  setSelectedColor({ r: pixel[0], g: pixel[1], b: pixel[2] });
  applyTransparency();
});

downloadBtn.addEventListener("click", () => {
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "transparent.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

resetBtn.addEventListener("click", resetImage);

setStatus("画像を読み込んでください。", Status.idle);
