import findPath from './dijkstra.js';
import preprocess from './preprocessor.js';
import { compactNode } from './compactor.js';
import roundCoord from './round-coord.js';

export default class PathFinder {
    constructor(graph, options) {
        options = options || {};

        if (!graph.compactedVertices) {
            graph = preprocess(graph, options);
        }

        this._graph = graph;
        this._keyFn = options.keyFn || function (c) {
            return c.join(',');
        };
        this._precision = options.precision || 1e-5;
        this._options = options;

        if (Object.keys(this._graph.compactedVertices).filter(function (k) { return k !== 'edgeData'; }).length === 0) {
            throw new Error('Compacted graph contains no forks (topology has no intersections).');
        }
    }

    // chris: I added this function. L is L from leaflet, which this package doesn't have direct access to.
    nearestRoad(L, map, layer, point) {
        const cl = L.GeometryUtil.closestLayer(map, layer.getLayers(), point);
        console.log('cl', cl);
        const closest = cl.latlng;
        closest.weight = cl.layer.feature?.properties?.weight ?? 1;
        const segments = cl.layer._latlngs;
        if (segments.length === 2) return [closest, segments[0], segments[1]];

        let dToS = map.distance(closest, segments[0]);
        for (let i = 0; i < segments.length - 1; i++) {
            const dToE = map.distance(closest, segments[i + 1]);
            const dt = map.distance(segments[i], segments[i + 1]);
            // TODO: Improve this threshold and try to get higher accuracy.
            // NOTE: I don't know what the note above means.
            if (Math.abs((dToS + dToE) - dt) <= 0.05) return [closest, segments[i], segments[i + 1]];

            dToS = dToE;
        }

        return [closest, {}, {}];
    }

    // chris: I added this function
    toPoint(l) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [l.lng, l.lat] } };
    }

    // Here's the changes I think need to be made, basically. Note that there's a non-working
    // version of this that the map builder uses, I need to figure out why it doesn't work.
    // This only works if a and b are points in the graph, to fix that to work with points on
    // a line we need to:
    // 1. Find the line on which each point exists.
    // 2. Each line is two points. a1, a2, b1, and b2.
    // 3. Find paths from a1 to b1, a1 to b2, a2 to b1, and a2 to b2.
    // 4. Each path weight should also include the weights to a and b where needed, i.e. The
    //      path isn't a1->b1, it's a->a1->b1->b. This needs to be found by getting the distance
    //      from the point to the vertex then multiplying it by the weight factor of the segment,
    //      which may not be available at this point in the code, in which case I'll need a way
    //      either get it to here or a way to derive it (like dividing the calculated segment
    //      weight by the real physical distance, but this would be a last resort).
    // 5. Compare the weights of the 4 total paths, including alternatives if present. I think I
    //    want to return the top 3, and then I'll decide how to display them on the UI side.
    findPath(L, map, layer, a, b) {
        const [a0, a1, a2] = this.nearestRoad(L, map, layer, [a.lat, a.lng]);
        const [b0, b1, b2] = this.nearestRoad(L, map, layer, [b.lat, b.lng]);

        console.log('a', a0, a1, a2);
        console.log('b', b0, b1, b2);
        // If these points are on the same segment.
        if ((a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1)) {
            return {
                weight: map.distance(a0, b0) * a0.weight, // a weight and b weight should be the same.
                path: [
                    [a0.lng, a0.lat],
                    [b0.lng, b0.lat]
                ],
            };
        }

        // Attempt to find a direct route between the points, i.e. they're both vertices in the graph.
        const direct = this._findPath(this.toPoint(a0), this.toPoint(b0));
        if (direct != null) return direct;

        // Test if either of the points is on a vertex.
        const l1r = roundCoord([a0.lng, a0.lat], this._precision);
        const a1r = roundCoord([a1.lng, a1.lat], this._precision);
        const b1r = roundCoord([a2.lng, a2.lat], this._precision);
        const l2r = roundCoord([b0.lng, b0.lat], this._precision);
        const a2r = roundCoord([b1.lng, b1.lat], this._precision);
        const b2r = roundCoord([b2.lng, b2.lat], this._precision);

        const equalPoint = (c, d) => c[0] === d[0] && c[1] === d[1];

        const path = this._findPathWithExtraPoints(L, map, a0, b0, [
            [a1, b1, equalPoint(l1r, a1r), equalPoint(l2r, a2r)],
            [a1, b2, equalPoint(l1r, a1r), equalPoint(l2r, b2r)],
            [a2, b1, equalPoint(l1r, b1r), equalPoint(l2r, a2r)],
            [a2, b2, equalPoint(l1r, b1r), equalPoint(l2r, b2r)],
        ]);

        if (path != null) {
            path.path.unshift([a0.lng, a0.lat]);
            path.path.push([b0.lng, b0.lat]);
        }

        return path;
    }

    /**
     * Finds the shortest path that takes into account the non-vertex points
     * @param {*} l1 - Real Starting Point
     * @param {*} l2 - Real Ending Point
     * @param {*} queue - List of sets of vertices to check between, and whether either
     *                    is equivalent to l1 or l2, i.e. [v1, v2, isV1L1, isV2L2]
     */
    _findPathWithExtraPoints(L, map, l1, l2, queue) {
        const p = queue.pop();
        const path = this._findPath(this.toPoint(p[0]), this.toPoint(p[1]));

        if (path != null) {
            // Add extra points and weight if the point isn't the vertex.
            if (!p[2]) {
                path.weight += map.distance(p[0], l1) * l1.weight;
                path.path.unshift([p[0].lng, p[0].lat]);
            }

            if (!p[3]) {
                path.weight += map.distance(p[1], l2) * l2.weight;
                path.path.push([p[1].lng, p[1].lat]);
            }
        }

        if (queue.length === 0) return path;

        const next = this._findPathWithExtraPoints(L, map, l1, l2, queue);
        if (path == null) return next;
        if (next == null) return path;

        // TODO: Maybe make this return them in a list to be sorted so I can provide alternates.
        return path.weight < next.weight ? path : next;
    }

    // This is the original findPath function, which is now internal.
    _findPath(a, b) {
        let start = this._keyFn(roundCoord(a.geometry.coordinates, this._precision));
        let finish = this._keyFn(roundCoord(b.geometry.coordinates, this._precision));

        // We can't find a path if start or finish isn't in the
        // set of non-compacted vertices
        if (!this._graph.vertices[start] || !this._graph.vertices[finish]) {
            return null;
        }

        var phantomStart = this._createPhantom(start);
        var phantomEnd = this._createPhantom(finish);

        var path = findPath(this._graph.compactedVertices, start, finish);

        if (path) {
            var weight = path[0];
            path = path[1];
            return {
                path: path.reduce(function buildPath(cs, v, i, vs) {
                    if (i > 0) {
                        cs = cs.concat(this._graph.compactedCoordinates[vs[i - 1]][v]);
                    }

                    return cs;
                }.bind(this), []).concat([this._graph.sourceVertices[finish]]),
                weight: weight,
                edgeDatas: this._graph.compactedEdges
                    ? path.reduce(function buildEdgeData(eds, v, i, vs) {
                        if (i > 0) {
                            eds.push({
                                reducedEdge: this._graph.compactedEdges[vs[i - 1]][v]
                            });
                        }

                        return eds;
                    }.bind(this), [])
                    : undefined
            };
        } else {
            return null;
        }

        this._removePhantom(phantomStart);
        this._removePhantom(phantomEnd);
    }

    serialize() {
        return this._graph;
    }

    _createPhantom(n) {
        if (this._graph.compactedVertices[n]) return null;

        var phantom = compactNode(n, this._graph.vertices, this._graph.compactedVertices, this._graph.sourceVertices, this._graph.edgeData, true, this._options);
        this._graph.compactedVertices[n] = phantom.edges;
        this._graph.compactedCoordinates[n] = phantom.coordinates;

        if (this._graph.compactedEdges) {
            this._graph.compactedEdges[n] = phantom.reducedEdges;
        }

        Object.keys(phantom.incomingEdges).forEach(function (neighbor) {
            this._graph.compactedVertices[neighbor][n] = phantom.incomingEdges[neighbor];
            this._graph.compactedCoordinates[neighbor][n] = [this._graph.sourceVertices[neighbor]].concat(phantom.incomingCoordinates[neighbor].slice(0, -1));
            if (this._graph.compactedEdges) {
                this._graph.compactedEdges[neighbor][n] = phantom.reducedEdges[neighbor];
            }
        }.bind(this));

        return n;
    }

    _removePhantom(n) {
        if (!n) return;

        Object.keys(this._graph.compactedVertices[n]).forEach(function (neighbor) {
            delete this._graph.compactedVertices[neighbor][n];
        }.bind(this));
        Object.keys(this._graph.compactedCoordinates[n]).forEach(function (neighbor) {
            delete this._graph.compactedCoordinates[neighbor][n];
        }.bind(this));
        if (this._graph.compactedEdges) {
            Object.keys(this._graph.compactedEdges[n]).forEach(function (neighbor) {
                delete this._graph.compactedEdges[neighbor][n];
            }.bind(this));
        }

        delete this._graph.compactedVertices[n];
        delete this._graph.compactedCoordinates[n];

        if (this._graph.compactedEdges) {
            delete this._graph.compactedEdges[n];
        }
    }
};
