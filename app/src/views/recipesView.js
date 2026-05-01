import { state, dispatch } from '../store/store.js';
import { showUndo } from './snackbar.js';
import { config, bringToFront } from './uiState.js';
import { escapeHtml } from './escape.js';
import { genId } from '../domain/id.js';
import { findNutrientVal, netCarbsFromMap } from '../domain/nutrients.js';
import { getRecipeWeightG as _getRecipeWeightG, getRecipeNutrientsPer100g as _getRecipeNutrientsPer100g } from '../domain/recipes.js';

function getRecipeWeightG(r)        { return _getRecipeWeightG(r, state.recipes); }
function getRecipeNutrientsPer100g(r) { return _getRecipeNutrientsPer100g(r, state.recipes, state.foods); }

export function renderRecipes() {
  const wrap = document.getElementById('recipes-wrap');
  const ids  = Object.keys(state.recipes).sort((a, b) => (state.recipes[b].lastEdited || 0) - (state.recipes[a].lastEdited || 0));

  let html = `<div style="padding-top:32px;border-top:1px solid var(--border)">
    <div class="section-hdr" style="margin-bottom:16px">
      <div class="section-title">Recipes</div>
      <button class="btn primary" data-action="new-recipe">+ New Recipe</button>
    </div>`;

  if (!ids.length) {
    html += `<div class="empty-msg"><div class="e-icon">📖</div><div class="e-title">No recipes yet</div><p>Create a recipe to use across your meal plan.</p></div>`;
  } else {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">';
    ids.forEach(id => {
      const r       = state.recipes[id];
      const totalG  = getRecipeWeightG(r);
      const servingG = r.yields > 0 ? Math.round(totalG / r.yields) : Math.round(totalG);
      const n        = totalG ? getRecipeNutrientsPer100g(r) : {};
      const kcal     = totalG ? Math.round(findNutrientVal(n, 'energy')) : 0;
      const kcalServ = servingG ? Math.round(kcal * servingG / 100) : 0;
      const scale    = servingG / 100;
      const protS = totalG ? (findNutrientVal(n, 'protein') * scale).toFixed(1) : '—';
      const carbS = totalG ? (netCarbsFromMap(n) * scale).toFixed(1) : '—';
      const fatS  = totalG ? ((findNutrientVal(n, 'lipid') || findNutrientVal(n, 'fat')) * scale).toFixed(1) : '—';
      html += `<div class="recipe-card" style="cursor:pointer" data-action="edit-recipe" data-id="${id}">
        <div class="recipe-card-title">${escapeHtml(r.name || 'Unnamed')}</div>
        <div style="font-size:11px;color:var(--text-dim)">${r.ingredients.length} ingredient${r.ingredients.length!==1?'s':''} · ${r.yields} serving${r.yields !== 1 ? 's' : ''}</div>
        <div style="font-size:11px;color:var(--text-dimmer)">${totalG?Math.round(totalG*10)/10+'g total':'—'} · ${servingG?servingG+'g/serving':'—'}</div>
        <div style="font-size:11px;color:var(--text-dimmer);margin-top:3px">per serving: ${kcalServ||'—'} kcal · P ${protS}g · C ${carbS}g · F ${fatS}g</div>
      </div>`;
    });
    html += '</div>';
  }
  html += '</div>';

  // Custom Ingredients section
  html += `<div style="margin-top:36px;padding-top:32px;border-top:1px solid var(--border)">
    <div class="section-hdr" style="margin-bottom:14px">
      <div class="section-title">Custom Ingredients</div>
      <button class="btn sm" data-action="new-custom-ing">+ New</button>
    </div>`;
  const cids = Object.keys(state.customIngredients).sort((a, b) => (state.customIngredients[b].lastEdited || 0) - (state.customIngredients[a].lastEdited || 0));
  if (!cids.length) {
    html += `<div style="color:var(--text-dimmer);font-size:12px;padding:16px 0">No custom ingredients yet. Add one for foods not found in any database.</div>`;
  } else {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">`;
    cids.forEach(id => {
      const ci   = state.customIngredients[id];
      const ciFood = state.foods['custom_' + id];
      const n    = ciFood?.nutrients || ci.nutrients || {};
      const kcal = Math.round(n['Energy'] || 0);
      const prot = (n['Protein'] || 0).toFixed(1);
      const carb = (n['Carbohydrate, by difference'] || 0).toFixed(1);
      const fat  = (n['Total lipid (fat)'] || 0).toFixed(1);
      const forkBadge = ci.backedByFdcId ? `<span title="Forked from ${escapeHtml(ci.backedByName || ci.backedByFdcId)}" style="font-size:11px;color:var(--good);margin-right:3px">⎇</span>` : '';
      const nb = ciFood?.nutrientBasis;
      const perLabel = !nb ? '100g'
        : nb.unit === 'serving' ? escapeHtml(nb.label || 'serving')
        : nb.unit === 'g' || nb.unit === 'ml' ? `${nb.qty}${nb.unit}`
        : `${nb.qty} ${escapeHtml(nb.unit)}`;
      html += `<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:5px;cursor:pointer" data-action="edit-custom-ing" data-id="${id}">
        <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${forkBadge}${escapeHtml(ci.name)}</div>
        <div style="font-size:11px;color:var(--text-dim)">${kcal} kcal/${perLabel}</div>
        <div style="font-size:10px;color:var(--text-dimmer)">P ${prot}g · C ${carb}g · F ${fat}g</div>
      </div>`;
    });
    html += '</div>';
  }
  html += '</div>';
  wrap.innerHTML = html;
}

export function showRecipePDFDialog() {
  document.getElementById('recipe-pdf-dialog')?.remove();

  const ids = Object.keys(state.recipes).sort(
    (a, b) => (state.recipes[b].lastEdited || 0) - (state.recipes[a].lastEdited || 0)
  );
  const sel = new Set(ids);

  const overlay = document.createElement('div');
  overlay.id = 'recipe-pdf-dialog';
  overlay.className = 'modal-overlay';

  function build() {
    const nSel = ids.filter(id => sel.has(id)).length;
    const allSel = ids.length > 0 && nSel === ids.length;
    const scrollTop = overlay.querySelector('[data-role=list]')?.scrollTop ?? 0;

    const listHTML = ids.length
      ? ids.map((id, i) => {
          const r = state.recipes[id];
          return `<label style="display:flex;align-items:center;gap:10px;padding:9px 0;${i > 0 ? 'border-top:1px solid var(--border);' : ''}cursor:pointer">
            <input type="checkbox" ${sel.has(id) ? 'checked' : ''} data-id="${escapeHtml(id)}" style="accent-color:var(--accent);width:15px;height:15px;flex-shrink:0">
            <div>
              <div style="font-size:13px;font-weight:500">${escapeHtml(r.name || 'Unnamed')}</div>
              <div style="font-size:11px;color:var(--text-dimmer)">${r.ingredients.length} ingredient${r.ingredients.length !== 1 ? 's' : ''} · ${r.yields} serving${r.yields !== 1 ? 's' : ''}</div>
            </div>
          </label>`;
        }).join('')
      : `<div style="color:var(--text-dimmer);font-size:13px;padding:12px 0">No recipes to export.</div>`;

    overlay.innerHTML = `<div class="modal" style="width:400px;max-height:80vh;display:flex;flex-direction:column">
      <div class="modal-header" style="display:flex;align-items:center">
        <div class="modal-title">Export Recipes as PDF</div>
        ${ids.length ? `<button class="btn sm" data-action="pdf-toggle-all" style="margin-left:auto;flex-shrink:0">${allSel ? 'Deselect All' : 'Select All'}</button>` : ''}
      </div>
      <div data-role="list" style="padding:0 20px;overflow-y:auto;flex:1">${listHTML}</div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">
        <button class="btn sm" data-action="pdf-cancel">Cancel</button>
        <button class="btn primary sm" data-action="pdf-export"${!nSel ? ' disabled style="opacity:0.45;cursor:default"' : ''}>${nSel ? `Export ${nSel} as PDF` : 'Select recipes…'}</button>
      </div>
    </div>`;

    const list = overlay.querySelector('[data-role=list]');
    if (list) list.scrollTop = scrollTop;
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } }

  function updateButtons() {
    const nSel = ids.filter(id => sel.has(id)).length;
    const allSel = ids.length > 0 && nSel === ids.length;
    const exportBtn = overlay.querySelector('[data-action=pdf-export]');
    if (exportBtn) {
      exportBtn.textContent = nSel ? `Export ${nSel} as PDF` : 'Select recipes…';
      exportBtn.disabled = !nSel;
      exportBtn.style.opacity = nSel ? '' : '0.45';
      exportBtn.style.cursor  = nSel ? '' : 'default';
    }
    const toggleBtn = overlay.querySelector('[data-action=pdf-toggle-all]');
    if (toggleBtn) toggleBtn.textContent = allSel ? 'Deselect All' : 'Select All';
  }

  overlay.addEventListener('change', e => {
    const chk = e.target;
    if (chk.type === 'checkbox' && chk.dataset.id) {
      if (chk.checked) sel.add(chk.dataset.id);
      else             sel.delete(chk.dataset.id);
      updateButtons();
    }
  });

  overlay.addEventListener('click', async e => {
    if (e.target === overlay) { close(); return; }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    switch (el.dataset.action) {
      case 'pdf-cancel':
        close();
        break;
      case 'pdf-toggle-all':
        if (ids.every(id => sel.has(id))) sel.clear();
        else ids.forEach(id => sel.add(id));
        overlay.querySelectorAll('input[type=checkbox][data-id]').forEach(chk => {
          chk.checked = sel.has(chk.dataset.id);
        });
        updateButtons();
        break;
      case 'pdf-export':
        if (!sel.size) return;
        close();
        await generateRecipePDF([...sel]);
        break;
    }
  });

  document.addEventListener('keydown', onEsc);
  build();
  document.body.appendChild(overlay);
  overlay.classList.add('open');
  bringToFront(overlay);
}

export function copyCustomIng(id) {
  const src = state.customIngredients[id];
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id   = genId();
  copy.name = src.name + ' (copy)';
  dispatch({ type: 'CUSTOM_ING_COPY', payload: copy });
  showUndo(`Copied "${src.name}"`, () => dispatch({ type: 'CUSTOM_ING_DELETE', payload: { id: copy.id } }));
}

// ── PDF export ───────────────────────────────────────────────────────────────
const _GREEN      = [45, 90, 39];
const _GREEN_MID  = [80, 140, 70];
const _GREEN_PALE = [100, 140, 80];
const _GRAY_LT    = [210, 210, 200];
const _GRAY_MID   = [150, 150, 140];
const _GRAY_TXT   = [110, 110, 110];
const _DARK       = [40, 40, 40];
const _WHITE      = [255, 255, 255];

function _addPageFooter(doc, pageW, margin, pageNum, totalPages) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(..._GRAY_MID);
  doc.text('Nourish', margin, 290);
  doc.text(`${pageNum} / ${totalPages}`, pageW - margin, 290, { align: 'right' });
}

function _renderRecipeToDoc(doc, r, pageW, margin, contentW, startY) {
  const totalG   = getRecipeWeightG(r);
  const servingG = r.yields > 0 ? Math.round(totalG / r.yields) : Math.round(totalG);
  const n        = totalG ? getRecipeNutrientsPer100g(r) : {};
  const scale    = servingG / 100;
  const kcalPerServ  = servingG ? Math.round(findNutrientVal(n, 'energy') * scale) : 0;
  const protPerServ  = servingG ? (findNutrientVal(n, 'protein') * scale).toFixed(1) : '0';
  const carbPerServ  = servingG ? (netCarbsFromMap(n) * scale).toFixed(1) : '0';
  const fatPerServ   = servingG ? ((findNutrientVal(n, 'lipid') || findNutrientVal(n, 'fat')) * scale).toFixed(1) : '0';
  const fiberPerServ = servingG ? (findNutrientVal(n, 'fiber') * scale).toFixed(1) : '0';

  let y = startY;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(..._GREEN);
  const nameLines = doc.splitTextToSize(r.name || 'Unnamed Recipe', contentW);
  doc.text(nameLines, margin, y);
  y += nameLines.length * 8 + 2;

  doc.setDrawColor(..._GRAY_LT); doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  doc.setLineWidth(0.2);
  y += 5;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(..._GRAY_TXT);
  doc.text(`Makes ${r.yields} serving${r.yields !== 1 ? 's' : ''} · ${totalG ? Math.round(totalG) + 'g total' : '—'} · ${servingG ? servingG + 'g per serving' : '—'}`, margin, y);
  y += 10;

  if (config.pdfShowMacros) {
    doc.setFillColor(248, 248, 244); doc.setDrawColor(220, 220, 210);
    doc.roundedRect(margin, y, contentW, 22, 2, 2, 'FD');
    const colW = contentW / 5;
    [['Calories', kcalPerServ + ' kcal'], ['Protein', protPerServ + 'g'], ['Carbs', carbPerServ + 'g'], ['Fat', fatPerServ + 'g'], ['Fiber', fiberPerServ + 'g']].forEach(([label, val], i) => {
      const cx = margin + colW * i + colW / 2;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(..._GRAY_TXT);
      doc.text(label.toUpperCase(), cx, y + 7, { align: 'center' });
      doc.setFontSize(11); doc.setTextColor(..._DARK);
      doc.text(String(val), cx, y + 15.5, { align: 'center' });
    });
    y += 28;
  }

  // "Ingredients" heading with left accent bar
  doc.setFillColor(..._GREEN);
  doc.rect(margin, y - 4, 1.5, 5.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(..._GREEN);
  doc.text('INGREDIENTS', margin + 4, y); y += 7;

  const qtyColW = 26;
  r.ingredients.forEach(ing => {
    if (y > 272) { doc.addPage(); y = margin; }
    const qtyStr = ing.qty !== undefined
      ? `${Math.round(ing.qty * 100) / 100} ${ing.unit || 'g'}`
      : `${Math.round(ing.amountG)}g`;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(..._DARK);
    doc.text(qtyStr, margin + qtyColW, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    const nameLines2 = doc.splitTextToSize(ing.name, contentW - qtyColW - 3);
    doc.text(nameLines2, margin + qtyColW + 3, y);
    y += nameLines2.length * 5.5 + 2;
  });

  return y;
}

export async function generateRecipePDF(ids) {
  const recipeIds = (ids || []).filter(id => state.recipes[id]);
  if (!recipeIds.length) return;

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
  const pageW    = 210;
  const margin   = 18;
  const contentW = pageW - margin * 2;
  const doc      = new jsPDF({ unit: 'mm', format: 'a4' });

  // ── Brand header (page 1) ─────────────────────────────────────────────────
  const HDR_H = 19;
  doc.setFillColor(..._GREEN);
  doc.rect(0, 0, pageW, HDR_H, 'F');
  doc.setFillColor(..._GREEN_MID);
  doc.rect(0, HDR_H, pageW, 1.5, 'F');

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(..._WHITE);
  doc.text('NOURISH', margin, 12.5);
  const nourishW = doc.getTextWidth('NOURISH');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(180, 225, 160);
  doc.text('Recipe Collection', margin + nourishW + 5, 12.5);

  let y = HDR_H + 13;

  recipeIds.forEach((id, recipeIdx) => {
    if (recipeIdx > 0) {
      if (config.pdfPagePerRecipe) {
        doc.addPage();
        y = margin;
      } else {
        y += 10;
        if (y > 260) { doc.addPage(); y = margin; }
        y += 10;
      }
    }
    y = _renderRecipeToDoc(doc, state.recipes[id], pageW, margin, contentW, y);
  });

  // ── Footer on every page ──────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    _addPageFooter(doc, pageW, margin, p, totalPages);
  }

  doc.save('nourish-recipes.pdf');
}
