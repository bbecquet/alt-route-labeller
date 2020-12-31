import { coordAll } from '@turf/meta';
import { lineString } from '@turf/helpers';
import { getCoord } from '@turf/invariant';
import along from '@turf/along';
import lineLength from '@turf/length';
import bearing from '@turf/bearing';

// find the point at the given distance ratio on the linestring
function project(ratio, ls) {
  const length = lineLength(ls);
  const lngLat = getCoord(along(ls, length * ratio));
  /// keep the local bearing of the line to later choose an anchor minimizing the portion of line covered.
  const localLineBearing = bearing(
    along(ls, length * (ratio - 0.1)),
    along(ls, length * (ratio + 0.1))
  );

  return { lngLat, localLineBearing };
}

const asKey = coord => `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;

function distinctSegment(coordinates, coordCounts) {
  // a distinct segment is a part of a line where coordinates
  // appear only once accross all the features
  const start = coordinates.findIndex(coord => coordCounts.get(asKey(coord)) === 1);
  // in some rare cases, an alternative will share all its parts with others.
  // when this happens, just return the whole line
  if (start === -1) {
    return lineString(coordinates);
  }
  const end = start + coordinates
    .slice(start)
    .findIndex(coord => coordCounts.get(asKey(coord)) !== 1);

  return lineString(coordinates.slice(start, end));
}

// extract the first segment of each linestring
// whose coordinates don't overlap with another feature
export function findDistinctSegments(linestrings) {
  if (linestrings.length < 2) {
    return linestrings;
  }
  // extract raw coordinates
  const featuresCoords = linestrings.map(coordAll);
  // count occurences of each coordinate accross all features
  const coordCounts = new Map();
  [].concat(...featuresCoords).forEach(coord => {
    coordCounts.set(asKey(coord), (coordCounts.get(asKey(coord)) || 0) + 1);
  });
  return featuresCoords.map(coordinates => distinctSegment(coordinates, coordCounts));
}

const toSimpleLinestring = geoJson => lineString(dropRepeatedCoords(coordAll(geoJson)));

const TOLERANCE = 0.000001;
const floatEquals = (f1, f2) => Math.abs(f1 - f2) < TOLERANCE;

const coordEquals = (c1 = [], c2 = []) => floatEquals(c1[0], c2[0]) && floatEquals(c1[1], c2[1]);

function dropRepeatedCoords(list) {
  const result = [];
  for (let i = 0; i < list.length; i++) {
    if (!coordEquals(result[result.length - 1], list[i])) {
      result.push(list[i]);
    }
  }
  return result;
}

// Reduce possibilities of collision by chosing anchors so that labels repulse each other
function optimizeAnchors(positions) {
  return positions.map((position, index) => {
    const others = [
      ...positions.slice(0, index),
      ...positions.slice(index + 1),
    ];
    const othersBearing = getBearingFromOtherPoints(position, others);
    return {
      lngLat: position.lngLat,
      anchor: getAnchor(position, othersBearing),
    };
  });
}

function getBearingFromOtherPoints(position, others) {
  if (others.length === 0) {
    return 0;
  }
  return others
    .map(other => bearing(other.lngLat, position.lngLat))
    .reduce((sum, current) => sum + current)
    / others.length;
}

function getAnchor(position, otherBearing) {
  const axis = (Math.abs(position.localLineBearing) < 45 || Math.abs(position.localLineBearing) > 135)
    ? 'vertical'
    : 'horizontal';

  if (axis === 'vertical') {
    return otherBearing > 0 ? 'left' : 'right';
  }
  return Math.abs(otherBearing) < 90 ? 'bottom' : 'top';
}

export function getLabelPositions(featureCollection) {
  const lineStrings = featureCollection.features.map(toSimpleLinestring);
  const distinctSegments = findDistinctSegments(lineStrings);
  const positions = distinctSegments.map(branchCoords => project(0.5, branchCoords));
  const optimizedPositions = optimizeAnchors(positions);
  return optimizedPositions;
}
