const PROXY_BASE = 'https://berkeley-earth-temperature-proxy.shaog.workers.dev';

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
            if (!response.ok) throw new Error(`Local fetch status: ${response.status}`);
            return response.json();
        })
        .catch(localError => {
            console.warn(`Failed to fetch GeoJSON locally from ${url}. Falling back to remote proxy...`, localError);
            const fileName = url.substring(url.lastIndexOf('/') + 1);
            const remoteUrl = `${PROXY_BASE}/countries-land/${fileName}`;
            return fetch(remoteUrl).then(response => {
                if (!response.ok) throw new Error(`Remote fetch status: ${response.status}`);
                return response.json();
            });
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
