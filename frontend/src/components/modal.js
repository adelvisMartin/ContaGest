import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material';
import { CgConfirmDialog } from './vnext/index.js';
import { normalizeUiError } from './vnext/formContracts.js';
import { createContaGestMuiTheme } from './muiThemeAdapter.js';

const text = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
}[char]));

let activeReactRoot=null;
let activeCancel=null;
let restoreFocusTarget=null;

function documentThemeMode(){
  const requested=document.documentElement?.dataset?.theme||'light';
  if(requested==='light'||requested==='dark')return requested;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches?'dark':'light';
}

function unmountReactModal({restoreFocus=true}={}){
  const root=document.getElementById('modal-root');
  activeReactRoot?.unmount();
  activeReactRoot=null;
  activeCancel=null;
  if(root)root.innerHTML='';
  document.body.classList.remove('modal-open');
  const target=restoreFocusTarget;
  restoreFocusTarget=null;
  if(restoreFocus&&target?.focus)queueMicrotask(()=>target.focus());
}

function ConfirmHost({title,body,message,confirmText='Confirmar',cancelText='Cancelar',tone='danger',onConfirm,settle}){
  const [saving,setSaving]=React.useState(false);
  const [errorText,setErrorText]=React.useState('');
  const confirm=async()=>{
    if(saving)return;
    setSaving(true);
    setErrorText('');
    try{await onConfirm?.();settle(true);}
    catch(error){setSaving(false);setErrorText(normalizeUiError(error).message);}
  };
  return React.createElement(CgConfirmDialog,{open:true,title,description:body??message??'',confirmLabel:confirmText,cancelLabel:cancelText,danger:tone==='danger',saving,errorText,onConfirm:confirm,onClose:()=>!saving&&settle(false)});
}

export const Modal = {
  open({ title = '', body = '', actions = '', ariaLabel = '' }) {
    activeCancel?.();
    unmountReactModal({restoreFocus:false});
    const root = document.getElementById('modal-root');
    if (!root) return null;
    document.body.classList.add('modal-open');
    root.innerHTML = `
      <div class="cg-modal-backdrop" data-modal-backdrop>
        <section class="cg-modal cg-ui-card" role="dialog" aria-modal="true" aria-label="${text(ariaLabel || title || 'Diálogo')}">
          <header class="cg-modal-header">
            <h2 class="cg-ui-section-title cg-modal-title">${text(title)}</h2>
            <button type="button" data-modal-close class="cg-ui-button cg-ui-button-secondary cg-ui-button-icon" aria-label="Cerrar diálogo"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </header>
          <div class="cg-modal-body">${body}</div>
          ${actions ? `<footer class="cg-modal-actions">${actions}</footer>` : ''}
        </section>
      </div>`;
    const closeButton = root.querySelector('[data-modal-close]');
    closeButton?.addEventListener('click', () => this.close());
    root.querySelector('[data-modal-backdrop]')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) this.close();
    });
    requestAnimationFrame(() => closeButton?.focus());
    return root.querySelector('.cg-modal');
  },

  close() {
    if(activeCancel){activeCancel();return;}
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
    document.body.classList.remove('modal-open');
  },

  confirm({ title, body, message, confirmText = 'Confirmar', cancelText = 'Cancelar', tone = 'danger', onConfirm }) {
    const root=document.getElementById('modal-root');
    if(!root)return Promise.resolve(false);
    activeCancel?.();
    unmountReactModal({restoreFocus:false});
    restoreFocusTarget=document.activeElement;
    document.body.classList.add('modal-open');
    return new Promise((resolve)=>{
      let settled=false;
      const settle=(value)=>{
        if(settled)return;
        settled=true;
        activeCancel=null;
        unmountReactModal({restoreFocus:true});
        resolve(value);
      };
      activeCancel=()=>settle(false);
      activeReactRoot=createRoot(root);
      const theme=createContaGestMuiTheme(documentThemeMode());
      activeReactRoot.render(React.createElement(ThemeProvider,{theme},React.createElement(ConfirmHost,{title,body,message,confirmText,cancelText,tone,onConfirm,settle})));
    });
  }
};
