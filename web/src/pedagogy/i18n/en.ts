// Guided-task strings, English. Keys match es.ts (the Spanish is the original).
import type { PedagogyDict } from './es'

export const en: PedagogyDict = {
  learn: 'Learn',
  tasks: 'Guided tasks',
  back: 'All tasks',
  levels: ['', 'Intro', 'Core', 'Challenge'],
  steps: ['Predict', 'Act', 'Observe', 'Explain'],
  predictNumber: 'Your value',
  commit: 'Lock in my prediction',
  waiting: 'The task completes by itself once you get there.',
  done: 'Done',
  explainNext: 'Show the explanation',
  yourPrediction: 'Your prediction',
  expected: 'Answer',
  restart: 'Start over',
  teacher: 'Note for teachers',
  modeNote: { explore: 'Explore mode', lab: 'Lab mode' },
  progressLabels: { open: 'open' },
  task: {
    'kalpha-third-order': {
      title: 'Kα in third order',
      concept: 'Diffraction orders',
      predict: 'In first order, Kα shows up at θ = 7.24°. At which angle θ do you expect third-order Kα?',
      options: [],
      act: 'Switch HV on and turn the crystal: drag it in Goniometer or use ADJUST in ⚙︎ Settings. Try your angle, then find where the counter receives third-order Kα.',
      observe: 'At 3 × 7.24° only the weak continuum arrives; Kα shows up a little further on, with the counter at 2θ. In “Path difference” (λ button), 2d sin θ = 3λ.',
      explain:
        'Bragg’s law, nλ = 2d sin θ, fixes sin θ, not θ: for n = 3, sin θ triples and θ = 22.21°, not 21.72°. Same λ; only the order changes. The “reflection” is interference: waves scattered by neighbouring planes add up only at these angles.',
      teacher:
        'Answer: θ = 22.21° (leaflet Table 2); the task is met on the nearest 0.1° step, 22.2°. Typical mistake: 21.72°, from tripling θ; only continuum arrives there. Another: thinking the third order is a different λ. To discuss: up to which order does the geometry allow Kα? (nλ ≤ 2d, n ≤ 7).',
    },
    'line-threshold': {
      title: 'Line threshold',
      concept: 'Characteristic lines',
      predict: 'If you lower the voltage U, below which value does the Kα line disappear?',
      options: ['17.4 kV', '20.0 kV', 'Never: the crystal always reflects Kα at that angle'],
      act: 'Run a scan (SCAN) from 5° to 9°. Lower U (slider in Goniometer, or U and ADJUST in ⚙︎ Settings) and repeat until Kα is gone but X-rays still reach its angle. Tip: speed up time.',
      observe: 'Kα and Kβ vanished together, but bremsstrahlung (the continuum) still reaches their angle.',
      explain:
        'Kα takes two steps: a beam electron knocks a K-shell electron out of Mo (eU > 20.0 keV), then an L electron fills the hole and emits a photon of only 17.4 keV. The continuum at that angle only needs λmin < λ(Kα), i.e. U > 17.4 kV. Just above 20 kV the line is still very weak.',
      teacher:
        'Answer: 20.0 kV, where eU equals the Mo K binding energy (20.0 keV). The distractor 17.4 kV is hc/λ(Kα), where λmin = λ(Kα). Kβ (19.65 keV) also vanishes at 20.0 kV, not 19.65: the threshold is the K shell. The line grows as (U/U_K − 1)^1.67 and is hardly visible below about 22 kV: to measure the threshold, extrapolate the peak area at several U to zero, at low current (0.1 mA) to avoid dead time. See docs/teacher-key.md.',
    },
    'lambda-three-orders': {
      title: 'λ from three orders',
      concept: 'Measuring wavelengths',
      predict: 'From each order n you will compute λ = 2d sin θ / n for Kα. What do you expect?',
      options: ['The same λ in all three orders', 'A shorter λ in each higher order', 'A longer λ in each higher order'],
      act: 'Set up a COUPLED scan that covers the first three orders of Kβ and Kα, with a fine step Δβ and a long Δt, as in the leaflet. When it ends, download the data with CSV on the Monitor. If it doesn’t complete, check that the scan starts before the first peak and ends after the last one, that the weakest peak stands out from the noise, and that the CSV is from the finished scan.',
      observe: 'You have three Kβ–Kα pairs: in each higher order the pair is further apart and weaker.',
      explain:
        'Find the centre of each peak, compute λ = 2d sin θ / n with d = a₀/2 = 282.01 pm, and average the orders. If all give the same λ, you have confirmed Bragg’s law: the order changes the angle, not the wavelength.',
      teacher:
        'Analysis outside the app (~20 min). Expected values in docs/teacher-key.md (Tables 3–5, simulated data). Typical mistakes: using a₀ = 564.02 pm instead of d = a₀/2 (λ comes out doubled), taking the sensor angle (2θ) as θ, assigning a peak to the wrong order. To discuss: why does the Kβ–Kα pair spread apart in higher orders?',
    },
    'moseley-k-edges': {
      title: 'Moseley’s law',
      concept: 'K absorption edges',
      predict: 'A Zr foil (Z = 40) and an Ag foil (Z = 47) absorb strongly for photon energies above their K-edge energy. Scanning β, where do you expect the Ag edge relative to the Zr edge?',
      options: ['At a smaller β than Zr’s', 'At the same β', 'At a larger β than Zr’s'],
      act: 'At 35 kV and 1 mA, in COUPLED, scan from 3.7° to 7.5° with Δβ = 0.1° and Δt = 5 s. Make one scan without a foil and one with each foil (Zr, Mo, Ag, In). Mount the foil in the sensor slot from Setup, with the doors open. After each scan, download the CSV on the Monitor. All scans must share the same U and I.',
      observe: 'The transmission R(foil) / R(open) jumps up at one angle, and each foil does it at a different one.',
      explain:
        'The higher Z is, the more strongly the nucleus pulls on the K-shell electrons: the binding energy rises and λ_K gets shorter. By Bragg’s law a shorter λ reflects at a smaller θ, so the Ag edge lies at a smaller angle than the Zr edge. Moseley’s law, found for the K lines, holds for the edges too: √(1/λ_K) is linear in Z. The squared slope gives R, and the intercept divided by the slope gives −σ_K. Your R will come out a little below R∞: partly physics (real K edges are not hydrogen-like) and partly the counter’s finite angular resolution.',
      teacher:
        'Answer: the first option; the Ag edge falls at θ ≈ 4.94° and the Zr edge at ≈ 7.02° (higher Z → shorter λ_K → smaller θ). Typical mistake: “more Z or more energy, larger angle”. The fit should give R ≈ 1.06 × 10⁷ m⁻¹ and σ_K ≈ 2.9, 3.4 % below R∞: ≈ 1.3 % is physics (real K edges are not hydrogen-like) and ≈ 2.3 % is the counter’s resolution bias. To discuss: why does the transmission rise with λ at the edge instead of falling? See docs/teacher-key.md (Moseley).',
    },
  },
}
