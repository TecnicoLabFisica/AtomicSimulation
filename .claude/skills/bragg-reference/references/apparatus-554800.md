# LD X-ray apparatus 554 800: fact sheet for the emulator

Source: LD instruction sheet 554 800 (paraphrased facts only). Code comments cite "§n" of that sheet in places
(e.g. `web/src/apparatus/apparatus.ts`, `web/src/views/bench.ts`); those tags are not reproduced here.

## Limits
- Tube: 0.0-35.0 kV, emission current 0.0-1.0 mA (hard maximum 37 kV / 1.2 mA, unreachable by the user).
- Rate meter: internal maximum 65 535 /s, display shows at most 9999 /s. Without a counter tube it reads 0.
- Sensor arm -10 ... +170 degrees, target arm unlimited, 0.1 degree steps. Scan modes: sensor, target, 2:1 coupled.
- Exposure-timer gate 0.5-9999 s (panel Δt entry: 1-9999 s). Optional speaker click per pulse.
- Accessories: collimator, Zr filter (plugs onto the collimator).
- Housing 67 x 48 x 35 cm; panel column on the left, tube chamber, experiment chamber, each with a lead-glass sliding
  door (used by `web/src/views/bench.ts`); fluorescent screen D = 15 cm closes the far side of the experiment chamber.

## Parameter keys
| Key | Range | Step | Default | Notes |
|---|---|---|---|---|
| U | 0.0-35.0 kV | 0.1 kV | 5.0 kV | shows the set value even with HV off |
| I | 0.00-1.00 mA | 0.01 mA | 0.00 mA | shows the set value even with no current |
| Δt | 1-9999 s | 1 s | 1 s | measuring time per angular step |
| Δβ | 0.0-20.0° | 0.1° | 0.1° | 0.0° selects exposure-timer mode (auto-scan off) |
| β LIMITS | arm range | 0.1° | n/a | 1st press: lower limit, 2nd press: upper limit; upper < lower blocks scans and flashes the display |

ADJUST is an incremental encoder with a dynamic response (faster turn, bigger increment). Any key ends an edit.

## Scan-mode keys
- SENSOR / TARGET select the arm moved by ADJUST and scanned; limits apply to it.
- COUPLED: limits are set on the target arm, sensor follows at twice the angle. In manual moves the reference is the
  arm positions when COUPLED was pressed; in auto-scan it is the measuring-system zero. Pressing COUPLED again toggles
  the top display between rate and sensor angle.
- ZERO moves both arms to zero.

## Operational keys
- RESET: arms to zero, defaults restored, HV off.
- HV ON/OFF: safety self-test, then HV on (doors must be closed).
- SCAN: self-test, then HV on and program start. Δβ > 0 needs a scan mode; Δβ = 0 runs the exposure timer. Auto-scan
  drives the arms to zero, then to the lower limit; stepping starts once HV and emission current are present and runs
  to the upper limit, storing (angle, mean rate over Δt) per step.
- REPLAY: ADJUST browses the stored angles and their mean rates; arms stay put. Data lasts until RESET, new SCAN or power-off.
- Speaker toggles the click.

## Displays
- Top: current rate, refreshed every 1 s regardless of Δt. Bottom: quantity of the last parameter key (target angle in COUPLED).
- HV lamp flashes while HV is on. Analogue/USB outputs update once per Δt with the mean rate.

## Safety and interlock
Before HV on (HV key or SCAN) the display shows "SAFE", then "SAFE OK" if both doors are closed. With a door open the
test fails, HV stays off and the top display blinks. Doors stay locked while X-rays can be produced.

## Procedure as the emulator implements it
Set U and I, close the doors and press HV (or SCAN, which also self-tests). Move arms with ADJUST in SENSOR, TARGET
or COUPLED. For an exposure at fixed angle use Δβ = 0 with Δt and read the mean with REPLAY. For an auto-scan pick a
mode, set both limits, Δβ and Δt, then SCAN and browse the result with REPLAY. The Bragg run uses 35.0 kV, 1.0 mA,
Δt = 10 s, Δβ = 0.1°, COUPLED, target limits 2.5-30° (sheet example) or 2-25° (leaflet).

## State machine
Idle -> ParamEdit (any key returns to Idle). Idle -> SafetyTest (SCAN/HV) -> Idle if a door is open, Scanning if
SAFE OK and Δβ > 0, ExposureTimer if SAFE OK and Δβ = 0. Scanning/ExposureTimer -> Replay (REPLAY) -> Idle on RESET or SCAN.
Simulation-only addition: time acceleration (1x, 10x, 100x, instant); label it as not a device feature.
