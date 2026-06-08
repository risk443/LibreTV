(function () {
    const VERSION_URL = '/version.json';
    const STORAGE_KEY = 'xueAppWebVersion';
    const DISMISSED_KEY = 'xueAppDismissedVersion';
    const PROMPTED_KEY = 'xueAppPromptedUpdateId';

    function injectUpdateStyles() {
        if (document.getElementById('xue-update-style')) return;
        const style = document.createElement('style');
        style.id = 'xue-update-style';
        style.textContent = `
            .xue-update-backdrop {
                position: fixed;
                inset: 0;
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                background: rgba(17, 24, 39, 0.42);
                backdrop-filter: blur(8px);
            }
            .xue-update-card {
                width: min(92vw, 360px);
                border-radius: 22px;
                padding: 22px;
                color: #3f2a2a;
                background: linear-gradient(145deg, #fffaf0 0%, #ffe4ef 100%);
                border: 1px solid rgba(244, 114, 182, 0.28);
                box-shadow: 0 22px 60px rgba(99, 32, 60, 0.24);
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            .xue-update-title {
                display: flex;
                gap: 10px;
                align-items: center;
                margin: 0 0 10px;
                font-size: 20px;
                font-weight: 800;
            }
            .xue-update-message {
                margin: 0 0 14px;
                color: #6b4a4a;
                line-height: 1.55;
                font-size: 14px;
            }
            .xue-update-notes {
                margin: 0 0 18px;
                padding-left: 18px;
                color: #7c4b5d;
                font-size: 13px;
                line-height: 1.65;
            }
            .xue-update-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
            }
            .xue-update-actions button {
                border: 0;
                border-radius: 999px;
                padding: 11px 12px;
                font-weight: 700;
                cursor: pointer;
            }
            .xue-update-later {
                color: #7c4b5d;
                background: rgba(255, 255, 255, 0.74);
            }
            .xue-update-now {
                color: white;
                background: linear-gradient(135deg, #ec4899, #f59e0b);
                box-shadow: 0 10px 24px rgba(236, 72, 153, 0.28);
            }
            .xue-version-pill {
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-left: 6px;
                padding: 2px 8px;
                border-radius: 999px;
                color: #fff;
                background: #ec4899;
                font-size: 12px;
                animation: xuePulse 1.7s ease-in-out infinite;
            }
            @keyframes xuePulse { 0%, 100% { opacity: 1; } 50% { opacity: .65; } }
        `;
        document.head.appendChild(style);
    }

    async function fetchSiteVersion() {
        const response = await fetch(`${VERSION_URL}?_=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('版本信息获取失败');
        return response.json();
    }

    function currentStoredVersion() {
        return localStorage.getItem(STORAGE_KEY) || '';
    }

    function setCurrentVersion(version) {
        if (version) localStorage.setItem(STORAGE_KEY, version);
    }

    async function clearWebCache() {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(registration => registration.update().catch(() => null)));
        }
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }
    }

    async function applyUpdate(versionInfo) {
        const button = document.querySelector('.xue-update-now');
        if (button) {
            button.disabled = true;
            button.textContent = '更新中...';
        }
        localStorage.removeItem(DISMISSED_KEY);
        if (versionInfo.promptId) localStorage.setItem(PROMPTED_KEY, versionInfo.promptId);
        setCurrentVersion(versionInfo.version);
        await clearWebCache();
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.set('_v', versionInfo.build || versionInfo.version || Date.now().toString());
        window.location.replace(cleanUrl.toString());
    }

    function showUpdateDialog(versionInfo) {
        injectUpdateStyles();
        document.querySelector('.xue-update-backdrop')?.remove();

        const backdrop = document.createElement('div');
        backdrop.className = 'xue-update-backdrop';
        const notes = Array.isArray(versionInfo.notes) ? versionInfo.notes : [];
        backdrop.innerHTML = `
            <div class="xue-update-card" role="dialog" aria-modal="true" aria-label="更新提示">
                <h2 class="xue-update-title">🌸 ${versionInfo.title || '发现新版本'}</h2>
                <p class="xue-update-message">${versionInfo.message || '点击立即更新，刷新到最新版。'}</p>
                ${notes.length ? `<ul class="xue-update-notes">${notes.map(note => `<li>${note}</li>`).join('')}</ul>` : ''}
                <div class="xue-update-actions">
                    <button class="xue-update-later" type="button">稍后</button>
                    <button class="xue-update-now" type="button">立即更新</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        backdrop.querySelector('.xue-update-later').addEventListener('click', () => {
            localStorage.setItem(DISMISSED_KEY, versionInfo.version || 'unknown');
            if (versionInfo.promptId) localStorage.setItem(PROMPTED_KEY, versionInfo.promptId);
            backdrop.remove();
        });
        backdrop.querySelector('.xue-update-now').addEventListener('click', () => applyUpdate(versionInfo));
    }

    function displayVersionElement(versionInfo, hasUpdate) {
        const footerElement = document.querySelector('.footer p.text-gray-500.text-sm');
        if (!footerElement || document.getElementById('xue-version-info')) return;
        const element = document.createElement('p');
        element.id = 'xue-version-info';
        element.className = 'text-gray-500 text-sm mt-1 text-center md:text-left';
        element.innerHTML = `版本: ${versionInfo.version || '未知'}${hasUpdate ? '<span class="xue-version-pill">发现新版</span>' : ' <span class="text-green-500">(最新版本)</span>'}`;
        footerElement.insertAdjacentElement('afterend', element);
        if (hasUpdate) {
            element.querySelector('.xue-version-pill')?.addEventListener('click', () => showUpdateDialog(versionInfo));
        }
    }

    async function checkForUpdates() {
        try {
            const versionInfo = await fetchSiteVersion();
            const latestVersion = versionInfo.version || '';
            const promptId = versionInfo.promptId || versionInfo.build || latestVersion;
            const storedVersion = currentStoredVersion();
            const dismissedVersion = localStorage.getItem(DISMISSED_KEY) || '';
            const promptedId = localStorage.getItem(PROMPTED_KEY) || '';
            const shouldForcePrompt = Boolean(versionInfo.forcePrompt && promptId && promptedId !== promptId);

            if (!storedVersion && latestVersion && !shouldForcePrompt) {
                setCurrentVersion(latestVersion);
                displayVersionElement(versionInfo, false);
                return;
            }

            const hasUpdate = Boolean(latestVersion && storedVersion && latestVersion !== storedVersion);
            const shouldShowPrompt = (hasUpdate && dismissedVersion !== latestVersion) || shouldForcePrompt;
            displayVersionElement(versionInfo, hasUpdate || shouldForcePrompt);

            if (shouldShowPrompt) {
                setTimeout(() => showUpdateDialog(versionInfo), 600);
            }
        } catch (error) {
            console.warn('版本检测失败:', error);
        }
    }

    window.XueAppUpdater = {
        check: checkForUpdates,
        reset: () => localStorage.removeItem(STORAGE_KEY)
    };

    document.addEventListener('DOMContentLoaded', checkForUpdates);
})();
