const PLAYABLE_DEFAULT_POSTER = 'image/default-poster-xue.jpg';

const PLAYABLE_HOME_CONFIG = {
    version: '2026-06-08-playable-home-v2',
    sources: ['bfzy', 'ffzy', 'lzi', 'ruyi', 'dyttzy', 'jisu'],
    sections: [
        { key: 'hot', label: '最近热播', keyword: '长安', limit: 8 },
        { key: 'tv', label: '一起追剧', keyword: '吞噬星空', limit: 8 },
        { key: 'movie', label: '下饭电影', keyword: '电影', limit: 8 },
        { key: 'anime', label: '动漫追更', keyword: '动漫', limit: 8 }
    ],
    perSourceLimit: 2,
    requestTimeoutMs: 4500
};

function getPlayableSourceName(sourceCode) {
    return (window.API_SITES && window.API_SITES[sourceCode] && window.API_SITES[sourceCode].name) || sourceCode;
}

function sanitizePlayableText(value) {
    return (value || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getPlayablePoster(item) {
    const poster = item && item.vod_pic && item.vod_pic.startsWith('http') ? item.vod_pic : '';
    return poster || PLAYABLE_DEFAULT_POSTER;
}

function buildPosterErrorHandler() {
    return `if (!this.dataset.defaultPoster) { this.dataset.defaultPoster='1'; this.src='${PLAYABLE_DEFAULT_POSTER}'; this.classList.add('xue-default-poster'); }`;
}

function dedupePlayableItems(items) {
    const seen = new Set();
    const deduped = [];

    for (const item of items) {
        const title = (item.vod_name || '').trim();
        if (!title) continue;
        const key = `${title}-${item.source_code || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
    }

    return deduped;
}

function withPlayableTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeout = new Promise(resolve => {
        timeoutId = setTimeout(() => resolve([]), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function fetchPlayableSource(section, sourceCode) {
    try {
        const results = await withPlayableTimeout(
            searchByAPIAndKeyWord(sourceCode, section.keyword),
            PLAYABLE_HOME_CONFIG.requestTimeoutMs
        );
        return (results || []).slice(0, PLAYABLE_HOME_CONFIG.perSourceLimit).map(item => ({
            ...item,
            home_section: section.label,
            source_code: item.source_code || sourceCode,
            source_name: item.source_name || getPlayableSourceName(sourceCode)
        }));
    } catch (error) {
        console.warn(`加载 ${section.label}/${sourceCode} 失败：`, error);
        return [];
    }
}

async function fetchPlayableSection(section) {
    const sourceResults = await Promise.all(
        PLAYABLE_HOME_CONFIG.sources.map(sourceCode => fetchPlayableSource(section, sourceCode))
    );
    return dedupePlayableItems(sourceResults.flat()).slice(0, section.limit);
}

function renderPlayableSectionSkeleton(section) {
    return `
        <section class="xue-home-section" data-section="${section.key}">
            <div class="xue-section-header">
                <h2>${section.label}</h2>
                <span>正在加载...</span>
            </div>
            <div class="xue-playable-grid">
                ${Array.from({ length: 4 }).map(() => '<div class="xue-playable-card xue-card-skeleton"><div class="xue-playable-poster"></div><div class="xue-playable-meta"><h3></h3><p></p></div></div>').join('')}
            </div>
        </section>
    `;
}

function renderPlayableHomeSkeleton(container) {
    container.innerHTML = PLAYABLE_HOME_CONFIG.sections.map(renderPlayableSectionSkeleton).join('');
}

function renderPlayableHomeCards(items) {
    return items.map((item, index) => {
        const title = sanitizePlayableText(item.vod_name);
        const id = sanitizePlayableText((item.vod_id || '').toString().replace(/[^\w-]/g, ''));
        const sourceCode = sanitizePlayableText(item.source_code || '');
        const sourceName = sanitizePlayableText(item.source_name || getPlayableSourceName(sourceCode));
        const poster = sanitizePlayableText(getPlayablePoster(item));
        const typeName = sanitizePlayableText(item.type_name || item.home_section || '推荐');
        const remarks = sanitizePlayableText(item.vod_remarks || item.vod_year || '点开就能看');
        const loadingMode = index < 4 ? 'eager' : 'lazy';
        const fetchPriority = index < 2 ? 'high' : 'auto';

        return `
            <button class="xue-playable-card text-left group" onclick="showDetails('${id}', '${title}', '${sourceCode}')" title="${title}">
                <div class="xue-playable-poster">
                    <img src="${poster}" alt="${title}" loading="${loadingMode}" fetchpriority="${fetchPriority}" decoding="async" referrerpolicy="no-referrer" onerror="${buildPosterErrorHandler()}">
                    <span class="xue-playable-source">${sourceName}</span>
                </div>
                <div class="xue-playable-meta">
                    <h3>${title}</h3>
                    <p>${typeName} · ${remarks}</p>
                </div>
            </button>
        `;
    }).join('');
}

function renderPlayableSection(container, section, items) {
    const sectionElement = container.querySelector(`[data-section="${section.key}"]`);
    if (!sectionElement) return;

    if (!items.length) {
        sectionElement.innerHTML = `
            <div class="xue-section-header">
                <h2>${section.label}</h2>
                <span>可稍后刷新</span>
            </div>
            <div class="xue-section-empty">这组暂时没加载出来，先看其他推荐～</div>
        `;
        return;
    }

    sectionElement.innerHTML = `
        <div class="xue-section-header">
            <h2>${section.label}</h2>
            <span>已筛选可播放源</span>
        </div>
        <div class="xue-playable-grid">
            ${renderPlayableHomeCards(items)}
        </div>
    `;
}

async function loadPlayableHome() {
    const container = document.getElementById('douban-results');
    const area = document.getElementById('doubanArea');
    if (!container || !area) return;

    localStorage.setItem('doubanEnabled', 'true');
    area.classList.remove('hidden');
    renderPlayableHomeSkeleton(container);

    await Promise.all(PLAYABLE_HOME_CONFIG.sections.map(async section => {
        const items = await fetchPlayableSection(section);
        renderPlayableSection(container, section, items);
    }));
}

function setupPlayableHomeControls() {
    const refreshBtn = document.getElementById('douban-refresh');
    if (refreshBtn) {
        refreshBtn.onclick = loadPlayableHome;
        refreshBtn.querySelector('span') && (refreshBtn.querySelector('span').textContent = '换一批');
    }

    const movieToggle = document.getElementById('douban-movie-toggle');
    const tvToggle = document.getElementById('douban-tv-toggle');
    if (movieToggle) movieToggle.textContent = '推荐';
    if (tvToggle) tvToggle.textContent = '追剧';
}

document.addEventListener('DOMContentLoaded', () => {
    setupPlayableHomeControls();
    setTimeout(loadPlayableHome, 80);
});
