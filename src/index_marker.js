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

// UI 元素
const startButton = document.getElementById('start-button');
const markerButton = document.getElementById('marker-button');
const markerCountElement = document.getElementById('marker-count');
const instructionElement = document.getElementById('instruction');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

// 初始化場景
function init() {
    // 建立場景
    scene = new THREE.Scene();

    // 建立相機
    camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        20
    );

    // 建立環境光
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // 建立 WebGL renderer
    renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

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

    // 編號文字 (使用簡單的幾何圖形)
    const numberGroup = createNumberLabel(markerCount);
    numberGroup.position.y = 0.5;
    markerGroup.add(numberGroup);

    // 設定位置
    markerGroup.position.copy(position);

    // 加入場景
    scene.add(markerGroup);
    markers.push(markerGroup);

    // 增加動畫效果
    animateMarkerAppearance(markerGroup);

    return markerGroup;
}

// 建立編號標籤
function createNumberLabel(number) {
    const group = new THREE.Group();
    
    // 背景圓盤
    const bgGeometry = new THREE.CircleGeometry(0.08, 32);
    const bgMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.7
    });
    const bg = new THREE.Mesh(bgGeometry, bgMaterial);
    group.add(bg);

    return group;
}

// 標記出現動畫
function animateMarkerAppearance(marker) {
    const originalScale = { x: 1, y: 1, z: 1 };
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
        
        marker.scale.set(
            originalScale.x * easeProgress,
            originalScale.y * easeProgress,
            originalScale.z * easeProgress
        );

        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }

    animate();
}

// 放置標記
function placeMarker(useCamera = false) {
    let position = new THREE.Vector3();
    
    if (useCamera || !reticle || !reticle.visible) {
        // 如果沒有 hit test 或瞄準圈不可見,在相機前方 1.5 米處放置
        camera.getWorldPosition(position);
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(camera.quaternion);
        direction.y = 0; // 保持在地平面
        direction.normalize();
        position.add(direction.multiplyScalar(1.5));
        position.y = 0; // 設定在地面高度
    } else {
        // 使用 reticle 位置
        position.setFromMatrixPosition(reticle.matrix);
    }
    
    createMarker(position);
    markerCount++;
    updateUI();
    
    console.log(`訊號點 #${markerCount} 已放置在:`, position);
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
        // 檢查瀏覽器支援
        if (!navigator.xr) {
            alert('您的瀏覽器不支援 WebXR。請使用支援 AR 的瀏覽器(如 Chrome Android)。');
            return;
        }

        // 檢查 AR 支援
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        if (!supported) {
            alert('您的裝置不支援 AR 功能。');
            return;
        }

        // 請求 XR Session
        xrSession = await navigator.xr.requestSession('immersive-ar', {
                        requiredFeatures: ['local'],
                        optionalFeatures: ['dom-overlay', 'hit-test', 'anchors'],
                        domOverlay: { root: document.body }
                    });

        // 設定 renderer
        await renderer.xr.setSession(xrSession);

        // Session 結束時的處理
        xrSession.addEventListener('end', onSessionEnded);

        // 更新 UI
        startButton.textContent = '🛑 結束 AR';
        startButton.onclick = () => xrSession.end();
        markerButton.disabled = false;
        instructionElement.textContent = '將相機對準地面,白色圓圈會顯示放置位置';
        updateStatus(true, 'AR 已啟動');

        // 開始渲染循環
        renderer.setAnimationLoop(render);

    } catch (error) {
        console.error('啟動 AR 時發生錯誤:', error);
        alert('啟動 AR 失敗: ' + error.message);
        updateStatus(false, '啟動失敗');
    }
}

// Session 結束處理
function onSessionEnded() {
    xrSession = null;
    hitTestSource = null;
    hitTestSourceRequested = false;
    firstMarkerPlaced = false;

    startButton.textContent = '🚀 開始 AR';
    startButton.onclick = activateXR;
    markerButton.disabled = true;
    instructionElement.textContent = '點擊「開始 AR」來啟動體驗';
    updateStatus(false, '已結束');

    renderer.setAnimationLoop(null);
}

// 渲染循環
function render(timestamp, frame) {
    if (frame) {
        // 初始化 hit test source
        if (!hitTestSourceRequested) {
            xrSession.requestReferenceSpace('local').then((referenceSpace) => {
                xrSession.requestHitTestSource({ space: referenceSpace }).then((source) => {
                    hitTestSource = source;
                }).catch((error) => {
                    console.error('Hit test source 請求失敗:', error);
                    instructionElement.textContent = '此裝置不支援地面偵測功能';
                });
            }).catch((error) => {
                console.error('Reference space 請求失敗:', error);
                instructionElement.textContent = '此裝置不支援所需的參考空間';
            });

            hitTestSourceRequested = true;
        }

        // 執行 hit test
        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const pose = hit.getPose(renderer.xr.getReferenceSpace());

                // 更新瞄準圈位置
                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);

                // 第一次偵測到地面時,自動放置第一個標記
                if (!firstMarkerPlaced) {
                    placeMarker(false);
                    firstMarkerPlaced = true;
                    instructionElement.textContent = '第一個訊號點已放置!移動後可繼續放置更多訊號點';
                }
            } else {
                reticle.visible = false;
            }
        } else {
            // 如果沒有 hit test,第一次進入時自動在相機前方放置標記
            if (!firstMarkerPlaced && frame.session) {
                placeMarker(true);
                firstMarkerPlaced = true;
                instructionElement.textContent = '第一個訊號點已放置!點擊按鈕在前方放置更多訊號點';
            }
        }

        // 為標記添加微微旋轉動畫
        markers.forEach((marker, index) => {
            // 頂部球體發光效果
            const sphere = marker.children[1];
            if (sphere) {
                const pulseSpeed = 2;
                const pulseIntensity = 0.3 + Math.sin(timestamp * 0.001 * pulseSpeed + index) * 0.2;
                sphere.material.emissiveIntensity = pulseIntensity;
            }
        });
    }

    renderer.render(scene, camera);
}

// 初始化應用程式
init();

// 按鈕事件監聽
startButton.addEventListener('click', activateXR);
markerButton.addEventListener('click', placeMarker);

// 更新初始狀態
updateStatus(false, '未啟動');

console.log('WebXR AR 訊號點標記應用已初始化');
