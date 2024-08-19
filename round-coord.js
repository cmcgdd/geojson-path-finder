export default function roundCoord(c, precision) {
    const dec = Math.pow(10, precision);
    return [Math.round(c[0] * dec) / dec, Math.round(c[1] * dec) / dec];
};
