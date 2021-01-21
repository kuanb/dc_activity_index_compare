import * as d3 from "d3";
import _ from "lodash";
import tilebelt from "@mapbox/tilebelt";
import mapboxgl from 'mapbox-gl';
import dataRaw from './data.js';

function generateSourceAndLayer(map) {
  map.addSource('resultSource', {
    'type': 'geojson',
    'data': null,
  });

  map.addLayer({
    'id': 'resultLayer',
    'type': 'fill',
    'source': 'resultSource',
    'paint': {
      'fill-color': ['get', 'color'],
      'fill-opacity': 0.8,
    },
  });
}

function makeFeatCollection(features) {
  return {
    'type': 'FeatureCollection',
    'features': features,
  };
}

function filterToDate(collection, date) {
  const subsetFeatures = _.filter(collection.features, c => {
    return c.properties.date == date
  });
  return makeFeatCollection(subsetFeatures);
}

function incrementMappedDay(map, featCollection, sortedDays, ix) {
  const want = ix%sortedDays.length;
    const toSet = filterToDate(featCollection, sortedDays[want]);
    map.getSource("resultSource").setData(toSet);
    document.getElementById("date").innerText = sortedDays[want];

    // trigger the loop
    setTimeout(() => {
      incrementMappedDay(map, featCollection, sortedDays, ix+1);
    }, 1000);
}

function makeLegend(denominator) {
  var l = document.getElementById("legend");
  var r = _.range(0, 1.1, 0.1)
  _.forEach(r, v => {
    const d = document.createElement("div");
    const s1 = document.createElement("span");
    s1.style.background = d3.interpolateViridis(v);
    d.appendChild(s1);

    const s2 = document.createElement("span");
    s2.textContent = (v * denominator).toFixed(2)
    d.appendChild(s2);

    l.appendChild(d);
  })
  
}

// set access token
mapboxgl.accessToken = 'pk.eyJ1Ijoia3VhbmIiLCJhIjoidXdWUVZ2USJ9.qNKXXP6z9_fKA8qrmpOi6Q';

// parse raw time series quadkey data
const parsed = _.map(d3.csvParse(dataRaw), p => {
  p.bounds = _.map(p.bounds.split(", "), Number);
  p.day = p.day.split("T")[0];
  p.sum_activity_index_quadkey = Number(p.sum_activity_index_quadkey);
  p.lat = Number(p.xlat);
  p.lon = Number(p.xlon);
  delete p.xlat;
  delete p.xlon;
  return p;
});

// convert to a feature collection
const denominator = _.maxBy(parsed, "sum_activity_index_quadkey")["sum_activity_index_quadkey"];
const scaledFeatures = _.map(parsed, p => {
  const ratio = Math.min(
    Math.max(
      p.sum_activity_index_quadkey / denominator,
      0.1),
    1);

  const props = {
    "date": p.day,
    "ratio": ratio,
    "color": d3.interpolateViridis(ratio),
  };

  const b = p.bounds;
  return {
    "type": "Feature",
    "properties": props,
    "geometry": {
      "type": "Polygon",
      "coordinates": [[
        [b[0], b[1]],
        [b[2], b[1]],
        [b[2], b[3]],
        [b[0], b[3]],
        [b[0], b[1]],
      ]],
    },
  }
});

// now that we have denom, make legend
makeLegend(denominator);

// get unique days
const sortedDays = _.sortBy(_.uniq(_.map(parsed, p => p.day)));

const centerMap = [-77.01536178588867, 38.892769750328455];
const startMapZoom = 13;
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v10',
    center: centerMap,
    zoom: startMapZoom
});
map.on('load', () => {
    generateSourceAndLayer(map);
    incrementMappedDay(map, makeFeatCollection(scaledFeatures), sortedDays, 0)
})