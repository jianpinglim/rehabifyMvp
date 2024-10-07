import { HandLandmarker, FilesetResolver, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";

let handLandmarker = null;
let runningMode = "VIDEO";
let webcamRunning = false;
const videoWidth = 256;
const videoHeight = 256;

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("outputCanvas");
const canvasCtx = canvasElement.getContext("2d");
const drawingUtils = new DrawingUtils(canvasCtx);
const testInput = document.getElementById('testInput');
const keyStatus = document.getElementById('keyStatus');

const minHandDetectionConfidence = 0.7;
const minHandPresenceConfidence = 0.5;
const minTrackingConfidence = 0.5;

const touchThreshold = 0.05;

const fingerToTouches = {
    'IndexFinger': "a",
    'MiddleFinger': "w",
    'RingFinger': "s",
    'PinkyFinger': "d",
};

const heldKeys = {};
const keyIntervals = {};

const relevantLandmarks = [0, 4, 8, 12, 16, 20]; // Wrist and fingertips

function calDist(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function pressKey(key) {
    if (!heldKeys[key]) {
        const event = new KeyboardEvent('keydown', {
            key: key,
            code: 'Key' + key.toUpperCase(),
            which: key.charCodeAt(0),
            bubbles: true,
            cancelable: true
        });
        testInput.dispatchEvent(event);
        heldKeys[key] = true;
        updateKeyStatus();

        // Set up an interval to continuously dispatch keydown events
        keyIntervals[key] = setInterval(() => {
            testInput.dispatchEvent(event);
        }, 100); // Adjust this interval as needed
    }
}

function releaseKey(key) {
    if (heldKeys[key]) {
        const event = new KeyboardEvent('keyup', {
            key: key,
            code: 'Key' + key.toUpperCase(),
            which: key.charCodeAt(0),
            bubbles: true,
            cancelable: true
        });
        testInput.dispatchEvent(event);
        heldKeys[key] = false;
        updateKeyStatus();

        // Clear the interval for this key
        if (keyIntervals[key]) {
            clearInterval(keyIntervals[key]);
            delete keyIntervals[key];
        }
    }
}

function updateKeyStatus() {
    const pressedKeys = Object.entries(heldKeys)
        .filter(([key, isHeld]) => isHeld)
        .map(([key]) => key)
        .join(', ');
    keyStatus.textContent = `Pressed keys: ${pressedKeys}`;
}

function drawRelevantLandmarks(landmarks) {
    const relevantPoints = relevantLandmarks.map(index => landmarks[index]);
    
    // Draw lines connecting the wrist to each fingertip
    for (let i = 1; i < relevantPoints.length; i++) {
        drawingUtils.drawConnectors([relevantPoints[0], relevantPoints[i]], [[0, 1]], {color: '#ffa800', lineWidth: 0.5});
    }
    
    // Draw the relevant landmarks
    drawingUtils.drawLandmarks(relevantPoints, {color: '#FF0000', lineWidth: 3});
}

const createHandLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: runningMode,
        numHands: 2,
        minHandDetectionConfidence: minHandDetectionConfidence,
        minHandPresenceConfidence: minHandPresenceConfidence,
        minTrackingConfidence: minTrackingConfidence
    });
    enableCam(); // Automatically start the camera once the model is loaded
};

function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function enableCam() {
    if (!handLandmarker) {
        console.log("Wait! handLandmarker not loaded yet.");
        return;
    }

    if (webcamRunning) {
        return;
    }

    navigator.mediaDevices.getUserMedia({
        video: { width: videoWidth, height: videoHeight }
    })
    .then((stream) => {
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam);
        webcamRunning = true;
    })
    .catch((err) => {
        console.error("Error accessing the camera", err);
        alert("Error accessing the camera. Please make sure you have a working camera connected and have granted permission.");
    });
}

let lastVideoTime = -1;
let results = undefined;

async function predictWebcam() {
    canvasElement.style.width = `${videoWidth}px`;
    canvasElement.style.height = `${videoHeight}px`;
    canvasElement.width = videoWidth;
    canvasElement.height = videoHeight;
    
    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        results = handLandmarker.detectForVideo(video, startTimeMs);
    }
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
    
    if (results.landmarks) {
        for (const landmarks of results.landmarks) {
            drawRelevantLandmarks(landmarks);
            
            const thumbTip = landmarks[4];
            const touches = {};
            const fingertips = [8, 12, 16, 20];
            const fingerNames = ['IndexFinger', 'MiddleFinger', 'RingFinger', 'PinkyFinger'];
        
            for(let i = 0; i < fingertips.length; i++) {
                const fingerTip = landmarks[fingertips[i]];
                const dist = calDist(thumbTip, fingerTip);
                touches[fingerNames[i]] = dist < touchThreshold;
            }

            for (const [finger, isTouching] of Object.entries(touches)) {
                const keyToPress = fingerToTouches[finger];
                if (keyToPress) {
                    if (isTouching) {
                        pressKey(keyToPress);
                    } else {
                        releaseKey(keyToPress);
                    }
                }
            }
        }
    } else {
        // Release all keys if no hand is detected
        for (const key of Object.values(fingerToTouches)) {
            releaseKey(key);
        }
    }
    canvasCtx.restore();
    
    if (webcamRunning) {
        window.requestAnimationFrame(predictWebcam);
    }
}

// Add event listener to update the input field when keys are pressed
testInput.addEventListener('keydown', (e) => {
    testInput.value += e.key;
});

if (hasGetUserMedia()) {
    createHandLandmarker();
} else {
    console.warn("getUserMedia() is not supported by your browser");
}

// Initialize the key status display
updateKeyStatus();