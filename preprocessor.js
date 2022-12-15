import { compactGraph } from './compactor.js';
import distance from '@turf/distance';
import point from 'turf-point';
import topology from './topology.js';

export default function preprocess(graph, options) {
    options = options || {};
    const weightFn = options.weightFn || function defaultWeightFn(a, b) {
        return distance(point(a), point(b));
    };

    let topo;

    if (graph.type === 'FeatureCollection') {
        // Graph is GeoJSON data, create a topology from it
        topo = topology(graph, options);
    } else if (graph.edges) {
        // Graph is a preprocessed topology
        topo = graph;
    }

    const rGraph = topo.edges.reduce(function buildGraph(g, edge, i, es) {
        const a = edge[0];
        const b = edge[1];
        const props = edge[2];
        const w = weightFn(topo.vertices[a], topo.vertices[b], props);

        const makeEdgeList = (node) => {
            if (!g.vertices[node]) {
                g.vertices[node] = {};
                if (options.edgeDataReduceFn) {
                    g.edgeData[node] = {};
                }
            }
        };
        const concatEdge = (startNode, endNode, weight) => {
            var v = g.vertices[startNode];
            v[endNode] = weight;
            if (options.edgeDataReduceFn) {
                g.edgeData[startNode][endNode] = options.edgeDataReduceFn(options.edgeDataSeed, props);
            }
        };

        if (w) {
            makeEdgeList(a);
            makeEdgeList(b);
            if (w instanceof Object) {
                if (w.forward) {
                    concatEdge(a, b, w.forward);
                }
                if (w.backward) {
                    concatEdge(b, a, w.backward);
                }
            } else {
                concatEdge(a, b, w);
                concatEdge(b, a, w);
            }
        }

        if (i % 1000 === 0 && options.progress) {
            options.progress('edgeweights', i, es.length);
        }

        return g;
    }, { edgeData: {}, vertices: {} });

    // var compact = compactGraph(rGraph.vertices, topo.vertices, rGraph.edgeData, options);
    var compact = compactGraph(rGraph.vertices, topo.vertices, topo.edges, options);

    return {
        vertices: rGraph.vertices,
        edgeData: rGraph.edgeData,
        sourceVertices: topo.vertices,
        compactedVertices: compact.graph,
        compactedCoordinates: compact.coordinates,
        compactedEdges: options.edgeDataReduceFn ? compact.reducedEdges : null
    };
};
