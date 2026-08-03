const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const cameraSelect = document.getElementById("cameraSelect");
const toggleBtn = document.getElementById("toggleBtn");
const flipBtn = document.getElementById("flipBtn");
const snapshotBtn = document.getElementById("snapshotBtn");
const statusEl = document.getElementById("status");
const snapshotsEl = document.getElementById("snapshots");

let currentStream = null;
let currentFacingMode = null;
let statusTimeout = null;

function showStatus(text, { sticky = false } = {}) {
  statusEl.textContent = text;
  statusEl.classList.add("visible");
  clearTimeout(statusTimeout);
  if (!sticky) {
    statusTimeout = setTimeout(() => statusEl.classList.remove("visible"), 2500);
  }
}

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
  // Only show the picker when it's actually useful (e.g. multiple laptop webcams);
  // front/back on phones is handled by the flip button instead.
  cameraSelect.hidden = cameras.length < 2;
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

    toggleBtn.textContent = "Stop";
    toggleBtn.title = "Stop camera";
    flipBtn.disabled = false;
    snapshotBtn.disabled = false;
    showStatus("Camera live.");
  } catch (err) {
    showStatus(`Could not access camera: ${err.message}`, { sticky: true });
  }
}

function stopCamera() {
  stopTracksOnly();
  video.srcObject = null;

  toggleBtn.textContent = "Start";
  toggleBtn.title = "Start camera";
  flipBtn.disabled = true;
  snapshotBtn.disabled = true;
  showStatus("Camera stopped.");
}

function toggleCamera() {
  if (currentStream) {
    stopCamera();
  } else {
    startCamera();
  }
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
  showStatus("Snapshot saved.");
}

toggleBtn.addEventListener("click", toggleCamera);
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
      showStatus("No camera found on this device.", { sticky: true });
      toggleBtn.disabled = true;
    }
  })
  .catch(() => {
    showStatus("Camera access is not available in this browser.", { sticky: true });
    toggleBtn.disabled = true;
  });
