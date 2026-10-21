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
  progressLabels: { open: 'open', polystyrene: 'polystyrene' },
  task: {
    background: {
      title: 'The counter with the tube off',
      concept: 'Counting statistics',
      predict: 'With the tube off (U = 0 kV), you leave the Geiger–Müller counter counting for 100 s. What rate do you expect it to show?',
      options: ['Exactly 0 counts per second', 'Something above zero, but very little', 'The same as with the tube on'],
      act: 'With U = 0 kV (or I = 0 mA), Δβ = 0 and Δt = 100 s or more, press SCAN and wait for it to finish (SCAN switches HV on, but with no voltage or no current the tube emits nothing). Do not change U or I while it counts. Then press REPLAY to see the mean rate.',
      observe: 'Read the mean rate on REPLAY and work out how many counts that is in total (rate × Δt). Compare it with the direct beam, with the tube on and no plate.',
      explain:
        'The counter cannot tell where a photon or particle comes from: cosmic rays and natural radioactivity in the surroundings also trigger it, always, at a low but non-zero rate: the background. These are random events: with N counts the uncertainty is ≈ √N, large compared with N when N is small; that is why you measure for ≥ 100 s. Any X-ray measurement has to subtract this background, especially when the sample’s rate is small.',
      teacher:
        'Expected result: ≈ 0.2 counts/s (≈ 20 counts in 100 s, ±4.5 Poisson), never exactly 0, and about 5000 times less than the open direct beam at 21 kV, 0.05 mA (≈ 10³/s). Typical mistakes: “no X-rays, zero counts” and “it is radiation left over in the tube”. Source: cosmic rays and natural radioactivity, not the tube; with U > 0 but I = 0 there is no emission either. The task is met by one finished exposure with U = 0 or I = 0, steady, of ≥ 100 s (EPN guide, Práctica 1); the value the student writes down is not checked. To discuss: when does subtracting the background matter?',
    },
    'attenuation-thickness': {
      title: 'Attenuation in aluminium',
      concept: 'Lambert’s law with a real beam',
      predict: 'As the aluminium thickness d grows, you plot ln T against d, with T = rate with plate / rate without. Lambert’s law says ln T = −μ d for a single wavelength. With the tube beam at 21 kV, what does the plot look like?',
      options: ['A straight line', 'A curve that flattens: it falls more slowly as d grows', 'A curve that steepens: it falls faster as d grows'],
      act: 'At 21 kV, 0.05 mA, Δβ = 0 and Δt = 30 s, open the doors, put the aluminium wheel in from Setup and close them. With TARGET move the wheel to each slot (0°, 10°, … 60°; 0° is the open slot) and on each one press SCAN and wait for it to finish. Do not change U or I between slots. REPLAY shows each mean value; to note them all, download the exposure log on the Monitor.',
      actHelp: 'If a slot gets no ✓ or loses it, U or I changed while it counted or differ from the other slots. If you have all seven ✓ and the task does not advance, Δt was too short: repeat them with a longer Δt.',
      observe: 'Compute T for each plate (subtract the background first) and plot ln T against d. Also compute μ_eff = −ln T / d for the thinnest and the thickest plate: do they come out equal? To go further (about 25 min), repeat everything with the Zr filter on the collimator (21 kV, 0.15 mA, Δt = 200 s) and compare the shape.',
      explain:
        'Lambert’s law holds for a single wavelength. The tube beam is polychromatic: a bremsstrahlung continuum with the Mo K lines on top, and at 21 kV, just above the Mo K threshold, the lines are barely excited, so the continuum dominates. Soft photons (low energy, long λ) are absorbed first; with more thickness the remaining beam is harder (more energetic), penetrates better, and μ_eff = −ln T / d decreases: ln T against d bends and flattens. That is why a measured μ depends on the thickness range, not only on the material. The Zr filter does not turn the beam into Mo Kα: at 21 kV it removes the hard end (λ < 69 pm, above its K edge) and leaves a narrow 69–92 pm band; the line is only somewhat less curved and μ_eff comes out higher, farther from the Kα value.',
      teacher:
        'Answer: the second option (a curve that flattens). Al at 21 kV, 0.05 mA, as the apparatus reads it (τ = 100 µs, uncorrected): μ_eff/ρ = −ln T/(ρd) ≈ 6.4 cm²/g at 0.5 mm and ≈ 5.3 at 3 mm; the fit through the origin gives ≈ 5.7, with χ²/dof ≫ 1 (not a line). Without dead time they would be 6.9 → 5.4: dead time hides part of the curvature. For Mo Kα alone (xraylib) it would be 5.11. With the Zr filter (0.15 mA) the curve is somewhat less curved (≈ 6.5 → 5.8) and the fit rises to ≈ 6.1, farther from 5.11: at 21 kV the K lines are barely excited, and Zr removes the hard end of the continuum (59–69 pm, above its 18.0 keV K edge) and leaves a band of energies just below the edge (λ ≈ 69–92 pm). Local slopes between neighbouring plates fall further (down to ≈ 4.5 without Zr); ask for μ_eff = −ln T/d. Typical mistakes: “Lambert always gives a straight line”, “μ depends only on the material”, “Zr leaves pure Kα”, and using d in mm with μ/ρ in cm²/g without converting to ρd in g/cm². The task is met by exposures on all seven slots with the same U, I and filters, steady, unsaturated, and with a Δt such that the fall of μ_eff between 0.5 and 3.0 mm stands 5 Poisson σ above zero in the model (Δt ≳ 6 s is enough); the student’s μ is not checked. To discuss: which thickness range, U and filter should be quoted next to a μ?',
    },
    'attenuation-material': {
      title: 'Attenuation by material',
      concept: 'Absorption coefficient and atomic number',
      predict: 'With the tube at 30 kV, which lets more radiation through: a 0.4 mm plate of iron (Z = 26) or a 0.4 mm plate of zirconium (Z = 40)?',
      options: ['Iron', 'Zirconium', 'The same'],
      act: 'At 30 kV, Δβ = 0 and Δt = 30 s, open the doors, put the material wheel in from Setup and close them. With TARGET move the wheel to each slot (0°, 10°, … 60°) and take one exposure on each: polystyrene, Al, Fe, Cu, Zr, Ag and, in the last, the open slot (no plate). Do not mount filters. You may change I between slots, but not while it counts: if the saturation warning appears, lower I and repeat that slot; if a plate gives very few counts, raise I or lengthen Δt.',
      actHelp: 'Note the I of each slot. If a slot gets no ✓, the counter saturated, the rate was too close to the background, or U or I changed while it counted.',
      observe: 'Compute T = (rate with plate − background) / (rate without plate − background) for each plate, with the background you measured with the tube off. If you used a different I, first scale the rate without a plate by the ratio of currents. Rank the materials by T: does the order match that of Z?',
      explain:
        'At a given energy, μ/ρ usually grows with Z, but not always. As the photon energy rises, absorption jumps at the K edge: from that energy the photon can eject a K-shell electron. The Zr K edge is at 18.0 keV, just above the Mo Kα line (17.5 keV): Kα, intense at 30 kV, falls in Zr’s low-absorption window and goes through (Kβ, 19.6 keV, lies above the edge and is absorbed). Fe and Cu, lower in Z, have their K edges far below (7.1 and 9.0 keV), so their K shell absorbs Kα strongly; likewise Ag (Z = 47, edge at 25.5 keV) lets more through than Cu. What matters is the photon energy relative to the edge, not Z alone.',
      teacher:
        'Answer: zirconium. At 30 kV, 0.4 mm (no dead time or background): T ≈ 0.98 polystyrene, 0.62 Al, 3.3 × 10⁻³ Fe, 4.8 × 10⁻⁴ Cu, 4.8 × 10⁻³ Zr, 1.4 × 10⁻³ Ag; ranked by T: PS > Al > Zr > Fe > Ag > Cu. Zr transmits more than Fe and Cu because Mo Kα (17.5 keV) lies in its low-absorption window, just below its K edge (18.0 keV): ≈ 70 % of what passes through the Zr plate is Kα; Kβ (19.6 keV) is above the edge and is absorbed. Fe and Cu only pass the hard end of the continuum (≈ 23–29 keV); Ag beats Cu because Kα lies below its K edge (25.5 keV). Current: the EPN guide uses 0.02 mA on the first three slots and 1 mA on the rest, but at 0.02 mA polystyrene and the open beam already exceed the app’s saturation threshold (Rτ ≈ 0.32, ≈ 2400/s observed), and at 1 mA the open beam exceeds it by far: read them at 0.01 mA (≈ 1400/s). At 0.01 mA and 30 s all pass except Cu (≈ 1/s, 4 σ above background): it needs 0.02 mA or more, or a longer Δt. If currents are mixed, correct for dead time (R = m/(1 − mτ), τ = 100 µs) before scaling the open beam by I; uncorrected, T of the heavy plates comes out 8–16 % high. Typical mistakes: “μ always grows with Z”, mixing up the tube’s 30 kV with the photon energy, not scaling by I, and “fixing” the Zr point in μ/ρ against Z. The task is met by all seven slots at 30 kV, with the same filters, steady, unsaturated and 5 σ above the background; the student’s μ is not checked. To discuss: the Ag K edge is also above Mo Kα; why does it transmit less than Zr? (Kα is far from its edge and, on the same side of an edge, μ/ρ grows with Z: 26.6 against 16.3 cm²/g; Ag is also denser, 10.5 against 6.5 g/cm³.)',
    },
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
    'lif-kalpha-angle': {
      title: 'Kα with another crystal',
      concept: 'Bragg’s law and the crystal',
      predict: 'With NaCl (d = 282.0 pm), first-order Mo Kα shows up at θ = 7.24°. This task mounts a LiF crystal, with d = 201.4 pm. At which angle θ do you expect first-order Kα?',
      options: [],
      act: 'In COUPLED mode, run a scan that covers your prediction: set the limits 1° below and above your angle, Δβ = 0.1° or finer, and press SCAN. If the Kα peak does not show up, correct the window and repeat.',
      observe: 'The Kα peak lies further right than with NaCl, and Kβ, on its left, has moved too. In “Path difference” (λ button), 2d sin θ = λ with the LiF d.',
      explain:
        'The Kα wavelength is the same, 71.1 pm, but Bragg’s law, nλ = 2d sin θ, gives sin θ = λ / 2d: with a smaller d, sin θ and θ grow. With LiF, θ = 10.16°; with NaCl, 7.24°. The angle depends on the wavelength and the crystal, not only on the tube. Also, since Δθ ≈ Δλ / (2d cos θ), at larger θ and smaller d the Kα doublet and the Kα–Kβ pair spread further apart.',
      teacher:
        'Answer: θ = arcsin(71.08 / (2 × 201.4)) = arcsin(0.1765) = 10.16° (NaCl: arcsin(71.08 / 564.02) = 7.24°). With LiF, Kβ falls at 9.01°. Typical mistake: “the angle depends only on the tube” (7.24°). Another: scaling θ, not sin θ, with the ratio of d; that gives 10.1°, narrowly, but fails at large angles. The task is met by a COUPLED scan on LiF that covers the line ±0.7°, with Δβ ≤ 0.23° and 5 σ above the background according to the model; the student’s number is not checked. To discuss: up to which order does the geometry allow Kα with LiF? (nλ ≤ 2d, n ≤ 5).',
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
      predict: 'A Zr foil (Z = 40) and an Ag foil (Z = 47) absorb strongly for photon energies above their K-edge energy (the energy needed to remove a K-shell electron). Scanning β, where do you expect the Ag edge relative to the Zr edge?',
      options: ['At a smaller β than Zr’s', 'At the same β', 'At a larger β than Zr’s'],
      act: 'At 35 kV and 1 mA, in COUPLED, scan from 3.7° to 7.5° with Δβ = 0.1° and Δt = 5 s. Make one scan without a foil and one with each foil (Zr, Mo, Ag, In). To change foils, switch HV off, open the doors, put the foil in the sensor slot from Setup and close them. After each scan, download the CSV on the Monitor. All scans must share the same U and I. Variant: repeat it with LiF from Setup; the angular windows change with the crystal.',
      actHelp: 'If a foil gets no ✓, check the limits, Δβ, and that U and I match the scan without a foil.',
      observe: 'As β increases, the transmission T = rate with foil / rate without jumps up at a different angle for each foil. The Kα and Kβ peaks come from the tube: they appear without a foil too and nearly cancel in T.',
      explain:
        'Below θ_K (λ < λ_K) a photon has the energy to eject a K electron and is absorbed; above θ_K it does not, so the transmission rises. Compute λ_K = 2d sin θ_K with d = 282.01 pm. The higher Z is, the more strongly the nucleus pulls on the K electrons: the binding energy rises, λ_K gets shorter and, by Bragg’s law, the Ag edge lies at a smaller θ than the Zr edge. Moseley’s law holds for the edges too: √(1/λ_K) = √R (Z − σ_K), with R the Rydberg constant (the squared slope) and σ_K the screening constant, how much the other electrons reduce the charge the K electron feels (−intercept / slope). Your R will come out a few % below R∞ = 1.097 × 10⁷ m⁻¹, from physics and from the counter’s finite angular resolution.',
      teacher:
        'Answer: the first option; the Ag edge falls at θ ≈ 4.94° and the Zr edge at ≈ 7.02° (higher Z → shorter λ_K → smaller θ). Typical mistakes: “more Z or more energy, larger angle”; keeping the ¾ factor of the Kα line (an edge has none: R would come out 33 % high); taking the tube’s Kα/Kβ peaks for edges. The fit should give R ≈ 1.06 × 10⁷ m⁻¹ and σ_K ≈ 2.9, R ≈ 3.5 % below R∞ (±1 % noise): ≈ 1.3 % is physics (relativity and screening that grows with Z) and ≈ 2.3 % is the counter’s resolution bias. LiF variant (d = 201.4 pm): the edges fall at ≈ 6.3° (In), 6.9° (Ag), 8.9° (Mo) and 9.8° (Zr), so the window becomes ≈ 6.0°–10.2° (worked out from the crystal’s d; all scans of a group must be on the same crystal, and NaCl and LiF are not mixed). To discuss: why does the transmission rise with λ at the edge instead of falling? See docs/teacher-key.md (Moseley).',
    },
  },
}
