(function () {
    const HEARTBEAT_URL = '/api/online';
    const CLIENT_ID_KEY = 'xueOnlineClientId';
    const HEARTBEAT_INTERVAL = 30000;

    function getClientId() {
        let clientId = localStorage.getItem(CLIENT_ID_KEY);
        if (!clientId) {
            clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
            localStorage.setItem(CLIENT_ID_KEY, clientId);
        }
        return clientId;
    }

    function getBrowserName() {
        const ua = navigator.userAgent || '';
        if (ua.includes('XueTvAndroid')) return '雪雪App WebView';
        if (ua.includes('Edg/')) return 'Edge';
        if (ua.includes('Chrome/')) return 'Chrome/WebView';
        if (ua.includes('Safari/')) return 'Safari/WebView';
        return '未知浏览器';
    }

    function getOsName() {
        const ua = navigator.userAgent || '';
        const android = ua.match(/Android\s+([\d.]+)/i);
        if (android) return `Android ${android[1]}`;
        if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
        if (/Windows/i.test(ua)) return 'Windows';
        if (/Mac OS X/i.test(ua)) return 'macOS';
        if (/Linux/i.test(ua)) return 'Linux';
        return '未知系统';
    }

    function getDeviceName() {
        const ua = navigator.userAgent || '';
        const androidModel = ua.match(/;\s*([^;()]+\sBuild\/[^;)]+)/i);
        if (androidModel) return androidModel[1].replace(/\sBuild\/.*/, '').trim();
        if (/iPhone/i.test(ua)) return 'iPhone';
        if (/iPad/i.test(ua)) return 'iPad';
        return '未知设备';
    }

    function heartbeat() {
        const payload = {
            clientId: getClientId(),
            device: getDeviceName(),
            os: getOsName(),
            browser: getBrowserName(),
            screen: `${window.screen.width}×${window.screen.height}`,
            language: navigator.language || '',
            path: `${location.pathname}${location.search}`,
            referrer: document.referrer || ''
        };

        fetch(HEARTBEAT_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
            cache: 'no-store'
        }).catch(() => {});
    }

    window.XueOnlineHeartbeat = { ping: heartbeat };

    document.addEventListener('DOMContentLoaded', () => {
        heartbeat();
        setInterval(heartbeat, HEARTBEAT_INTERVAL);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) heartbeat();
        });
    });
})();
