const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const cameraSelect = document.getElementById("cameraSelect");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const flipBtn = document.getElementById("flipBtn");
const snapshotBtn = document.getElementById("snapshotBtn");
const statusEl = document.getElementById("status");
const snapshotsEl = document.getElementById("snapshots");

let currentStream = null;
let currentFacingMode = null;

function stopTracksOnly() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
}

function applyMirror(facingMode) {
  video.classList.toggle("mirror", facingMode !== "environment");
}

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((d) => d.kind === "videoinput");

  cameraSelect.innerHTML = "";
  cameras.forEach((cam, i) => {
    const option = document.createElement("option");
    option.value = cam.deviceId;
    option.textContent = cam.label || `Camera ${i + 1}`;
    cameraSelect.appendChild(option);
  });
}

async function startCamera({ facingMode } = {}) {
  try {
    const deviceId = cameraSelect.value;
    const constraints = facingMode
      ? { video: { facingMode: { ideal: facingMode } }, audio: false }
      : { video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false };

    stopTracksOnly();
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;

    const settings = currentStream.getVideoTracks()[0].getSettings();
    currentFacingMode = settings.facingMode || facingMode || null;
    applyMirror(currentFacingMode);

    await listCameras();
    if (settings.deviceId) cameraSelect.value = settings.deviceId;

    startBtn.disabled = true;
    stopBtn.disabled = false;
    flipBtn.disabled = false;
    snapshotBtn.disabled = false;
    statusEl.textContent = "Camera live.";
  } catch (err) {
    statusEl.textContent = `Could not access camera: ${err.message}`;
  }
}

function stopCamera() {
  stopTracksOnly();
  video.srcObject = null;

  startBtn.disabled = false;
  stopBtn.disabled = true;
  flipBtn.disabled = true;
  snapshotBtn.disabled = true;
  statusEl.textContent = "Camera stopped.";
}

function flipCamera() {
  const nextFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  startCamera({ facingMode: nextFacingMode });
}

function takeSnapshot() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (video.classList.contains("mirror")) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1); // match the mirrored preview
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const img = document.createElement("img");
  img.src = canvas.toDataURL("image/png");
  snapshotsEl.prepend(img);
}

startBtn.addEventListener("click", () => startCamera());
stopBtn.addEventListener("click", stopCamera);
flipBtn.addEventListener("click", flipCamera);
snapshotBtn.addEventListener("click", takeSnapshot);
cameraSelect.addEventListener("change", () => {
  if (currentStream) startCamera();
});

navigator.mediaDevices
  .enumerateDevices()
  .then((devices) => {
    if (devices.some((d) => d.kind === "videoinput")) {
      listCameras();
    } else {
      statusEl.textContent = "No camera found on this device.";
      startBtn.disabled = true;
    }
  })
  .catch(() => {
    statusEl.textContent = "Camera access is not available in this browser.";
    startBtn.disabled = true;
  });
