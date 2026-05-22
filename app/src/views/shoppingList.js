import { state } from '../store/store.js';
import { config, bringToFront } from './uiState.js';
import { DAYS, MEALS } from '../domain/constants.js';
import { getRecipeWeightG } from '../domain/recipes.js';
import { getDisplayName } from '../domain/nutrients.js';

// ── Aggregation ────────────────────────────────────────────────────────────

const _CONVERTIBLE_UNITS = new Set([
  'g', 'kg', 'mg', 'oz', 'lb', 'lbs',
  'ml', 'l', 'tsp', 'tbsp', 'cup', 'fl oz', 'fluid oz', 'cl', 'dl',
]);

// Convertible units (weight/volume) → merge to one line; named portions
// (medium, small, clove, slice…) → separate line per unit so the list
// stays actionable ("1 medium apple" + "1 small apple", not "302g apple").
function _mergeGrams(acc, key, name, amtG, ingUnit, ingQty) {
  const isConvertible = !ingUnit || _CONVERTIBLE_UNITS.has(ingUnit.toLowerCase());
  const mapKey = isConvertible ? key : key + '\x00' + ingUnit;
  const prefUnit = (ingUnit && ingUnit !== 'g') ? ingUnit : null;

  if (acc.grams.has(mapKey)) {
    const entry = acc.grams.get(mapKey);
    entry.amtG += amtG;
    if (isConvertible) {
      if (!entry.conflict) {
        const curPref = entry.prefUnit || 'g';
        const newPref = prefUnit || 'g';
        if (curPref !== newPref) entry.conflict = true;
        else if (prefUnit) entry.prefQty += ingQty;
      }
    } else {
      entry.prefQty += ingQty;
    }
  } else {
    acc.grams.set(mapKey, { name, amtG, prefUnit, prefQty: prefUnit ? ingQty : 0, conflict: false });
  }
}

function _fmtShoppingQty(amtG, prefUnit, prefQty, conflict) {
  if (!conflict && prefUnit) {
    if (prefUnit === 'ml') {
      if (prefQty >= 1000) return { qty: Math.round(prefQty / 100) / 10, unit: 'L' };
      return { qty: Math.round(prefQty), unit: 'ml' };
    }
    return { qty: Math.round(prefQty * 100) / 100, unit: prefUnit };
  }
  if (amtG >= 1000) return { qty: Math.round(amtG / 100) / 10, unit: 'kg' };
  return { qty: Math.round(amtG), unit: 'g' };
}

function _collectIngredients(ings, servingScale, recipes, acc) {
  ings.forEach(ing => {
    if (ing.type === 'recipe') {
      const recipe = recipes[ing.recipeId];
      if (!recipe) return;
      const totalG = getRecipeWeightG(recipe, recipes);
      const subScale = (ing.unit === 'serving' && (ing.qty || 0) > 0 && recipe.yields > 0)
        ? ing.qty / recipe.yields * servingScale
        : totalG > 0 ? (ing.amountG || 0) / totalG * servingScale : 0;
      _collectIngredients(recipe.ingredients, subScale, recipes, acc);
    } else if (state.foods?.[ing.fdcId]?.nutrientBasis?.unit === 'serving') {
      const key = (ing.fdcId || ing.name) + '\x00' + (ing.unit || 'serving');
      const qty = (ing.qty || 1) * servingScale;
      const name = getDisplayName(ing.fdcId, state.foods, state.foodAliases) || ing.name;
      if (acc.serving.has(key)) acc.serving.get(key).qty += qty;
      else acc.serving.set(key, { name, qty, unit: ing.unit || 'serving' });
    } else {
      const key = ing.fdcId || ing.name;
      const amtG = (ing.amountG || 0) * servingScale;
      const ingQty = (ing.qty || 0) * servingScale;
      const name = getDisplayName(ing.fdcId, state.foods, state.foodAliases) || ing.name;
      _mergeGrams(acc, key, name, amtG, ing.unit, ingQty);
    }
  });
}

function _processTopLevelIng(ing, recipes, acc) {
  if (ing.type === 'recipe') {
    const recipe = recipes[ing.recipeId];
    if (!recipe) return;
    const totalG = getRecipeWeightG(recipe, recipes);
    const servingScale = (ing.unit === 'serving' && (ing.qty || 0) > 0 && recipe.yields > 0)
      ? ing.qty / recipe.yields
      : totalG > 0 ? (ing.amountG || 0) / totalG : 0;
    _collectIngredients(recipe.ingredients, servingScale, recipes, acc);
  } else if (state.foods?.[ing.fdcId]?.nutrientBasis?.unit === 'serving') {
    const key = (ing.fdcId || ing.name) + '\x00' + (ing.unit || 'serving');
    const name = getDisplayName(ing.fdcId, state.foods, state.foodAliases) || ing.name;
    if (acc.serving.has(key)) acc.serving.get(key).qty += ing.qty || 1;
    else acc.serving.set(key, { name, qty: ing.qty || 1, unit: ing.unit || 'serving' });
  } else {
    const key = ing.fdcId || ing.name;
    const name = getDisplayName(ing.fdcId, state.foods, state.foodAliases) || ing.name;
    _mergeGrams(acc, key, name, ing.amountG || 0, ing.unit, ing.qty || 0);
  }
}

function buildShoppingList() {
  const acc = { grams: new Map(), serving: new Map() };
  const { plan, extraFoods = [], recipes } = state;

  DAYS.forEach(day => {
    MEALS.forEach(meal => {
      (plan[day]?.[meal] || []).forEach(ing => _processTopLevelIng(ing, recipes, acc));
    });
  });
  extraFoods.forEach(ing => _processTopLevelIng(ing, recipes, acc));

  const items = [];
  acc.grams.forEach(({ name, amtG, prefUnit, prefQty, conflict }) => {
    if (amtG > 0 || prefQty > 0) {
      const { qty, unit } = _fmtShoppingQty(amtG, prefUnit, prefQty, conflict);
      items.push({ name, qty, unit });
    }
  });
  acc.serving.forEach(({ name, qty, unit }) => {
    if (qty > 0) items.push({ name, qty: Math.round(qty * 10) / 10, unit });
  });
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Raw text modal ──────────────────────────────────────────────────────────
function showShoppingListRaw(items) {
  const text = items.map(item => {
    const amt = item.unit === 'g' ? `${item.qty}g` : `${item.qty} ${item.unit}`;
    return `[${amt}] ${item.name}`;
  }).join('\n');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:480px;max-height:80vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
          <div class="modal-title" style="margin:0">Shopping List</div>
          <button class="btn sm" data-role="close" style="min-width:0;padding:4px 10px">✕</button>
        </div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px">${items.length} item${items.length !== 1 ? 's' : ''} — select all and copy, or paste into Notion, Notes, etc.</div>
      </div>
      <div class="modal-body" style="padding:16px 20px">
        <textarea data-role="text" readonly style="width:100%;height:320px;font-family:monospace;font-size:12px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:10px;color:var(--text);resize:vertical;box-sizing:border-box;line-height:1.7">${text}</textarea>
        <button class="btn primary sm" data-role="copy" style="margin-top:10px">Copy to clipboard</button>
        <span data-role="copy-status" style="font-size:11px;color:var(--good);margin-left:10px;opacity:0;transition:opacity 0.3s"></span>
      </div>
    </div>`;

  let onKey;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  onKey = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
    const role = e.target.closest('[data-role]')?.dataset.role;
    if (role === 'close') close();
    if (role === 'copy') {
      const html = items.map(item => {
        const amt = item.unit === 'g' ? `${item.qty}g` : `${item.qty} ${item.unit}`;
        return `<p>[${amt}] ${item.name}</p>`;
      }).join('');
      const showCopied = () => {
        const st = overlay.querySelector('[data-role=copy-status]');
        st.textContent = 'Copied!';
        st.style.opacity = '1';
        setTimeout(() => { st.style.opacity = '0'; }, 1800);
      };
      // contenteditable select → execCommand: works in Firefox on file:// URLs
      const el = document.createElement('div');
      el.contentEditable = 'true';
      el.style.cssText = 'position:fixed;opacity:0;pointer-events:none;top:0;left:0';
      el.innerHTML = html;
      document.body.appendChild(el);
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand('copy');
      sel.removeAllRanges();
      el.remove();
      if (ok) { showCopied(); return; }
      // async fallback
      navigator.clipboard.writeText(text).then(showCopied).catch(() => {
        overlay.querySelector('[data-role=text]').select();
      });
    }
  });

  document.body.appendChild(overlay);
  overlay.classList.add('open');
  bringToFront(overlay);
}

// ── PDF export ─────────────────────────────────────────────────────────────
export async function generateShoppingListPDF() {
  const items = buildShoppingList();
  if (!items.length) { alert('Your weekly plan is empty — add some meals first.'); return; }

  if (!window.jspdf) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load jsPDF'));
      document.head.appendChild(s);
    });
  }

  const { jsPDF } = window.jspdf;
  const pageW = 210, margin = 18, contentW = pageW - margin * 2;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // ── Brand header ──────────────────────────────────────────────────────────
  const HDR_H = 19;
  doc.setFillColor(45, 90, 39);
  doc.rect(0, 0, pageW, HDR_H, 'F');
  doc.setFillColor(80, 140, 70);
  doc.rect(0, HDR_H, pageW, 1.5, 'F');

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(255, 255, 255);
  doc.text('NOURISH', margin, 12.5);
  const nourishW = doc.getTextWidth('NOURISH');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(180, 225, 160);
  doc.text('Shopping List', margin + nourishW + 5, 12.5);

  let y = HDR_H + 11;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110, 110, 110);
  doc.text(`${items.length} item${items.length !== 1 ? 's' : ''}`, margin, y);
  y += 9;

  doc.setDrawColor(210, 210, 200); doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  doc.setLineWidth(0.2);
  y += 7;

  const qtyColW = 28;
  items.forEach((item, i) => {
    if (y > 275) { doc.addPage(); y = margin; }

    const amtStr = `${item.qty}${item.unit === 'g' ? 'g' : ' ' + item.unit}`;
    doc.setFontSize(10);
    const nameLines = doc.splitTextToSize(item.name, contentW - 5 - qtyColW - 3);
    const rowH = nameLines.length * 5.5 + 2.5;

    if (i % 2 === 0) {
      doc.setFillColor(244, 248, 242);
      doc.rect(margin - 2, y - 5, contentW + 4, rowH, 'F');
    }

    const isDotted = config.shoppingListFormat === 'dotted';
    if (isDotted) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(110, 110, 110);
      doc.text('•', margin, y);
    } else {
      const cb = new doc.AcroFormCheckBox();
      cb.fieldName = `item_${i}`;
      cb.x = margin; cb.y = y - 3.5; cb.width = 3.5; cb.height = 3.5;
      cb.value = 'Off';
      doc.addField(cb);
    }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(110, 110, 110);
    doc.text(amtStr, margin + 5 + qtyColW, y, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
    doc.text(nameLines, margin + 5 + qtyColW + 3, y);
    y += rowH;
  });

  // ── Footer on every page ──────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 150, 140);
    doc.text('Nourish', margin, 290);
    doc.text(`${p} / ${totalPages}`, pageW - margin, 290, { align: 'right' });
  }

  doc.save('nourish-shopping-list.pdf');
}

// ── Entry point ─────────────────────────────────────────────────────────────
export async function generateShoppingList() {
  const items = buildShoppingList();
  if (!items.length) { alert('Your weekly plan is empty — add some meals first.'); return; }
  if (config.shoppingListFormat === 'raw') {
    showShoppingListRaw(items);
  } else {
    await generateShoppingListPDF();
  }
}
