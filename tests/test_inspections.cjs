// Ejecutar con node tests/test_inspections.cjs (sin paquetes adicionales).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.py'), 'utf8');
const logic = source.slice(source.indexOf("const INSPECTION_KEY="), source.indexOf('async function initialize()'));
let saved = null, fail = false;
const elements = Object.fromEntries(['radarSelect', 'checks', 'timerBtn', 'timer', 'inspectionMessage',
    'checkVisual', 'checkCalibration', 'checkPhoto', 'evidencePreview', 'evidenceFile', 'evidenceVideo', 'closure', 'problem', 'work', 'parts', 'notes', 'result', 'reason', 'reasonWrap', 'workDetail', 'reasonDetail', 'partsWrap', 'workDetailWrap', 'reasonDetailWrap'].map(id => [id, { value: '', textContent: '', pause(){} }]));
const context = vm.createContext({
    console, Date,
    document: {querySelectorAll:()=>[], querySelector: id => elements[id.slice(1)], getElementById: id => elements[id]},
    localStorage: {
        setItem: (_, value) => { if (fail) throw new Error('Storage full'); saved = value; },
        getItem: () => saved,
    },
});
vm.runInContext(logic + `
    renderInspections=()=>{};showTab=()=>{};
    radarCatalog=[{id:'A',name:'Equipo A'},{id:'B',name:'Equipo B'}];
`, context);
const run = code => vm.runInContext(code, context);
const state = () => JSON.parse(run('JSON.stringify(inspectionState)'));
elements.radarSelect.value = 'A';
run('updateCheck(0,true);updateCheck(1,true)');
assert.equal(state().history.length, 0);
elements.radarSelect.value = 'B';
run('updateCheck(1,true)');
assert.deepEqual(state().drafts.B.checks, [false,true,false]);
assert.deepEqual(state().drafts.A.checks, [true,true,false]);
elements.radarSelect.value = 'A';
run("updateCheck(2,true)");
assert.equal(state().history.length, 0, 'Sin imagen no puede finalizar');
fail = true;
run("updateCheck(2,true,\'data:image/png;base64,aGVsbG8=\')");
assert.equal(state().history.length, 0, 'Un error de guardado debe dejar la tarea pendiente');
assert.equal(state().drafts.A.checks[2], false);
fail = false;
run("updateCheck(2,true,'data:image/png;base64,aGVsbG8=');updateCheck(2,true)");
assert.equal(state().history.length, 0, 'La checklist no cierra automáticamente');
run('finishInspection()');
assert.equal(state().history.length, 0, 'Formulario vacío bloqueado');
elements.problem.value='Falla';elements.work.value='Ajuste';elements.result.value='Funcionando';
run('finishInspection();finishInspection()');
assert.equal(state().history.length, 1, 'El cierre no se duplica');
assert.equal(state().history[0].radar_id, 'A');
assert.equal(state().history[0].started_at, null);
assert.equal(state().drafts.A, undefined);
assert.equal(run("isCompleted('A')"), true);
run('inspectionState={drafts:{},history:[]};restoreState()');
assert.equal(state().history.length, 1, 'El historial se restaura');
assert.equal(state().history[0].evidence, 'data:image/png;base64,aGVsbG8=', 'La imagen persiste con la inspección');
assert.deepEqual(state().drafts.B.checks, [false,true,false]);
elements.radarSelect.value = 'B';
run('toggleTimer()');
assert.equal(typeof state().drafts.B.runningSince, 'number');
run("updateCheck(0,true);updateCheck(2,true,'data:video/mp4;base64,aGVsbG8=')");
elements.problem.value='Falla';elements.work.value='Diagnóstico';elements.result.value='Sin resolver';
run('finishInspection()');
assert.equal(state().history.length, 1, 'Sin motivo no cierra');
elements.reason.value='Falta repuesto';run('finishInspection()');
assert.equal(state().history[0].needs_revisit, true);
assert.equal(state().history[0].evidence, 'data:video/mp4;base64,aGVsbG8=');
assert.equal(state().history.length, 2);
assert.ok(state().history[0].started_at);
assert.equal(state().drafts.B, undefined, 'Finalizar detiene el cronómetro');
console.log('OK: controles independientes, guardado fallido, cierre único, restauración y cronómetro.');

assert.equal(run("hasEvidence({evidence:'data:video/mp4;base64,aGVsbG8='})"),true);
