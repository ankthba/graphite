// MathLive setup: Desmos-style rendered math fields with a symbol keypad.
// Fields display LaTeX; the app's canonical format stays the plain-text
// expression language (src/math/latex.js bridges both directions).
import { MathfieldElement, convertLatexToMarkup } from 'mathlive';
import 'mathlive/fonts.css';
import 'mathlive/static.css';
import { latexToExpr, exprToLatex } from '../math/latex.js';

// fonts ship inside the bundle via fonts.css — disable runtime fetching
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

// the symbol picker: numbers/operators, common symbols, and a Greek board
// (θ, φ, ρ, π live here — plus typing "theta", "phi", … converts as you type)
window.mathVirtualKeyboard.layouts = ['numeric', 'symbols', 'greek'];

const EXTRA_SHORTCUTS = {
  theta: '\\theta',
  phi: '\\phi',
  varphi: '\\phi',
  rho: '\\rho',
  tau: '\\tau',
  pi: '\\pi',
};

function baseField(placeholder) {
  const mf = new MathfieldElement();
  mf.className = 'expr-input';
  mf.setAttribute('math-virtual-keyboard-policy', 'manual'); // in-field keypad toggle
  if (placeholder) mf.setAttribute('placeholder', `\\text{${placeholder}}`);
  // options that need a live mathfield are applied once it's in the DOM
  mf.addEventListener('mount', () => {
    mf.inlineShortcuts = { ...mf.inlineShortcuts, ...EXTRA_SHORTCUTS };
    mf.menuItems = []; // no context menu
    mf.smartFence = true;
  });
  return mf;
}

// Create a rendered math field.
//  initialExpr: plain-text expression to display (best-effort pretty render)
//  onExpr(exprString) — called (debounced by caller) with the converted
//    plain-text expression, or onBadLatex(message) when unconvertible.
export function makeMathField(initialExpr, { placeholder = '', onExpr, onBadLatex } = {}) {
  const mf = baseField(placeholder);
  setFieldFromExpr(mf, initialExpr);
  mf.addEventListener('input', () => {
    const latex = mf.getValue('latex-expanded');
    if (!latex.trim()) { onExpr?.(''); return; }
    try {
      onExpr?.(latexToExpr(latex));
    } catch (e) {
      onBadLatex?.(e.message);
    }
  });
  return mf;
}

// split a LaTeX string at top-level '=' signs (ignoring ones inside braces)
function splitEquation(latex) {
  const parts = [];
  let depth = 0, cur = '';
  for (let i = 0; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (ch === '=' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

// Equation field for implicit surfaces: type the whole equation
// (e.g. x² + y² + z² = 9), Desmos-style. Reports both sides as expressions;
// with no '=' the right side defaults to 0.
export function makeEquationField(lhsExpr, rhsExpr, { placeholder = '', onEquation, onBadLatex } = {}) {
  const mf = baseField(placeholder);
  const L = exprToLatex(String(lhsExpr ?? '')) ?? String(lhsExpr ?? '');
  const R = exprToLatex(String(rhsExpr ?? '0')) ?? String(rhsExpr ?? '0');
  mf.value = L.trim() ? `${L} = ${R}` : '';
  mf.addEventListener('input', () => {
    const latex = mf.getValue('latex-expanded');
    if (!latex.trim()) { onEquation?.('', '0'); return; }
    const parts = splitEquation(latex).map((p) => p.trim());
    try {
      if (parts.length === 1) onEquation?.(latexToExpr(parts[0]), '0');
      else if (parts.length === 2 && parts[0] && parts[1]) {
        onEquation?.(latexToExpr(parts[0]), latexToExpr(parts[1]));
      } else {
        onBadLatex?.('Write one equation with a single = sign');
      }
    } catch (e) {
      onBadLatex?.(e.message);
    }
  });
  return mf;
}

export function setFieldFromExpr(mf, expr) {
  const src = String(expr ?? '');
  const latex = exprToLatex(src);
  // fall back to the raw string for unparseable saved input
  mf.value = latex ?? src;
}

// Small static typeset math (no field, just markup) for collapsed rows.
export function makeMathPreview(latex) {
  const span = document.createElement('span');
  span.className = 'nrow-preview';
  try {
    span.innerHTML = convertLatexToMarkup(latex);
  } catch {
    span.textContent = latex;
  }
  return span;
}

// Best-effort LaTeX for a plain expression (raw text fallback handled by caller).
export function previewLatex(expr) {
  return exprToLatex(String(expr ?? ''));
}

// Typeset LaTeX into an element (static markup; falls back to plain text).
export function renderLatexInto(el, latex) {
  try {
    el.innerHTML = convertLatexToMarkup(latex);
  } catch {
    el.textContent = latex;
  }
}
