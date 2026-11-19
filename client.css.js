/**
 * Stylesheet for both surfaces (the model seat panel and the settings tab).
 *
 * Its own chunk so the two feature chunks never carry the ~130 CSS rules
 * that only the entry point injects, once, into the document head.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-panel',
  chunk: 'client.css.js',
  factory(require) {
    'use strict';

    const CSS = `
.dshmp-trigger{display:inline-flex;align-items:center;gap:6px;height:28px;max-width:360px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#333);font-size:12px;cursor:pointer;transition:background .12s,border-color .12s;}
.dshmp-trigger:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,#ececec);}
.dshmp-trigger:disabled{opacity:.55;cursor:default;}
.dshmp-trigger-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-chev{font-size:9px;color:var(--dsw-alias-label-tertiary,#999);transform:rotate(-90deg);transition:transform .15s;}
.dshmp-trigger[aria-expanded="true"] .dshmp-chev{transform:none;}
.dshmp-spin{width:11px;height:11px;flex:none;border:2px solid var(--dsw-alias-border-l2,#d0d0d0);border-top-color:var(--dsw-alias-brand-primary,#4a7cff);border-radius:50%;animation:dshmp-rot .8s linear infinite;}
@keyframes dshmp-rot{to{transform:rotate(360deg);}}
.dshmp-panel{position:fixed;z-index:1000;width:min(680px,calc(100vw - 24px));max-height:min(72vh,620px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);overflow:hidden;font-size:13px;color:var(--dsw-alias-label-primary,#333);}
.dshmp-msg{padding:8px 12px;font-size:12px;color:var(--dsw-alias-state-error-primary,#d93025);border-bottom:1px solid var(--dsw-alias-border-l1,#e6e6e6);}
.dshmp-searchrow{padding:10px 12px 8px;}
.dshmp-search{width:100%;box-sizing:border-box;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#333);font-size:13px;outline:none;}
.dshmp-search:focus{border-color:var(--dsw-alias-brand-primary,#4a7cff);}
.dshmp-search::placeholder{color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-head{display:grid;grid-template-columns:minmax(0,1fr) 64px 250px;gap:10px;padding:4px 16px 8px;color:var(--dsw-alias-label-tertiary,#999);font-size:11px;}
.dshmp-body{flex:1;min-height:0;overflow-y:auto;padding:0 10px 10px;}
.dshmp-opts{flex:none;display:flex;align-items:center;gap:10px;padding:9px 14px 11px;border-top:1px solid var(--dsw-alias-border-l1,#e6e6e6);background:var(--dsw-alias-bg-layer-1,#f5f5f5);}
.dshmp-optlabel{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,#333);flex:none;}
.dshmp-optsub{font-size:11px;color:var(--dsw-alias-label-tertiary,#999);flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-opts .dshmp-toggle{margin-left:auto;}
.dshmp-pgroup{margin:8px 2px;border:1px solid var(--dsw-alias-border-l1,#e6e6e6);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);overflow:visible;}
.dshmp-pgroup.discount{background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 88%,#22c55e);border-color:color-mix(in srgb,var(--dsw-alias-border-l1,#e6e6e6) 50%,#22c55e);}
.dshmp-phead{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:14px minmax(0,1fr) max-content minmax(52px,max-content);column-gap:8px;align-items:center;padding:11px 14px;border-radius:10px 10px 0 0;background:inherit;cursor:pointer;user-select:none;}
.dshmp-pgroup:not(:has(.dshmp-row)) .dshmp-phead{border-radius:10px;}
.dshmp-phead:hover{background:var(--dsw-alias-bg-layer-1,#f5f5f5);}
.dshmp-pgroup.discount .dshmp-phead:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#f5f5f5) 88%,#22c55e);}
.dshmp-phead:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4a7cff);outline-offset:-2px;}
.dshmp-arrow{font-size:11px;width:12px;flex:none;color:var(--dsw-alias-label-tertiary,#999);transition:transform .12s;}
.dshmp-arrow.open{transform:rotate(90deg);}
.dshmp-pname{font-size:15px;font-weight:600;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-pthird{flex:none;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums;}
.dshmp-pcount{display:inline-flex;align-items:center;justify-self:stretch;height:20px;box-sizing:border-box;padding:0 0 0 8px;font-size:12px;line-height:1;color:var(--dsw-alias-label-tertiary,#999);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dshmp-pinfo{display:flex;align-items:center;gap:8px;justify-self:end;min-width:0;}
.dshmp-money{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#333);font-variant-numeric:tabular-nums;}
.dshmp-muted{font-weight:400;color:var(--dsw-alias-label-tertiary,#999);opacity:.75;cursor:help;}
.dshmp-note{font-size:11px;font-weight:400;max-width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-plan{display:inline-flex;align-items:center;gap:8px;}
.dshmp-bar{width:84px;height:6px;border-radius:3px;background:var(--dsw-alias-border-l2,#d0d0d0);overflow:hidden;}
.dshmp-bar-sm{width:44px;height:5px;}
.dshmp-plans{display:flex;align-items:center;gap:8px;flex:none;}
.dshmp-wbar{display:flex;align-items:center;gap:5px;}
.dshmp-wtag{font-size:10px;line-height:1;color:var(--dsw-alias-label-tertiary,#999);font-variant-numeric:tabular-nums;white-space:nowrap;}
.dshmp-bar-fill{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary,#4a7cff);transition:width .2s;}
.dshmp-bar-fill.low{background:var(--dsw-alias-state-error-primary,#d93025);}
.dshmp-pct{font-size:12px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums;min-width:34px;text-align:right;}
.dshmp-row{display:grid;grid-template-columns:minmax(0,1fr) 64px 250px;gap:9px;align-items:center;padding:6px 14px 6px 30px;cursor:pointer;border-left:2px solid transparent;outline:none;}
.dshmp-row.alt{background:rgba(128,128,128,.055);}
.dshmp-row.last{border-radius:0 0 10px 10px;}
.dshmp-row:hover{background:var(--dsw-alias-bg-layer-1,#f5f5f5);}
.dshmp-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4a7cff);outline-offset:-2px;}
.dshmp-row.current{background:linear-gradient(90deg,color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 18%,transparent),color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 6%,transparent));border-left-color:var(--dsw-alias-brand-primary,#4a7cff);border-left-width:3px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 16%,transparent);}
.dshmp-row.current .dshmp-name{font-weight:600;color:var(--dsw-alias-brand-primary,#4a7cff);}
.dshmp-row.current:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 20%,transparent);}
.dshmp-row.busy{opacity:.5;pointer-events:none;}
.dshmp-namewrap{display:flex;align-items:center;gap:6px;min-width:0;}
.dshmp-name{display:block;flex:1 1 auto;min-width:0;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-mult{flex:none;padding:0 5px;border-radius:5px;font-size:10.5px;font-weight:700;line-height:15px;letter-spacing:.2px;color:#15803d;background:color-mix(in srgb,#22c55e 15%,transparent);border:1px solid color-mix(in srgb,#22c55e 40%,transparent);font-variant-numeric:tabular-nums;}
.dshmp-cell{display:flex;justify-content:center;align-items:center;min-width:0;}
.dshmp-cell-effort{align-items:center;}
.dshmp-dash{color:var(--dsw-alias-label-tertiary,#999);text-align:center;}
.dshmp-toggle{position:relative;width:34px;height:19px;flex:none;padding:0;border:none;border-radius:10px;background:var(--dsw-alias-border-l2,#d0d0d0);cursor:pointer;transition:background .12s;}
.dshmp-toggle:disabled{opacity:.5;cursor:default;}
.dshmp-toggle.on{background:var(--dsw-alias-brand-primary,#4a7cff);}
.dshmp-knob{position:absolute;top:2.5px;left:2.5px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-switch-thumb,#fff);transition:transform .12s;}
.dshmp-toggle.on .dshmp-knob{transform:translateX(15px);}
.dshmp-effort-card{position:relative;display:flex;flex-direction:row;align-items:center;gap:6px;width:100%;height:30px;box-sizing:border-box;padding:0 6px 0 7px;border-radius:8px;background:rgba(128,128,128,.08);}
.dshmp-effort-side{display:flex;flex-direction:row;align-items:center;flex:none;width:44px;min-width:0;overflow:hidden;}
.dshmp-reset{position:static;flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:none;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:1;cursor:pointer;opacity:.45;transition:opacity .12s;}
.dshmp-reset-slot{display:block;flex:none;width:18px;height:18px;}
.dshmp-effort-card:hover .dshmp-reset{opacity:1;}
.dshmp-reset:hover{background:var(--dsw-alias-bg-layer-2,#ececec);color:var(--dsw-alias-label-primary,#333);}
.dshmp-effort-name{display:block;font-size:11.5px;font-weight:700;text-align:left;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:linear-gradient(90deg,#4c7dff,#8b5cf6);-webkit-background-clip:text;background-clip:text;color:transparent;}
.dshmp-effort-name.off{background:none;-webkit-background-clip:border-box;background-clip:border-box;color:var(--dsw-alias-label-tertiary,#999);font-weight:600;}
.dshmp-range{-webkit-appearance:none;appearance:none;display:block;flex:1 1 auto;min-width:0;height:20px;margin:0;border:none;border-radius:8px;cursor:pointer;outline:none;background-color:transparent;background-image:radial-gradient(1.5px 1.5px at 9% 32%,rgba(255,255,255,.95),rgba(255,255,255,0)),radial-gradient(1.2px 1.2px at 23% 68%,rgba(255,255,255,.85),rgba(255,255,255,0)),radial-gradient(1.5px 1.5px at 37% 30%,rgba(255,255,255,.9),rgba(255,255,255,0)),radial-gradient(1.1px 1.1px at 51% 72%,rgba(255,255,255,.8),rgba(255,255,255,0)),radial-gradient(1.4px 1.4px at 65% 36%,rgba(255,255,255,.9),rgba(255,255,255,0)),radial-gradient(1.2px 1.2px at 79% 64%,rgba(255,255,255,.85),rgba(255,255,255,0)),radial-gradient(1.5px 1.5px at 92% 33%,rgba(255,255,255,.9),rgba(255,255,255,0)),linear-gradient(90deg,#4c7dff 0%,#6a5cff 55%,#8b5cf6 100%);}
.dshmp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:none;box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:pointer;}
.dshmp-range::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#fff;border:none;box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:pointer;}
.dshmp-range::-moz-range-track{background:transparent;}
.dshmp-range:disabled{opacity:.55;cursor:default;}
.dshmp-empty{padding:22px 12px;text-align:center;color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-retry{margin-top:10px;height:28px;padding:0 14px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#333);font-size:12px;cursor:pointer;}
.dshmp-retry:hover{background:var(--dsw-alias-bg-layer-2,#ececec);}
.dshmp-fail{margin:8px 2px 0;padding:7px 12px;font-size:11.5px;color:var(--dsw-alias-state-error-primary,#d93025);border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#d93025) 35%,transparent);border-radius:8px;}
/* Settings → Plugins → Balance display: cookie-only usage. */
.dshmp-set{padding:4px 2px 18px;font-size:13px;color:var(--dsw-alias-label-primary,#333);}
.dshmp-set-head{margin-bottom:14px;}
.dshmp-set-title{font-size:15px;font-weight:600;margin-bottom:4px;}
.dshmp-set-sub{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary,#666);max-width:64ch;}
.dshmp-set-tips{margin-top:10px;display:flex;flex-direction:column;gap:6px;}
.dshmp-set-tip{margin:0;padding:7px 10px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#666);border-left:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 55%,transparent);background:var(--dsw-alias-bg-layer-1,#f5f5f5);border-radius:0 6px 6px 0;}
.dshmp-set-card{margin-bottom:10px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1,#e6e6e6);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);}
.dshmp-set-top{display:flex;align-items:center;gap:10px;}
.dshmp-set-name{font-size:14px;font-weight:600;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-set-pill{flex:none;font-size:11px;line-height:1;padding:4px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-pill.on{color:var(--dsw-alias-brand-primary,#4a7cff);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 10%,transparent);}
.dshmp-set-meta{display:flex;align-items:center;gap:10px;margin-top:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-meta code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-secondary,#666);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-set-meta a{flex:none;color:var(--dsw-alias-brand-primary,#4a7cff);text-decoration:none;}
.dshmp-set-meta a:hover{text-decoration:underline;}
.dshmp-set-usage{display:flex;align-items:center;gap:10px;margin-top:9px;font-size:12px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums;}
.dshmp-set-usage.err{color:var(--dsw-alias-state-error-primary,#d93025);}
.dshmp-set-plan{font-weight:600;color:var(--dsw-alias-label-primary,#333);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-set-bar{flex:none;width:120px;height:6px;border-radius:3px;background:var(--dsw-alias-border-l2,#d0d0d0);overflow:hidden;}
.dshmp-set-bar-fill{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary,#4a7cff);transition:width .2s;}
.dshmp-set-bar-fill.low{background:var(--dsw-alias-state-error-primary,#d93025);}
.dshmp-set-pct{min-width:40px;}
.dshmp-set-until{color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-form{margin-top:10px;}
.dshmp-set-input{width:100%;box-sizing:border-box;min-height:62px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#333);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.5;outline:none;resize:vertical;}
.dshmp-set-input:focus{border-color:var(--dsw-alias-brand-primary,#4a7cff);}
.dshmp-set-input.over{outline:2px dashed var(--dsw-alias-brand-primary,#4a7cff);outline-offset:2px;}
.dshmp-set-pastehint{margin-top:6px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-login{margin-top:8px;}
.dshmp-set-loginbox{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:6px;}
.dshmp-set-logintip{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-code{font:600 15px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:2px;padding:3px 8px;border-radius:6px;background:var(--dsw-alias-bg-surface-secondary,rgba(127,127,127,.12));user-select:all;}
.dshmp-set-loginnerr{margin-bottom:6px;font-size:11px;line-height:1.5;color:var(--dsw-alias-status-danger,#e5484d);}
.dshmp-set-actions{display:flex;gap:8px;margin-top:9px;}
.dshmp-set-btn{height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#333);font-size:12px;cursor:pointer;transition:background .12s,border-color .12s;}
.dshmp-set-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,#ececec);}
.dshmp-set-btn:disabled{opacity:.55;cursor:default;}
.dshmp-set-btn.primary{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 16%,transparent);color:var(--dsw-alias-brand-primary,#4a7cff);font-weight:600;}
.dshmp-set-err{display:flex;align-items:center;gap:10px;margin:0 0 10px;padding:8px 12px;font-size:12px;color:var(--dsw-alias-state-error-primary,#d93025);border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#d93025) 35%,transparent);border-radius:8px;}
.dshmp-set-note{margin:0 0 10px;font-size:12px;color:var(--dsw-alias-label-secondary,#666);}
.dshmp-set-note.bad{color:var(--dsw-alias-state-error-primary,#d93025);}
.dshmp-set-empty{padding:16px 2px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-foot{margin-top:12px;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-group{margin:14px 0 6px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-opt{flex:none;font-size:10px;line-height:1;padding:3px 6px;border-radius:999px;border:1px dashed var(--dsw-alias-border-l2,#d0d0d0);color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-hint{margin-top:6px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-wins{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.dshmp-set-win{display:flex;align-items:center;gap:5px;}
.dshmp-set-wlabel{font-size:10px;color:var(--dsw-alias-label-tertiary,#999);}
`;

    return { CSS };
  },
});
