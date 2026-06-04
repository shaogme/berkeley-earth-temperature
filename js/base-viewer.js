export class BaseViewer {
    constructor() {
        this.currentTempData = null;
        this.opacity = 0.8;
        this.isActive = false;
    }

    init() {
        throw new Error('init() must be implemented');
    }

    updateTemperatureTexture(arrayData) {
        this.currentTempData = arrayData;
    }

    setTemperatureOpacity(opacity) {
        this.opacity = opacity;
    }

    getLatLonFromClick(event) {
        return null;
    }

    show() {
        this.isActive = true;
    }

    hide() {
        this.isActive = false;
    }

    destroy() {}
}
