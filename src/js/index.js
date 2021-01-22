import * as d3 from "d3";
import _ from "lodash";
import tilebelt from "@mapbox/tilebelt";
import * as turf from '@turf/turf'
import mapboxgl from 'mapbox-gl';
import dataRaw from './data.js';

// globals
const STATE = {"is_paused": false, "date_ix": 0};

// set global control
document.getElementById("pauseplay").onclick = () => {
  STATE.is_paused = !STATE.is_paused;

  if (!STATE.is_paused) {
    const fc = makeFeatCollection(scaledFeatures);
    STATE.date_ix += 1
    incrementMappedDay(map, fc, sortedDays, STATE.date_ix);
  }
}

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

  // also add circles layer if in certain day timeframe
  if (["2021-01-05", "2021-01-06", "2021-01-07"].includes(sortedDays[want])) {
    map.setLayoutProperty("redCircles", "visibility", "visible");
    map.setLayoutProperty("redCirclesLabel", "visibility", "visible");
  } else {
    map.setLayoutProperty("redCircles", "visibility", "none");
    map.setLayoutProperty("redCirclesLabel", "visibility", "none");
  }

  // update names
  _.map(document.getElementsByClassName("date"), d => {
    const date = sortedDays[want];
    if (d.innerText == date.slice(5)) {
      d.className = "date live";
    } else {
      d.className = "date";
    }
  });

  // trigger the loop
  setTimeout(() => {
    if (!STATE.is_paused) {
      STATE.date_ix += 1
      incrementMappedDay(map, featCollection, sortedDays, STATE.date_ix);
    }
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

function boundsToPolygon(bounds) {
  return [[
    [bounds[0], bounds[1]],
    [bounds[2], bounds[1]],
    [bounds[2], bounds[3]],
    [bounds[0], bounds[3]],
    [bounds[0], bounds[1]],
  ]]
}

function makeFeature(geomType, props, coords) {
  return {
    "type": "Feature",
    "properties": props,
    "geometry": {
      "type": geomType,
      "coordinates": coords,
    },
  }
}

function createCirclesFeatCollection() {
  // make the 2 circles for the capitol and white house
  const sar = turf.buffer(turf.point([-77.0365458726883,38.891863716028645]), 750, {units: "meters"});
  sar.properties.title = "Save America Rally";
  const cap = turf.buffer(turf.point([-77.01251864433289,38.889788561664936]), 750, {units: "meters"});
  cap.properties.title = "US Capitol";
  return makeFeatCollection([sar, cap]);
}

function generateRedCirclesCallout(map) {
  map.addSource('redCircles', {
    'type': 'geojson',
    'data': createCirclesFeatCollection(),
  });

  map.addLayer({
    'id': 'redCircles',
    'type': 'line',
    'source': 'redCircles',
    'paint': {
      'line-color': 'red',
      'line-width': 3,
      'line-opacity': 1,
    },
  });
  
  map.addLayer({
    'id': 'redCirclesLabel',
    'type': 'symbol',
    'source': 'redCircles',
    'layout': {
      'text-field': ['get', 'title'],
      
    },
    'paint': {
        'text-color': 'red'
    }
  });

}

// set access token
mapboxgl.accessToken = "pk.eyJ1Ijoia3VhbmIiLCJhIjoidXdWUVZ2USJ9.qNKXXP6z9_fKA8qrmpOi6Q";

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
// const denominator = _.maxBy(parsed, "sum_activity_index_quadkey")["sum_activity_index_quadkey"];
const denominator = d3.quantile(_.map(_.sortBy(parsed, p => p.sum_activity_index_quadkey), p => p.sum_activity_index_quadkey), 0.98);
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

  const coords = boundsToPolygon(p.bounds);
  return makeFeature("Polygon", props, coords)
});

// now that we have denom, make legend
makeLegend(denominator);

// get unique days
const sortedDays = _.sortBy(_.uniq(_.map(parsed, p => p.day)));

// populate list of dates across top
_.forEach(sortedDays, d => {
  const newDiv = document.createElement("div");
  newDiv.className = "date";
  newDiv.innerText = d.slice(5);
  const parentD = document.getElementById("dates");
  parentD.appendChild(newDiv);
});

const centerMap = [-77.01216459274292, 38.90262264887739];
const startMapZoom = 13;
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/dark-v10',
  center: centerMap,
  zoom: startMapZoom
});
map.on('load', () => {
  generateSourceAndLayer(map);
  generateRedCirclesCallout(map);
  const fc = makeFeatCollection(scaledFeatures);
  const bb = turf.envelope(fc).bbox;
  const bnds = [[bb[0], bb[1]], [bb[2], bb[3]]]
  map.fitBounds(bnds);
  incrementMappedDay(map, fc, sortedDays, STATE.date_ix);
});
