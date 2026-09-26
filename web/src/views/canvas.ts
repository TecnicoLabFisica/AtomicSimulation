// Shared plumbing for the canvas views: design tokens read from CSS, DPR-aware sizing, reduced motion.
// Canvas code never hard-codes a colour: it reads the palette, which follows the theme.

const COLOURS = [
  'label', 'label-2', 'label-3', 'separator', 'surface', 'surface-2', 'accent', 'led-on',
  'phys-kalpha', 'phys-kbeta', 'phys-beam', 'phys-crystal', 'phys-constructive',
] as const // prettier-ignore
export type Palette = Record<(typeof COLOURS)[number], string> & { caption: string; footnote: string; font: string }

export let palette = {} as Palette
/** Bumped whenever the palette is re-read: views compare it to know they must redraw. */
export let paletteVersion = 0

export function readPalette(): void {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string) => cs.getPropertyValue(`--${name}`).trim()
  palette = Object.fromEntries(COLOURS.map((c) => [c, v(c)])) as Palette
  palette.caption = v('text-caption')
  palette.footnote = v('text-footnote')
  palette.font = v('font')
  paletteVersion++
}

let motionQuery: MediaQueryList | undefined
/** Lazy, so modules importing this one stay loadable in tests (no matchMedia in Node). */
export const reducedMotion = (): boolean =>
  (motionQuery ??= matchMedia('(prefers-reduced-motion: reduce)')).matches

/** Device pixels per CSS pixel, capped at 2: sharper is not visible on a phone, only slower. */
export function dpr(): number {
  return Math.min(devicePixelRatio || 1, 2)
}

/** Keep the canvas backing store at its CSS size × dpr(). Resizing clears the canvas after this frame's
 * draw, so `onResize` must redraw right away or the view blinks empty for a frame. */
export function watchSize(canvas: HTMLCanvasElement, onResize: () => void): void {
  new ResizeObserver(([e]) => {
    canvas.width = Math.round(e.contentRect.width * dpr())
    canvas.height = Math.round(e.contentRect.height * dpr())
    onResize()
  }).observe(canvas)
}

/** A CSS font token ("500 11px/13px …") at `scale` × its size, for a canvas drawn in device pixels. */
export function scaledFont(token: string, scale: number): string {
  return token.replace(/([\d.]+)px\/[\d.]+px/, (_, px) => `${Number(px) * scale}px`)
}
