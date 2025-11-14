// 引入 Three.js (使用 CDN 版本 r128 模組)
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

// 全域變數：基本渲染與 XR 會話狀態
let camera, scene, renderer;          // Three.js 基本場景與相機、渲染器
let session = null;                   // WebXR 目前的 AR 會話
let refSpace = null;                  // 參考座標空間 (viewer / local-floor 等)
let markers = [];                     // 已放置的訊號點物件集合
let markerCount = 0;                  // 訊號點累計數量

const startButton = document.getElementById('startButton');
const placeMarkerButton = document.getElementById('placeMarkerButton');
const info = document.getElementById('info');
const markerCountDiv = document.getElementById('markerCount');

// 簡單除錯輸出：僅同步到 console
function log(msg) {
    console.log(msg);
}

// 初始化場景
// 初始化 Three.js 場景與基礎光源、XR 設定
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
// 建立單一訊號點的 3D 造型 (底座 + 柱 + 球 + 編號貼圖)
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

// 放置訊號點：以目前相機位置為基準，落在「腳下」高度
function placeMarker() {
    if (!session || !refSpace) {
        log('Session or refSpace not available');
        info.textContent = '請先啟動 AR 模式';
        return;
    }

    markerCount++;
    const marker = createMarker(markerCount);
    
    // 在腳下放置標記（相機下方）
    marker.position.copy(camera.position);
    marker.position.y = camera.position.y - 1.6; // 腳下約 1.6 米
    
    scene.add(marker);
    markers.push(marker);
    
    updateMarkerCount();
    info.textContent = `已放置訊號點 #${markerCount} (腳下)`;
    log(`Marker ${markerCount} placed at (${marker.position.x.toFixed(2)}, ${marker.position.y.toFixed(2)}, ${marker.position.z.toFixed(2)})`);
    log(`Camera at (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
}

// 更新 UI 顯示目前訊號點數量
function updateMarkerCount() {
    markerCountDiv.textContent = `訊號點數量: ${markerCount}`;
}

// 開始 AR 會話
// 啟動 AR：檢查支援、建立會話、選擇參考空間、啟動渲染迴圈
async function startAR() {
    log('Starting AR...');
    
    if (!navigator.xr) {
        info.textContent = '您的裝置不支援 WebXR';
        log('ERROR: WebXR not supported');
        return;
    }

    try {
        log('Requesting AR session...');
        session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['dom-overlay'],      // 啟用 DOM Overlay 讓原生按鈕可見
            domOverlay: { root: document.getElementById('container') },
            optionalFeatures: ['local-floor']
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
            log('local-floor failed, trying viewer...');
                refSpace = await session.requestReferenceSpace('viewer');
                log('Using viewer reference space');
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

// 每一幀的渲染：更新相機姿態後繪製場景
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
// 啟動前檢查裝置與瀏覽器是否支援 WebXR AR 會話
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
