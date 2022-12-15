export default function roundCoord(c, precision) {
    // FIXME: This rounding function fucks things up, and my coords are built precisely,
    //        so just skip it and return the input directly.
    return c;
    // return [
    //     Math.round(c[0] / precision) * precision,
    //     Math.round(c[1] / precision) * precision,
    // ];
};
