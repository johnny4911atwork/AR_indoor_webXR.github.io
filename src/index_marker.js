import * as THREE from 'https://cdn.jsdelivr.net/npm/three@r128/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@r128/examples/jsm/loaders/GLTFLoader.js';
import { XRButton } from 'https://cdn.jsdelivr.net/npm/three@r128/examples/jsm/webxr/XRButton.js';
import { XRControllerModelFactory } from 'https://cdn.jsdelivr.net/npm/three@r128/examples/jsm/webxr/XRControllerModelFactory.js';

// 全局變數
let scene, camera, renderer;
let controller;
let waypoints = []; // 儲存所有訊號點
let hitTestSource = null;
let hitTestSourceRequested = false;
let userPosition = new THREE.Vector3();

// UI 元素
const addWaypointBtn = document.getElementById('add-waypoint-btn');
const clearBtn = document.getElementById('clear-btn');
const statusDiv = document.getElementById('status');
const errorMessage = document.getElementById('error-message');
const waypointCountSpan = document.getElementById('waypoint-count');
const posXSpan = document.getElementById('pos-x');
const posYSpan = document.getElementById('pos-y');
const posZSpan = document.getElementById('pos-z');

/**
 * 初始化 Three.js 場景
 */
function initScene() {
    // 創建場景
    scene = new THREE.Scene();

    // 創建相機
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    // 創建渲染器
    const canvas = document.getElementById('canvas');
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    // 添加光線
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    scene.add(light);

    // 添加 WebXR 按鈕
    document.body.appendChild(XRButton.createButton(renderer, {
        requiredFeatures: ['hit-test', 'dom-overlay', 'dom-overlay-for-handheld-ar'],
        optionalFeatures: ['hit-test-legacy'],
        domOverlay: { root: document.body }
    }));

    // 設置動畫循環
    renderer.xr.addEventListener('sessionstart', onSessionStart);
    renderer.xr.addEventListener('sessionend', onSessionEnd);
    renderer.setAnimationLoop(animate);

    // 監聽視窗大小變化
    window.addEventListener('resize', onWindowResize);
}

/**
 * 當 XR 會話開始時
 */
async function onSessionStart() {
    console.log('XR 會話已開始');
    statusDiv.textContent = 'AR 已啟動';

    const session = renderer.xr.getSession();
    
    // 請求 HitTest 源
    if (session.requestHitTestSource) {
        const space = await session.requestReferenceSpace('viewer');
        hitTestSource = await session.requestHitTestSource({ space });
        hitTestSourceRequested = true;
    }

    // 添加初始訊號點
    addWaypointAtScreenCenter();
}

/**
 * 當 XR 會話結束時
 */
function onSessionEnd() {
    console.log('XR 會話已結束');
    hitTestSourceRequested = false;
    hitTestSource = null;
    statusDiv.textContent = 'AR 已關閉';
}

/**
 * 創建訊號點視覺化模型
 */
function createWaypointVisual() {
    const group = new THREE.Group();

    // 創建中心球體
    const sphereGeometry = new THREE.SphereGeometry(0.05, 32, 32);
    const sphereMaterial = new THREE.MeshStandardMaterial({
        color: 0x4CAF50,
        emissive: 0x4CAF50,
        emissiveIntensity: 0.5,
        metalness: 0.5,
        roughness: 0.5
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    group.add(sphere);

    // 創建光暈環
    const ringGeometry = new THREE.TorusGeometry(0.1, 0.01, 16, 100);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x4CAF50,
        emissive: 0x4CAF50,
        emissiveIntensity: 0.8
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    // 創建垂直線（連接到地面）
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([0, 0, 0, 0, -0.5, 0]),
        3
    ));
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4CAF50, linewidth: 2 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    group.add(line);

    return group;
}

/**
 * 添加訊號點到場景
 */
function addWaypoint(position) {
    const visual = createWaypointVisual();
    visual.position.copy(position);
    scene.add(visual);

    const waypoint = {
        position: position.clone(),
        visual: visual,
        timestamp: new Date().toLocaleTimeString('zh-tw')
    };

    waypoints.push(waypoint);
    updateUI();

    console.log(`訊號點已添加: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
}

/**
 * 在屏幕中心放置訊號點
 */
function addWaypointAtScreenCenter() {
    // 使用相機前方一定距離的位置
    const distance = 1.0;
    const position = new THREE.Vector3(0, -0.5, -distance);
    const worldPosition = new THREE.Vector3();

    camera.getWorldPosition(worldPosition);
    const cameraForward = new THREE.Vector3(0, 0, -1);
    cameraForward.applyQuaternion(camera.quaternion);
    cameraForward.multiplyScalar(distance);

    worldPosition.add(cameraForward);
    worldPosition.y = -0.5; // 放在地面

    addWaypoint(worldPosition);
}

/**
 * 清除所有訊號點
 */
function clearWaypoints() {
    waypoints.forEach(waypoint => {
        scene.remove(waypoint.visual);
    });
    waypoints = [];
    updateUI();
    console.log('所有訊號點已清除');
}

/**
 * 更新 UI 顯示
 */
function updateUI() {
    waypointCountSpan.textContent = waypoints.length;

    if (waypoints.length > 0) {
        const lastWaypoint = waypoints[waypoints.length - 1];
        posXSpan.textContent = lastWaypoint.position.x.toFixed(2);
        posYSpan.textContent = lastWaypoint.position.y.toFixed(2);
        posZSpan.textContent = lastWaypoint.position.z.toFixed(2);
    }
}

/**
 * 顯示錯誤訊息
 */
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 3000);
}

/**
 * 處理視窗大小變化
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * 動畫循環
 */
function animate(time, frame) {
    // 更新用戶位置（相機位置）
    camera.getWorldPosition(userPosition);
    posXSpan.textContent = userPosition.x.toFixed(2);
    posYSpan.textContent = userPosition.y.toFixed(2);
    posZSpan.textContent = userPosition.z.toFixed(2);

    // 執行 HitTest（用於地面檢測）
    if (hitTestSourceRequested && frame) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);

        if (hitTestResults.length > 0) {
            // 可以在此處添加視覺反饋（例如光標）
        }
    }

    renderer.render(scene, camera);
}

/**
 * 事件監聽器
 */
addWaypointBtn.addEventListener('click', () => {
    if (!hitTestSourceRequested) {
        showError('請先啟動 AR 模式');
        return;
    }
    addWaypointAtScreenCenter();
});

clearBtn.addEventListener('click', () => {
    if (waypoints.length === 0) {
        showError('沒有訊號點可清除');
        return;
    }
    clearWaypoints();
});

// 初始化
window.addEventListener('load', () => {
    console.log('頁面已加載，正在初始化...');
    try {
        initScene();
        statusDiv.textContent = '點擊 "進入 AR" 開始';
    } catch (error) {
        console.error('初始化失敗:', error);
        showError('初始化失敗: ' + error.message);
    }
});
