import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.0/build/three.module.js';

// 全域變數
let xrSession = null;
let renderer = null;
let scene = null;
let camera = null;
let hitTestSource = null;
let hitTestSourceRequested = false;
let markers = [];
let markerCount = 0;
let reticle = null;
let firstMarkerPlaced = false;
let xrRefSpace = null;
let isARActive = false;

// UI 元素
const startButton = document.getElementById('start-button');
const markerButton = document.getElementById('marker-button');
const markerCountElement = document.getElementById('marker-count');
const instructionElement = document.getElementById('instruction');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

// 初始化場景
function init() {
    console.log('開始初始化 WebXR 場景...');
    
    // 建立場景
    scene = new THREE.Scene();

    // 建立相機
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    // 建立環境光
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // 建立平行光
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // 建立 WebGL renderer
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setFoveation(1);
    document.body.appendChild(renderer.domElement);

    console.log('Renderer 已建立，xr.enabled:', renderer.xr.enabled);

    // 建立瞄準圈 (reticle)
    createReticle();

    // 處理視窗大小調整
    window.addEventListener('resize', onWindowResize);
}

// 建立瞄準圈
function createReticle() {
    const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5
    });
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    console.log('Reticle 已建立');
}

// 建立訊號點標記
function createMarker(position) {
    const markerGroup = new THREE.Group();

    // 主要圓柱體 (訊號柱)
    const cylinderGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 32);
    const cylinderMaterial = new THREE.MeshStandardMaterial({
        color: 0xff6b6b,
        metalness: 0.5,
        roughness: 0.3,
        emissive: 0xff6b6b,
        emissiveIntensity: 0.3
    });
    const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
    cylinder.position.y = 0.15;
    markerGroup.add(cylinder);

    // 頂部球體
    const sphereGeometry = new THREE.SphereGeometry(0.08, 32, 32);
    const sphereMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        metalness: 0.7,
        roughness: 0.2,
        emissive: 0xffff00,
        emissiveIntensity: 0.5
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.y = 0.35;
    markerGroup.add(sphere);

    // 底部圓盤
    const discGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 32);
    const discMaterial = new THREE.MeshStandardMaterial({
        color: 0x667eea,
        metalness: 0.6,
        roughness: 0.4,
        emissive: 0x667eea,
        emissiveIntensity: 0.2
    });
    const disc = new THREE.Mesh(discGeometry, discMaterial);
    disc.position.y = 0.01;
    markerGroup.add(disc);

    // 設定位置
    markerGroup.position.copy(position);

    // 加入場景
    scene.add(markerGroup);
    markers.push(markerGroup);

    // 增加動畫效果
    animateMarkerAppearance(markerGroup);

    console.log(`訊號點 #${markerCount + 1} 已建立在:`, position);

    return markerGroup;
}

// 標記出現動畫
function animateMarkerAppearance(marker) {
    marker.scale.set(0, 0, 0);

    const duration = 500; // 毫秒
    const startTime = Date.now();

    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // 使用 easeOutBack 效果
        const easeProgress = progress < 1 
            ? 1 - Math.pow(1 - progress, 3) 
            : 1;
        
        marker.scale.set(easeProgress, easeProgress, easeProgress);

        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }

    animate();
}

// 放置標記
function placeMarker() {
    if (!isARActive) {
        alert('請先啟動 AR');
        return;
    }

    if (reticle && reticle.visible) {
        const position = new THREE.Vector3();
        position.setFromMatrixPosition(reticle.matrix);
        
        createMarker(position);
        markerCount++;
        updateUI();
        
        console.log(`訊號點 #${markerCount} 已放置在:`, position);
    } else {
        alert('請對準地面後再點擊按鈕');
    }
}

// 更新 UI
function updateUI() {
    markerCountElement.textContent = markerCount;
}

// 更新狀態顯示
function updateStatus(active, text) {
    if (active) {
        statusDot.className = 'status-dot status-active';
    } else {
        statusDot.className = 'status-dot status-inactive';
    }
    statusText.textContent = text;
}

// 視窗大小調整
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// 啟動 AR Session
async function activateXR() {
    try {
        console.log('正在啟動 AR...');
        
        // 檢查瀏覽器支援
        if (!navigator.xr) {
            alert('您的瀏覽器不支援 WebXR。請使用 Chrome Android。');
            updateStatus(false, '不支援 WebXR');
            return;
        }

        // 檢查 AR 支援
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        console.log('AR 支援檢查結果:', supported);
        
        if (!supported) {
            alert('您的裝置不支援 AR 功能。');
            updateStatus(false, '不支援 AR');
            return;
        }

        // 請求 XR Session
        const sessionInit = {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay', 'dom-overlay-for-handheld-ar'],
            domOverlay: { root: document.body }
        };

        console.log('正在請求 XR Session 並使用參數:', sessionInit);
        xrSession = await navigator.xr.requestSession('immersive-ar', sessionInit);
        console.log('XR Session 已建立:', xrSession);

        // 設定 renderer
        await renderer.xr.setSession(xrSession);
        console.log('Renderer XR session 已設定');

        // 獲取參考空間
        try {
            xrRefSpace = await xrSession.requestReferenceSpace('local');
            console.log('參考空間 (local) 已取得:', xrRefSpace);
        } catch (e) {
            console.warn('無法取得 local 參考空間，嘗試 viewer:', e);
            xrRefSpace = await xrSession.requestReferenceSpace('viewer');
            console.log('參考空間 (viewer) 已取得:', xrRefSpace);
        }

        // Session 結束時的處理
        xrSession.addEventListener('end', onSessionEnded);

        // 更新 UI
        startButton.textContent = '🛑 結束 AR';
        markerButton.disabled = false;
        instructionElement.textContent = '將相機對準地面，等待白色圓圈出現後點擊「放置訊號點」';
        updateStatus(true, 'AR 已啟動');
        isARActive = true;

        console.log('AR 已成功啟動');

        // 開始渲染循環
        renderer.setAnimationLoop((time, frame) => render(time, frame));

    } catch (error) {
        console.error('啟動 AR 時發生錯誤:', error);
        alert('啟動 AR 失敗: ' + error.message);
        updateStatus(false, '啟動失敗: ' + error.message);
    }
}

// Session 結束處理
function onSessionEnded() {
    console.log('AR Session 已結束');
    
    xrSession = null;
    hitTestSource = null;
    hitTestSourceRequested = false;
    firstMarkerPlaced = false;
    isARActive = false;

    startButton.textContent = '🚀 開始 AR';
    markerButton.disabled = true;
    instructionElement.textContent = '點擊「開始 AR」來啟動體驗';
    updateStatus(false, '已結束');

    renderer.setAnimationLoop(null);
}

// 渲染循環
function render(time, frame) {
    if (!frame || !xrRefSpace) return;

    // 初始化 hit test source
    if (!hitTestSourceRequested) {
        console.log('正在初始化 hit test source...');
        
        xrSession.requestHitTestSource({ 
            space: xrRefSpace
        }).then((source) => {
            hitTestSource = source;
            console.log('Hit test source 已建立:', source);
        }).catch((error) => {
            console.warn('Hit test source 請求失敗:', error);
            
            // 嘗試備用方法
            xrSession.requestHitTestSource({ 
                space: xrRefSpace,
                entityTypes: ['plane']
            }).then((source) => {
                hitTestSource = source;
                console.log('使用備用參數的 Hit test source 已建立:', source);
            }).catch((err) => {
                console.error('備用 hit test source 也失敗了:', err);
            });
        });

        hitTestSourceRequested = true;
    }

    // 執行 hit test
    if (hitTestSource) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);

        if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            const pose = hit.getPose(xrRefSpace);

            if (pose) {
                // 更新瞄準圈位置
                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);

                // 第一次偵測到地面時,自動放置第一個標記
                if (!firstMarkerPlaced) {
                    placeMarker();
                    firstMarkerPlaced = true;
                    instructionElement.textContent = '第一個訊號點已放置!移動後可繼續放置更多訊號點';
                }
            }
        } else {
            reticle.visible = false;
        }
    }

    // 為標記添加脈衝發光效果
    markers.forEach((marker, index) => {
        if (marker.children.length > 1) {
            const sphere = marker.children[1];
            if (sphere && sphere.material) {
                const pulseSpeed = 2;
                const pulseIntensity = 0.3 + Math.sin(time * 0.001 * pulseSpeed + index) * 0.2;
                sphere.material.emissiveIntensity = pulseIntensity;
            }
        }
    });

    renderer.render(scene, camera);
}

// 初始化應用程式
console.log('頁面已加載，開始初始化應用程式...');
init();

// 按鈕事件監聽
startButton.addEventListener('click', () => {
    console.log('開始按鈕被點擊');
    activateXR();
});

markerButton.addEventListener('click', () => {
    console.log('放置訊號點按鈕被點擊');
    placeMarker();
});

// 更新初始狀態
updateStatus(false, '未啟動');

console.log('WebXR AR 訊號點標記應用已初始化');
