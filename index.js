import { coordAll } from '@turf/meta';
import { lineString } from '@turf/helpers';
import { getCoord } from '@turf/invariant';
import along from '@turf/along';
import lineLength from '@turf/length';
import bearing from '@turf/bearing';
import * as R from 'ramda';

const TOLERANCE = 0.000001;
const floatEquals = (f1, f2) => Math.abs(f1 - f2) < TOLERANCE;
const coordEquals = (c1 = [], c2 = []) => floatEquals(c1[0], c2[0]) && floatEquals(c1[1], c2[1]);
const asKey = coord => `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;

// find the point at the given distance ratio on the linestring
const project = R.curry((ratio, ls) => {
  const length = lineLength(ls);
  const lngLat = getCoord(along(ls, length * ratio));
  // keep the local bearing of the line to later choose an anchor minimizing the portion of line covered.
  const localLineBearing = bearing(
    along(ls, length * (ratio - 0.1)),
    along(ls, length * (ratio + 0.1))
  );

  return { lngLat, localLineBearing };
});

function distinctSegment(coordinates, coordCounts) {
  const longestDistinctSegment = R.pipe(
    R.map(coord => coordCounts.get(asKey(coord)) > 1 ? undefined : coord),
    R.groupWith((a, b) => a && b),
    R.reject(a => !a[0]),
    R.reduce((longest, current) => current.length > longest.length ? current : longest, []),
  )(coordinates);
  
  return lineString(longestDistinctSegment.length === 0
    ? coordinates
    : longestDistinctSegment,
  );
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

const toSimpleLinestring = R.pipe(
  coordAll,
  R.dropRepeatsWith(coordEquals),
  lineString,
);

// Reduce possibilities of collision by chosing anchors so that labels repulse each other
function optimizeAnchors(positions) {
  return positions.map((position, index) => {
    const others = R.remove(index, 1, positions);
    const othersBearing = getBearingFromOtherPoints(position, others);
    return {
      lngLat: position.lngLat,
      anchor: getAnchor(position, othersBearing),
    };
  });
}

function getBearingFromOtherPoints(position, others) {
  return R.pipe(
    R.map(other => bearing(other.lngLat, position.lngLat)),
    R.mean,
    R.defaultTo(0),
  )(others);
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
  return R.pipe(
    R.prop('features'),
    R.map(toSimpleLinestring),
    findDistinctSegments,
    R.map(project(0.5)),
    optimizeAnchors,
  )(featureCollection);
}
