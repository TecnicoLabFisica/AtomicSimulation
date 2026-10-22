// F2.2: the forged crystal on the bench (key registry, mount, refusal), its label (hypothetical, safe against a hostile
// name) and its CSV/file-name form. No DOM: strings and the pure decision function are what is tested.
import { beforeAll, describe, expect, test } from 'vitest'
import { Apparatus } from '../src/apparatus/apparatus'
import { crystalLabel, escapeHtml } from '../src/i18n'
import { csvField, exposureCsv, fileCrystal, fileSafe } from '../src/pedagogy/csv'
import { isNacl } from '../src/physics/crystal'
import { forgeEntry } from '../src/physics/forge'
import { PRESETS } from '../src/physics/forge-lattices'
import { wouldBeSpectrum } from '../src/physics/forge-plot'
import { BETA_MAX_DEG, DEFAULT, coupledBetas, expectedRate } from '../src/physics/scan'
import { CRYSTALS, loadCrystals, loadForgeElements } from '../src/physics/tables'
import { benchRefusal, designFromPreset, registerForged, toInput } from '../src/views/forge'

const forged = (name: string) => forgeEntry({ ...toInput(designFromPreset(PRESETS[1])), name })
const XSS = '<img src=x onerror=alert(1)>'

beforeAll(async () => {
  await loadForgeElements()
  await loadCrystals()
})

describe('mounting a forged crystal', () => {
  test('apparatus.crystal is the entry, rates equal a direct call, a forged "NaCl" is not the anchor', () => {
    const entry = forged('NaCl')
    const key = registerForged(entry)
    const a = new Apparatus()
    a.setDoors(false)
    expect(a.mount({ ...a.setup, holder: 'crystal', crystal: key })).toBe(true)
    expect(a.crystal).toEqual(entry)
    expect(Object.isFrozen(a.crystal)).toBe(true)
    expect(isNacl(a.crystal)).toBe(false)
    const betas = coupledBetas(5, 20, 0.5)
    expect(expectedRate(betas, 35, 1, DEFAULT, undefined, [], a.crystal)).toEqual(expectedRate(betas, 35, 1, DEFAULT, undefined, [], entry))
  })
  test('two registrations give two distinct keys; the first entry is unchanged', () => {
    const [e1, e2] = [forged('first'), forged('second')]
    const [k1, k2] = [registerForged(e1), registerForged(e2)]
    expect(k1).not.toBe(k2)
    expect(CRYSTALS[k1].name).toBe('first')
    expect(CRYSTALS[k2].name).toBe('second')
  })
  test('refusal: doors closed, HV on, a task lock', () => {
    const open = { doorsClosed: false, hvOn: false, busy: false }
    expect(benchRefusal({ ...open, doorsClosed: true }, null, 'forge:9')).toBe('doors')
    expect(benchRefusal({ ...open, hvOn: true }, null, 'forge:9')).toBe('busy')
    expect(benchRefusal({ ...open, busy: true }, null, 'forge:9')).toBe('busy')
    expect(benchRefusal(open, 'NaCl', 'forge:9')).toBe('locked')
    expect(benchRefusal(open, null, 'forge:9')).toBeNull()
    const a = new Apparatus() // doors closed at start: the real mount refuses too
    expect(benchRefusal(a, null, 'forge:9')).toBe('doors')
  })
})

describe('would-be spectrum', () => {
  test('is the expected rate of both crystals on the coupled grid, no noise', () => {
    const entry = forged('x')
    const p = wouldBeSpectrum(entry)
    const b = coupledBetas(2.5, BETA_MAX_DEG, 0.1)
    expect(Array.from(p.beta_deg)).toEqual(Array.from(b))
    expect(p.crystal).toEqual(expectedRate(b, 35, 1, DEFAULT, undefined, [], entry))
    expect(p.nacl.length).toBe(b.length)
  })
})

describe('labels', () => {
  let key = ''
  beforeAll(() => void (key = registerForged(forged(XSS))))
  test('presets keep their name, forged keys are marked hypothetical in both languages', () => {
    expect(crystalLabel('calcite', 'es')).toBe('Calcita')
    expect(crystalLabel(key, 'es')).toBe(`${XSS} (hipotético)`)
    expect(crystalLabel(key, 'en')).toBe(`${XSS} (hypothetical)`)
    expect(crystalLabel(registerForged(forged('NaCl')), 'en')).toBe('NaCl (hypothetical)')
  })
  test('a hostile name stays plain text and escapes for the few innerHTML spots', () => {
    expect(escapeHtml(crystalLabel(key, 'en'))).not.toMatch(/[<>"]/)
    expect(escapeHtml(crystalLabel(key, 'en'))).toContain('&#60;img')
  })
})

describe('CSV and file name', () => {
  test('formula injection is neutralised, RFC 4180 quoting', () => {
    expect(csvField('=1+1')).toBe("'=1+1")
    expect(csvField('+cmd')).toBe("'+cmd")
    expect(csvField('-2')).toBe("'-2")
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('plain')).toBe('plain')
  })
  test('file name part is [A-Za-z0-9_-] with a fallback', () => {
    expect(fileSafe('../../etc/passwd')).toBe('etc-passwd')
    expect(fileSafe('日本語')).toBe('forged')
    const k = registerForged(forged('=cmd|calc, "x"'))
    expect(fileCrystal(k)).toMatch(/^forged-[A-Za-z0-9_-]+$/)
    expect(fileCrystal('LiF')).toBe('LiF')
  })
  test('the crystal column of the exposure CSV is quoted and defused', () => {
    const k = registerForged(forged('=evil,"x"'))
    const a = new Apparatus()
    a.setDoors(false)
    a.mount({ ...a.setup, holder: 'crystal', crystal: k });
    (a.exposureLog as any[]).push({ setup: a.setup, target: 0, sensor: 0, mode: null, slot: null, u: 350, i: 100, dt: 1, changed: false, rate: 1 } as any)
    const row = exposureCsv(a)!.trim().split('\n').at(-1)!
    expect(row).toContain(`"'=evil,""x"" (hypothetical)"`)
  })
})
