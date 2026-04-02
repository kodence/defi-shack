/**
 * Minimal normal distribution CDF via rational approximation (Abramowitz & Stegun).
 * Avoids adding scipy/jstat as a dependency.
 */
export const Normal = {
  cdf(z: number): number {
    const t  = 1 / (1 + 0.2316419 * Math.abs(z));
    const d  = 0.3989422820 * Math.exp(-z * z / 2);
    const p  = d * t * (0.3193815530
              + t * (-0.3565637780
              + t * (1.7814779370
              + t * (-1.8212559780
              + t *  1.3302744290))));
    return z > 0 ? 1 - p : p;
  },
};
