(() => {
    const key = 'sv-warehouse-appearance-v1';
    const system = matchMedia('(prefers-color-scheme: dark)');
    let prefs = {style:'silver',mode:'system'};
    try { const saved = JSON.parse(localStorage.getItem(key)); if(saved && ['warm','blue','silver'].includes(saved.style))prefs.style=saved.style;if(saved && ['light','dark','system'].includes(saved.mode))prefs.mode=saved.mode; } catch {}
    function apply() {
        const scheme = prefs.mode === 'system' ? (system.matches ? 'dark' : 'light') : prefs.mode;
        const root = document.documentElement;
        root.dataset.style = prefs.style; root.dataset.scheme = scheme;root.style.colorScheme = scheme;
        const colors = {warm:{light:'#d5c6af',dark:'#241c16'},blue:{light:'#c5d9ea',dark:'#081a30'},silver:{light:'#d9e0dd',dark:'#171e20'}};
        const color=colors[prefs.style][scheme];
        document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>{meta.removeAttribute('media');meta.content=color;});
        try { const tg=window.Telegram?.WebApp;tg?.setHeaderColor(color);tg?.setBackgroundColor(color);tg?.setBottomBarColor?.(color); } catch {}
        window.dispatchEvent(new Event('warehouse-theme-change'));
    }
    window.warehouseTheme={get:()=>({...prefs}),apply,set:(changes)=>{
        if(['warm','blue','silver'].includes(changes.style))prefs.style=changes.style;
        if(['light','dark','system'].includes(changes.mode))prefs.mode=changes.mode;
        apply();try{localStorage.setItem(key,JSON.stringify(prefs));return true;}catch{return false;}
    }};
    system.addEventListener('change',()=>{if(prefs.mode==='system')apply();});
    apply();
})();
