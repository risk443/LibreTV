const WATCHLIST_KEYS = {
    favorites: 'xueFavoriteVideos',
    history: 'viewingHistory'
};
const WATCHLIST_LIMITS = {
    favorites: 80,
    continue: 6,
    history: 30
};

function getStoredList(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(value) ? value : [];
    } catch (error) {
        return [];
    }
}

function setStoredList(key, list) {
    localStorage.setItem(key, JSON.stringify(list));
}

function getWatchItemKey(item) {
    return [item.sourceCode || item.sourceName || '', item.vod_id || item.showIdentifier || item.title || ''].join('::');
}

function normalizeWatchItem(item) {
    return {
        title: item.title || item.vod_name || '未知视频',
        url: item.url || '',
        directVideoUrl: item.directVideoUrl || '',
        episodeIndex: Number(item.episodeIndex || 0),
        sourceName: item.sourceName || item.source_name || item.sourceCode || '',
        sourceCode: item.sourceCode || item.source_code || item.source || '',
        vod_id: item.vod_id || item.id || '',
        showIdentifier: item.showIdentifier || '',
        playbackPosition: Number(item.playbackPosition || 0),
        duration: Number(item.duration || 0),
        episodes: Array.isArray(item.episodes) ? item.episodes : [],
        timestamp: item.timestamp || Date.now(),
        favoriteAt: item.favoriteAt || Date.now()
    };
}

function getFavoriteVideos() {
    return getStoredList(WATCHLIST_KEYS.favorites).map(normalizeWatchItem);
}

function saveFavoriteVideos(items) {
    setStoredList(WATCHLIST_KEYS.favorites, items.slice(0, WATCHLIST_LIMITS.favorites));
}

function isFavoriteVideo(item) {
    const key = getWatchItemKey(normalizeWatchItem(item));
    return getFavoriteVideos().some(favorite => getWatchItemKey(favorite) === key);
}

function toggleFavoriteVideo(item) {
    const normalized = normalizeWatchItem(item);
    const key = getWatchItemKey(normalized);
    const favorites = getFavoriteVideos();
    const existingIndex = favorites.findIndex(favorite => getWatchItemKey(favorite) === key);

    if (existingIndex >= 0) {
        favorites.splice(existingIndex, 1);
        saveFavoriteVideos(favorites);
        return false;
    }

    favorites.unshift({ ...normalized, favoriteAt: Date.now() });
    saveFavoriteVideos(favorites);
    return true;
}

function buildWatchUrl(item) {
    const normalized = normalizeWatchItem(item);
    if (normalized.url) return normalized.url;

    const episodeUrl = normalized.directVideoUrl || normalized.episodes[normalized.episodeIndex] || '';
    if (!episodeUrl) return '#';

    return `watch.html?id=${encodeURIComponent(normalized.vod_id || '')}&source=${encodeURIComponent(normalized.sourceCode || normalized.sourceName || '')}&url=${encodeURIComponent(episodeUrl)}&index=${normalized.episodeIndex}&title=${encodeURIComponent(normalized.title || '')}`;
}

function formatWatchProgress(item) {
    const normalized = normalizeWatchItem(item);
    const episodeText = `第 ${normalized.episodeIndex + 1} 集`;
    if (normalized.duration > 0 && normalized.playbackPosition > 10) {
        const percent = Math.min(99, Math.max(1, Math.round((normalized.playbackPosition / normalized.duration) * 100)));
        return `${episodeText} · 已看 ${percent}%`;
    }
    return episodeText;
}

function formatWatchDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return '今天';
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getContinueWatchingItems() {
    const history = getStoredList(WATCHLIST_KEYS.history).map(normalizeWatchItem);
    const seen = new Set();
    return history
        .filter(item => item.url || item.directVideoUrl || item.episodes.length)
        .filter(item => {
            const key = getWatchItemKey(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, WATCHLIST_LIMITS.continue);
}

function escapeWatchText(value) {
    if (typeof sanitizePlayableText === 'function') return sanitizePlayableText(value);
    return (value || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderWatchItem(item, options = {}) {
    const normalized = normalizeWatchItem(item);
    const title = escapeWatchText(normalized.title);
    const source = escapeWatchText(normalized.sourceName || normalized.sourceCode || '播放源');
    const url = escapeWatchText(buildWatchUrl(normalized));
    const progress = escapeWatchText(options.progressText || formatWatchProgress(normalized));
    const date = escapeWatchText(formatWatchDate(normalized.timestamp || normalized.favoriteAt));
    const key = escapeWatchText(getWatchItemKey(normalized));

    return `
        <div class="xue-watch-item" data-watch-key="${key}">
            <a href="${url}" class="xue-watch-main">
                <span class="xue-watch-title">${title}</span>
                <span class="xue-watch-sub">${progress} · ${source}${date ? ` · ${date}` : ''}</span>
            </a>
            ${options.showRemove ? `<button class="xue-watch-remove" onclick="removeFavoriteByKey('${key}')" aria-label="取消收藏">×</button>` : ''}
        </div>
    `;
}

function renderHomeWatchShelf() {
    const shelf = document.getElementById('xueWatchShelf');
    if (!shelf) return;

    const continueItems = getContinueWatchingItems();
    const favorites = getFavoriteVideos().slice(0, 6);

    if (!continueItems.length && !favorites.length) {
        shelf.classList.add('hidden');
        return;
    }

    shelf.classList.remove('hidden');
    const continueHtml = continueItems.length ? `
        <section class="xue-watch-section">
            <div class="xue-watch-heading">继续观看</div>
            <div class="xue-watch-list">${continueItems.map(item => renderWatchItem(item)).join('')}</div>
        </section>
    ` : '';
    const favoriteHtml = favorites.length ? `
        <section class="xue-watch-section">
            <div class="xue-watch-heading">我的收藏</div>
            <div class="xue-watch-list">${favorites.map(item => renderWatchItem(item, { showRemove: true, progressText: '收藏片单' })).join('')}</div>
        </section>
    ` : '';

    shelf.innerHTML = continueHtml + favoriteHtml;
}

function removeFavoriteByKey(key) {
    const favorites = getFavoriteVideos().filter(item => getWatchItemKey(item) !== key);
    saveFavoriteVideos(favorites);
    renderHomeWatchShelf();
    renderSearchHistory && renderSearchHistory();
    showToast && showToast('已取消收藏', 'success');
}

function renderWatchlistPanel() {
    const container = document.getElementById('historyList');
    if (!container) return;

    const continueItems = getContinueWatchingItems();
    const favorites = getFavoriteVideos();
    const history = getStoredList(WATCHLIST_KEYS.history).map(normalizeWatchItem).slice(0, WATCHLIST_LIMITS.history);

    if (!continueItems.length && !favorites.length && !history.length) {
        container.innerHTML = '<div class="text-center text-gray-500 py-8">暂无观看记录</div>';
        return;
    }

    container.innerHTML = `
        ${continueItems.length ? `<div class="xue-panel-block"><h4>继续观看</h4>${continueItems.map(item => renderWatchItem(item)).join('')}</div>` : ''}
        ${favorites.length ? `<div class="xue-panel-block"><h4>我的收藏</h4>${favorites.map(item => renderWatchItem(item, { showRemove: true, progressText: '收藏片单' })).join('')}</div>` : ''}
        ${history.length ? `<div class="xue-panel-block"><h4>观看历史</h4>${history.map(item => renderWatchItem(item)).join('')}</div>` : ''}
    `;
}

function clearWatchData() {
    localStorage.removeItem(WATCHLIST_KEYS.history);
    renderWatchlistPanel();
    renderHomeWatchShelf();
}

document.addEventListener('DOMContentLoaded', () => {
    renderHomeWatchShelf();
    renderWatchlistPanel();
});
