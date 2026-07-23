'use strict';

/* ===================================================================
   Agile Tracker — frontend rakendus
   Vanilla JS, ilma raamistikuta. Suhtleb backendiga REST API kaudu
   (vt README.md API sektsiooni).
   =================================================================== */

const API_BASE = '/api/stories';
const STATUSES = ['todo', 'doing', 'done'];
const TITLE_MAX_LENGTH = 200;

/** @type {Array<Object>} kõik hetkel serverist laetud story'd, prioriteedi järjekorras */
let stories = [];

/** Aktiivsed filtrid */
const filters = { search: '', status: 'all', min: null, max: null };

/** Kui modal on avatud olemasoleva story vaatamiseks/muutmiseks, siis selle ID. Uue loomisel: null. */
let editingId = null;

/** Lohistamise ajal liikuva kaardi ID */
let draggedId = null;

/** Kinnitusmodali jaoks salvestatud tegevus (funktsioon, mida käivitada "Kustuta" vajutamisel) */
let pendingConfirmAction = null;

// ---------- DOM viited ----------
const el = {
  board: document.getElementById('board'),
  searchInput: document.getElementById('searchInput'),
  statusFilter: document.getElementById('statusFilter'),
  minPoints: document.getElementById('minPoints'),
  maxPoints: document.getElementById('maxPoints'),
  newStoryBtn: document.getElementById('newStoryBtn'),
  toast: document.getElementById('toast'),

  storyModal: document.getElementById('storyModal'),
  modalIdLabel: document.getElementById('modalIdLabel'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  titleInput: document.getElementById('titleInput'),
  titleCounter: document.getElementById('titleCounter'),
  statusInput: document.getElementById('statusInput'),
  pointsInput: document.getElementById('pointsInput'),
  datesCol: document.getElementById('datesCol'),
  datesText: document.getElementById('datesText'),
  descriptionInput: document.getElementById('descriptionInput'),
  addCriterionBtn: document.getElementById('addCriterionBtn'),
  criteriaList: document.getElementById('criteriaList'),
  commentsSection: document.getElementById('commentsSection'),
  commentsList: document.getElementById('commentsList'),
  newCommentInput: document.getElementById('newCommentInput'),
  addCommentBtn: document.getElementById('addCommentBtn'),
  deleteStoryBtn: document.getElementById('deleteStoryBtn'),
  cancelStoryBtn: document.getElementById('cancelStoryBtn'),
  saveStoryBtn: document.getElementById('saveStoryBtn'),

  confirmModal: document.getElementById('confirmModal'),
  confirmText: document.getElementById('confirmText'),
  confirmCancelBtn: document.getElementById('confirmCancelBtn'),
  confirmOkBtn: document.getElementById('confirmOkBtn'),
};

const columnBodies = {
  todo: document.querySelector('.column-body[data-status="todo"]'),
  doing: document.querySelector('.column-body[data-status="doing"]'),
  done: document.querySelector('.column-body[data-status="done"]'),
};

// ---------- API abifunktsioonid ----------
async function apiRequest(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    const message = data && (data.errors ? data.errors.join(' ') : data.error) ;
    throw new Error(message || `Serveri viga (HTTP ${res.status}).`);
  }
  return data;
}

const api = {
  list: () => apiRequest('GET', API_BASE),
  create: (payload) => apiRequest('POST', API_BASE, payload),
  update: (id, payload) => apiRequest('PUT', `${API_BASE}/${id}`, payload),
  remove: (id) => apiRequest('DELETE', `${API_BASE}/${id}`),
  setStatus: (id, status) => apiRequest('PATCH', `${API_BASE}/${id}/status`, { status }),
  reorder: (orderedIds) => apiRequest('PATCH', `${API_BASE}/reorder`, { orderedIds }),
  addComment: (id, text) => apiRequest('POST', `${API_BASE}/${id}/comments`, { text }),
  removeComment: (id, commentId) => apiRequest('DELETE', `${API_BASE}/${id}/comments/${commentId}`),
};

// ---------- Toast ----------
let toastTimer = null;
function showToast(message, type = 'info') {
  el.toast.textContent = message;
  el.toast.className = `toast show${type === 'error' ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('show');
  }, 3200);
}

// ---------- Kuupäevad ----------
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ---------- Laadimine ja renderdamine ----------
async function loadStories({ silent = false } = {}) {
  try {
    stories = await api.list();
    render();
  } catch (err) {
    if (!silent) showToast(err.message, 'error');
  }
}

function matchesFilters(story) {
  if (filters.status !== 'all' && story.status !== filters.status) return false;
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const hay = `${story.title} ${story.description}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  if (filters.min !== null && story.points < filters.min) return false;
  if (filters.max !== null && story.points > filters.max) return false;
  return true;
}

function render() {
  STATUSES.forEach((status) => {
    const columnStories = stories.filter((s) => s.status === status).sort((a, b) => a.priority - b.priority);
    const visible = columnStories.filter(matchesFilters);

    const body = columnBodies[status];
    body.innerHTML = '';
    visible.forEach((story) => body.appendChild(buildCard(story)));

    const column = body.closest('.column');
    column.querySelector('[data-role="count"]').textContent = `${visible.length} story't`;
    const pts = visible.reduce((sum, s) => sum + (Number(s.points) || 0), 0);
    column.querySelector('[data-role="points"]').textContent = `${pts} pt`;
  });
}

function buildCard(story) {
  const card = document.createElement('article');
  card.className = 'card';
  card.draggable = true;
  card.dataset.id = String(story.id);

  card.innerHTML = `
    <div class="card-top">
      <span class="card-id mono">#${String(story.id).padStart(3, '0')}</span>
    </div>
    <h3 class="card-title">${escapeHtml(story.title)}</h3>
    ${story.description ? `<p class="card-desc">${escapeHtml(story.description)}</p>` : ''}
    <div class="card-footer">
      <span class="badge badge-points mono">${story.points} PT</span>
      <span class="badge-meta mono">✓ ${story.acceptanceCriteria.length}</span>
      <span class="badge-meta mono">💬 ${story.comments.length}</span>
    </div>
  `;

  card.addEventListener('click', () => openStoryModal(story.id));
  card.addEventListener('dragstart', (e) => {
    draggedId = story.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(story.id));
    } catch (_) {
      /* Safari niisama */
    }
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedId = null;
    document.querySelectorAll('.column-body.drag-over').forEach((n) => n.classList.remove('drag-over'));
    dropIndicator.remove();
  });

  return card;
}

// ---------- Lohistamine (drag & drop) ----------
function getDragAfterElement(container, y) {
  const cards = [...container.querySelectorAll('.card:not(.dragging)')];
  return cards.reduce(
    (closest, cardEl) => {
      const box = cardEl.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: cardEl };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function computeNewOrder(fullIds, draggedStoryId, afterId, targetStatus, storiesById) {
  const rest = fullIds.filter((id) => id !== draggedStoryId);
  let insertIndex;
  if (afterId != null) {
    insertIndex = rest.indexOf(afterId);
    if (insertIndex === -1) insertIndex = rest.length;
  } else {
    let lastIdx = -1;
    rest.forEach((id, i) => {
      const s = storiesById.get(id);
      if (s && s.status === targetStatus) lastIdx = i;
    });
    insertIndex = lastIdx === -1 ? rest.length : lastIdx + 1;
  }
  rest.splice(insertIndex, 0, draggedStoryId);
  return rest;
}

const dropIndicator = document.createElement('div');
dropIndicator.className = 'drop-indicator';

Object.values(columnBodies).forEach((body) => {
  body.addEventListener('dragover', (e) => {
    e.preventDefault();
    body.classList.add('drag-over');
    const afterEl = getDragAfterElement(body, e.clientY);
    if (afterEl) {
      body.insertBefore(dropIndicator, afterEl);
    } else {
      body.appendChild(dropIndicator);
    }
  });
  body.addEventListener('dragleave', (e) => {
    if (e.target === body) {
      body.classList.remove('drag-over');
      dropIndicator.remove();
    }
  });
  body.addEventListener('drop', async (e) => {
    e.preventDefault();
    body.classList.remove('drag-over');
    dropIndicator.remove();
    if (draggedId == null) return;

    const targetStatus = body.dataset.status;
    const afterEl = getDragAfterElement(body, e.clientY);
    const afterId = afterEl ? Number(afterEl.dataset.id) : null;

    const draggedStory = stories.find((s) => s.id === draggedId);
    if (!draggedStory) return;
    const oldStatus = draggedStory.status;

    const fullIds = stories.map((s) => s.id);
    const storiesById = new Map(stories.map((s) => [s.id, s]));
    const newOrder = computeNewOrder(fullIds, draggedId, afterId, targetStatus, storiesById);

    // Optimistlik uuendus kohapeal, kiireks tagasisideks
    newOrder.forEach((id, idx) => {
      const s = storiesById.get(id);
      if (s) s.priority = idx + 1;
    });
    draggedStory.status = targetStatus;
    render();

    try {
      await api.reorder(newOrder);
      if (oldStatus !== targetStatus) {
        await api.setStatus(draggedStory.id, targetStatus);
      }
      await loadStories({ silent: true });
    } catch (err) {
      showToast(err.message, 'error');
      await loadStories({ silent: true });
    }
  });
});

// ---------- Filtrid ----------
let searchDebounce = null;
el.searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    filters.search = el.searchInput.value.trim();
    render();
  }, 150);
});
el.statusFilter.addEventListener('change', () => {
  filters.status = el.statusFilter.value;
  render();
});
el.minPoints.addEventListener('input', () => {
  filters.min = el.minPoints.value === '' ? null : Number(el.minPoints.value);
  render();
});
el.maxPoints.addEventListener('input', () => {
  filters.max = el.maxPoints.value === '' ? null : Number(el.maxPoints.value);
  render();
});

// ---------- Modal: pealkirja märgiloendur ----------
function updateTitleCounter() {
  const length = el.titleInput.value.length;
  el.titleCounter.textContent = `${length} / ${TITLE_MAX_LENGTH}`;
  el.titleCounter.classList.toggle('near-limit', length >= TITLE_MAX_LENGTH - 20);
}
el.titleInput.addEventListener('input', updateTitleCounter);

// ---------- Modal: vastuvõtutingimused ----------
function addCriterionRow(value = '') {
  const li = document.createElement('li');
  li.className = 'criteria-item';
  li.innerHTML = `
    <input type="text" value="${escapeHtml(value)}" placeholder="nt Kasutaja saab sisestada pealkirja." maxlength="300" />
    <button type="button" class="remove-btn" aria-label="Eemalda tingimus">✕</button>
  `;
  li.querySelector('.remove-btn').addEventListener('click', () => li.remove());
  el.criteriaList.appendChild(li);
  return li;
}

function getCriteriaValues() {
  return [...el.criteriaList.querySelectorAll('input')]
    .map((input) => input.value.trim())
    .filter((v) => v.length > 0);
}

el.addCriterionBtn.addEventListener('click', () => {
  const row = addCriterionRow('');
  row.querySelector('input').focus();
});

// ---------- Modal: kommentaarid ----------
function renderComments(story) {
  el.commentsList.innerHTML = '';
  if (story.comments.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'comments-empty';
    empty.textContent = 'Kommentaare pole veel. Ole esimene!';
    el.commentsList.appendChild(empty);
    return;
  }
  story.comments.forEach((comment) => {
    const li = document.createElement('li');
    li.className = 'comment-item';
    li.innerHTML = `
      <div>
        <div class="comment-text">${escapeHtml(comment.text)}</div>
        <span class="comment-time">${formatDate(comment.createdAt)}</span>
      </div>
      <button type="button" class="comment-delete" aria-label="Kustuta kommentaar">✕</button>
    `;
    li.querySelector('.comment-delete').addEventListener('click', async () => {
      try {
        await api.removeComment(story.id, comment.id);
        story.comments = story.comments.filter((c) => c.id !== comment.id);
        renderComments(story);
        render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    el.commentsList.appendChild(li);
  });
}

el.addCommentBtn.addEventListener('click', async () => {
  const text = el.newCommentInput.value.trim();
  if (!text || editingId == null) return;
  try {
    const comment = await api.addComment(editingId, text);
    const story = stories.find((s) => s.id === editingId);
    if (story) {
      story.comments.push(comment);
      renderComments(story);
      render();
    }
    el.newCommentInput.value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
});
el.newCommentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    el.addCommentBtn.click();
  }
});

// ---------- Modal: ava / sulge ----------
function openNewStoryModal() {
  editingId = null;
  el.modalIdLabel.textContent = 'UUS';
  el.titleInput.value = '';
  el.statusInput.value = 'todo';
  el.pointsInput.value = '';
  el.descriptionInput.value = '';
  el.datesCol.hidden = true;
  updateTitleCounter();
  el.criteriaList.innerHTML = '';
  addCriterionRow('');
  el.commentsSection.hidden = true;
  el.deleteStoryBtn.hidden = true;
  el.storyModal.classList.remove('hidden');
  el.titleInput.focus();
}

function openStoryModal(id) {
  const story = stories.find((s) => s.id === id);
  if (!story) return;
  editingId = id;
  el.modalIdLabel.textContent = `#${String(story.id).padStart(3, '0')}`;
  el.titleInput.value = story.title;
  el.statusInput.value = story.status;
  el.pointsInput.value = story.points;
  el.descriptionInput.value = story.description;
  el.datesCol.hidden = false;
  updateTitleCounter();
  el.datesText.innerHTML = `Loodud: ${formatDate(story.createdAt)}<br>Muudetud: ${formatDate(story.updatedAt)}`;
  el.criteriaList.innerHTML = '';
  story.acceptanceCriteria.forEach((c) => addCriterionRow(c));
  el.commentsSection.hidden = false;
  el.newCommentInput.value = '';
  renderComments(story);
  el.deleteStoryBtn.hidden = false;
  el.storyModal.classList.remove('hidden');
  el.titleInput.focus();
}

function closeStoryModal() {
  el.storyModal.classList.add('hidden');
  editingId = null;
}

el.newStoryBtn.addEventListener('click', openNewStoryModal);
el.closeModalBtn.addEventListener('click', closeStoryModal);
el.cancelStoryBtn.addEventListener('click', closeStoryModal);
el.storyModal.addEventListener('click', (e) => {
  if (e.target === el.storyModal) closeStoryModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!el.storyModal.classList.contains('hidden')) closeStoryModal();
    if (!el.confirmModal.classList.contains('hidden')) closeConfirmModal();
  }
});

// ---------- Salvestamine ----------
el.saveStoryBtn.addEventListener('click', async () => {
  const payload = {
    title: el.titleInput.value.trim(),
    description: el.descriptionInput.value.trim(),
    status: el.statusInput.value,
    points: el.pointsInput.value === '' ? NaN : Number(el.pointsInput.value),
    acceptanceCriteria: getCriteriaValues(),
  };

  if (!payload.title) return showToast('Pealkiri on kohustuslik.', 'error');
  if (!Number.isInteger(payload.points) || payload.points < 0 || payload.points > 1000) {
    return showToast('Punktid peavad olema täisarv vahemikus 0–1000.', 'error');
  }
  if (payload.acceptanceCriteria.length === 0) {
    return showToast('Lisa vähemalt üks vastuvõtutingimus.', 'error');
  }

  // Väldib topeltklikist tekkivat topeltloomist/-salvestust, kuni päring käib.
  if (el.saveStoryBtn.disabled) return;
  el.saveStoryBtn.disabled = true;
  try {
    if (editingId == null) {
      await api.create(payload);
      showToast('Story loodud.');
    } else {
      await api.update(editingId, payload);
      showToast('Story salvestatud.');
    }
    closeStoryModal();
    await loadStories();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    el.saveStoryBtn.disabled = false;
  }
});

// ---------- Kustutamine (üldine kinnitusmodal) ----------
function openConfirmModal(text, onConfirm) {
  el.confirmText.textContent = text;
  pendingConfirmAction = onConfirm;
  el.confirmModal.classList.remove('hidden');
}
function closeConfirmModal() {
  el.confirmModal.classList.add('hidden');
  pendingConfirmAction = null;
}
el.confirmCancelBtn.addEventListener('click', closeConfirmModal);
el.confirmModal.addEventListener('click', (e) => {
  if (e.target === el.confirmModal) closeConfirmModal();
});
el.confirmOkBtn.addEventListener('click', async () => {
  if (el.confirmOkBtn.disabled) return;
  const action = pendingConfirmAction;
  el.confirmOkBtn.disabled = true;
  try {
    closeConfirmModal();
    if (action) await action();
  } finally {
    el.confirmOkBtn.disabled = false;
  }
});

el.deleteStoryBtn.addEventListener('click', () => {
  if (editingId == null) return;
  const story = stories.find((s) => s.id === editingId);
  openConfirmModal(`Kustutada story "${story ? story.title : ''}"? Seda ei saa tagasi võtta.`, async () => {
    try {
      await api.remove(editingId);
      showToast('Story kustutatud.');
      closeStoryModal();
      await loadStories();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
});

// ---------- Käivitamine ----------
loadStories();
