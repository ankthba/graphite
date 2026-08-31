// MathLive setup: Desmos-style rendered math fields with a symbol keypad.
// Fields display LaTeX; the app's canonical format stays the plain-text
// expression language (src/math/latex.js bridges both directions).
import { MathfieldElement } from 'mathlive';
import 'mathlive/fonts.css';
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

// Create a rendered math field.
//  initialExpr: plain-text expression to display (best-effort pretty render)
//  onExpr(exprString) — called (debounced by caller) with the converted
//    plain-text expression, or onBadLatex(message) when unconvertible.
export function makeMathField(initialExpr, { placeholder = '', onExpr, onBadLatex } = {}) {
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

export function setFieldFromExpr(mf, expr) {
  const src = String(expr ?? '');
  const latex = exprToLatex(src);
  // fall back to the raw string for unparseable saved input
  mf.value = latex ?? src;
}
