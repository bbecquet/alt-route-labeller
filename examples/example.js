function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds - h * 3600) / 60);
  return `${h > 0 ? h+' h ' : ''}${m} min`;
}

function altRouteLabelExampleMap(mapElement, options) {
  const map = L.map(mapElement, {
    maxZoom: 15,
    zoomSnap: 0,
    // doubleClickZoom: false,
    // dragging: false,
    // boxZoom: false,
    // scrollWheelZoom: false,
    // touchZoom: false,
    zoomControl: false,
    attributionControl: false,
  })
    .addControl(L.control.attribution({ prefix: false }))
    .addLayer(L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data &copy; <a href="//osm.org/copyright">OSM</a> contributors',
    }));

  const lineStyles = [
    { color: 'red' },
    { color: 'blue' },
    { color: 'green' },
  ];

  const anchorToDirection = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  };

  fetch(options.file)
    .then(response => response.json())
    .then(geojson => {
      let i = 0;
      let origin, destination;
      const lines = L.geoJSON(geojson, {
        style: () => ({
          interactive: false,
          dashArray: '4 12',
          weight: 4,
        }),
        onEachFeature: (feature, layer) => {
          origin = L.GeoJSON.coordsToLatLng(feature.geometry.coordinates[0]);
          destination = L.GeoJSON.coordsToLatLng(feature.geometry.coordinates[feature.geometry.coordinates.length - 1]);
          layer.setStyle({
            ...lineStyles[i],
            dashOffset: i * 4,
          });
          i++;
        }
      }).addTo(map);

      map
        .fitBounds(lines.getBounds(), { padding: [30, 30] })
        .addLayer(L.marker(origin, {
          icon: L.divIcon({ className: 'endPoint-marker endPoint-marker--origin' }),
          interactive: false,
        }))
        .addLayer(L.marker(destination, {
          icon: L.divIcon({ className: 'endPoint-marker endPoint-marker--destination' }),
          interactive: false,
        }));
      
      const labelPositions = altRouteLabeller.getLabelPositions(geojson)
        .map(labelPosition => ({
          latLng: L.GeoJSON.coordsToLatLng(labelPosition.lngLat),
          direction: anchorToDirection[labelPosition.anchor],
        }));

      const labels = labelPositions.map((position, index) => {
        const feature = geojson.features[index];
        return L.circleMarker(position.latLng, {
          opacity: 0,
          fillOpacity: 0,
          interactive: false,
        })
          .bindTooltip(formatDuration(feature.properties.duration), {
            permanent: true,
            opacity: 1,
            interactive: false,
            direction: position.direction,
          });
      });
      L.layerGroup(labels).addTo(map);
    });
}