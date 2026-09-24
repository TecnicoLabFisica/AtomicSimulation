# LD X-ray apparatus 554 800: behaviour to emulate (paraphrased)

## Hardware limits (manual §4)
- Tube high voltage 0.0–35.0 kV DC. Emission current 0.0–1.0 mA. The hard safety maximum is 37 kV / 1.2 mA,
  which the user cannot reach.
- Rate meter: at most 65 535 /s internally and **9999 /s shown on the display**. The GM supply is fixed at 500 V.
- Two 4-digit LED displays, 25 mm tall, with units shown in an LED dot-matrix.
- Goniometer 554 831 with stepper motors: target arm unlimited (0–360°), **sensor arm −10° … +170°**,
  step 0.1°. Scan modes are sensor, target, or 2:1 coupled.
- Exposure-timer gate time 0.5–9999 s. A loudspeaker gives acoustic count clicks and can be toggled.
- Accessories: collimator and a **Zr filter** (it plugs onto the collimator).

## Displays (§7 b1)
- **Top** display: the current counting rate, refreshed every 1 s regardless of Δt.
- **Bottom** display: the quantity selected by the last parameter key.
- In COUPLED mode the bottom display shows the target angle. Pressing COUPLED again toggles the top display
  between the rate and the sensor angle.
- The HV indicator lamp **flashes** while high voltage is on.

## ADJUST knob (§7 b2)
An incremental encoder that turns both ways. Its response is **dynamic**: turning faster makes bigger steps.
A value is accepted when any key is pressed.

## Parameter keys (§7 b3)
| Key | Range | Step | Default | Notes |
|---|---|---|---|---|
| U | 0.0–35.0 kV | 0.1 kV | 5.0 kV | Shows the set value even with HV off |
| I | 0.00–1.00 mA | 0.01 mA | 0.00 mA | Shows the set value even with no current |
| Δt | 1–9999 s | 1 s | 1 s | Measuring time per angular step |
| Δβ | 0.0–20.0° | 0.1° | 0.1° | Needs the goniometer. **0.0° switches to exposure-timer mode** and turns auto-scan off. The display shows a special symbol |
| β LIMITS | — | 0.1° | — | 1st press sets the lower limit (with a "lower" symbol), 2nd press sets the upper limit (with an "upper" symbol). **If upper < lower, no scan can start and the display flashes until it is fixed** |

## Scan-mode keys (§7 b4)
- **SENSOR / TARGET**: select that arm for manual or auto scan. The limits apply to that arm, and the bottom
  display shows its angle.
- **COUPLED**: 2:1 coupling, with limits set on the **target** arm. In manual moves the coupling reference is the
  arm positions at the moment COUPLED was pressed. In auto-scan the reference is the zero of the
  measuring system. So sensor = 2 × target holds only after ZERO or in auto-scan.
- **ZERO**: move both arms to the zero position of the measuring system.

## Operational keys (§7 b5)
- **RESET**: arms go to zero, **all parameters return to their defaults, and HV switches off**.
- **REPLAY**: read back stored values. The ADJUST knob steps through the scanned angles, and the display shows the angle and
  the rate averaged over Δt. The arms do not move. Data stays available until RESET, a new SCAN, or power-off.
- **SCAN ON/OFF**: runs the safety self-test, and if it passes switches HV on and starts the program. With Δβ > 0 it
  needs a scan mode (SENSOR/TARGET/COUPLED). With Δβ = 0 it runs the exposure timer. In auto-scan the arms go
  **first to zero, then to the lower limit**, then HV comes on. Stepping starts once HV and emission current are
  present and runs from the lower to the upper limit. During the scan every (angle, mean rate) pair is stored.
- **Speaker**: toggles the acoustic pulse indicator.
- **HV ON/OFF**: runs the safety self-test, and if it passes switches HV on (doors must be closed).

## Safety self-test and interlock (§6, §7 h)
Before HV turns on through SCAN or HV ON/OFF, with the doors closed, the display shows **"SAFE"** and then adds **"OK"**
when the test passes. If a door is open the test fails, HV stays off, and the **upper display line blinks**.
The doors are locked while X-rays can be produced and unlock only when none can be.

## Data output (§8)
The rate is counted continuously and displayed every second. During a scan the angle display updates at each
new position and the rate every second. The analogue ANGLE/RATE outputs (and USB) change once per
elapsed Δt and carry the **mean rate over Δt**. Without a counter tube the display reads 0.

## Procedures (§11). The emulator must allow each of these step by step
**a) Switch on**: press U and set e.g. 20 kV. Press I and set e.g. 1.00 mA. Close the doors and press HV ON/OFF.
The HV lamp flashes and the cathode glows. Changing I changes the cathode brightness.

**b) Set parameters**: press U, I, Δt, or LIMITS, then turn ADJUST. Any key ends the edit.

**c) Manual positioning**: press SENSOR or TARGET and turn ADJUST, and the arm follows. Alternatively press COUPLED and turn
ADJUST, and the target follows while the sensor moves at twice the step.

**e) Exposure timer**: position the arms manually, set U and I, set Δβ = 0.0° and Δt, then press SCAN. The remaining
time counts down while the arms stay put. When it reaches zero, press REPLAY to see the mean rate over Δt.

**f) Auto-scan**: choose TARGET, SENSOR, or COUPLED. Press LIMITS to set the lower limit and LIMITS again to set the upper limit. Set I, U, Δβ, and Δt, then
press SCAN. The display shows the rate and the target angle (or the sensor and target angles in coupled mode). Values are stored,
and afterwards REPLAY with ADJUST browses them.

**g) Manual scan**: choose a scan mode, set I and U with Δt = 1, and move the arm with ADJUST. Wait ~2 s for the rate to
settle, then note it. At low rates, use an exposure timer at each angle and press REPLAY each time. This works but is slow.

**h) Bragg at NaCl**: collimator, goniometer, end-window counter as the sensor, NaCl as the target. Go to zero. Set
U = 35.0 kV, I = 1.0 mA, Δt = 10 s, Δβ = 0.1°, press COUPLED, set the target limits (the manual's example is 2.5°–30°,
the leaflet uses 2°–25°), then press SCAN.

## Emulator state machine (from the project plan)
Idle → ParamEdit (U/I/Δt/Δβ/LIMITS), and any key returns to Idle.
Idle → SafetyTest (SCAN or HV) → back to Idle if a door is open (display blinks), or → Scanning if SAFE OK and Δβ > 0,
or → ExposureTimer if SAFE OK and Δβ = 0.
Scanning or ExposureTimer → Replay when finished (via REPLAY). Replay → Idle on RESET or SCAN.
Simulation-only addition: **time acceleration** (1×, 10×, 100×, instant). This is not a real device feature, so label it as such.
