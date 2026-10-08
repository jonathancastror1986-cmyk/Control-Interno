// ===================================================================
// LA CONCILIACIÓN: EL RELOJ CONTRA LA PLANILLA
// ===================================================================
// UNA SOLA LISTA DE SITUACIONES, PARA LAS DOS PANTALLAS QUE LA USAN
//
// ---------------------------------------------------------------------
// POR QUÉ ESTE ARCHIVO EXISTE
// ---------------------------------------------------------------------
//
// Porque la conciliación se dibujaba en dos lugares, cada uno con su propio
// vocabulario:
//
//     Supervisores → Conciliar el reloj con la planilla   "conciliarDia()"
//     Administración → Justificación diaria                "app.js"
//
// Y con dos vocabularios para la misma pregunta, hay dos respuestas a "¿esto qué
// es?", y sólo una puede estar bien.
//
// Y NO ES HIPOTÉTICO: SE MEDIÓ, Y DABA MAL EN DOS CASOS
//
// 1. EL GRAVE. La planilla decía "F" —ausente— y el reloj tenía marcaje de
//    entrada. "conciliarDia" no conocía más estado que "X", así que decía
//    "falta marcar en la planilla" y ofrecía el botón MARCAR ENTRADA. O sea,
//    invitaba a pisar la falta que alguien había puesto, cuando lo que había era
//    una contradicción entre dos fuentes. La Justificación Diaria, en cambio, sí
//    lo separaba: "falta_con_marca", con el texto "Los dos datos no pueden ser
//    ciertos a la vez".
//
// 2. EL RUIDOSO. Un trabajador con "L", "P", "V", "A" o "PP" —licencia, permiso,
//    vacaciones, accidente mutual, permiso pagado— y sin marcaje, que es lo
//    NORMAL, salía como "sin registro en ninguno de los dos". Cinco de los ocho
//    estados que acepta la base.
//
// Los dos bugs venían de la misma línea: sólo se miraba el estado "X".
//
// ---------------------------------------------------------------------
// Y LO QUE ESTE ARCHIVO NO HACE
// ---------------------------------------------------------------------
//
// No fusiona las dos pantallas, porque no son la misma pregunta:
//
//     la Conciliación pregunta  "¿el reloj coincide con lo que alguien escribió?"
//     la Justificación pregunta "¿qué hay que explicar de esta persona?"
//
// La Justificación además tiene horarios, tolerancias por equipo yEntradas
// esperadas —"tarde", "sin salida"—, que la Conciliación no puede saber. Eso se
// queda donde está.
//
// Lo que se comparte es lo que SÍ es la misma pregunta: qué significa que el reloj
// y la planilla no digan lo mismo. Y eso ahora tiene un solo nombre, un solo
// texto y un solo color, en las dos pantallas.

// ---------------------------------------------------------------------
// LOS ESTADOS QUE SON UNA JUSTIFICACIÓN, Y POR QUÉ NO SON UNA ALERTA
// ---------------------------------------------------------------------
// Y LA MISMA LISTA QUE USA LA JUSTIFICACIÓN DIARIA
//
// Se repite aquí a propósito. "esJustificado()" está en "app.js" y no se puede
// llamar desde acá sin depender del orden de carga de los archivos, y una función
// que devuelve una lista la puede leer cualquiera sin que se note de dónde salió.
//
// Y ESTOS SEIS NO SON UNA DISCREPANCIA
//
// Que falte el marcaje de alguien con licencia no es una contradicción: es lo
// esperado. Que la planilla diga "L" y el reloj no registre nada es la única
// combinación coherente. Antes salía como alerta, y una alerta que no es una
// alerta hace que se dejen de mirar las que sí lo son.
//
// Y "LL", DÍA LLUVIA, FALTABA, Y FUE UN BUG QUE SE MEDIÓ AL ESCRIBIR ESTA LISTA
//
// "LL" es un estado que la base acepta —la lista es 'X','F','P','L','A','PP','V','LL'—
// y que la Justificación Diaria ya nombraba con su texto, "Día lluvia". Pero no
// estaba en ninguna de las dos listas de justificados.
//
// O sea: un trabajador con día de lluvia y sin marcaje salía como "sin marcar", que
// es una falta inexistente. Con lluvia no se marca, porque no se trabaja; el día
// tiene su propio estado justamente para eso.
//
// Y NO SE METE "F" AQUÍ, POR MÁS PARECIDO QUE SEA
//
// "F" es ausencia. Que no haya marcaje de alguien que está ausente es lo esperado,
// pero lo esperado de otra manera: no es una justificación que alguien entregó, es
// que la persona faltó. Por eso tiene su propia situación, "ausente_coherente", y
// no comparte grupo con las licencias.
const ESTADOS_JUSTIFICADOS = ['P', 'L', 'V', 'A', 'PP', 'LL'];

// Y CUÁNTOS MINUTOS DE DIFERENCIA SON RUIDO Y NO UNA DISCREPANCIA
//
// Diez minutos es lo habitual entre un reloj y una anotación hecha por una
// persona: cinco minutos de diferencia es redondeo. Sale del código y no se
// cambia en pantalla, porque una tolerancia que se cambia desde donde se mira deja
// de ser una regla y pasa a ser una opinión.
const TOLERANCIA_MIN = 10;

// ---------------------------------------------------------------------
// EL CLASIFICADOR
// ---------------------------------------------------------------------
// Y ES UNA FUNCIÓN PURA: NO DIBUJA, NO ESCRIBE, NO LEE LA BASE
//
// Recibe lo que se sabe de una persona en un día y devuelve UN nombre de esta
// lista. Nada más. Con eso se puede probar sin pantalla y sin base, que es como se
// probó: los once casos de la tabla de abajo.
//
// Y POR QUÉ "X" ESTÁ SEPARADO DEL RESTO EN LA PRIMERA COMPROBACIÓN
//
// Porque "X" es el único estado que dice "estuvo". Con "F" la planilla dice que no
// estuvo, y con los cinco justificados no dice nada sobre la asistencia: dice por
// qué no. Y un "F" con marcaje es una contradicción entre dos fuentes, no una
// planilla incompleta.
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

// ---------------------------------------------------------------------
// LA HORA EN MINUTOS DESDE LA MEDIANOCHE
// ---------------------------------------------------------------------
// Y "minutosDe" YA EXISTE, Y NO SE REPITE
//
// Está en "views/administracion/administracion.js" y hace lo mismo: parte el texto
// por los dos puntos y devuelve los minutos. Los archivos comparten el ámbito, así
// que definirla otra vez acá no agrega nada: una de las dos pisa a la otra según
// cuál cargó último. Ver [word-04].
//
// Y LA RAZÓN DE QUE EXISTA "minutosDe", Y NO SE USE "new Date"
//
// "new Date('08:30')" en JavaScript es una fecha, no una hora: la interpreta como
// 30 de agosto de 2001, en la zona horaria de la máquina. La diferencia entre dos
// horas no puede depender de dónde se miró. Por eso la cuenta es de minutos.

// ---------------------------------------------------------------------
// LAS DOS FUNCIONES QUE USA EL RESTO DEL CÓDIGO
// ---------------------------------------------------------------------
// Y ESTÁ ANTES DE LA TABLA, Y POR QUÉ
//
// Porque no necesita la tabla: sólo junta los dos pasos. Y por eso queda en el
// bloque de arriba, que es el que la prueba se lleva para correr sin pantalla y sin
// base. Si estuviera después, la prueba tendría que llevarse la tabla también, y
// entonces probaría el dibujo y no el cálculo.
function situacionDe(planilla, marcaje) {
  const base = clasificarConciliacion(planilla, !!marcaje);
  if (base === 'diferencia_hora_o_coincide') {
    return desempatePorHora(planilla, marcaje);
  }
  return base;
}

// ---------------------------------------------------------------------
// LA LISTA ÚNICA, CON SU TEXTO, SU COLOR Y QUÉ SE PUEDE HACER
// ---------------------------------------------------------------------
// Y "queSePuedeHacer" ES LO QUE DICE EL BOTÓN, Y ES LA PARTE IMPORTANTE
//
// Porque "Falta marcar en la planilla" y "F con marcaje" se parecían en la tabla
// y son opuestas: la primera se resuelve marcando, la segunda NO. Un marcaje
//Automatico no puede resolver una contradicción: las dos fuentes pueden estar
//bien —el reloj marca de más— y hay que preguntarle a la persona.
//
// Y POR QUÉ NO HAY UNA "FALTA_MARCAR" EN ESTA LISTA
//
// Porque con "F" ya no es una planilla incompleta: es una contradicción. La
// planilla incompleta es cuando NO hay fila, y eso es "falta_en_planilla".
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
    texto: 'Está en la planilla como presente y el reloj no registró nada',
    corto: 'Presente sin reloj',
    color: 'var(--warn)',
    alerta: true,
    queSePuedeHacer: 'Revisar si corresponde, o marcar y avisar para dejarlo asentado',
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