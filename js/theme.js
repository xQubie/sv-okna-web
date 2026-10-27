// One appearance follows the device. Previous theme choices are no longer read.
(() => {
    const system = matchMedia('(prefers-color-scheme: dark)');
    function apply() {
        const scheme = system.matches ? 'dark' : 'light';
        const color = scheme === 'dark' ? '#111a24' : '#dce4e7';
        document.documentElement.dataset.scheme = scheme;
        document.documentElement.style.colorScheme = scheme;
        document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
            meta.removeAttribute('media');
            meta.content = color;
        });
        try {
            const tg = window.Telegram?.WebApp;
            if (tg?.initData) {
                tg.setHeaderColor(color);
                tg.setBackgroundColor(color);
                tg.setBottomBarColor?.(color);
            }
        } catch { /* The Telegram bridge is optional in Safari. */ }
    }
    window.warehouseTheme = { apply };
    system.addEventListener('change', apply);
    apply();
})();
