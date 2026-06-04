let geojsonCache = null;
let loadPromise = null;

export function loadBoundariesGeoJSON() {
    if (geojsonCache) {
        return Promise.resolve(geojsonCache);
    }
    if (loadPromise) {
        return loadPromise;
    }

    const geojsonUrl = './countries-land-1m.geo.json';
    loadPromise = fetch(geojsonUrl)
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(geojson => {
            geojsonCache = geojson;
            return geojson;
        });

    return loadPromise;
}
