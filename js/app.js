import { GlobeViewer } from './globe-viewer.js';

class App {
    constructor() {
        this.viewer = new GlobeViewer();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.currentCoords = null;
        this.historyList = [];

        this.copyBtn = document.getElementById('copy-btn');
        this.resultContent = document.getElementById('result-content');
        this.historySection = document.getElementById('history-section');
        this.historyListEl = document.getElementById('history-list');

        this.initEvents();
        this.viewer.start();
    }

    initEvents() {
        window.addEventListener('click', (e) => this.onMouseClick(e), false);
        this.copyBtn.addEventListener('click', () => this.copyToClipboard());
    }

    onMouseClick(event) {
        if (event.target.closest('#info') || event.target.closest('.tips')) {
            return;
        }

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.viewer.camera);
        const intersects = this.raycaster.intersectObject(this.viewer.earth);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            const latLng = this.getLatLngFromVector3(point);
            const localPoint = this.viewer.earth.worldToLocal(point.clone());
            this.selectCoordinate(latLng, localPoint);
        }
    }

    getLatLngFromVector3(vector) {
        const localPoint = vector.clone().normalize();
        const lat = Math.asin(localPoint.y) * (180 / Math.PI);
        let lng = -Math.atan2(localPoint.z, localPoint.x) * (180 / Math.PI);

        if (lng > 180) lng -= 360;
        if (lng < -180) lng += 360;

        return { lat: lat, lng: lng };
    }

    selectCoordinate(latLng, localPoint) {
        this.currentCoords = latLng;

        this.resultContent.innerHTML = `
            <div class="coordinate-row">
                <span class="coord-label">经度 (Lng)</span>
                <span class="coord-val">${latLng.lng.toFixed(5)}°</span>
            </div>
            <div class="coordinate-row">
                <span class="coord-label">纬度 (Lat)</span>
                <span class="coord-val">${latLng.lat.toFixed(5)}°</span>
            </div>
        `;

        this.copyBtn.disabled = false;
        this.copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            复制坐标
        `;

        this.viewer.markerGroup.position.copy(localPoint);
        const normal = localPoint.clone().normalize();
        this.viewer.markerGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        this.viewer.markerGroup.visible = true;

        this.viewer.markerRing.scale.set(1, 1, 1);
        this.viewer.ringMat.opacity = 0.9;

        this.addHistoryRecord(latLng, localPoint);
    }

    addHistoryRecord(latLng, localPoint) {
        const timeStr = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const item = { latLng, localPoint, timeStr };

        if (this.historyList.length > 0 &&
            Math.abs(this.historyList[0].latLng.lat - latLng.lat) < 0.0001 &&
            Math.abs(this.historyList[0].latLng.lng - lng) < 0.0001) {
            return;
        }

        this.historyList.unshift(item);
        if (this.historyList.length > 3) {
            this.historyList.pop();
        }

        this.renderHistory();
    }

    renderHistory() {
        this.historySection.style.display = 'block';
        this.historyListEl.innerHTML = '';

        this.historyList.forEach((item) => {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.innerHTML = `
                <span class="history-coords">${item.latLng.lng.toFixed(3)}°, ${item.latLng.lat.toFixed(3)}°</span>
                <span class="history-time">${item.timeStr}</span>
            `;
            li.addEventListener('click', () => {
                this.selectCoordinate(item.latLng, item.localPoint);
            });
            this.historyListEl.appendChild(li);
        });
    }

    copyToClipboard() {
        if (!this.currentCoords) return;
        const textToCopy = `${this.currentCoords.lng.toFixed(6)}, ${this.currentCoords.lat.toFixed(6)}`;

        navigator.clipboard.writeText(textToCopy).then(() => {
            this.copyBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="green" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                已成功复制
            `;
            setTimeout(() => {
                if (this.currentCoords) {
                    this.copyBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        复制坐标
                    `;
                }
            }, 2000);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new App();
});
