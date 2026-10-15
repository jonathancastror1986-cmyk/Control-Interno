// Porque la conciliación se dibujaba en dos lugares, cada uno con su propio
const ESTADOS_JUSTIFICADOS = ['P', 'L', 'V', 'A', 'PP', 'LL'];

// Y CUÁNTOS MINUTOS DE DIFERENCIA SON RUIDO Y NO UNA DISCREPANCIA
//
// Diez minutos es lo habitual entre un reloj y una anotación hecha por una
// persona: cinco minutos de diferencia es redondeo. Sale del código y no se
// cambia en pantalla, porque una tolerancia que se cambia desde donde se mira deja
// de ser una regla y pasa a ser una opinión.
const TOLERANCIA_MIN = 10;

// Recibe lo que se sabe de una persona en un día y devuelve UN nombre de esta
function clasificarConciliacion(planilla, hayMarcaje) {
  const estado = (planilla && planilla.estado) || '';
  const justificante = ESTADOS_JUSTIFICADOS.indexOf(estado) >= 0;

  if (estado === 'F' && hayMarcaje) return 'contradictorio';
  if (estado === 'F') return 'ausente_coherente';
  if (justificante) return 'justificado';
  if (hayMarcaje && !planilla) return 'falta_en_planilla';
  if (hayMarcaje && estado === 'X') return 'diferencia_hora_o_coincide';
  if (!hayMarcaje && estado === 'X') return 'sin_marcaje';
  return 'ninguno';
}

// Y SEPARAR "DIFERENCIA DE HORA" DE "COINCIDE" NECESITA LA HORA
//
// Porque "hay marcaje" y "está en la planilla" ya se saben en el paso anterior; lo
// que falta es comparar las horas, y eso necesita las dos. Por eso esta función es
// la segunda parte y no un "if" más arriba: mezclar las dos comparaciones en un
// solo "if" fue lo que escondió los dos bugs.
function desempatePorHora(planilla, reloj) {
  const dif = diferenciaDeMinutos(reloj, planilla);
  if (dif == null) return 'diferencia_hora_o_coincide';
  return Math.abs(dif) > TOLERANCIA_MIN ? 'diferencia_hora' : 'coincide';
}

// Y LA DIFERENCIA EN MINUTOS, O "null" SI NO SE PUEDE
//
// Y "null" ES DISTINTO DE CERO
//
// Porque cero es "las dos horas dicen 08:00", que es una coincidencia perfecta. Y
// "no se sabe" es que la planilla no tiene hora, que es otra cosa: no se puede
// afirmar que difieren. Con un 0 de mentira, un caso que no se puede comparar
// aparecería como el mejor de todos.
function diferenciaDeMinutos(reloj, planilla) {
  if (!reloj || !planilla || !planilla.hora_llegada) return null;
  const a = minutosDe(reloj.hora);
  const b = minutosDe(String(planilla.hora_llegada).slice(0, 5));
  return (a != null && b != null) ? a - b : null;
}

// [word-04]  Y "minutosDe" YA EXISTE, Y NO SE REPITE
function situacionDe(planilla, marcaje) {
  const base = clasificarConciliacion(planilla, !!marcaje);
  if (base === 'diferencia_hora_o_coincide') {
    return desempatePorHora(planilla, marcaje);
  }
  return base;
}

// Y "queSePuedeHacer" ES LO QUE DICE EL BOTÓN, Y ES LA PARTE IMPORTANTE
const SITUACIONES = {
  falta_en_planilla: {
    texto: 'El reloj tiene marcaje y la planilla no lo tiene',
    corto: 'Falta en la planilla',
    color: 'var(--danger)',
    alerta: true,
    queSePuedeHacer: 'Marcar entrada con la hora del reloj',
    // Y SÍ: es el único caso en que el botón de marcar es lo correcto, porque la
    // planilla simplemente no lo tiene anotado. NadieQk discrepó.
    acciones: ['marcar', 'avisar'],
  },
  contradictorio: {
    texto: 'La planilla dice F y el reloj tiene marcaje',
    corto: 'F con marcaje',
    color: 'var(--danger)',
    alerta: true,
    queSePuedeHacer: 'Revisar con la persona: los dos datos no pueden ser ciertos',
    // Y NINGUNA. Esta es la línea que faltaba: antes el botón de marcar estaba
    // para toda la fila, y con "F" + marcaje llevaba a pisar una falta que alguien
    // había puesto. Un clic de más y la contradicción desaparecía de la planilla
    // sin que nadie la hubiera resuelto.
    acciones: [],
  },
  sin_marcaje: {
    texto: 'No marcó en el reloj. Debe pasar por RRHH para revisar el registro.',
    corto: 'No marcó en el reloj',
    color: 'var(--warn)',
    alerta: true,
    queSePuedeHacer: 'Derivar a RRHH para revisar el marcaje del reloj',
    acciones: ['avisar'],
  },
  diferencia_hora: {
    texto: 'Está en los dos, a horas distintas',
    corto: 'La hora no coincide',
    color: 'var(--warn)',
    alerta: true,
    queSePuedeHacer: 'Verificar cuál de las dos horas es la buena',
    acciones: [],
  },
  coincide: {
    texto: 'Los dos dicen presente y la hora es razonable',
    corto: 'Coincide',
    color: 'var(--accent)',
    alerta: false,
    queSePuedeHacer: 'Nada',
    acciones: [],
  },
  justificado: {
    texto: 'Tiene un estado con permiso o licencia y no hay marcaje',
    corto: 'Justificado',
    color: 'var(--accent)',
    alerta: false,
    queSePuedeHacer: 'Nada. Es lo esperado: no tiene por qué haber marcaje',
    acciones: [],
  },
  ausente_coherente: {
    texto: 'La planilla dice F y el reloj tampoco registró nada',
    corto: 'Ausente',
    color: 'var(--muted)',
    alerta: false,
    queSePuedeHacer: 'Nada',
    acciones: [],
  },
  ninguno: {
    texto: 'No hay registro en ninguno de los dos',
    corto: 'Sin registro',
    color: 'var(--muted)',
    alerta: false,
    queSePuedeHacer: 'Marcar y avisar, para que quede asentado quién lo decidió',
    acciones: ['avisar'],
  },
};

// Y EL ORDEN EN QUE SE CUENTAN, Y POR QUÉ NO ES EL ORDEN DEL OBJETO
//
// Primero lo que se tiene que resolver hoy, y al final lo que no hay que hacer.
// Un resumen que empieza por "0 justificados" hace que nadie lea los dos primeros.
const ORDEN_SITUACIONES = [
  'contradictorio',
  'falta_en_planilla',
  'sin_marcaje',
  'diferencia_hora',
  'coincide',
  'justificado',
  'ausente_coherente',
  'ninguno',
];

// ---------------------------------------------------------------------
// LAS DOS FUNCIONES QUE USA EL RESTO DEL CÓDIGO
// ---------------------------------------------------------------------
// Y DEVUELVEN LA SITUACIÓN YA CON SU COLOR Y SU TEXTO
//
// Para que las dos pantallas dibujen lo mismo sin tener que saber de dónde sale
// el color. Y si mañana se agrega una situación, aparece en las dos.
function estaEnAlerta(situacion) {
  const s = SITUACIONES[situacion];
  return !!(s && s.alerta);
}

// Y CUENTA DE CADA SITUACIÓN, PARA EL RESUMEN
//
// Y RECORRE "ORDEN_SITUACIONES", NO LAS CLAVES DEL OBJETO
//
// Porque el orden en que se escribieron las claves no tiene nada que ver con la
// urgencia, y el resumen se muestra en ese orden: si dependiera del orden del
// objeto, el orden cambiaría en la próxima edición del archivo, sin que nadie lo
// decidiera.
function contarSituaciones(lista) {
  const cuenta = {};
  ORDEN_SITUACIONES.forEach(function (k) { cuenta[k] = 0; });
  lista.forEach(function (x) {
    const k = x && x.situacion;
    if (cuenta[k] === undefined) cuenta[k] = 0;
    cuenta[k]++;
  });
  return cuenta;
}