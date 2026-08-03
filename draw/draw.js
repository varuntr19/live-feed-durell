const video = document.getElementById("video");
const drawCanvas = document.getElementById("drawCanvas");
const cursorCanvas = document.getElementById("cursorCanvas");
const drawCtx = drawCanvas.getContext("2d");
const cursorCtx = cursorCanvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayBtn = document.getElementById("overlayBtn");
const clearBtn = document.getElementById("clearBtn");
const eraserBtn = document.getElementById("eraserBtn");
const swatches = Array.from(document.querySelectorAll(".swatch"));

const PINCH_THRESHOLD = 0.45; // pinch distance, relative to hand scale
const LINE_WIDTH = 6;
const ERASER_WIDTH = 40;

let width = 0;
let height = 0;
let currentColor = swatches[0].dataset.color;
let eraserMode = false;
let lastPoint = null;
let isPinching = false;
let hands = null;
let handLoopActive = false;

function resizeCanvases() {
  width = window.innerWidth;
  height = window.innerHeight;

  // Resizing a canvas clears it, so snapshot and restore the drawing
  // (skip the restore if there's nothing to preserve yet).
  const hasExistingDrawing = drawCanvas.width > 0 && drawCanvas.height > 0;
  const snapshot = document.createElement("canvas");
  if (hasExistingDrawing) {
    snapshot.width = drawCanvas.width;
    snapshot.height = drawCanvas.height;
    snapshot.getContext("2d").drawImage(drawCanvas, 0, 0);
  }

  drawCanvas.width = width;
  drawCanvas.height = height;
  cursorCanvas.width = width;
  cursorCanvas.height = height;

  if (hasExistingDrawing) drawCtx.drawImage(snapshot, 0, 0);
}
window.addEventListener("resize", resizeCanvases);
resizeCanvases();

function setActiveSwatch(swatch) {
  swatches.forEach((s) => s.classList.remove("active"));
  swatch.classList.add("active");
}
setActiveSwatch(swatches[0]);

swatches.forEach((swatch) => {
  swatch.addEventListener("click", () => {
    currentColor = swatch.dataset.color;
    eraserMode = false;
    eraserBtn.classList.remove("active");
    setActiveSwatch(swatch);
  });
});

eraserBtn.addEventListener("click", () => {
  eraserMode = !eraserMode;
  eraserBtn.classList.toggle("active", eraserMode);
});

clearBtn.addEventListener("click", () => {
  drawCtx.clearRect(0, 0, width, height);
});

function drawStroke(from, to) {
  drawCtx.save();
  if (eraserMode) {
    drawCtx.globalCompositeOperation = "destination-out";
    drawCtx.lineWidth = ERASER_WIDTH;
  } else {
    drawCtx.globalCompositeOperation = "source-over";
    drawCtx.strokeStyle = currentColor;
    drawCtx.lineWidth = LINE_WIDTH;
  }
  drawCtx.lineCap = "round";
  drawCtx.lineJoin = "round";
  drawCtx.beginPath();
  drawCtx.moveTo(from.x, from.y);
  drawCtx.lineTo(to.x, to.y);
  drawCtx.stroke();
  drawCtx.restore();
}

function drawCursor(point, pinching) {
  cursorCtx.clearRect(0, 0, width, height);
  if (!point) return;

  const radius = eraserMode ? ERASER_WIDTH / 2 : 10;
  cursorCtx.save();
  cursorCtx.beginPath();
  cursorCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  if (pinching) {
    cursorCtx.fillStyle = eraserMode ? "rgba(255,255,255,0.5)" : currentColor;
    cursorCtx.fill();
  } else {
    cursorCtx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    cursorCtx.lineWidth = 2;
    cursorCtx.stroke();
  }
  cursorCtx.restore();
}

function onHandResults(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    isPinching = false;
    lastPoint = null;
    drawCursor(null, false);
    return;
  }

  const landmarks = results.multiHandLandmarks[0];
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  // Mirror x to match the mirrored video feed on screen.
  const point = { x: (1 - indexTip.x) * width, y: indexTip.y * height };

  const pinchDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
  const handScale = Math.hypot(wrist.x - middleMcp.x, wrist.y - middleMcp.y) || 0.001;
  const pinching = pinchDistance / handScale < PINCH_THRESHOLD;

  if (pinching) {
    if (lastPoint) drawStroke(lastPoint, point);
    lastPoint = point;
  } else {
    lastPoint = null;
  }
  isPinching = pinching;

  drawCursor(point, pinching);
}

function initHands() {
  hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  hands.onResults(onHandResults);
}

async function handFrameLoop() {
  if (!handLoopActive) return;
  if (video.readyState >= 2) {
    await hands.send({ image: video });
  }
  requestAnimationFrame(handFrameLoop);
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

async function startApp() {
  try {
    overlayBtn.disabled = true;
    if (!video.srcObject) await startCamera();
    if (!hands) initHands();

    overlay.classList.add("hidden");
    handLoopActive = true;
    handFrameLoop();
  } catch (err) {
    overlay.querySelector("h1").textContent = "Camera error";
    overlay.querySelector("p").textContent = err.message;
  } finally {
    overlayBtn.disabled = false;
  }
}

overlayBtn.addEventListener("click", startApp);
