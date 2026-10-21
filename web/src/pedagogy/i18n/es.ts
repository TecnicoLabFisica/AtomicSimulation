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
  progressLabels: { open: 'abierto' },
  task: {
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
      predict: 'Un filtro de Zr (Z = 40) y otro de Ag (Z = 47) absorben mucho los fotones con energía mayor que la de su borde K. Al barrer β, ¿dónde esperas el borde de la Ag respecto al del Zr?',
      options: ['A un β menor que el del Zr', 'Al mismo β', 'A un β mayor que el del Zr'],
      act: 'Con 35 kV y 1 mA, en COUPLED, barre de 3.7° a 7.5° con Δβ = 0.1° y Δt = 5 s. Haz un barrido sin filtro y uno con cada filtro (Zr, Mo, Ag, In). Monta el filtro en la ranura del sensor desde Montaje, con las puertas abiertas. Tras cada barrido, descarga el CSV en el Monitor. Todos los barridos deben tener la misma U y la misma I.',
      observe: 'La transmisión R(filtro) / R(abierto) salta hacia arriba en un ángulo, y cada filtro lo hace en uno distinto.',
      explain:
        'Cuanto mayor es Z, más fuerte atrae el núcleo a los electrones de la capa K: la energía de enlace sube y λ_K se acorta. Por la ley de Bragg, una λ más corta se refleja a un θ menor: el borde de la Ag queda a menor ángulo que el del Zr. La ley de Moseley, hallada para las líneas K, vale también para los bordes: √(1/λ_K) es lineal en Z. La pendiente al cuadrado da R, y la ordenada en el origen dividida por la pendiente da −σ_K. Tu R saldrá algo por debajo de R∞: en parte por física (los bordes K reales no son los del hidrógeno) y en parte por la resolución angular finita del contador.',
      teacher:
        'Respuesta: la primera opción; el borde de la Ag cae en θ ≈ 4.94° y el del Zr en ≈ 7.02° (Z mayor → λ_K menor → θ menor). Error típico: «más Z o más energía, mayor ángulo». Del ajuste se espera R ≈ 1.06 × 10⁷ m⁻¹ y σ_K ≈ 2.9, un 3.4 % por debajo de R∞: ≈ 1.3 % es física (los bordes K reales no son hidrogenoides) y ≈ 2.3 % es el sesgo de resolución del contador. Para discutir: ¿por qué la transmisión sube con λ en el borde, en vez de bajar? Ver docs/teacher-key.md (Moseley).',
    },
  },
}
export type PedagogyDict = typeof es
