const $ = id => document.getElementById(id);

function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function cleanIsbn(value) {
    return value.replace(/[-\s]/g, '').replace(/\D/g, '').slice(0, 13);
}

function validateIsbn(el) {
    const cleaned = cleanIsbn(el.value);
    el.value = cleaned;
    if (cleaned.length > 0 && cleaned.length !== 13) {
        el.style.borderColor = '#ff5252';
    } else {
        el.style.borderColor = '';
    }
}

function showNotification(message, icon = '') {
    document.getElementById('notifyIcon').textContent = icon || '📢';
    document.getElementById('notifyMessage').innerHTML = message.replace(/\n/g, '<br>');
    document.getElementById('notifyModal').style.display = 'flex';
}

function showNotify() {
    // This is closeNotify
}

function closeNotify() {
    document.getElementById('notifyModal').style.display = 'none';
}

function showConfirm(title, message, onConfirm) {
    document.getElementById('confirmTitle').textContent = title || 'Подтверждение';
    document.getElementById('confirmMessage').innerHTML = message.replace(/\n/g, '<br>');
    document.getElementById('confirmYesBtn').onclick = () => {
        if (onConfirm) onConfirm();
        closeConfirmModal();
    };
    document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
}

const state = {
    database: [],
    collection: {},
    view: { view: 0, cols: 5, sort: 'title', confirmDelete: true },
    mode: 0,
    editId: null,
    infoId: null,
    searchTimer: null,
    filterAuthor: '',
    filterPublisher: '',
    filterGenre: '',
    seriesView: '',
    viewMode: 'owned',
    resetScroll: false,
    savedScrollTop: 0,
    scrollPositions: { 
        series: {},
        seriesVolumes: {},
        seriesList: {}
    }
};

const safeStorage = {
    _memoryStore: {},
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn('LocalStorage is blocked or unavailable, using in-memory storage fallback:', e);
            return this._memoryStore[key] || null;
        }
    },
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn('LocalStorage is blocked or unavailable, state won\'t persist past reload:', e);
            this._memoryStore[key] = String(value);
        }
    }
};

function loadData() {
    const db = safeStorage.getItem('mm_db');
    if (db) {
        try { state.database = JSON.parse(db); } catch (e) { state.database = []; }
    } else {
        state.database = [];
    }

    state.database = state.database.map(i => ({
        ...i,
        id: i.id || Date.now() + Math.random(),
        t: String(i.t || '').trim(),
        a: i.a ? (Array.isArray(i.a) ? i.a.filter(a => a && String(a).trim()) :
            (typeof i.a === 'string' ? i.a.split(',').map(s => s.trim()).filter(s => s) : [])) : [],
        g: i.g ? (Array.isArray(i.g) ? i.g.filter(g => g && String(g).trim()) :
            (typeof i.g === 'string' ? i.g.split(',').map(s => s.trim()).filter(s => s) : [])) : [],
        series: String(i.series || '').trim(),
        pub: String(i.pub || '').trim(),
        v: Math.max(0, parseInt(i.v) || 0),
        tv: i.tv !== undefined ? Math.max(0, parseInt(i.tv) || 0) : (String(i.series || '').trim() ? 0 : 1),
        p: Math.max(0, parseInt(i.p) || 0),
        y: String(i.y || '').trim(),
        isbn: String(i.isbn || '').trim(),
        c: String(i.c || '').trim(),
        binding: i.binding ? String(i.binding).trim() : ''
    }));

    const cl = safeStorage.getItem('mm_cl');
    if (cl) {
        try { state.collection = JSON.parse(cl); } catch (e) { state.collection = {}; }
    } else {
        state.collection = {};
    }

    Object.keys(state.collection).forEach(id => {
        if (state.collection[id].wishlist === undefined) {
            state.collection[id].wishlist = false;
        }
    });

    const s = safeStorage.getItem('mm_s');
    if (s) {
        try {
            const parsed = JSON.parse(s);
            state.view = {
                view: parsed.view !== undefined ? parsed.view : 0,
                cols: parsed.cols !== undefined ? (parsed.cols === 4 ? 5 : parsed.cols) : 5,
                sort: parsed.sort !== undefined ? parsed.sort : 'title',
                confirmDelete: parsed.confirmDelete !== undefined ? parsed.confirmDelete : true
            };
        } catch (e) {}
    }
}

function saveData() {
    safeStorage.setItem('mm_db', JSON.stringify(state.database));
    safeStorage.setItem('mm_cl', JSON.stringify(state.collection));
    safeStorage.setItem('mm_s', JSON.stringify(state.view));
}

function getMergedData() {
    return state.database.map(item => {
        const col = state.collection[item.id] || { owned: false, read: false, wishlist: false };
        return { ...item, owned: col.owned, r: col.read, wishlist: col.wishlist };
    });
}

function getFilteredData() {
    const merged = getMergedData();
    if (state.viewMode === 'owned') {
        return merged.filter(i => i.owned === true);
    }
    if (state.viewMode === 'wishlist') {
        return merged.filter(i => i.wishlist === true && i.owned !== true);
    }
    return merged;
}

function getAllSeries() {
    return [...new Set(state.database.map(i => (i.series || i.t).trim()))]
        .filter(t => t)
        .sort((a, b) => a.localeCompare(b));
}

function getAllAuthors() {
    return [...new Set(state.database.flatMap(i => i.a || []))]
        .sort((a, b) => a.localeCompare(b));
}

function getAllPublishers() {
    return [...new Set(state.database.map(i => i.pub).filter(p => p))]
        .sort((a, b) => a.localeCompare(b));
}

function getAllGenres() {
    return [...new Set(state.database.flatMap(i => i.g || []))]
        .sort((a, b) => a.localeCompare(b));
}

function filterByAuthor(author) {
    state.filterAuthor = author;
    state.filterPublisher = '';
    state.filterGenre = '';
    state.seriesView = '';
    state.resetScroll = true;
}

function filterByPublisher(publisher) {
    state.filterPublisher = publisher;
    state.filterAuthor = '';
    state.filterGenre = '';
    state.seriesView = '';
    state.resetScroll = true;
}

function filterByGenre(genre) {
    state.filterGenre = genre;
    state.filterAuthor = '';
    state.filterPublisher = '';
    state.seriesView = '';
    state.resetScroll = true;
}

function clearFilters() {
    state.filterAuthor = '';
    state.filterPublisher = '';
    state.filterGenre = '';
    state.seriesView = '';
    state.resetScroll = true;
}

function openSeriesView(seriesName) {
    const menu = document.getElementById('seriesContextMenu');
    if (menu) menu.style.display = 'none';
    state.seriesView = seriesName;
    state.filterAuthor = '';
    state.filterPublisher = '';
    state.filterGenre = '';
    state.resetScroll = true;
}

function closeSeriesView() {
    const currentSeries = state.seriesView;
    
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (currentSeries && currentScroll > 0) {
        if (!state.scrollPositions.seriesVolumes) state.scrollPositions.seriesVolumes = {};
        state.scrollPositions.seriesVolumes[currentSeries] = currentScroll;
    }
    
    state.seriesView = '';
    state.resetScroll = false;
    render();
    
    const savedPos = state.scrollPositions?.seriesList?.main;
    if (savedPos !== undefined && savedPos > 0) {
        setTimeout(() => {
            window.scrollTo(0, savedPos);
        }, 50);
    } else if (state.savedScrollTop > 0) {
        setTimeout(() => {
            window.scrollTo(0, state.savedScrollTop);
        }, 50);
    }
}

function isAnyFilterActive() {
    return !!(state.filterAuthor || state.filterPublisher || state.filterGenre || state.seriesView);
}

function syncSeriesMetadata(title, authors, publisher, genres) {
    const nt = title.trim();
    if (!nt) return;

    state.database.forEach(item => {
        const itemSeries = (item.series || item.t || '').trim();
        if (itemSeries === nt) {
            if (authors && authors.length > 0) item.a = [...authors];
            if (publisher && publisher.trim()) item.pub = publisher.trim();
            if (genres && genres.length > 0) item.g = [...genres];
        }
    });
}

let sidebarBuilt = false;

function buildSidebar() {
    const f = getFilteredData();
    const aM = new Map(),
        pM = new Map(),
        gM = new Map();

    f.forEach(i => {
        if (i.a && Array.isArray(i.a)) i.a.forEach(a => aM.set(a, (aM.get(a) || 0) + 1));
        if (i.pub) pM.set(i.pub, (pM.get(i.pub) || 0) + 1);
        if (i.g && Array.isArray(i.g)) i.g.forEach(g => gM.set(g, (gM.get(g) || 0) + 1));
    });

    const au = [...aM.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const pu = [...pM.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const ge = [...gM.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    document.getElementById('authorsList').innerHTML = au.map(([n, c]) =>
        `<li data-value="${n.replace(/"/g, '&quot;')}" onclick="selectSidebarItem('author',this)">${n} <span style="color:var(--dim);font-size:10px;">${c}</span></li>`
    ).join('');
    document.getElementById('publishersList').innerHTML = pu.map(([n, c]) =>
        `<li data-value="${n.replace(/"/g, '&quot;')}" onclick="selectSidebarItem('publisher',this)">${n} <span style="color:var(--dim);font-size:10px;">${c}</span></li>`
    ).join('');
    document.getElementById('genresList').innerHTML = ge.map(([n, c]) =>
        `<li data-value="${n.replace(/"/g, '&quot;')}" onclick="selectSidebarItem('genre',this)">${n} <span style="color:var(--dim);font-size:10px;">${c}</span></li>`
    ).join('');

    if (!sidebarBuilt) {
        document.getElementById('toggleAuthors').onclick = (e) => { e.stopPropagation(); document.getElementById('authorsList').classList.toggle('show'); };
        document.getElementById('togglePublishers').onclick = (e) => { e.stopPropagation(); document.getElementById('publishersList').classList.toggle('show'); };
        document.getElementById('toggleGenres').onclick = (e) => { e.stopPropagation(); document.getElementById('genresList').classList.toggle('show'); };
        sidebarBuilt = true;
    }
}

function selectSidebarItem(type, el) {
    const v = el.dataset.value;
    document.querySelectorAll('#authorsList li, #publishersList li, #genresList li')
        .forEach(li => li.classList.remove('active'));

    if (type === 'author') {
        if (state.filterAuthor === v) {
            clearFilters();
        } else {
            filterByAuthor(v);
            el.classList.add('active');
        }
    } else if (type === 'publisher') {
        if (state.filterPublisher === v) {
            clearFilters();
        } else {
            filterByPublisher(v);
            el.classList.add('active');
        }
    } else if (type === 'genre') {
        if (state.filterGenre === v) {
            clearFilters();
        } else {
            filterByGenre(v);
            el.classList.add('active');
        }
    }
    updateBackButton();
    render();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('hidden');
}

function getBadges(mode, type) {
    const chips = document.getElementById(mode + type + 'Chips');
    if (!chips) return [];
    const tags = [];
    chips.querySelectorAll('.badge-chip').forEach(b => {
        tags.push(b.dataset.value);
    });
    return tags;
}

function addBadgeChip(mode, type, value, max, dropdownId) {
    const chips = document.getElementById(mode + type + 'Chips');
    if (!chips) return;
    const tags = getBadges(mode, type);
    if (tags.length >= max || tags.includes(value)) return;

    const badge = document.createElement('span');
    badge.className = 'badge-chip';
    badge.dataset.value = value;
    badge.innerHTML = `${value}<button class="badge-remove" onclick="event.stopPropagation();removeBadge('${mode}','${type}','${value.replace(/'/g, "\\'")}')" title="Удалить">✕</button>`;
    chips.appendChild(badge);

    const input = document.getElementById(mode + type + 'Input');
    if (input) input.value = '';

    if (dropdownId) {
        const d = document.getElementById(dropdownId);
        if (d) d.classList.remove('show');
    }
    updateBadgeInput(mode, type, max);
}

function removeBadge(mode, type, value) {
    const chips = document.getElementById(mode + type + 'Chips');
    if (!chips) return;
    chips.querySelectorAll('.badge-chip').forEach(b => {
        if (b.dataset.value === value) b.remove();
    });
    updateBadgeInput(mode, type, 10);
}

function updateBadgeInput(mode, type, max) {
    const wrap = document.getElementById(mode + type + 'InputWrap');
    if (!wrap) return;
    const tags = getBadges(mode, type);
    wrap.style.display = tags.length >= max ? 'none' : 'flex';
}

function handleBadgeKeydown(e, mode, type, max, dropdownId) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v) addBadgeChip(mode, type, v, max, dropdownId);
    }
    if (e.key === 'Backspace' && e.target.value === '') {
        const tags = getBadges(mode, type);
        if (tags.length > 0) removeBadge(mode, type, tags[tags.length - 1]);
    }
}

function filterBadgeDropdown(mode, type, allFn, dropdownId) {
    const input = document.getElementById(mode + type + 'Input');
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;
    const filter = input.value.trim().toLowerCase();
    const existing = getBadges(mode, type);
    const items = allFn().filter(x => x.toLowerCase().includes(filter) && !existing.includes(x));
    dropdown.innerHTML = items.map(x =>
        `<div onclick="addBadgeChip('${mode}','${type}','${x.replace(/'/g, "\\'")}',10,'${dropdownId}')">${x}</div>`
    ).join('');
    dropdown.classList.toggle('show', items.length > 0);
}

function toggleBadgeDropdown(mode, type, allFn, dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    if (dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
    } else {
        filterBadgeDropdown(mode, type, allFn, dropdownId);
    }
}

function clearBadges(mode, type) {
    const chips = document.getElementById(mode + type + 'Chips');
    const input = document.getElementById(mode + type + 'Input');
    const wrap = document.getElementById(mode + type + 'InputWrap');
    if (chips) chips.innerHTML = '';
    if (input) input.value = '';
    if (wrap) wrap.style.display = 'flex';
}

function updateSeriesDropdown(mode) {
    const prefix = mode === 'add' ? 'add' : 'edit';
    const input = document.getElementById(prefix + 'Series');
    const dropdown = document.getElementById(prefix + 'SeriesDropdown');
    const filter = input.value.trim().toLowerCase();
    const series = getAllSeries().filter(s => s.toLowerCase().includes(filter));
    dropdown.innerHTML = series.map(s =>
        `<div onclick="selectSeries('${mode}','${s.replace(/'/g, "\\'")}')">${s}</div>`
    ).join('');
    dropdown.classList.add('show');
}

function filterSeriesDropdown(mode) {
    updateSeriesDropdown(mode);
}

function toggleSeriesDropdown(mode) {
    const dropdown = document.getElementById(mode === 'add' ? 'addSeriesDropdown' : 'editSeriesDropdown');
    if (dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
    } else {
        updateSeriesDropdown(mode);
    }
}

function selectSeries(mode, s) {
    const prefix = mode === 'add' ? 'add' : 'edit';
    document.getElementById(prefix + 'Series').value = s;
    document.getElementById(prefix + 'SeriesDropdown').classList.remove('show');
    autoFillFromSeries(mode);
}

function autoFillFromSeries(mode) {
    const prefix = mode === 'add' ? 'add' : 'edit';
    const s = document.getElementById(prefix + 'Series'),
        t = s.value.trim();
    if (!t) return;

    const existing = state.database.find(i =>
        (i.series || i.t).trim().toLowerCase() === t.toLowerCase()
    );
    if (!existing) return;

    const pub = document.getElementById(prefix + 'Publisher');
    if (pub && pub.value.trim() === '' && existing.pub) pub.value = existing.pub;

    if (existing.a && existing.a.length > 0) {
        clearBadges(mode, 'Authors');
        existing.a.forEach(a => addBadgeChip(mode, 'Authors', a, 10, mode + 'AuthorsDropdown'));
    }
    if (existing.g && existing.g.length > 0) {
        clearBadges(mode, 'Genres');
        existing.g.forEach(g => addBadgeChip(mode, 'Genres', g, 10, mode + 'GenresDropdown'));
    }
}

function updatePublishersDropdown(mode) {
    const prefix = mode === 'add' ? 'add' : 'edit';
    const input = $(prefix + 'Publisher');
    const dropdown = $(prefix + 'PublisherDropdown');
    const filter = input.value.trim().toLowerCase();
    const pubs = getAllPublishers().filter(p => p.toLowerCase().includes(filter));
    dropdown.innerHTML = pubs.map(p =>
        `<div onclick="selectPublisher('${mode}','${p.replace(/'/g, "\\'")}')">${p}</div>`
    ).join('');
    dropdown.classList.add('show');
}

function filterPublishersDropdown(mode) {
    updatePublishersDropdown(mode);
}

function togglePublishersDropdown(mode) {
    const dropdown = $(mode === 'add' ? 'addPublisherDropdown' : 'editPublisherDropdown');
    if (dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
    } else {
        updatePublishersDropdown(mode);
    }
}

function selectPublisher(mode, p) {
    const prefix = mode === 'add' ? 'add' : 'edit';
    $(prefix + 'Publisher').value = p;
    $(prefix + 'PublisherDropdown').classList.remove('show');
}

function setViewMode(mode) {
    state.viewMode = mode;
    document.getElementById('modeOwned').classList.toggle('btn-active', mode === 'owned');
    document.getElementById('modeWishlist').classList.toggle('btn-active', mode === 'wishlist');
    document.getElementById('modeAll').classList.toggle('btn-active', mode === 'all');
    
    clearFilters();
    buildSidebar();
    render();
}

function setMode(mode) {
    state.mode = mode;
    state.seriesView = '';
    document.querySelectorAll('#btn0, #btn1, #btn2').forEach(b => b.classList.remove('btn-active'));
    const btn = document.getElementById('btn' + mode);
    if (btn) btn.classList.add('btn-active');
    updateBackButton();
    render();
}

function changeView() {
    state.view.view = +(document.getElementById('viewType').value);
    applyView();
    saveData();
}

function changeGridScale() {
    state.view.cols = +(document.getElementById('gridScale').value);
    applyGrid();
    saveData();
}

function changeSort() {
    state.view.sort = document.getElementById('sortType').value;
    applySort();
    saveData();
    render();
}

// Wait, looking at changeSort - let's see if there is any other details
function applyView() {
    const list = document.getElementById('list');
    list.className = 'manga-grid';
    if (state.view.view === 1) list.classList.add('list-view');
    if (state.view.view === 2) list.classList.add('covers-only');
    document.getElementById('viewType').value = state.view.view;
    syncCustomSelect('viewType');
}

function applyGrid() {
    const cols = state.view.cols;
    document.documentElement.style.setProperty('--grid-cols', cols);
    document.documentElement.setAttribute('data-cols', cols);
    document.getElementById('gridScale').value = cols;
    syncCustomSelect('gridScale');
}

function applySort() {
    const el = document.getElementById('sortType');
    if (el) {
        el.value = state.view.sort || 'title';
    }
    syncCustomSelect('sortType');
}

function toggleCustomDropdown(event, id) {
    event.stopPropagation();
    const dropdown = document.getElementById(id);
    if (!dropdown) return;
    
    document.querySelectorAll('.custom-select').forEach(cs => {
        if (cs.id !== id) {
            cs.classList.remove('open');
        }
    });
    
    dropdown.classList.toggle('open');
}

function chooseCustomOption(nativeSelectId, value) {
    const nativeSelect = document.getElementById(nativeSelectId);
    if (!nativeSelect) return;
    
    nativeSelect.value = value;
    
    if (nativeSelectId === 'viewType') {
        changeView();
    } else if (nativeSelectId === 'gridScale') {
        changeGridScale();
    } else if (nativeSelectId === 'sortType') {
        changeSort();
    }
    
    document.querySelectorAll('.custom-select').forEach(cs => {
        cs.classList.remove('open');
    });
}

function syncCustomSelect(nativeSelectId) {
    const nativeSelect = document.getElementById(nativeSelectId);
    if (!nativeSelect) return;
    
    const val = String(nativeSelect.value);
    
    let wrapperId = '';
    if (nativeSelectId === 'viewType') wrapperId = 'customSelectView';
    else if (nativeSelectId === 'gridScale') wrapperId = 'customSelectScale';
    else if (nativeSelectId === 'sortType') wrapperId = 'customSelectSort';
    
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    
    const triggerVal = wrapper.querySelector('.custom-val');
    const items = wrapper.querySelectorAll('.custom-select-item');
    
    items.forEach(item => {
        if (String(item.dataset.value) === val) {
            item.classList.add('active');
            if (triggerVal) {
                triggerVal.textContent = item.textContent;
            }
        } else {
            item.classList.remove('active');
        }
    });
}

function openSettings() {
    const chk = document.getElementById('settingConfirmDelete');
    if (chk) {
        chk.checked = state.view.confirmDelete !== false;
    }
    document.getElementById('settingsModal').style.display = 'flex';
}

function toggleConfirmSetting() {
    const chk = document.getElementById('settingConfirmDelete');
    if (chk) {
        state.view.confirmDelete = chk.checked;
        saveData();
    }
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

function openAbout() {
    document.getElementById('aboutModal').style.display = 'flex';
}

function closeAbout() {
    document.getElementById('aboutModal').style.display = 'none';
}

function U() {
    applyView();
    applyGrid();
    applySort();
}

function formatCollapsibleRow(rowId, listContainerId, itemsArr, filterFuncName, itemClass) {
    const row = document.getElementById(rowId);
    const container = document.getElementById(listContainerId);
    if (!row || !container) return;

    container.innerHTML = '';
    const existingBadge = row.querySelector('.overflow-badge');
    if (existingBadge) existingBadge.remove();
    row.classList.remove('has-overflow');
    row.classList.remove('is-expanded');

    const label = row.querySelector('strong');
    if (label) {
        label.onclick = null;
        label.removeAttribute('title');
    }

    if (itemsArr.length === 0) {
        row.style.display = 'none';
        return;
    }
    row.style.display = 'flex';

    const itemElements = [];
    itemsArr.forEach((item) => {
        const span = document.createElement('span');
        span.className = itemClass;
        span.setAttribute('onclick', `event.stopPropagation();closeInfoModal();${filterFuncName}('${item.replace(/'/g, "\\'")}');updateBackButton();render();`);
        span.textContent = item;
        container.appendChild(span);
        itemElements.push(span);
    });

    if (itemElements.length <= 1) return;

    // Add has-overflow temporarily to simulate the layout constraint (e.g. padding for the badge)
    row.classList.add('has-overflow');

    // Use bounding rect to reliably calculate wraps once the modal is visible and constrained
    const firstTop = itemElements[0].getBoundingClientRect().top;
    let firstWrapIndex = -1;

    for (let i = 1; i < itemElements.length; i++) {
        const itemTop = itemElements[i].getBoundingClientRect().top;
        if (itemTop > firstTop + 6) {
            firstWrapIndex = i;
            break;
        }
    }

    // Remove the class temporarily to restore original state before applying the final classes
    row.classList.remove('has-overflow');

    if (firstWrapIndex !== -1) {
        for (let i = 0; i < firstWrapIndex; i++) {
            itemElements[i].classList.add('initial-item');
        }
        for (let i = firstWrapIndex; i < itemElements.length; i++) {
            itemElements[i].classList.add('overflow-item');
        }

        row.classList.add('has-overflow');
        if (label) {
            label.setAttribute('title', 'Показать/скрыть скрытые элементы');
            label.onclick = (e) => {
                e.stopPropagation();
                row.classList.toggle('is-expanded');
            };
        }
    }
}

function openInfo(id) {
    const menu = document.getElementById('seriesContextMenu');
    if (menu) menu.style.display = 'none';

    const item = state.database.find(i => String(i.id) === String(id));
    if (!item) return;

    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    
    if (state.seriesView) {
        if (!state.scrollPositions.seriesVolumes) state.scrollPositions.seriesVolumes = {};
        state.scrollPositions.seriesVolumes[state.seriesView] = currentScroll;
    } else if (state.mode === 1) {
        if (!state.scrollPositions.seriesList) state.scrollPositions.seriesList = {};
        state.scrollPositions.seriesList.main = currentScroll;
    } else {
        state.savedScrollTop = currentScroll;
    }

    state.infoId = id;
    const col = state.collection[id] || { owned: false, read: false, wishlist: false };
    const isOneshot = item.oneshot === true;

    const coverEl = document.getElementById('infoCover');
    const noCoverEl = document.getElementById('infoNoCover');
    if (item.c) {
        coverEl.src = item.c;
        coverEl.style.display = '';
        noCoverEl.style.display = 'none';
    } else {
        coverEl.style.display = 'none';
        noCoverEl.style.display = 'flex';
    }

    const titleEl = document.getElementById('infoTitle');
    if (titleEl) {
        titleEl.textContent = item.t;
        titleEl.classList.remove('is-expanded');
        titleEl.classList.remove('has-overflow');
    }
    const existingToggle = document.getElementById('infoTitleToggle');
    if (existingToggle) {
        existingToggle.remove();
    }

    const volumeRow = document.getElementById('infoVolumeRow');
    if (isOneshot) {
        document.getElementById('infoVolume').innerHTML = '<span class="info-volume-oneshot">Ваншот</span>';
        volumeRow.style.display = 'flex';
    } else if (item.v !== undefined && item.v !== null && item.v !== '' && item.v >= 0) {
        let volHtml = `<span class="info-volume-regular">${item.v}</span>`;
        let totalVal = item.tv || 0;
        if (totalVal <= 0 && item.series) {
            const seriesName = String(item.series).trim();
            const seriesItems = state.database.filter(x => String(x.series || '').trim().toLowerCase() === seriesName.toLowerCase());
            if (seriesItems.length > 0) {
                totalVal = Math.max(
                    ...seriesItems.map(x => x.tv || 0),
                    seriesItems.length,
                    ...seriesItems.map(x => x.v || 0)
                );
            }
        }
        if (totalVal <= 0) {
            const titleName = String(item.t).trim();
            const titleItems = state.database.filter(x => String(x.t).trim().toLowerCase() === titleName.toLowerCase());
            if (titleItems.length > 0) {
                totalVal = Math.max(
                    ...titleItems.map(x => x.tv || 0),
                    titleItems.length,
                    ...titleItems.map(x => x.v || 0)
                );
            }
        }
        if (totalVal > 0) {
            volHtml += ` <span class="info-volume-total">из ${totalVal}</span>`;
        }
        document.getElementById('infoVolume').innerHTML = volHtml;
        volumeRow.style.display = 'flex';
    } else {
        volumeRow.style.display = 'none';
    }

    const authorsArr = item.a || [];
    const genresArr = item.g || [];

    const pagesRow = document.getElementById('infoPagesRow');
    if (item.p) {
        document.getElementById('infoPages').textContent = item.p;
        pagesRow.style.display = 'flex';
    } else {
        pagesRow.style.display = 'none';
    }

    const yearRow = document.getElementById('infoYearRow');
    if (item.y) {
        document.getElementById('infoYear').textContent = item.y;
        yearRow.style.display = 'flex';
    } else {
        yearRow.style.display = 'none';
    }

    const publisherRow = document.getElementById('infoPublisherRow');
    if (item.pub) {
        document.getElementById('infoPublisher').innerHTML = `<span class="info-pub-link" onclick="event.stopPropagation();closeInfoModal();filterByPublisher('${item.pub.replace(/'/g,"\\'")}');updateBackButton();render();">${item.pub}</span>`;
        publisherRow.style.display = 'flex';
    } else {
        publisherRow.style.display = 'none';
    }

    const bindingRow = document.getElementById('infoBindingRow');
    if (item.binding) {
        document.getElementById('infoBinding').textContent = item.binding;
        bindingRow.style.display = 'flex';
    } else {
        bindingRow.style.display = 'none';
    }

    const isbnRow = document.getElementById('infoIsbnRow');
    if (item.isbn) {
        document.getElementById('infoIsbn').textContent = item.isbn;
        isbnRow.style.display = 'flex';
    } else {
        isbnRow.style.display = 'none';
    }

    updateInfoButtons();

    document.getElementById('infoModal').style.display = 'flex';

    // Delay measurement slightly to allow modal to be in layout and render correctly
    setTimeout(() => {
        if (state.infoId === id) { // Only execute if modal wasn't closed or changed
            formatCollapsibleRow('infoAuthorsRow', 'infoAuthors', authorsArr, 'filterByAuthor', 'info-author-link');
            formatCollapsibleRow('infoGenresRow', 'infoGenres', genresArr, 'filterByGenre', 'info-genre-link');
        }
    }, 50);
}

function toggleInfoOwned(e) {
    if (e) e.preventDefault();
    const col = state.collection[state.infoId] || { owned: false, read: false, wishlist: false };
    const newOwned = !col.owned;
    if (!newOwned) {
        const item = state.database.find(i => String(i.id) === String(state.infoId));
        const title = item ? (item.t || '') : '';
        const isOneshot = item ? (item.oneshot === true || (item.v === 1 && item.tv === 1)) : false;
        const msg = isOneshot 
            ? `Удалить ваншот "${title}" из коллекции?` 
            : `Удалить том "${title}" из коллекции?`;
        
        const doDelete = () => {
            state.collection[state.infoId] = {
                owned: false,
                wishlist: col.wishlist,
                read: col.read
            };
            updateInfoButtons();
            saveData();
            render(true);
        };

        if (state.view.confirmDelete !== false) {
            showConfirm('Удаление из коллекции', msg, doDelete);
        } else {
            doDelete();
        }
        return;
    }
    state.collection[state.infoId] = {
        owned: newOwned,
        wishlist: col.wishlist,
        read: col.read
    };
    updateInfoButtons();
    saveData();
    render(true);
}

function toggleInfoWishlist(e) {
    if (e) e.preventDefault();
    const col = state.collection[state.infoId] || { owned: false, read: false, wishlist: false };
    const newWishlist = !col.wishlist;
    
    const doUpdate = () => {
        state.collection[state.infoId] = {
            owned: col.owned,
            wishlist: newWishlist,
            read: col.read
        };
        updateInfoButtons();
        saveData();
        render(true);
    };

    if (!newWishlist && state.view.confirmDelete !== false) {
        const item = state.database.find(i => String(i.id) === String(state.infoId));
        const title = item ? (item.t || '') : '';
        const isOneshot = item ? (item.oneshot === true || (item.v === 1 && item.tv === 1)) : false;
        const msg = isOneshot 
            ? `Удалить ваншот "${title}" из вишлиста?` 
            : `Удалить том "${title}" из вишлиста?`;
        
        showConfirm('Удаление из вишлиста', msg, doUpdate);
    } else {
        doUpdate();
    }
}

function toggleInfoRead(e) {
    if (e) e.preventDefault();
    const col = state.collection[state.infoId] || { owned: false, read: false, wishlist: false };
    const newRead = !col.read;

    const doUpdate = () => {
        state.collection[state.infoId] = {
            owned: col.owned,
            wishlist: col.wishlist,
            read: newRead
        };
        updateInfoButtons();
        saveData();
        render(true);
    };

    if (!newRead && state.view.confirmDelete !== false) {
        const item = state.database.find(i => String(i.id) === String(state.infoId));
        const title = item ? (item.t || '') : '';
        const isOneshot = item ? (item.oneshot === true || (item.v === 1 && item.tv === 1)) : false;
        const msg = isOneshot 
            ? `Удалить ваншот "${title}" из прочитанного?` 
            : `Удалить том "${title}" из прочитанного?`;
        
        showConfirm('Удаление из прочитанного', msg, doUpdate);
    } else {
        doUpdate();
    }
}

function updateInfoButtons() {
    const col = state.collection[state.infoId] || { owned: false, read: false, wishlist: false };
    const ownedBtn = document.getElementById('infoOwnedBtn');
    const wishlistBtn = document.getElementById('infoWishlistBtn');
    const readBtn = document.getElementById('infoReadBtn');
    const coverWrap = document.getElementById('infoCoverWrap');

    if (ownedBtn) {
        ownedBtn.classList.toggle('active', col.owned === true);
        ownedBtn.disabled = false;
    }
    if (wishlistBtn) {
        wishlistBtn.classList.toggle('active', col.wishlist === true);
        wishlistBtn.disabled = false;
    }
    if (readBtn) {
        readBtn.classList.toggle('active', col.read === true);
    }
    if (coverWrap) {
        const isNotOwned = (state.viewMode === 'owned' && col.owned !== true);
        coverWrap.classList.toggle('not-owned', isNotOwned);
        const badgesContainer = document.getElementById('infoBadges');
        if (badgesContainer) {
            badgesContainer.classList.toggle('not-owned', isNotOwned);
        }
        const infoVol = document.getElementById('infoVolume');
        if (infoVol) {
            infoVol.classList.toggle('not-owned', isNotOwned);
        }
    }
}

function closeInfoModal() {
    document.getElementById('infoModal').style.display = 'none';
    state.infoId = null;
    
    if (state.seriesView) {
        const savedPos = state.scrollPositions?.seriesVolumes?.[state.seriesView];
        if (savedPos !== undefined && savedPos > 0) {
            setTimeout(() => {
                window.scrollTo(0, savedPos);
            }, 50);
        }
    } else if (state.mode === 1) {
        const savedPos = state.scrollPositions?.seriesList?.main;
        if (savedPos !== undefined && savedPos > 0) {
            setTimeout(() => {
                window.scrollTo(0, savedPos);
            }, 50);
        }
    } else if (state.savedScrollTop > 0) {
        setTimeout(() => {
            window.scrollTo(0, state.savedScrollTop);
            state.savedScrollTop = 0;
        }, 50);
    }
}

document.addEventListener('keydown', function(e) {
    const infoModal = document.getElementById('infoModal');
    if (!infoModal || infoModal.style.display !== 'flex') return;

    if (e.key === 'Escape') {
        closeInfoModal();
        return;
    }

    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        infoPrev();
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        infoNext();
    }
});

function getNavigationList() {
    let items = getFilteredData();
    const sortType = (document.getElementById('sortType')?.value) || 'title';
    const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();

    if (state.seriesView && state.viewMode === 'owned') {
        items = getMergedData();
    }

    if (state.filterAuthor) {
        items = items.filter(x =>
            x.a && Array.isArray(x.a) &&
            x.a.some(a => String(a).toLowerCase() === state.filterAuthor.toLowerCase())
        );
    }
    if (state.filterPublisher) {
        items = items.filter(x =>
            String(x.pub || '').toLowerCase() === state.filterPublisher.toLowerCase()
        );
    }
    if (state.filterGenre) {
        items = items.filter(x =>
            x.g && Array.isArray(x.g) &&
            x.g.some(g => String(g).toLowerCase() === state.filterGenre.toLowerCase())
        );
    }
    if (state.seriesView) {
        items = items.filter(x =>
            String(x.series || x.t).trim() === state.seriesView
        );
    }

    let result = [];

    if (state.seriesView) {
        result = [...items].sort((a, b) => (a.v || 0) - (b.v || 0));
    } else if (state.mode === 0 || state.mode === 2) {
        result = [...items];
        if (sortType === 'pages') {
            result.sort((a, b) => (b.p || 0) - (a.p || 0));
        } else if (sortType === 'year') {
            result.sort((a, b) => (b.y || '').localeCompare(a.y || ''));
        } else {
            result.sort((a, b) => {
                const tc = String(a.t).localeCompare(String(b.t));
                return tc !== 0 ? tc : (a.v || 0) - (b.v || 0);
            });
        }
        if (state.mode === 2) {
            result = result.filter(x => x.v === 1 && x.tv === 1);
        }
    } else {
        result = [...items].sort((a, b) => {
            const tc = String(a.t).localeCompare(String(b.t));
            return tc !== 0 ? tc : (a.v || 0) - (b.v || 0);
        });
    }

    if (!state.filterAuthor && !state.filterPublisher && !state.filterGenre && !state.seriesView && query) {
        result = result.filter(x =>
            String(x.t).toLowerCase().includes(query) ||
            (x.a && Array.isArray(x.a) && x.a.some(a => String(a).toLowerCase().includes(query)))
        );
    }

    return result;
}

function infoPrev() {
    const result = getNavigationList();
    const currentIndex = result.findIndex(i => String(i.id) === String(state.infoId));
    if (currentIndex === -1) return;

    const newIndex = currentIndex > 0 ? currentIndex - 1 : result.length - 1;
    openInfo(result[newIndex].id);
}

function infoNext() {
    const result = getNavigationList();
    const currentIndex = result.findIndex(i => String(i.id) === String(state.infoId));
    if (currentIndex === -1) return;

    const newIndex = currentIndex < result.length - 1 ? currentIndex + 1 : 0;
    openInfo(result[newIndex].id);
}

function toggleEditOneshot() {
    const checked = document.getElementById('editOneshot').checked;
    const wrap = document.getElementById('editSeriesWrap');
    if (checked) {
        document.getElementById('editSeries').value = '';
        document.getElementById('editVolume').value = '1';
        wrap.style.display = 'none';
    } else {
        wrap.style.display = 'flex';
    }
}

function onEditOwnedChange() {
    // No mutual exclusion between owned and wishlist anymore
}

function onEditWishlistChange() {
    // No mutual exclusion between owned and wishlist anymore
}

function openEdit(id) {
    state.editId = id;
    const i = state.database.find(x => String(x.id) === String(id));
    if (!i) { console.error('not found', id); return; }

    const isOneshot = (i.tv === 1 && i.v === 1);

    document.getElementById('editTitle').value = i.t || '';
    document.getElementById('editSeries').value = isOneshot ? '' : (i.series || '');
    document.getElementById('editVolume').value = (i.v !== undefined && i.v !== null) ? i.v : '';
    document.getElementById('editPages').value = i.p || 0;
    document.getElementById('editYear').value = i.y || '';
    document.getElementById('editIsbn').value = i.isbn || '';
    document.getElementById('editCover').value = i.c || '';
    document.getElementById('editPublisher').value = i.pub || '';
    document.getElementById('editOneshot').checked = isOneshot;
    document.getElementById('editSeriesWrap').style.display = isOneshot ? 'none' : 'flex';

    const col = state.collection[id] || { owned: false, read: false, wishlist: false };
    document.getElementById('editRead').checked = col.read || false;
    document.getElementById('editOwned').checked = col.owned === true;
    document.getElementById('editWishlist').checked = col.wishlist === true;

    const ownedCheckbox = document.getElementById('editOwned');
    const wishlistCheckbox = document.getElementById('editWishlist');
    ownedCheckbox.disabled = false;
    wishlistCheckbox.disabled = false;

    clearBadges('edit', 'Authors');
    if (i.a && i.a.length > 0) {
        i.a.forEach(a => addBadgeChip('edit', 'Authors', a, 10, 'editAuthorsDropdown'));
    }
    clearBadges('edit', 'Genres');
    if (i.g && i.g.length > 0) {
        i.g.forEach(g => addBadgeChip('edit', 'Genres', g, 10, 'editGenresDropdown'));
    }

    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    state.editId = null;
    ['editSeriesDropdown', 'editPublisherDropdown', 'editAuthorsDropdown', 'editGenresDropdown'].forEach(id => {
        const d = document.getElementById(id);
        if (d) d.classList.remove('show');
    });
}

function saveEdit() {
    if (state.editId === null) return;
    const i = state.database.find(x => String(x.id) === String(state.editId));
    if (!i) return;

    const nt = document.getElementById('editTitle').value.trim(),
        ns = document.getElementById('editSeries').value.trim(),
        isOneshot = document.getElementById('editOneshot').checked,
        gt = isOneshot ? nt : (ns || nt);
    const a = getBadges('edit', 'Authors'),
        g = getBadges('edit', 'Genres'),
        pub = document.getElementById('editPublisher').value.trim(),
        cv = document.getElementById('editCover').value.trim(),
        is = document.getElementById('editIsbn').value.trim(),
        volInput = document.getElementById('editVolume').value.trim(),
        v = isOneshot ? 1 : (volInput === '' ? 1 : (isNaN(parseInt(volInput)) ? 1 : Math.max(0, parseInt(volInput))));

    Object.assign(i, {
        t: nt, series: gt, a,
        v: v,
        tv: isOneshot ? 1 : 0,
        p: +(document.getElementById('editPages').value) || 0,
        y: document.getElementById('editYear').value.trim(),
        isbn: is, c: cv,
        pub, g
    });

    const wasOwned = (state.collection[state.editId] || {}).owned === true;
    const nowOwned = document.getElementById('editOwned').checked;
    const wasWishlist = (state.collection[state.editId] || {}).wishlist === true;
    const nowWishlist = document.getElementById('editWishlist').checked;
    const wasRead = (state.collection[state.editId] || {}).read === true;
    const nowRead = document.getElementById('editRead').checked;

    const doSave = () => {
        state.collection[state.editId] = {
            owned: nowOwned,
            wishlist: nowWishlist,
            read: nowRead
        };

        if (!isOneshot && ns) syncSeriesMetadata(gt, a, pub, g);
        closeEditModal();
        saveData();
        render();
        buildSidebar();
    };

    if (state.view.confirmDelete !== false) {
        if (wasOwned && !nowOwned) {
            const title = nt;
            const msg = isOneshot 
                ? `Удалить ваншот "${title}" из коллекции?` 
                : `Удалить том "${title}" из коллекции?`;
            showConfirm('Удаление из коллекции', msg, doSave);
            return;
        }
        if (wasWishlist && !nowWishlist) {
            const title = nt;
            const msg = isOneshot 
                ? `Удалить ваншот "${title}" из вишлиста?` 
                : `Удалить том "${title}" из вишлиста?`;
            showConfirm('Удаление из вишлиста', msg, doSave);
            return;
        }
        if (wasRead && !nowRead) {
            const title = nt;
            const msg = isOneshot 
                ? `Удалить ваншот "${title}" из прочитанного?` 
                : `Удалить том "${title}" из прочитанного?`;
            showConfirm('Удаление из прочитанного', msg, doSave);
            return;
        }
    }

    doSave();
}

function deleteItem() {
    if (state.editId === null) return;
    showConfirm('Удаление тома', '🗑️ Удалить из базы данных?', () => {
        state.database = state.database.filter(i => i.id !== state.editId);
        delete state.collection[state.editId];
        closeEditModal();
        saveData();
        render();
        buildSidebar();
    });
}

function editItem(id) {
    openEdit(id);
}

function getBadgeString(item, isGroup) {
    if (isGroup) {
        if (state.viewMode !== 'owned') return '';
        
        const count = item.count || 0;
        let maxVol = item.maxVol || 0;
        if (maxVol === 0) {
            maxVol = state.database.filter(x =>
                String(x.series || x.t).trim() === String(item.t).trim()
            ).length;
        }
        let pct = maxVol > 0 ? Math.min(98, Math.round((count / maxVol) * 100)) : Math.min(70, count * 8);
        if (maxVol > 0 && count >= maxVol) pct = 100;
        const cls = maxVol > 0 && count >= maxVol ? 'completed' : '';
        return `<div class="progress-wrap"><div class="progress-bar ${cls}"><div class="progress-fill" style="width:${pct}%"></div><div class="progress-text">${count}/${maxVol || '?'}</div></div></div>`;
    } else {
        const v = (item.v !== undefined && item.v !== null) ? item.v : null;
        const tv = item.tv || 0;
        if (v === 1 && tv === 1) return '<span class="vol-badge oneshot">ВАНШОТ</span>';
        if (v !== null && v !== '' && v >= 0) return `<span class="vol-badge">Том ${v}</span>`;
        return '';
    }
}

function render(preserveScroll = false) {
    let items = getFilteredData();
    const sortType = (document.getElementById('sortType')?.value) || 'title';
    const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();

    if (state.seriesView && state.viewMode === 'owned') {
        items = getMergedData();
    }

    if (state.filterAuthor) {
        items = items.filter(x =>
            x.a && Array.isArray(x.a) &&
            x.a.some(a => String(a).toLowerCase() === state.filterAuthor.toLowerCase())
        );
    }
    if (state.filterPublisher) {
        items = items.filter(x =>
            String(x.pub || '').toLowerCase() === state.filterPublisher.toLowerCase()
        );
    }
    if (state.filterGenre) {
        items = items.filter(x =>
            x.g && Array.isArray(x.g) &&
            x.g.some(g => String(g).toLowerCase() === state.filterGenre.toLowerCase())
        );
    }
    if (state.seriesView) {
        items = items.filter(x =>
            String(x.series || x.t).trim() === state.seriesView
        );
    }

    let result = [];

    if (state.seriesView) {
        result = [...items].sort((a, b) => (a.v || 0) - (b.v || 0));
    } else if (state.mode === 0 || state.mode === 2) {
        result = [...items];
        if (sortType === 'pages') {
            result.sort((a, b) => (b.p || 0) - (a.p || 0));
        } else if (sortType === 'year') {
            result.sort((a, b) => (b.y || '').localeCompare(a.y || ''));
        } else {
            result.sort((a, b) => {
                const tc = String(a.t).localeCompare(String(b.t));
                return tc !== 0 ? tc : (a.v || 0) - (b.v || 0);
            });
        }
        if (state.mode === 2) {
            result = result.filter(x => x.v === 1 && x.tv === 1);
        }
    } else {
        const groups = items.reduce((acc, x) => {
            if (x.oneshot === true) return acc;
            const key = String(x.series || x.t).trim();
            if (!acc[key]) {
                acc[key] = { 
                    ...x, 
                    t: key,
                    count: 0,
                    ownedCount: 0,
                    maxVol: 0, 
                    readCount: 0, 
                    isGroup: true, 
                    hasOwned: false 
                };
            }
            acc[key].count++;
            if (x.owned === true) acc[key].ownedCount++;
            if (x.r) acc[key].readCount++;
            if (x.owned !== false) acc[key].hasOwned = true;
            if (x.v === 1 && x.c) {
                acc[key].c = x.c;
            }
            return acc;
        }, {});

        Object.keys(groups).forEach(key => {
            const totalInDatabase = state.database.filter(x =>
                String(x.series || x.t).trim() === key
            ).length;
            groups[key].maxVol = totalInDatabase;
        });

        result = Object.values(groups)
            .sort((a, b) => String(a.t).localeCompare(String(b.t)));
    }

    if (!state.filterAuthor && !state.filterPublisher && !state.filterGenre && !state.seriesView && query) {
        result = result.filter(x =>
            String(x.t).toLowerCase().includes(query) ||
            (x.a && Array.isArray(x.a) && x.a.some(a => String(a).toLowerCase().includes(query)))
        );
    }

    const list = document.getElementById('list');
    
    let currentScrollTop = 0;
    if (!preserveScroll) {
        currentScrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }
    
    if (!result.length) {
        const msg = state.seriesView ? 'Тома не найдены' :
            (state.filterAuthor || state.filterPublisher) ? 'Ничего не найдено по фильтру' : 'Ничего не найдено';
        list.innerHTML = `<div style="text-align:center;padding:50px;color:var(--dim);grid-column:1/-1;"><div style="font-size:44px;margin-bottom:12px;">🔍</div><div style="font-size:16px;">${msg}</div></div>`;
        
        if (state.resetScroll) {
            state.resetScroll = false;
            window.scrollTo(0, 0);
        }
        return;
    }

    list.innerHTML = result.map(item => {
        const isGroup = item.isGroup && !state.seriesView;
        const isCompleted = isGroup && state.viewMode === 'owned' && item.maxVol > 0 && item.count >= item.maxVol;
        const isAllCollected = isGroup && state.viewMode === 'all' && item.maxVol > 0 && item.ownedCount >= item.maxVol;

        const badge = getBadgeString(item, isGroup);

        const coverUrl = item.c || '';
        const coverHtml = coverUrl
            ? `<img src="${coverUrl}" class="cover" alt="${item.t.replace(/"/g, '&quot;')}" loading="eager" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
            : '';
        const noCoverHtml = `<div class="no-cover" style="${coverUrl ? 'display:none' : ''}">📘</div>`;

        let clickHandler = '';
        let contextMenuAttr = '';
        if (state.seriesView) {
            clickHandler = `event.stopPropagation();openInfo(${item.id})`;
            contextMenuAttr = `oncontextmenu="handleVolumeContextMenu(event, ${item.id})"`;
        } else if (isGroup) {
            const sn = (item.series || item.t).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            clickHandler = `event.stopPropagation();openSeries('${sn}')`;
            contextMenuAttr = `oncontextmenu="handleSeriesContextMenu(event, '${sn}')"`;
        } else {
            clickHandler = `event.stopPropagation();openInfo(${item.id})`;
            contextMenuAttr = `oncontextmenu="handleVolumeContextMenu(event, ${item.id})"`;
        }

        let metaHtml = '';
        if (isGroup) {
            const vols = state.database.filter(x => String(x.series || x.t).trim() === String(item.t).trim());
            const totalPages = vols.reduce((sum, x) => sum + (+x.p || 0), 0);
            if (state.viewMode === 'all') {
                metaHtml = `${totalPages} стр. • ${vols.length} т.`;
            } else {
                metaHtml = `${totalPages} стр.`;
            }
        } else {
            metaHtml = `${item.p || 0} стр. • ${item.y || '—'}`;
        }

        const notOwnedClass = (state.viewMode === 'owned' && item.owned === false) ? ' not-owned' : '';
        const inCollectionClass = (state.viewMode === 'all' && item.owned === true && !isGroup) ? ' in-collection' : '';

        return `<div class="manga-card ${isCompleted ? 'completed' : ''}${isAllCollected ? 'completed' : ''}${notOwnedClass}${inCollectionClass}" onclick="${clickHandler}" ${contextMenuAttr} style="cursor:pointer;">
            <div class="cover-wrap${notOwnedClass}">${coverHtml}${noCoverHtml}</div>
            <div class="card-body">
                <div class="card-title" title="${item.t.replace(/"/g, '&quot;')}">${item.t}</div>
                ${badge}
                <div class="card-meta">${metaHtml}</div>
            </div>
        </div>`;
    }).join('');

    if (preserveScroll) {
        requestAnimationFrame(() => {
            list.style.display = 'grid';
        });
        return;
    }

    if (state.resetScroll) {
        state.resetScroll = false;
        requestAnimationFrame(() => {
            list.style.display = 'grid';
            window.scrollTo(0, 0);
        });
    } else {
        requestAnimationFrame(() => {
            list.style.display = 'grid';
            if (state.seriesView) {
                window.scrollTo(0, 0);
            } else {
                window.scrollTo(0, currentScrollTop);
            }
        });
    }
}

function updateBackButton() {
    const btn = document.getElementById('backButton');
    if (btn) {
        btn.classList.toggle('inactive', !(state.filterAuthor || state.filterPublisher || state.filterGenre || state.seriesView));
    }
}

function normalizeItem(i) {
    const s = i.series || '';
    const t = i.t || '';
    return {
        id: i.id || Date.now() + Math.random(),
        t: t,
        series: s,
        a: i.a ? (typeof i.a === 'string' ? i.a.split(',').map(s => s.trim()).filter(s => s) : i.a) : [],
        v: +i.v || 0,
        tv: s ? 0 : 1,
        p: +i.p || 0,
        y: i.y || '',
        isbn: String(i.isbn || '').replace(/[-\s]/g, '').replace(/\D/g, ''),
        c: i.c || '',
        pub: i.pub || '',
        g: i.g ? (typeof i.g === 'string' ? i.g.split(',').map(s => s.trim()).filter(s => s) : i.g) : [],
        binding: i.binding ? String(i.binding).trim() : ''
    };
}

function exportDatabase() {
    const d = JSON.stringify(state.database, null, 2);
    const b = new Blob([d], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = `mangamaster_database_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(u);
}

function exportCollection() {
    const d = JSON.stringify(state.collection, null, 2);
    const b = new Blob([d], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = `mangamaster_collection_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(u);
}

function importDatabase(inp) {
    const f = inp.files[0];
    if (!f) return;

    const r = new FileReader();
    r.onload = e => {
        try {
            const raw = JSON.parse(e.target.result);
            let items = [];

            if (Array.isArray(raw)) {
                items = raw.map(normalizeItem);
            } else if (raw.dbs && raw.dbs.manga) {
                items = (raw.dbs.manga || []).map(normalizeItem);
            } else if (raw.manga) {
                items = (raw.manga || []).map(normalizeItem);
            } else {
                items = Object.values(raw).flat().map(normalizeItem);
            }

            const existingIds = new Set(state.database.map(i => i.id));
            let addedCount = 0;
            items.forEach(item => {
                if (!existingIds.has(item.id)) {
                    state.database.push(item);
                    existingIds.add(item.id);
                    addedCount++;
                }
            });

            saveData();
            if (typeof U === 'function') U();
            if (typeof render === 'function') render();
            if (typeof buildSidebar === 'function') buildSidebar();
            showNotification(`База данных импортирована!\nДобавлено томов: ${addedCount}`, '✅');
        } catch (err) {
            showNotification('Ошибка импорта: ' + err.message, '❌');
        }
    };

    r.readAsText(f);
    inp.value = '';
}

function importCollection(inp) {
    const f = inp.files[0];
    if (!f) return;

    const r = new FileReader();
    r.onload = e => {
        try {
            const raw = JSON.parse(e.target.result);
            state.collection = raw;
            saveData();
            if (typeof U === 'function') U();
            if (typeof render === 'function') render();
            if (typeof buildSidebar === 'function') buildSidebar();
            showNotification('Коллекция импортирована!', '✅');
        } catch (err) {
            showNotification('Ошибка импорта: ' + err.message, '❌');
        }
    };

    r.readAsText(f);
    inp.value = '';
}

function importAll(inp) {
    const f = inp.files[0];
    if (!f) return;

    const r = new FileReader();
    r.onload = e => {
        try {
            const raw = JSON.parse(e.target.result);

            if (Array.isArray(raw)) {
                state.database = raw.map(normalizeItem);
                state.collection = {};
            } else if (raw.database) {
                state.database = raw.database.map(normalizeItem);
                state.collection = raw.collection || {};
            } else {
                state.database = raw.map(normalizeItem);
                state.collection = {};
            }

            saveData();
            if (typeof U === 'function') U();
            if (typeof render === 'function') render();
            if (typeof buildSidebar === 'function') buildSidebar();
            showNotification('Всё импортировано!', '✅');
        } catch (err) {
            showNotification('Ошибка импорта: ' + err.message, '❌');
        }
    };

    r.readAsText(f);
    inp.value = '';
}

function showStats() {
    const cur = getMergedData().filter(i => i.owned === true);

    if (!cur.length) {
        document.getElementById('statsContainer').innerHTML = '<div style="text-align:center;padding:30px;color:var(--dim);">Ваша коллекция пуста</div>';
        document.getElementById('statsModal').style.display = 'flex';
        return;
    }

    const totalVanshots = cur.filter(i => i.oneshot === true).length;
    const readVanshots = cur.filter(i => i.oneshot === true && i.r).length;

    const dbGroups = {};
    state.database.forEach(i => {
        if (i.oneshot === true) return;
        const k = (i.series || i.t).trim();
        if (!k) return;
        if (!dbGroups[k]) dbGroups[k] = 0;
        dbGroups[k]++;
    });
    const validSeries = Object.keys(dbGroups);

    const g = {};
    cur.forEach(i => {
        if (i.oneshot === true) return;
        const k = (i.series || i.t).trim();
        if (!k || !validSeries.includes(k)) return;
        if (!g[k]) g[k] = { c: 0, rc: 0 };
        g[k].c++;
        if (i.r) g[k].rc++;
    });

    const comp = Object.entries(g).filter(([key, val]) => val.c >= dbGroups[key]).length;
    const totalSeries = Object.keys(g).length;

    const s = cur.reduce((a, i) => {
        a.t++;
        a.p += (+i.p || 0);
        if (i.r) { a.r++; a.rp += (+i.p || 0); }
        return a;
    }, { t: 0, r: 0, p: 0, rp: 0 });

    const sl = Object.entries(g).sort((a, b) => b[1].c - a[1].c);
    const bs = sl.length > 0 ? sl[0] : null;
    const tb = [...cur].sort((a, b) => (b.p || 0) - (a.p || 0))[0];
    const pubs = cur.reduce((a, i) => {
        const p = i.pub || 'Не указано';
        a[p] = (a[p] || 0) + 1;
        return a;
    }, {});
    const tp = Object.entries(pubs).sort((a, b) => b[1] - a[1])[0];

    let html = '';

    html += '<div class="stats-hero">';
    html += `<div class="stats-hero-item accent-red"><div class="stats-hero-value" data-target="${s.t}">0</div><div class="stats-hero-label">томов</div><div class="stats-hero-sub"><span class="stats-hero-sub-value">${s.r}</span> прочитано</div></div>`;
    html += `<div class="stats-hero-item accent-gold"><div class="stats-hero-value" data-target="${totalSeries}">0</div><div class="stats-hero-label">серий</div><div class="stats-hero-sub"><span class="stats-hero-sub-value">${comp}</span> собрано</div></div>`;
    html += `<div class="stats-hero-item accent-purple"><div class="stats-hero-value" data-target="${totalVanshots}">0</div><div class="stats-hero-label">ваншотов</div><div class="stats-hero-sub"><span class="stats-hero-sub-value">${readVanshots}</span> прочитано</div></div>`;
    html += '</div>';

    html += '<div class="stats-hero stats-hero-wide">';
    html += `<div class="stats-hero-item accent-blue"><div class="stats-hero-value" data-target="${s.p}">0</div><div class="stats-hero-label">страниц</div><div class="stats-hero-sub"><span class="stats-hero-sub-value">${s.rp}</span> прочитано</div></div>`;
    html += '</div>';

    html += '<div class="stats-records-block">';
    const records = [];
    if (bs) records.push(`<div class="stats-record-col"><span class="stats-record-label">Самая большая серия</span><span class="stats-record-title">${bs[0]}</span><span class="stats-record-meta">${bs[1].c} томов</span></div>`);
    if (tb) records.push(`<div class="stats-record-col"><span class="stats-record-label">Самая толстая книга</span><span class="stats-record-title">${tb.t}</span><span class="stats-record-meta">${tb.p} страниц</span></div>`);
    if (tp) records.push(`<div class="stats-record-col"><span class="stats-record-label">Топ издательство</span><span class="stats-record-title">${tp[0]}</span><span class="stats-record-meta">${tp[1]} томов</span></div>`);
    html += records.join('<span class="stats-record-sep"></span>');
    html += '</div>';

    document.getElementById('statsContainer').innerHTML = html;
    document.getElementById('statsModal').style.display = 'flex';

    animateCounters();
}

function animateCounters() {
    const counters = document.querySelectorAll('.stats-hero-value');
    counters.forEach(counter => {
        const target = parseInt(counter.dataset.target) || 0;
        const duration = 800;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(target * eased);
            
            counter.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                counter.textContent = target;
            }
        }

        requestAnimationFrame(update);
    });
}

function closeStats() {
    document.getElementById('statsModal').style.display = 'none';
}

const DATABASE_URL = 'https://raw.githubusercontent.com/YobaTek/MangaMaster/refs/heads/main/database.json';

function updateDbVersionInfo() {
    const el = document.getElementById('dbVersionInfo');
    if (el) {
        el.textContent = `Томов в базе: ${state.database.length}`;
    }
}

async function updateDatabase(silent = false) {
    try {
        const response = await fetch(DATABASE_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error('Ошибка сети');

        const raw = await response.json();
        const items = Array.isArray(raw) ? raw : (raw.database || raw.manga || []);

        if (!items.length) {
            if (!silent) showNotification('База данных пуста', '⚠️');
            return;
        }

        state.database = items.map(item => ({
            ...item,
            id: item.id || Date.now() + Math.random(),
            t: String(item.t || '').trim(),
            series: String(item.series || '').trim(),
            a: item.a ? (Array.isArray(item.a) ? item.a.filter(a => a && String(a).trim()) :
                (typeof item.a === 'string' ? item.a.split(',').map(s => s.trim()).filter(s => s) : [])) : [],
            g: item.g ? (Array.isArray(item.g) ? item.g.filter(g => g && String(g).trim()) :
                (typeof item.g === 'string' ? item.g.split(',').map(s => s.trim()).filter(s => s) : [])) : [],
            v: Math.max(0, parseInt(item.v) || 0),
            tv: item.oneshot ? 1 : (parseInt(item.tv) || 0),
            oneshot: item.oneshot === true,
            p: Math.max(0, parseInt(item.p) || 0),
            y: String(item.y || '').trim(),
            isbn: String(item.isbn || '').trim(),
            pub: String(item.pub || '').trim(),
            c: String(item.c || '').trim(),
            binding: item.binding ? String(item.binding).trim() : ''
        }));

        saveData();
        render();
        buildSidebar();
        updateDbVersionInfo();

        if (!silent) {
            showNotification(`База данных обновлена!\nВсего томов: ${state.database.length}`, '✅');
        }
    } catch (err) {
        if (!silent) {
            showNotification('Не удалось обновить базу данных.', '⚠️');
        }
    }
}

function openSeries(seriesName) {
    const menu = document.getElementById('seriesContextMenu');
    if (menu) menu.style.display = 'none';

    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (!state.scrollPositions.seriesList) state.scrollPositions.seriesList = {};
    state.scrollPositions.seriesList.main = currentScroll;
    
    state.savedScrollTop = currentScroll;
    
    state.seriesView = seriesName;
    state.filterAuthor = '';
    state.filterPublisher = '';
    state.filterGenre = '';
    const si = document.getElementById('searchInput');
    if (si) si.value = '';
    state.resetScroll = true;
    updateBackButton();
    render();
}

function toggleAuthorDropdown(btn) {
    const d = btn.parentElement.querySelector('.author-dropdown');
    const is = d.classList.contains('show');
    closeAllDropdowns();
    if (!is) {
        const r = btn.getBoundingClientRect();
        const spaceBelow = window.innerHeight - r.bottom;
        const spaceAbove = r.top;
        const estimatedHeight = 250;

        d.style.left = r.left + 'px';

        if (spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove) {
            d.style.top = (r.bottom + 4) + 'px';
            d.style.bottom = 'auto';
        } else {
            d.style.bottom = (window.innerHeight - r.top + 4) + 'px';
            d.style.top = 'auto';
        }

        d.classList.add('show');
        btn.innerHTML = '▲';
    }
}

function closeAllDropdowns() {
    document.querySelectorAll('.author-dropdown.show').forEach(d => {
        d.classList.remove('show');
        const moreBtn = d.parentElement.querySelector('.author-more-btn');
        if (moreBtn) moreBtn.innerHTML = '▼';
    });
}

function onSearchInput() {
    clearFilters();
    updateBackButton();
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(render, 300);
}

function handleBack() {
    if (state.seriesView) {
        closeSeriesView();
    } else {
        clearFilters();
    }
    updateBackButton();
    render();
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.series-field-wrap') && !e.target.closest('.badge-field-wrap')) {
        document.querySelectorAll('.series-dropdown').forEach(d => d.classList.remove('show'));
    }
    if (!e.target.closest('.author-dropdown-wrap')) {
        closeAllDropdowns();
    }
});

document.addEventListener('scroll', function() {
    closeAllDropdowns();
}, true);

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (state.seriesView) {
            closeSeriesView();
            updateBackButton();
            render();
            return;
        }
        const modals = ['editModal', 'addModal', 'statsModal', 'settingsModal', 'aboutModal', 'infoModal'];
        modals.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.style.display === 'flex') el.style.display = 'none';
        });
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const si = document.getElementById('searchInput');
        if (si) si.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openAddModal();
    }
});

const CURRENT_VERSION = '1.0.0';

async function checkForUpdates() {
    try {
        const path = window.location.pathname || '/';
        const res = await fetch(path + '?cb=' + Date.now(), { cache: 'no-cache' });
        if (!res.ok) return;
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) {
            return;
        }
        const text = await res.text();
        const match = text.match(/<title>MangaMaster v(\d+\.\d+\.\d+)<\/title>/);
        if (match && match[1] && match[1] !== CURRENT_VERSION) {
            console.log('New version detected! Auto-reloading client to update.', match[1]);
            location.reload();
        }
    } catch (err) {
        console.warn('Update check failed:', err);
    }
}

function init() {
    loadData();
    U();
    render();
    buildSidebar();
    updateDbVersionInfo();
    updateDatabase(true);
    checkForUpdates();
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

let scrollTimeout;
document.addEventListener('scroll', function(e) {
    const btn = document.getElementById('scrollToTop');
    if (!btn) return;
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        if (scrollTop > 300) {
            btn.classList.add('show');
        } else {
            btn.classList.remove('show');
        }
    }, 50);
}, true);

// ---------- КОНТЕКСТНОЕ МЕНЮ ДЛЯ СЕРИЙ И ТОМОВ ----------
let ctxActiveType = ''; // 'series' or 'volume'
let ctxActiveSeries = '';
let ctxActiveId = null;

function handleSeriesContextMenu(event, seriesName) {
    event.preventDefault();
    event.stopPropagation();
    
    ctxActiveType = 'series';
    ctxActiveSeries = seriesName;
    ctxActiveId = null;
    
    const vols = state.database.filter(x => String(x.series || x.t).trim() === String(seriesName).trim());
    if (!vols.length) return;
    
    const hasAnyOwned = vols.some(v => {
        const col = state.collection[v.id];
        return col && col.owned === true;
    });
    
    const hasAnyRead = vols.some(v => {
        const col = state.collection[v.id];
        return col && col.read === true;
    });

    const hasAnyWishlist = vols.some(v => {
        const col = state.collection[v.id];
        return col && col.wishlist === true;
    });
    
    const btnOwned = document.getElementById('ctxToggleOwned');
    const btnRead = document.getElementById('ctxToggleRead');
    const btnWishlist = document.getElementById('ctxToggleWishlist');
    const btnSearchGoogle = document.getElementById('ctxSearchGoogle');
    const btnGoToSeries = document.getElementById('ctxGoToSeries');
    const dividerGoToSeries = document.getElementById('ctxGoToSeriesDivider');

    if (btnGoToSeries) btnGoToSeries.style.display = 'none';
    if (dividerGoToSeries) dividerGoToSeries.style.display = 'none';
    
    if (btnOwned) {
        btnOwned.textContent = hasAnyOwned ? '❌ Удалить из коллекции' : '🏆 Добавить в коллекцию';
        btnOwned.dataset.action = hasAnyOwned ? 'remove' : 'add';
    }
    
    if (btnRead) {
        btnRead.textContent = hasAnyRead ? '❌ Удалить из прочитанного' : '📖 Добавить в прочитанное';
        btnRead.dataset.action = hasAnyRead ? 'remove' : 'add';
    }

    if (btnWishlist) {
        btnWishlist.textContent = hasAnyWishlist ? '❌ Удалить из вишлиста' : '⭐ Добавить в вишлист';
        btnWishlist.dataset.action = hasAnyWishlist ? 'remove' : 'add';
    }

    if (btnSearchGoogle) {
        const query = (seriesName || '').trim() + ' манга';
        btnSearchGoogle.href = 'https://www.google.com/search?q=' + encodeURIComponent(query);
    }
    
    showContextMenu(event);
}

function handleVolumeContextMenu(event, itemId) {
    event.preventDefault();
    event.stopPropagation();
    
    ctxActiveType = 'volume';
    ctxActiveId = itemId;
    ctxActiveSeries = '';
    
    const col = state.collection[itemId] || { owned: false, read: false, wishlist: false };
    const isOwned = col.owned === true;
    const isRead = col.read === true;
    const isWishlist = col.wishlist === true;
    
    const btnOwned = document.getElementById('ctxToggleOwned');
    const btnRead = document.getElementById('ctxToggleRead');
    const btnWishlist = document.getElementById('ctxToggleWishlist');
    const btnSearchGoogle = document.getElementById('ctxSearchGoogle');
    const btnGoToSeries = document.getElementById('ctxGoToSeries');
    const dividerGoToSeries = document.getElementById('ctxGoToSeriesDivider');
    
    const item = state.database.find(i => String(i.id) === String(itemId));

    if (btnGoToSeries) {
        if (item) {
            const seriesName = String(item.series || item.t).trim();
            const isOneshot = item.oneshot === true || (item.v === 1 && item.tv === 1);
            const alreadyInSeriesView = state.seriesView && state.seriesView.toLowerCase() === seriesName.toLowerCase();
            
            if (!isOneshot && !alreadyInSeriesView) {
                btnGoToSeries.style.display = 'block';
                if (dividerGoToSeries) dividerGoToSeries.style.display = 'block';
            } else {
                btnGoToSeries.style.display = 'none';
                if (dividerGoToSeries) dividerGoToSeries.style.display = 'none';
            }
        } else {
            btnGoToSeries.style.display = 'none';
            if (dividerGoToSeries) dividerGoToSeries.style.display = 'none';
        }
    }
    
    if (btnOwned) {
        btnOwned.textContent = isOwned ? '❌ Удалить из коллекции' : '🏆 Добавить в коллекцию';
        btnOwned.dataset.action = isOwned ? 'remove' : 'add';
    }
    
    if (btnRead) {
        btnRead.textContent = isRead ? '❌ Удалить из прочитанного' : '📖 Добавить в прочитанное';
        btnRead.dataset.action = isRead ? 'remove' : 'add';
    }

    if (btnWishlist) {
        btnWishlist.textContent = isWishlist ? '❌ Удалить из вишлиста' : '⭐ Добавить в вишлист';
        btnWishlist.dataset.action = isWishlist ? 'remove' : 'add';
    }

    if (btnSearchGoogle) {
        let query = '';
        if (item) {
            const title = (item.t || '').trim();
            query = `${title} манга`;
        }
        btnSearchGoogle.href = 'https://www.google.com/search?q=' + encodeURIComponent(query);
    }
    
    showContextMenu(event);
}

function ctxGoToSeries() {
    const menu = document.getElementById('seriesContextMenu');
    if (menu) menu.style.display = 'none';
    
    if (ctxActiveType === 'volume' && ctxActiveId !== null) {
        const item = state.database.find(i => String(i.id) === String(ctxActiveId));
        if (item) {
            const seriesName = String(item.series || item.t).trim();
            const isOneshot = item.oneshot === true || (item.v === 1 && item.tv === 1);
            if (!isOneshot) {
                openSeries(seriesName);
            }
        }
    }
}

function showContextMenu(event) {
    const menu = document.getElementById('seriesContextMenu');
    if (menu) {
        // IDs of the menu items we want to manage
        const ids = ['ctxGoToSeries', 'ctxToggleOwned', 'ctxToggleRead', 'ctxToggleWishlist', 'ctxSearchGoogle'];
        const items = ids.map(id => document.getElementById(id)).filter(Boolean);
        
        // Remove existing dividers
        menu.querySelectorAll('.context-menu-divider').forEach(d => d.remove());
        
        const normalVisible = [];
        const deleteVisible = [];
        const hiddenItems = [];
        
        items.forEach(item => {
            const isVisible = item.style.display !== 'none';
            if (isVisible) {
                const text = item.textContent || '';
                if (text.includes('❌') || text.toLowerCase().includes('удалить')) {
                    deleteVisible.push(item);
                    item.classList.add('delete-item');
                } else {
                    normalVisible.push(item);
                    item.classList.remove('delete-item');
                }
            } else {
                hiddenItems.push(item);
            }
        });
        
        // Put all visible items in order: normal first, followed by deletion items
        const orderedVisible = [...normalVisible, ...deleteVisible];
        
        // Append them in order with new dividers
        orderedVisible.forEach((item, index) => {
            menu.appendChild(item);
            if (index < orderedVisible.length - 1) {
                const divider = document.createElement('div');
                divider.className = 'context-menu-divider';
                menu.appendChild(divider);
            }
        });
        
        // Keep hidden items in the DOM so they can be retrieved and shown again on future clicks
        hiddenItems.forEach(item => {
            menu.appendChild(item);
        });

        menu.style.display = 'block';
        
        const menuWidth = menu.offsetWidth || 250;
        const menuHeight = menu.offsetHeight || 175;
        let x = event.clientX;
        let y = event.clientY;
        
        if (x + menuWidth > window.innerWidth) {
            x = window.innerWidth - menuWidth - 10;
        }
        if (y + menuHeight > window.innerHeight) {
            y = window.innerHeight - menuHeight - 10;
        }
        
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
    }

    // Эффект вспышки рамки при правом клике
    if (event) {
        const card = event.target ? event.target.closest('.manga-card') : null;
        if (card) {
            card.classList.remove('sparking');
            // Force a reflow to restart animation if triggered multiple times
            void card.offsetWidth;
            card.classList.add('sparking');
            
            setTimeout(() => {
                card.classList.remove('sparking');
            }, 500);
        }
    }
}

function ctxAddRemoveOwned() {
    const btnOwned = document.getElementById('ctxToggleOwned');
    if (!btnOwned) return;
    
    const action = btnOwned.dataset.action;
    const menu = document.getElementById('seriesContextMenu');
    if (menu) menu.style.display = 'none';
    
    if (ctxActiveType === 'volume' && ctxActiveId !== null) {
        const col = state.collection[ctxActiveId] || { owned: false, read: false, wishlist: false };
        if (action === 'add') {
            state.collection[ctxActiveId] = {
                owned: true,
                wishlist: col.wishlist,
                read: col.read
            };
            saveData();
            render(true);
            buildSidebar();
        } else {
            const item = state.database.find(i => String(i.id) === String(ctxActiveId));
            const title = item ? (item.t || '') : '';
            const isOneshot = item ? (item.oneshot === true || (item.v === 1 && item.tv === 1)) : false;
            const msg = isOneshot 
                ? `Удалить ваншот "${title}" из коллекции?` 
                : `Удалить том "${title}" из коллекции?`;
            
            const doDelete = () => {
                state.collection[ctxActiveId] = {
                    owned: false,
                    wishlist: col.wishlist,
                    read: col.read
                };
                saveData();
                render(true);
                buildSidebar();
            };

            if (state.view.confirmDelete !== false) {
                showConfirm('Удаление из коллекции', msg, doDelete);
            } else {
                doDelete();
            }
        }
    } else if (ctxActiveType === 'series' && ctxActiveSeries) {
        const vols = state.database.filter(x => String(x.series || x.t).trim() === String(ctxActiveSeries).trim());
        if (action === 'add') {
            vols.forEach(v => {
                const col = state.collection[v.id] || { owned: false, read: false, wishlist: false };
                state.collection[v.id] = {
                    owned: true,
                    wishlist: col.wishlist,
                    read: col.read
                };
            });
            saveData();
            render(true);
            buildSidebar();
        } else {
            const msg = `Удалить серию "${ctxActiveSeries}" (все тома) из коллекции?`;
            
            const doDelete = () => {
                vols.forEach(v => {
                    const col = state.collection[v.id] || { owned: false, read: false, wishlist: false };
                    state.collection[v.id] = {
                        owned: false,
                        wishlist: col.wishlist,
                        read: col.read
                    };
                });
                saveData();
                render(true);
                buildSidebar();
            };

            if (state.view.confirmDelete !== false) {
                showConfirm('Удаление из коллекции', msg, doDelete);
            } else {
                doDelete();
            }
        }
    }
}

function ctxAddRemoveRead() {
    const btnRead = document.getElementById('ctxToggleRead');
    if (!btnRead) return;
    
    const action = btnRead.dataset.action;
    const menu = document.getElementById('seriesContextMenu');
    if (menu) menu.style.display = 'none';
    
    if (ctxActiveType === 'volume' && ctxActiveId !== null) {
        const col = state.collection[ctxActiveId] || { owned: false, read: false, wishlist: false };
        if (action === 'add') {
            state.collection[ctxActiveId] = {
                owned: col.owned,
                wishlist: col.wishlist,
                read: true
            };
            saveData();
            render(true);
            buildSidebar();
        } else {
            const doDelete = () => {
                state.collection[ctxActiveId] = {
                    owned: col.owned,
                    wishlist: col.wishlist,
                    read: false
                };
                saveData();
                render(true);
                buildSidebar();
            };

            if (state.view.confirmDelete !== false) {
                const item = state.database.find(i => String(i.id) === String(ctxActiveId));
                const title = item ? (item.t || '') : '';
                const isOneshot = item ? (item.oneshot === true || (item.v === 1 && item.tv === 1)) : false;
                const msg = isOneshot 
                    ? `Удалить ваншот "${title}" из прочитанного?` 
                    : `Удалить том "${title}" из прочитанного?`;
                showConfirm('Удаление из прочитанного', msg, doDelete);
            } else {
                doDelete();
            }
        }
    } else if (ctxActiveType === 'series' && ctxActiveSeries) {
        const vols = state.database.filter(x => String(x.series || x.t).trim() === String(ctxActiveSeries).trim());
        if (action === 'add') {
            vols.forEach(v => {
                const col = state.collection[v.id] || { owned: false, read: false, wishlist: false };
                state.collection[v.id] = {
                    owned: col.owned,
                    wishlist: col.wishlist,
                    read: true
                };
            });
            saveData();
            render(true);
            buildSidebar();
        } else {
            const doDelete = () => {
                vols.forEach(v => {
                    const col = state.collection[v.id] || { owned: false, read: false, wishlist: false };
                    state.collection[v.id] = {
                        owned: col.owned,
                        wishlist: col.wishlist,
                        read: false
                    };
                });
                saveData();
                render(true);
                buildSidebar();
            };

            if (state.view.confirmDelete !== false) {
                const msg = `Удалить серию "${ctxActiveSeries}" (все тома) из прочитанного?`;
                showConfirm('Удаление из прочитанного', msg, doDelete);
            } else {
                doDelete();
            }
        }
    }
}

function ctxAddRemoveWishlist() {
    const btnWishlist = document.getElementById('ctxToggleWishlist');
    if (!btnWishlist) return;
    
    const action = btnWishlist.dataset.action;
    const menu = document.getElementById('seriesContextMenu');
    if (menu) menu.style.display = 'none';
    
    if (ctxActiveType === 'volume' && ctxActiveId !== null) {
        const col = state.collection[ctxActiveId] || { owned: false, read: false, wishlist: false };
        if (action === 'add') {
            state.collection[ctxActiveId] = {
                owned: col.owned,
                wishlist: true,
                read: col.read
            };
            saveData();
            render(true);
            buildSidebar();
        } else {
            const doDelete = () => {
                state.collection[ctxActiveId] = {
                    owned: col.owned,
                    wishlist: false,
                    read: col.read
                };
                saveData();
                render(true);
                buildSidebar();
            };

            if (state.view.confirmDelete !== false) {
                const item = state.database.find(i => String(i.id) === String(ctxActiveId));
                const title = item ? (item.t || '') : '';
                const isOneshot = item ? (item.oneshot === true || (item.v === 1 && item.tv === 1)) : false;
                const msg = isOneshot 
                    ? `Удалить ваншот "${title}" из вишлиста?` 
                    : `Удалить том "${title}" из вишлиста?`;
                showConfirm('Удаление из вишлиста', msg, doDelete);
            } else {
                doDelete();
            }
        }
    } else if (ctxActiveType === 'series' && ctxActiveSeries) {
        const vols = state.database.filter(x => String(x.series || x.t).trim() === String(ctxActiveSeries).trim());
        if (action === 'add') {
            vols.forEach(v => {
                const col = state.collection[v.id] || { owned: false, read: false, wishlist: false };
                state.collection[v.id] = {
                    owned: col.owned,
                    wishlist: true,
                    read: col.read
                };
            });
            saveData();
            render(true);
            buildSidebar();
        } else {
            const doDelete = () => {
                vols.forEach(v => {
                    const col = state.collection[v.id] || { owned: false, read: false, wishlist: false };
                    state.collection[v.id] = {
                        owned: col.owned,
                        wishlist: false,
                        read: col.read
                    };
                });
                saveData();
                render(true);
                buildSidebar();
            };

            if (state.view.confirmDelete !== false) {
                const msg = `Удалить серию "${ctxActiveSeries}" (все тома) из вишлиста?`;
                showConfirm('Удаление из вишлиста', msg, doDelete);
            } else {
                doDelete();
            }
        }
    }
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('seriesContextMenu');
    if (menu) menu.style.display = 'none';

    if (!e.target.closest('.custom-select')) {
        document.querySelectorAll('.custom-select').forEach(cs => {
            cs.classList.remove('open');
        });
    }
});

document.addEventListener('contextmenu', (e) => {
    const menu = document.getElementById('seriesContextMenu');
    if (menu && !e.target.closest('.manga-card')) {
        menu.style.display = 'none';
    }
});

window.addEventListener('scroll', () => {
    const menu = document.getElementById('seriesContextMenu');
    if (menu) menu.style.display = 'none';
    
    document.querySelectorAll('.custom-select').forEach(cs => {
        cs.classList.remove('open');
    });
}, { passive: true });

init();
