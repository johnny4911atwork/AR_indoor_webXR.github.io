import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

let camera, scene, renderer;
let session = null;
let refSpace = null;
let markers = [];
let markerCount = 0;

const startButton = document.getElementById('startButton');
const placeMarkerButton = document.getElementById('placeMarkerButton');
const info = document.getElementById('info');
const markerCountDiv = document.getElementById('markerCount');
const debugDiv = document.getElementById('debug');

function log(msg) {
    console.log(msg);
    debugDiv.innerHTML += msg + '<br>';
    debugDiv.style.display = 'block';
}

// 初始化場景
function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    
    // 添加環境光
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    
    document.getElementById('container').appendChild(renderer.domElement);
    
    log('Three.js initialized');
}

// 創建訊號點標記
function createMarker(number) {
    const group = new THREE.Group();

    // 底座圓盤 - 加大並增加發光效果
    const baseGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 32);
    const baseMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x2196F3,
        emissive: 0x2196F3,
        emissiveIntensity: 0.8,
        shininess: 100
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    group.add(base);

    // 中心圓柱 - 加粗並增加發光
    const poleGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 16);
    const poleMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xFFEB3B,
        emissive: 0xFFEB3B,
        emissiveIntensity: 0.9
    });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.y = 0.2;
    group.add(pole);

    // 頂部球體 - 加大
    const sphereGeometry = new THREE.SphereGeometry(0.08, 16, 16);
    const sphereMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xFF5722,
        emissive: 0xFF5722,
        emissiveIntensity: 1.0
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.y = 0.45;
    group.add(sphere);

    // 編號文字平面
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'Bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const textMaterial = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true,
        side: THREE.DoubleSide
    });
    const textGeometry = new THREE.PlaneGeometry(0.15, 0.15);
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    textMesh.position.y = 0.15;
    textMesh.rotation.x = -Math.PI / 2;
    textMesh.position.z = 0.001;
    group.add(textMesh);

    return group;
}

// 放置訊號點
function placeMarker() {
    if (!session || !refSpace) {
        log('Session or refSpace not available');
        info.textContent = '請先啟動 AR 模式';
        return;
    }

    markerCount++;
    const marker = createMarker(markerCount);
    
    // 根據相機當前的位置和方向放置標記
    // 在相機前方 1.5 米處,接近地面
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(camera.quaternion);
    forward.y = 0; // 保持在水平面上
    forward.normalize();
    
    marker.position.copy(camera.position);
    marker.position.add(forward.multiplyScalar(1.5)); // 前方 1.5 米
    marker.position.y = camera.position.y - 1.2; // 地面高度 (相機下方約 1.2 米)
    
    scene.add(marker);
    markers.push(marker);
    
    updateMarkerCount();
    info.textContent = `已放置訊號點 #${markerCount} (前方 1.5m)`;
    log(`Marker ${markerCount} placed at (${marker.position.x.toFixed(2)}, ${marker.position.y.toFixed(2)}, ${marker.position.z.toFixed(2)})`);
    log(`Camera at (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
}

function updateMarkerCount() {
    markerCountDiv.textContent = `訊號點數量: ${markerCount}`;
}

// 開始 AR 會話
async function startAR() {
    log('Starting AR...');
    
    if (!navigator.xr) {
        info.textContent = '您的裝置不支援 WebXR';
        log('ERROR: WebXR not supported');
        return;
    }

    try {
        log('Checking AR support...');
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        log(`AR supported: ${supported}`);
        
        if (!supported) {
            info.textContent = '您的裝置不支援 AR 模式';
            return;
        }

        log('Requesting AR session...');
        session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: [],
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
        });
        log('AR session created');

        log('Setting XR session to renderer...');
        await renderer.xr.setSession(session);
        log('Renderer XR session set');

        // 嘗試不同的參考空間
        try {
            log('Trying local-floor...');
            refSpace = await session.requestReferenceSpace('local-floor');
            log('Using local-floor reference space');
        } catch (e) {
            log('local-floor failed, trying local...');
            try {
                refSpace = await session.requestReferenceSpace('local');
                log('Using local reference space');
            } catch (e2) {
                log('local failed, trying unbounded...');
                try {
                    refSpace = await session.requestReferenceSpace('unbounded');
                    log('Using unbounded reference space');
                } catch (e3) {
                    log('unbounded failed, using viewer...');
                    refSpace = await session.requestReferenceSpace('viewer');
                    log('Using viewer reference space');
                }
            }
        }

        session.addEventListener('end', () => {
            log('AR session ended');
            session = null;
            refSpace = null;
            startButton.style.display = 'block';
            placeMarkerButton.style.display = 'none';
            markerCountDiv.style.display = 'none';
            info.textContent = 'AR 已結束';
        });

        startButton.style.display = 'none';
        placeMarkerButton.style.display = 'block';
        markerCountDiv.style.display = 'block';
        info.textContent = '移動到想要的位置後,點擊「放置訊號點」';

        log('Starting animation loop...');
        renderer.setAnimationLoop(render);
        log('AR started successfully!');
    } catch (err) {
        info.textContent = 'AR 啟動失敗: ' + err.message;
        log('ERROR: ' + err.message);
        log('Stack: ' + err.stack);
    }
}

function render(timestamp, frame) {
    if (frame && refSpace) {
        const pose = frame.getViewerPose(refSpace);
        if (pose) {
            // 更新相機位置以便放置標記時使用
            const view = pose.views[0];
            camera.matrix.fromArray(view.transform.matrix);
            camera.matrix.decompose(camera.position, camera.quaternion, camera.scale);
        }
    }
    renderer.render(scene, camera);
}

// 檢查 WebXR 支援
async function checkWebXRSupport() {
    if (!navigator.xr) {
        info.textContent = '❌ 您的瀏覽器不支援 WebXR';
        log('WebXR not available');
        return;
    }

    log('WebXR available, checking AR support...');
    
    try {
        const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
        
        if (arSupported) {
            info.textContent = '✅ 您的裝置支援 AR,點擊開始';
            startButton.style.display = 'block';
            log('AR is supported!');
        } else {
            info.textContent = '❌ 您的裝置不支援 AR 模式';
            log('AR not supported on this device');
        }
    } catch (err) {
        info.textContent = '❌ 檢查 AR 支援時發生錯誤';
        log('ERROR checking AR support: ' + err.message);
    }
}

// 事件監聽
startButton.addEventListener('click', startAR);
placeMarkerButton.addEventListener('click', placeMarker);

// 初始化
init();
checkWebXRSupport();
