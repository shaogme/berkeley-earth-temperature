let geojsonCache = null;
let loadPromise = null;
let cachedUrl = null;

export function loadBoundariesGeoJSON(url = './countries-land-1m.geo.json') {
    if (cachedUrl !== url) {
        geojsonCache = null;
        loadPromise = null;
        cachedUrl = url;
    }

    if (geojsonCache) {
        return Promise.resolve(geojsonCache);
    }
    if (loadPromise) {
        return loadPromise;
    }

    loadPromise = fetch(url)
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(geojson => {
            geojsonCache = geojson;
            return geojson;
        })
        .catch(error => {
            loadPromise = null;
            throw error;
        });

    return loadPromise;
}
