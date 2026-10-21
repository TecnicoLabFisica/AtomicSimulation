// port of braggsim.analysis: the scan-quality limits of the line finder (constants only; the peak
// fitting and the teacher key stay in Python).

/** port of braggsim.analysis.PEAK_HALF_WINDOW_DEG: half-width of a marked peak region, in °. */
export const PEAK_HALF_WINDOW_DEG = 0.7
/** port of braggsim.analysis.MIN_PROMINENCE_SIGMA: a line stands this many Poisson σ above its background. */
export const MIN_PROMINENCE_SIGMA = 5
/** port of braggsim.analysis.MAX_STEP_DEG: coarsest Δβ that still resolves a line, in °. */
export const MAX_STEP_DEG = 0.23
/** port of braggsim.analysis.EDGE_SPLIT_HALF_WINDOW_DEG: half-width of each side of the coarse K-edge split, in °. */
export const EDGE_SPLIT_HALF_WINDOW_DEG = 0.3
/** port of braggsim.analysis.MAX_EDGE_STEP_DEG: coarsest Δβ that k_edge_deg accepts (2 points per side), in °. */
export const MAX_EDGE_STEP_DEG = 0.15
