// P9: unified unit selector — covers both the search modal and recipe editor contexts.
let _currentUnitFactor = 1;
let _currentUnitLabel  = 'g';
let _allMeasures       = [];

export function getCurrentUnit() {
  return { factor: _currentUnitFactor, label: _currentUnitLabel };
}

// Takes an array of { label, factor } measures (factor = grams per unit).
// For ml-containing measure lists, automatically derives tbsp and tsp.
// userAdded entries (custom servings) are already included; callers should put them first.
export function populateUnitSelector(measures) {
  const mlMeasure = measures.find(m => m.label === 'ml');
  _allMeasures = [...measures];
  if (mlMeasure) {
    const f = mlMeasure.factor;
    _allMeasures.push({ label: 'tbsp', factor: f * 15 });
    _allMeasures.push({ label: 'tsp',  factor: f * 5  });
  }

  const first = _allMeasures[0] || { label: 'g', factor: 1 };
  _currentUnitFactor = first.factor;
  _currentUnitLabel  = first.label;

  _renderUnitSelector();
  document.getElementById('amount-input').value = 1;
}

function _renderUnitSelector() {
  const sel = document.getElementById('unit-selector');
  const currentLabel = _currentUnitLabel;
  sel.innerHTML = '';
  _allMeasures.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = m.label;
    if (m.label === currentLabel) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = () => {
    selectUnit(_allMeasures[parseInt(sel.value)]);
  };
}


export function selectUnit(measure) {
  const currentQty = parseFloat(document.getElementById('amount-input').value) || 0;
  const newQty = (currentQty * _currentUnitFactor) / measure.factor;
  _currentUnitFactor = measure.factor;
  _currentUnitLabel  = measure.label;
  document.getElementById('amount-input').value = Math.round(newQty * 10) / 10 || 1;
}
