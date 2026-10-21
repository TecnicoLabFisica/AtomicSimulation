// Guided-task strings, Spanish (written first). Keys match en.ts; lab-mode tasks never state the
// expected angles or wavelengths (the teacher notes, shown only with ?teacher, may).
export const es = {
  learn: 'Aprender',
  tasks: 'Tareas guiadas',
  back: 'Todas las tareas',
  levels: ['', 'Introducción', 'Básica', 'Reto'],
  steps: ['Predice', 'Actúa', 'Observa', 'Explica'],
  predictNumber: 'Tu valor',
  commit: 'Fijar mi predicción',
  waiting: 'La tarea se completa sola cuando lo logres.',
  done: 'Logrado',
  explainNext: 'Ver la explicación',
  yourPrediction: 'Tu predicción',
  expected: 'Respuesta',
  restart: 'Empezar de nuevo',
  teacher: 'Nota para docentes',
  modeNote: { explore: 'Modo Explorar', lab: 'Modo Laboratorio' },
  progressLabels: { open: 'abierto', polystyrene: 'poliestireno' },
  task: {
    background: {
      title: 'El contador con el tubo apagado',
      concept: 'Estadística de conteo',
      predict: 'Con el tubo apagado (U = 0 kV), dejas el contador Geiger–Müller contando 100 s. ¿Qué tasa esperas que indique?',
      options: ['Exactamente 0 cuentas por segundo', 'Algo distinto de cero, pero muy poco', 'Lo mismo que con el tubo encendido'],
      act: 'Con U = 0 kV (o I = 0 mA), Δβ = 0 y Δt = 100 s o más, pulsa SCAN y espera a que termine (SCAN enciende HV, pero sin tensión o sin corriente el tubo no emite). No cambies U ni I mientras cuenta. Luego pulsa REPLAY para ver la tasa media.',
      observe: 'Lee la tasa media en REPLAY y calcula cuántas cuentas son en total (tasa × Δt). Compárala con la del haz directo, con el tubo encendido y sin placa.',
      explain:
        'El contador no distingue de dónde viene un fotón o una partícula: los rayos cósmicos y la radiactividad natural del entorno también lo disparan, siempre, a una tasa baja pero no nula: es el fondo. Son sucesos al azar: con N cuentas la incertidumbre es ≈ √N, grande frente a N cuando N es pequeño; por eso se mide ≥ 100 s. Toda medida con rayos X debe restar este fondo, sobre todo cuando la tasa de la muestra es pequeña.',
      teacher:
        'Resultado esperado: ≈ 0.2 cuentas/s (≈ 20 cuentas en 100 s, ±4.5 por Poisson), nunca exactamente 0, y unas 5000 veces menos que el haz directo sin absorbente a 21 kV, 0.05 mA (≈ 10³/s). Errores típicos: «sin rayos X, cero cuentas» y «es radiación que queda en el tubo». Origen: rayos cósmicos y radiactividad natural, no el tubo; con U > 0 pero I = 0 tampoco hay emisión. La tarea se da por hecha con una exposición terminada con U = 0 o I = 0, estable y de ≥ 100 s (guía EPN, Práctica 1); no se revisa el valor que anote el estudiante. Para discutir: ¿cuándo importa restar el fondo?',
    },
    'attenuation-thickness': {
      title: 'Atenuación en aluminio',
      concept: 'Ley de Lambert con un haz real',
      predict: 'Al aumentar el espesor d de aluminio, representas ln T frente a d, con T = tasa con placa / tasa sin placa. La ley de Lambert dice que ln T = −μ d para una sola longitud de onda. Con el haz del tubo a 21 kV, ¿cómo se ve el gráfico?',
      options: ['Una recta', 'Una curva que se aplana: cae menos deprisa al crecer d', 'Una curva que se empina: cae más deprisa al crecer d'],
      act: 'Con 21 kV, 0.05 mA, Δβ = 0 y Δt = 30 s, abre las puertas, pon la rueda de aluminio desde Montaje y ciérralas. Con TARGET lleva la rueda a cada ranura (0°, 10°, … 60°; 0° es la ranura abierta) y en cada una pulsa SCAN y espera a que termine. No cambies U ni I entre ranuras. Con REPLAY ves el valor medio de cada una; para anotarlas todas, descarga el registro de exposiciones en el Monitor.',
      actHelp: 'Si una ranura no se marca ✓ o pierde la suya, U o I cambiaron mientras contaba o no son las de las demás. Si tienes las siete ✓ y la tarea no avanza, el Δt fue corto: repítelas con un Δt mayor.',
      observe: 'Calcula T para cada placa (resta antes el fondo) y representa ln T frente a d. Calcula también μ_eff = −ln T / d para la placa más fina y para la más gruesa: ¿salen iguales? Para ir más lejos (unos 25 min), repite todo con el filtro de Zr en el colimador (21 kV, 0.15 mA, Δt = 200 s) y compara la forma.',
      explain:
        'La ley de Lambert vale para una sola longitud de onda. El haz del tubo es policromático: un continuo de frenado con las líneas K del Mo encima, y a 21 kV, muy cerca del umbral K del Mo, las líneas apenas se excitan, así que domina el continuo. Los fotones blandos (de baja energía, λ larga) se absorben antes; a mayor espesor el haz que queda es más duro (más energético), atraviesa mejor y μ_eff = −ln T / d disminuye: ln T frente a d se curva y se aplana. Por eso el μ medido depende del rango de espesores, no solo del material. El filtro de Zr no convierte el haz en Mo Kα: a 21 kV quita el extremo duro (λ < 69 pm, sobre su borde K) y deja una banda estrecha de 69 a 92 pm; la curva queda algo menos curvada y μ_eff sale mayor, más lejos del valor de Kα.',
      teacher:
        'Respuesta: la segunda opción (curva que se aplana). Al a 21 kV, 0.05 mA, tal como lo lee el aparato (τ = 100 µs, sin corregir): μ_eff/ρ = −ln T/(ρd) ≈ 6.4 cm²/g con 0.5 mm y ≈ 5.3 con 3 mm; el ajuste por el origen da ≈ 5.7, con χ²/gl ≫ 1 (no es una recta). Sin tiempo muerto serían 6.9 → 5.4: el tiempo muerto esconde parte de la curvatura. Para Mo Kα solo (xraylib) sería 5.11. Con el filtro de Zr (0.15 mA) la curva queda algo menos curvada (≈ 6.5 → 5.8) y el ajuste sube a ≈ 6.1, más lejos de 5.11: a 21 kV las líneas K apenas se excitan, y el Zr quita el extremo duro del continuo (59–69 pm, sobre su borde K de 18.0 keV) y deja una banda de energías justo por debajo del borde (λ ≈ 69–92 pm). Las pendientes locales entre placas vecinas caen más (hasta ≈ 4.5 sin Zr); pida μ_eff = −ln T/d. Errores típicos: «Lambert siempre da una recta», «μ solo depende del material», «el Zr deja Kα puro», y usar d en mm con μ/ρ en cm²/g sin pasar a ρd en g/cm². La tarea se da por hecha con exposiciones en las siete ranuras con los mismos U, I y filtros, estables, sin saturar, y con un Δt tal que la caída de μ_eff entre 0.5 y 3.0 mm supere 5 σ de Poisson según el modelo (basta Δt ≳ 6 s); no se revisa el μ del estudiante. Para discutir: ¿qué rango de espesores, U y filtro hay que citar junto a un μ?',
    },
    'attenuation-material': {
      title: 'Atenuación según el material',
      concept: 'Coeficiente de absorción y número atómico',
      predict: 'Con el tubo a 30 kV, ¿cuál deja pasar más radiación: una placa de 0.4 mm de hierro (Z = 26) o una de 0.4 mm de circonio (Z = 40)?',
      options: ['El hierro', 'El circonio', 'Lo mismo'],
      act: 'Con 30 kV, Δβ = 0 y Δt = 30 s, abre las puertas, pon la rueda de materiales desde Montaje y ciérralas. Con TARGET lleva la rueda a cada ranura (0°, 10°, … 60°) y mide una exposición en cada una: poliestireno, Al, Fe, Cu, Zr, Ag y, en la última, la ranura abierta (sin placa). No pongas filtros. Puedes cambiar I entre ranuras, pero no mientras cuenta: si aparece el aviso de saturación, baja I y repite esa ranura; si una placa da muy pocas cuentas, sube I o alarga Δt.',
      actHelp: 'Anota la I de cada ranura. Si una ranura no se marca ✓, el contador se saturó, la tasa quedó muy cerca del fondo, o U o I cambiaron mientras contaba.',
      observe: 'Calcula T = (tasa con placa − fondo) / (tasa sin placa − fondo) para cada placa, con el fondo que mediste con el tubo apagado. Si usaste distinta I, escala antes la tasa sin placa por el cociente de corrientes. Ordena los materiales por T: ¿el orden coincide con el de Z?',
      explain:
        'A una energía dada, μ/ρ suele crecer con Z, pero no siempre. Al subir la energía del fotón, la absorción salta de golpe en el borde K: desde esa energía el fotón puede arrancar un electrón de la capa K. El borde K del Zr está en 18.0 keV, justo por encima de la línea Kα del Mo (17.5 keV): Kα, intensa a 30 kV, cae en la ventana de baja absorción del Zr y lo atraviesa (Kβ, 19.6 keV, queda sobre el borde y se absorbe). El Fe y el Cu, de menor Z, tienen su borde K muy por debajo (7.1 y 9.0 keV), así que su capa K absorbe Kα con fuerza; por lo mismo, el Ag (Z = 47, borde en 25.5 keV) deja pasar más que el Cu. Lo que importa es la energía del fotón frente a la del borde, no solo Z.',
      teacher:
        'Respuesta: el circonio. A 30 kV, 0.4 mm (sin tiempo muerto ni fondo): T ≈ 0.98 poliestireno, 0.62 Al, 3.3 × 10⁻³ Fe, 4.8 × 10⁻⁴ Cu, 4.8 × 10⁻³ Zr, 1.4 × 10⁻³ Ag; por T: PS > Al > Zr > Fe > Ag > Cu. El Zr transmite más que Fe y Cu porque Mo Kα (17.5 keV) cae en su ventana de baja absorción, justo bajo su borde K (18.0 keV): ≈ 70 % de lo que pasa por la placa de Zr es Kα; Kβ (19.6 keV) está sobre el borde y se absorbe. Fe y Cu solo dejan pasar el extremo duro del continuo (≈ 23–29 keV); el Ag supera al Cu porque Kα queda bajo su borde K (25.5 keV). Corriente: la guía EPN usa 0.02 mA en las tres primeras ranuras y 1 mA en el resto, pero a 0.02 mA el poliestireno y el haz abierto ya superan el umbral de saturación de la app (Rτ ≈ 0.32, ≈ 2400/s observadas), y a 1 mA el haz abierto lo supera de lejos: mídalos a 0.01 mA (≈ 1400/s). A 0.01 mA y 30 s pasan todas salvo el Cu (≈ 1/s, 4 σ sobre el fondo): necesita 0.02 mA o más, o un Δt mayor. Si se mezclan corrientes, corrija el tiempo muerto (R = m/(1 − mτ), τ = 100 µs) antes de escalar el haz abierto por I; sin corregir, el T de las placas pesadas sale un 8–16 % alto. Errores típicos: «μ siempre crece con Z», confundir los 30 kV del tubo con la energía de los fotones, no escalar por I y «arreglar» el punto del Zr en μ/ρ frente a Z. La tarea se da por hecha con las siete ranuras a 30 kV, con los mismos filtros, estables, sin saturar y a 5 σ sobre el fondo; no se revisa el μ del estudiante. Para discutir: el borde K del Ag también está por encima de Mo Kα; ¿por qué transmite menos que el Zr? (Kα queda lejos de su borde y, del mismo lado de un borde, μ/ρ crece con Z: 26.6 frente a 16.3 cm²/g; además el Ag es más denso, 10.5 frente a 6.5 g/cm³.)',
    },
    'kalpha-third-order': {
      title: 'Kα en tercer orden',
      concept: 'Órdenes de difracción',
      predict: 'En primer orden, Kα aparece en θ = 7.24°. ¿En qué ángulo θ esperas Kα de tercer orden?',
      options: [] as string[],
      act: 'Enciende HV y gira el cristal: arrástralo en Goniómetro o usa ADJUST en ⚙︎ Ajustes. Prueba tu ángulo y busca dónde el contador recibe Kα de tercer orden.',
      observe: 'En 3 × 7.24° solo llega el continuo débil; Kα aparece un poco más allá, con el contador en 2θ. En «Diferencia de camino» (botón λ), 2d sen θ = 3λ.',
      explain:
        'La ley de Bragg, nλ = 2d sen θ, fija sen θ, no θ: para n = 3 se triplica sen θ y θ = 22.21°, no 21.72°. La λ es la misma; solo cambia el orden. La «reflexión» es interferencia: las ondas dispersadas por planos vecinos se suman solo en estos ángulos.',
      teacher:
        'Respuesta: θ = 22.21° (tabla 2 del folleto); la tarea se cumple en el paso de 0.1° más cercano, 22.2°. Error típico: 21.72°, por triplicar θ; ahí solo llega el continuo. Otro: creer que el tercer orden es otra λ. Para discutir: ¿hasta qué orden permite la geometría ver Kα? (nλ ≤ 2d, n ≤ 7).',
    },
    'lif-kalpha-angle': {
      title: 'Kα con otro cristal',
      concept: 'La ley de Bragg y el cristal',
      predict: 'Con NaCl (d = 282.0 pm), la línea Kα del Mo aparece en primer orden en θ = 7.24°. En esta tarea el cristal es de LiF, con d = 201.4 pm. ¿En qué ángulo θ esperas Kα de primer orden?',
      options: [] as string[],
      act: 'En modo COUPLED (β = θ), haz un barrido desde 1.5° por debajo de tu ángulo hasta 1° por encima, con Δβ = 0.1° o menor, y pulsa SCAN. Así entran Kα y Kβ. Si el pico de Kα no aparece, corrige la ventana y repite.',
      observe: 'El pico de Kα queda a la derecha de los 7.24° del NaCl, y Kβ, a su izquierda, también se ha movido: los dos picos están más separados. En «Diferencia de camino» (botón λ), 2d sen θ = λ con la d del LiF.',
      explain:
        'La λ de Kα es la misma, 71.1 pm: la emite el tubo, y el cristal solo elige en qué ángulo llega al contador. En primer orden, la ley de Bragg da sen θ = λ / (2d): con una d menor, sen θ y θ crecen. Con LiF, θ = 10.16°; con NaCl, 7.24°. Por eso Kα y Kβ quedan más separados con LiF (1.15° frente a 0.82°): un cristal de d menor separa mejor las longitudes de onda.',
      teacher:
        'Respuesta: θ = arcsen(71.08 / (2 × 201.4)) = arcsen(0.1765) = 10.16° (NaCl: arcsen(71.08 / 564.02) = 7.24°). Con LiF, Kβ cae en 9.01°. Error típico: «el ángulo depende solo del tubo» (7.24°). Otro: escalar θ y no sen θ con el cociente de d; da 10.14°, casi igual a ángulos pequeños, pero en 3.er orden daría 31.1° en vez de 32.0°. Otro más: usar a₀ = 402.8 pm en vez de d = a₀/2 (da 5.06°). La altura del pico es una cota superior del modelo; un LiF real da menos (extinción secundaria): no sirve para comparar cristales. La tarea se cumple con un barrido COUPLED sobre LiF que cubra la línea ±0.7°, con Δβ ≤ 0.23° y a 5 σ sobre el fondo según el modelo; no se revisa el número del estudiante. Para discutir: ¿hasta qué orden permite la geometría ver Kα con LiF? (nλ ≤ 2d, n ≤ 5).',
    },
    'line-threshold': {
      title: 'Umbral de las líneas',
      concept: 'Líneas características',
      predict: 'Si bajas la tensión U, ¿por debajo de qué valor desaparece la línea Kα?',
      options: ['17.4 kV', '20.0 kV', 'Nunca: el cristal siempre refleja Kα en ese ángulo'],
      act: 'Haz un barrido (SCAN) de 5° a 9°. Baja U (control deslizante en Goniómetro, o U y ADJUST en ⚙︎ Ajustes) y repite hasta que Kα ya no aparezca, pero aún lleguen rayos X a su ángulo. Consejo: acelera el tiempo.',
      observe: 'Kα y Kβ desaparecieron juntos, pero a su ángulo sigue llegando radiación de frenado (el continuo).',
      explain:
        'Kα nace en dos pasos: un electrón del haz arranca un electrón de la capa K del Mo (eU > 20.0 keV) y un electrón L llena el hueco emitiendo un fotón de solo 17.4 keV. El continuo en ese ángulo solo pide λmín < λ(Kα), o sea U > 17.4 kV. Justo sobre 20 kV la línea aún es muy débil.',
      teacher:
        'Respuesta: 20.0 kV, donde eU iguala la energía de enlace K del Mo (20.0 keV). El distractor 17.4 kV es hc/λ(Kα), donde λmín = λ(Kα). Kβ (19.65 keV) también desaparece en 20.0 kV, no en 19.65: el umbral es la capa K. La línea crece como (U/U_K − 1)^1.67 y casi no se ve hasta unos 22 kV: para medir el umbral hay que extrapolar a cero el área del pico a varias U, con corriente baja (0.1 mA) para evitar el tiempo muerto. Ver docs/teacher-key.md.',
    },
    'lambda-three-orders': {
      title: 'λ con tres órdenes',
      concept: 'Medir longitudes de onda',
      predict: 'Con cada orden n calcularás λ = 2d sen θ / n para Kα. ¿Qué esperas obtener?',
      options: ['La misma λ en los tres órdenes', 'Una λ más corta en cada orden superior', 'Una λ más larga en cada orden superior'],
      act: 'Prepara un barrido COUPLED que cubra los tres primeros órdenes de Kβ y Kα, con un paso Δβ fino y un tiempo Δt largo, como en el folleto. Al terminar, descarga los datos con CSV en el Monitor. Si no se completa, revisa que el barrido empiece antes del primer pico y termine después del último, que el pico más débil se distinga del ruido y que el CSV sea del barrido terminado.',
      observe: 'Tienes tres pares de picos Kβ–Kα: en cada orden el par está más separado y es más débil.',
      explain:
        'Busca el centro de cada pico, calcula λ = 2d sen θ / n con d = a₀/2 = 282.01 pm y promedia los órdenes. Si todos dan la misma λ, confirmas la ley de Bragg: el orden cambia el ángulo, no la longitud de onda.',
      teacher:
        'Análisis fuera de la app (~20 min). Valores esperados en docs/teacher-key.md (tablas 3–5, datos simulados). Errores típicos: usar a₀ = 564.02 pm en vez de d = a₀/2 (λ sale el doble), tomar el ángulo del sensor (2θ) como θ, asignar un pico al orden equivocado. Para discutir: ¿por qué el par Kβ–Kα se separa más en órdenes altos?',
    },
    'moseley-k-edges': {
      title: 'Ley de Moseley',
      concept: 'Bordes de absorción K',
      predict: 'Un filtro de Zr (Z = 40) y otro de Ag (Z = 47) absorben mucho los fotones con energía mayor que la de su borde K (la energía necesaria para arrancar un electrón de la capa K). Al barrer β, ¿dónde esperas el borde de la Ag respecto al del Zr?',
      options: ['A un β menor que el del Zr', 'Al mismo β', 'A un β mayor que el del Zr'],
      act: 'Con 35 kV y 1 mA, en COUPLED, barre de 3.7° a 7.5° con Δβ = 0.1° y Δt = 5 s. Haz un barrido sin filtro y uno con cada filtro (Zr, Mo, Ag, In). Para cambiar de filtro, apaga HV, abre las puertas, colócalo en la ranura del sensor desde Montaje y ciérralas. Tras cada barrido, descarga el CSV en el Monitor. Todos los barridos deben tener la misma U y la misma I. Variante: repite todos los barridos con el cristal de LiF (d = 201.4 pm), que se elige en Montaje. Antes, traduce con la ley de Bragg la ventana 3.7°–7.5° del NaCl a LiF.',
      actHelp: 'Si un filtro no se marca ✓, revisa los límites, Δβ y que U e I sean las del barrido sin filtro.',
      observe: 'Al crecer β, la transmisión T = tasa con filtro / tasa sin filtro sube de golpe en un ángulo distinto para cada filtro. Los picos Kα y Kβ son del tubo: aparecen también sin filtro y casi se cancelan en T.',
      explain:
        'Para θ < θ_K (λ < λ_K) el fotón tiene energía para arrancar un electrón K y se absorbe; por encima de θ_K ya no, y la transmisión sube. Calcula λ_K = 2d sen θ_K con la d de tu cristal (NaCl: 282.01 pm; LiF: 201.4 pm). Cuanto mayor es Z, más fuerte atrae el núcleo a los electrones K: la energía de enlace sube, λ_K se acorta y, por la ley de Bragg, el borde de la Ag cae a menor θ que el del Zr. La ley de Moseley vale también para los bordes: √(1/λ_K) = √R (Z − σ_K), con R la constante de Rydberg (pendiente al cuadrado) y σ_K la constante de apantallamiento, cuánto reducen los demás electrones la carga que siente el electrón K (−ordenada / pendiente). Con NaCl, tu R saldrá unos % por debajo de R∞ = 1.097 × 10⁷ m⁻¹, por física y por la resolución angular finita del contador; con LiF, que separa más los ángulos, la diferencia es menor.',
      teacher:
        'Respuesta: la primera opción; el borde de la Ag cae en θ ≈ 4.94° y el del Zr en ≈ 7.02° (Z mayor → λ_K menor → θ menor). Errores típicos: «más Z o más energía, mayor ángulo»; usar el factor ¾ de la línea Kα (para el borde no va: R saldría un 33 % alta); tomar los picos Kα/Kβ del tubo por bordes. Del ajuste se espera R ≈ 1.06 × 10⁷ m⁻¹ y σ_K ≈ 2.9, R ≈ 3.5 % por debajo de R∞ (±1 % por ruido): ≈ 1.3 % es física (relatividad y un apantallamiento que crece con Z) y ≈ 2.3 % es el sesgo de resolución del contador. Variante con LiF (d = 201.4 pm): los bordes caen en ≈ 6.3° (In), 6.9° (Ag), 8.9° (Mo) y 9.8° (Zr), así que la ventana pasa a ≈ 6.0°–10.2° (se calcula con la d del cristal; todos los barridos de un grupo deben ser sobre el mismo cristal, y no se mezclan NaCl y LiF). La ventana del NaCl traducida a LiF es 5.2°–10.5°. Con LiF, el modelo sin ruido da R ≈ 1.09 × 10⁷ m⁻¹ (≈ 1 % bajo R∞) y σ_K ≈ 3.4–3.6, según la ventana: con mayor dispersión dθ/dλ, la misma resolución angular desplaza menos λ_K. El borde del Zr queda a 0.3° de Kα, así que su valor depende de hasta dónde llegue el barrido. Para discutir: ¿por qué LiF da un R más cercano a R∞? Para discutir: ¿por qué la transmisión sube con λ en el borde, en vez de bajar? Ver docs/teacher-key.md (Moseley).',
    },
  },
}
export type PedagogyDict = typeof es
