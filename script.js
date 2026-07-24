// API-Basis-URL
const API_URL = '/todos';

// Service Worker registrieren (für PWA und Offline-Funktionalität)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
        console.warn('Service Worker registration failed:', err);
    });
}

// DOM-Elemente
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoList = document.getElementById('todo-list');
const settingsBtn = document.getElementById('settings-btn');
const settingsMenu = document.getElementById('settings-menu');
const backupTodosBtn = document.getElementById('backup-todos-btn');
const backupSelect = document.getElementById('backup-select');
const restoreTodosBtn = document.getElementById('restore-todos-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const taskFilter = document.getElementById('task-filter');
const deleteCompletedBtn = document.getElementById('delete-completed-btn');

const expandedSubtaskTodoIds = new Set();
let draggedTodoId = null;
let currentFilter = 'all';

// Settings-Menü ein-/ausblenden
settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsMenu.hidden = !settingsMenu.hidden;
    if (!settingsMenu.hidden) loadBackups();
});

closeSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsMenu.hidden = true;
});

// Neues Todo hinzufügen
async function addTodo(e) {
    e.preventDefault();
    const text = todoInput.value.trim();

    if (!text) {
        alert('Bitte gib einen Text für das Todo ein.');
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, note: '', subtasks: [] })
        });

        if (!response.ok) {
            throw new Error('Fehler beim Speichern des Todos');
        }

        // "Todo saved" Nachricht anzeigen
        const originalText = todoForm.querySelector('button').textContent;
        todoForm.querySelector('button').textContent = 'Todo gespeichert ✓';
        setTimeout(() => {
            todoForm.querySelector('button').textContent = originalText;
        }, 2000);

        todoInput.value = '';
        loadTodos();
    } catch (error) {
        console.error('Fehler beim Hinzufügen des Todos:', error);
        alert('Fehler beim Hinzufügen des Todos: ' + error.message);
    }
}

// Form-Submit-Handler
todoForm.addEventListener('submit', addTodo);

taskFilter.addEventListener('click', (e) => {
    const filterButton = e.target.closest('.task-filter-btn');
    if (!filterButton) return;
    currentFilter = filterButton.dataset.filter;
    document.querySelectorAll('.task-filter-btn').forEach(button => {
        button.classList.toggle('active', button === filterButton);
    });
    loadTodos();
});

deleteCompletedBtn.addEventListener('click', deleteCompletedTodos);

// Backup Todos auslösen
backupTodosBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (backupTodosBtn.disabled) return;
    backupTodosBtn.disabled = true;

    try {
        const response = await fetch('/backup', { method: 'GET' });
        const data = await response.json();
        alert(`Backup erfolgreich erstellt!\nDateiname: ${data.filename}`);
        await loadBackups();
    } catch (error) {
        alert('Fehler beim Erstellen des Backups: ' + error.message);
    } finally {
        backupTodosBtn.disabled = false;
    }
});

async function loadBackups() {
    try {
        const response = await fetch('/backups');
        if (!response.ok) throw new Error('Backups konnten nicht geladen werden.');
        const data = await response.json();
        const backups = data.backups || [];

        backupSelect.replaceChildren();
        backups.forEach(filename => {
            const option = document.createElement('option');
            option.value = filename;
            option.textContent = filename;
            backupSelect.appendChild(option);
        });
        backupSelect.disabled = backups.length === 0;
        restoreTodosBtn.disabled = backups.length === 0;

        if (backups.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Keine Backups gefunden';
            backupSelect.appendChild(option);
        }
    } catch (error) {
        backupSelect.replaceChildren(new Option('Backups konnten nicht geladen werden', ''));
        backupSelect.disabled = true;
        restoreTodosBtn.disabled = true;
        alert('Fehler beim Laden der Backups: ' + error.message);
    }
}

restoreTodosBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    const filename = backupSelect.value;
    if (!filename || !confirm(`Möchtest du das Backup "${filename}" wirklich wiederherstellen? Die aktuellen Todos werden ersetzt.`)) return;

    restoreTodosBtn.disabled = true;
    try {
        const response = await fetch('/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Wiederherstellung fehlgeschlagen.');
        alert('Todos wurden erfolgreich wiederhergestellt.');
        settingsMenu.hidden = true;
        await loadTodos();
    } catch (error) {
        alert('Fehler beim Wiederherstellen der Todos: ' + error.message);
        restoreTodosBtn.disabled = false;
    }
});

// Todos laden
async function loadTodos() {
    try {
        const response = await fetch(API_URL);
        const todos = await response.json();
        renderTodos(todos);
    } catch (error) {
        console.error('Fehler beim Laden der Todos:', error);
    }
}

// Hilfsfunktion: Text sicher für HTML escapen (verhindert XSS über Todo-/Notiz-/Teilschritt-Text)
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function formatFileSize(size) {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// Fortschritts-Ring und Zähler aktualisieren
function updateProgress(todos) {
    const total = todos.length;
    const completedCount = todos.filter(isTodoCompleted).length;
    const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);

    const circumference = 169.6;
    const ringFill = document.getElementById('progress-ring-fill');
    const ringLabel = document.getElementById('progress-ring-label');
    ringFill.style.strokeDashoffset = circumference - (circumference * percent) / 100;
    ringFill.classList.toggle('complete', total > 0 && percent === 100);
    ringLabel.textContent = `${percent}%`;

    document.getElementById('all-count').textContent = total;
    document.getElementById('open-count').textContent = total - completedCount;
    document.getElementById('completed-count').textContent = completedCount;
    deleteCompletedBtn.hidden = currentFilter !== 'completed' || completedCount === 0;
}

function isTodoCompleted(todo) {
    const hasSubtasks = todo.subtasks && todo.subtasks.length > 0;
    const allSubtasksCompleted = hasSubtasks && todo.subtasks.every(st => st.completed);
    return todo.completed || allSubtasksCompleted;
}

function getFilteredTodos(todos) {
    if (currentFilter === 'open') return todos.filter(todo => !isTodoCompleted(todo));
    if (currentFilter === 'completed') return todos.filter(isTodoCompleted);
    return todos;
}

// Todos rendern (mit Teilschritten direkt unter dem Todo)
function renderTodos(todos) {
    todoList.innerHTML = '';
    updateProgress(todos);
    const filteredTodos = getFilteredTodos(todos);

    if (filteredTodos.length === 0) {
        todoList.innerHTML = `
            <li class="empty-state">
                <span class="empty-state-icon">✓</span>
                <p>${todos.length === 0 ? 'Keine Todos vorhanden' : 'Keine passenden Todos'}</p>
                <span class="empty-state-hint">${todos.length === 0 ? 'Füge oben dein erstes Todo hinzu' : 'Wähle einen anderen Filter'}</span>
            </li>
        `;
        return;
    }

    filteredTodos.forEach(todo => {
        const todoItem = document.createElement('li');
        const hasSubtasks = todo.subtasks && todo.subtasks.length > 0;
        const allSubtasksCompleted = hasSubtasks && todo.subtasks.every(st => st.completed);
        const isCompleted = isTodoCompleted(todo);
        const isSubtaskContainerVisible = expandedSubtaskTodoIds.has(todo.id);

        todoItem.className = `todo-item ${isCompleted ? 'completed' : ''} ${hasSubtasks ? 'has-subtasks' : ''}`;
        todoItem.dataset.id = todo.id;
        todoItem.draggable = true;

        const noteId = `note-${todo.id}`;
        const noteDisplayId = `note-display-${todo.id}`;
        const subtaskContainerId = `subtask-container-${todo.id}`;
        const newSubtaskInputId = `new-subtask-input-${todo.id}`;
        const noteButtonText = 'Notiz einblenden';
        const attachments = todo.attachments || [];

        todoItem.innerHTML = `
            <div class="todo-header">
                <input type="checkbox" class="todo-toggle" ${isCompleted ? 'checked' : ''} data-id="${todo.id}">
                <span class="todo-text">${escapeHtml(todo.text)}</span>
                <div class="todo-actions">
                    <button class="subtask-toggle-btn" data-id="${todo.id}">Teilschritte ${isSubtaskContainerVisible ? 'ausblenden' : 'anzeigen'}</button>
                    <button class="note-toggle" data-id="${todo.id}" data-note-id="${noteId}">
                        ${noteButtonText}
                    </button>
                    <button class="todo-delete" data-id="${todo.id}">Löschen</button>
                </div>
            </div>
            <div id="${noteId}" class="todo-note" style="display: none;">
                <textarea id="${noteDisplayId}" placeholder="Notiz eingeben...">${escapeHtml(todo.note || '')}</textarea>
                <button class="note-save" data-id="${todo.id}" data-note-id="${noteDisplayId}">Speichern</button>
                <div class="todo-attachments">
                    <div class="attachment-list">
                        ${attachments.map(attachment => `
                            <div class="attachment-item">
                                <a href="${API_URL}/${todo.id}/attachments/${attachment.id}" class="attachment-link" download>${escapeHtml(attachment.original_name)}</a>
                                <span class="attachment-size">${formatFileSize(attachment.size)}</span>
                                <button class="attachment-delete" data-todo-id="${todo.id}" data-attachment-id="${attachment.id}" title="Anhang löschen" aria-label="Anhang löschen">×</button>
                            </div>
                        `).join('')}
                    </div>
                    <label class="attachment-upload">
                        <span>Anhang hinzufügen</span>
                        <input type="file" class="note-attachment-input" data-todo-id="${todo.id}" multiple>
                    </label>
                    <span class="attachment-hint">Maximal 12 MB pro Datei</span>
                </div>
            </div>
            <div id="${subtaskContainerId}" class="subtask-container ${isSubtaskContainerVisible ? 'visible' : ''}">
                ${hasSubtasks ? todo.subtasks.map((subtask, index) => `
                    <div class="subtask-item-in-todo" data-todo-id="${todo.id}" data-index="${index}">
                        <input type="checkbox" class="subtask-toggle" ${subtask.completed ? 'checked' : ''} data-todo-id="${todo.id}" data-index="${index}">
                        <span class="subtask-text">${escapeHtml(subtask.text)}</span>
                    </div>
                `).join('') : ''}
                <div class="add-subtask-in-todo">
                    <input type="text" id="${newSubtaskInputId}" class="new-subtask-input" placeholder="Neuer Teilschritt..." data-todo-id="${todo.id}">
                    <button class="add-subtask-btn" data-todo-id="${todo.id}">+</button>
                </div>
            </div>
        `;
        todoList.appendChild(todoItem);
    });

    document.querySelectorAll('.todo-item').forEach(todoItem => {
        todoItem.addEventListener('dragstart', handleTodoDragStart);
        todoItem.addEventListener('dragover', handleTodoDragOver);
        todoItem.addEventListener('dragleave', handleTodoDragLeave);
        todoItem.addEventListener('drop', handleTodoDrop);
        todoItem.addEventListener('dragend', handleTodoDragEnd);
    });

    // Event-Listener hinzufügen
    document.querySelectorAll('.todo-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', toggleTodo);
    });
    document.querySelectorAll('.todo-delete').forEach(button => {
        button.addEventListener('click', deleteTodo);
    });
    document.querySelectorAll('.note-toggle').forEach(button => {
        button.addEventListener('click', toggleNote);
    });
    document.querySelectorAll('.note-save').forEach(button => {
        button.addEventListener('click', saveNote);
    });
    document.querySelectorAll('.note-attachment-input').forEach(input => {
        input.addEventListener('change', uploadAttachments);
    });
    document.querySelectorAll('.attachment-delete').forEach(button => {
        button.addEventListener('click', deleteAttachment);
    });
    document.querySelectorAll('.subtask-toggle-btn').forEach(button => {
        button.addEventListener('click', toggleSubtaskContainer);
    });
    document.querySelectorAll('.subtask-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', toggleSubtask);
    });
    document.querySelectorAll('.add-subtask-btn').forEach(button => {
        button.addEventListener('click', addSubtask);
    });
    document.querySelectorAll('.new-subtask-input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const todoId = e.target.getAttribute('data-todo-id');
                document.querySelector(`.add-subtask-btn[data-todo-id="${todoId}"]`).click();
            }
        });
    });
}

async function uploadAttachments(e) {
    e.stopPropagation();
    const input = e.target;
    const todoId = input.getAttribute('data-todo-id');
    const maxSize = 12 * 1024 * 1024;
    const files = [...input.files];

    for (const file of files) {
        if (file.size > maxSize) {
            alert(`Die Datei "${file.name}" ist größer als 12 MB.`);
            continue;
        }
        const formData = new FormData();
        formData.append('attachment', file);
        try {
            const response = await fetch(`${API_URL}/${todoId}/attachments`, {
                method: 'POST',
                body: formData
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Fehler beim Hochladen des Anhangs');
            }
        } catch (error) {
            alert(`Fehler beim Hochladen von "${file.name}": ${error.message}`);
        }
    }
    input.value = '';
    loadTodos();
}

async function deleteAttachment(e) {
    e.stopPropagation();
    const todoId = e.currentTarget.getAttribute('data-todo-id');
    const attachmentId = e.currentTarget.getAttribute('data-attachment-id');
    try {
        const response = await fetch(`${API_URL}/${todoId}/attachments/${attachmentId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Fehler beim Löschen des Anhangs');
        loadTodos();
    } catch (error) {
        alert(error.message);
    }
}

function handleTodoDragStart(e) {
    draggedTodoId = e.currentTarget.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedTodoId);
    e.currentTarget.classList.add('dragging');
}

function handleTodoDragOver(e) {
    e.preventDefault();
    if (e.currentTarget.dataset.id !== draggedTodoId) {
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
    }
}

function handleTodoDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
    }
}

async function handleTodoDrop(e) {
    e.preventDefault();
    const targetTodo = e.currentTarget;
    const targetTodoId = targetTodo.dataset.id;
    targetTodo.classList.remove('drag-over');

    if (!draggedTodoId || draggedTodoId === targetTodoId) return;

    const draggedTodo = document.querySelector(`.todo-item[data-id="${draggedTodoId}"]`);
    const targetRect = targetTodo.getBoundingClientRect();
    const insertBefore = e.clientY < targetRect.top + targetRect.height / 2;
    todoList.insertBefore(draggedTodo, insertBefore ? targetTodo : targetTodo.nextSibling);

    try {
        const ids = [...todoList.querySelectorAll('.todo-item')].map(item => Number(item.dataset.id));
        const response = await fetch(`${API_URL}/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        if (!response.ok) throw new Error('Fehler beim Speichern der Reihenfolge');
    } catch (error) {
        console.error('Fehler beim Sortieren der Todos:', error);
        loadTodos();
    }
}

function handleTodoDragEnd() {
    draggedTodoId = null;
    document.querySelectorAll('.todo-item').forEach(todoItem => {
        todoItem.classList.remove('dragging', 'drag-over');
    });
}

// Teilschritte-Container ein-/ausblenden
function toggleSubtaskContainer(e) {
    e.stopPropagation();
    const todoId = e.target.getAttribute('data-id');
    const subtaskContainer = document.getElementById(`subtask-container-${todoId}`);
    const button = e.target;

    if (subtaskContainer.classList.contains('visible')) {
        subtaskContainer.classList.remove('visible');
        button.textContent = 'Teilschritte anzeigen';
        expandedSubtaskTodoIds.delete(todoId);
    } else {
        subtaskContainer.classList.add('visible');
        button.textContent = 'Teilschritte ausblenden';
        expandedSubtaskTodoIds.add(todoId);
    }
}

// Teilschritt als erledigt/unerledigt markieren
async function toggleSubtask(e) {
    e.stopPropagation();
    const todoId = e.target.getAttribute('data-todo-id');
    const index = parseInt(e.target.getAttribute('data-index'));

    try {
        const response = await fetch(`${API_URL}/${todoId}`);
        const todo = await response.json();
        todo.subtasks[index].completed = e.target.checked;

        // Prüfen, ob alle Subtasks erledigt sind
        const allSubtasksCompleted = todo.subtasks.every(st => st.completed);
        todo.completed = allSubtasksCompleted;

        await fetch(`${API_URL}/${todoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                completed: todo.completed,
                subtasks: todo.subtasks
            })
        });
        loadTodos();
    } catch (error) {
        console.error('Fehler beim Aktualisieren des Teilschritts:', error);
    }
}

// Neuen Teilschritt hinzufügen
async function addSubtask(e) {
    e.stopPropagation();
    const todoId = e.target.getAttribute('data-todo-id');
    const inputId = `new-subtask-input-${todoId}`;
    const input = document.getElementById(inputId);
    const text = input.value.trim();

    if (!text) {
        alert('Bitte gib einen Text für den Teilschritt ein.');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/${todoId}`);
        const todo = await response.json();
        if (!todo.subtasks) {
            todo.subtasks = [];
        }
        todo.subtasks.push({ text, completed: false });

        await fetch(`${API_URL}/${todoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subtasks: todo.subtasks })
        });

        input.value = '';
        loadTodos();
    } catch (error) {
        console.error('Fehler beim Hinzufügen des Teilschritts:', error);
        alert('Fehler beim Hinzufügen des Teilschritts: ' + error.message);
    }
}

// Todo als erledigt/unerledigt markieren
async function toggleTodo(e) {
    e.stopPropagation();
    const id = e.target.getAttribute('data-id');
    const isCompleted = e.target.checked;

    try {
        await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: isCompleted })
        });
        loadTodos();
    } catch (error) {
        console.error('Fehler beim Aktualisieren des Todos:', error);
    }
}

// Todo löschen
async function deleteTodo(e) {
    e.stopPropagation();
    const id = e.target.getAttribute('data-id');
    try {
        await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        loadTodos();
    } catch (error) {
        console.error('Fehler beim Löschen des Todos:', error);
    }
}

async function deleteCompletedTodos() {
    const response = await fetch(API_URL);
    const todos = await response.json();
    const completedTodos = todos.filter(isTodoCompleted);
    if (completedTodos.length === 0) return;

    const confirmed = window.confirm(`Möchtest du wirklich ${completedTodos.length} erledigte Todos dauerhaft löschen?`);
    if (!confirmed) return;

    try {
        const results = await Promise.all(
            completedTodos.map(todo => fetch(`${API_URL}/${todo.id}`, { method: 'DELETE' }))
        );
        if (results.some(result => !result.ok)) {
            throw new Error('Mindestens ein Todo konnte nicht gelöscht werden.');
        }
        loadTodos();
    } catch (error) {
        console.error('Fehler beim Löschen erledigter Todos:', error);
        alert(error.message);
    }
}

// Notiz ein-/ausblenden
function toggleNote(e) {
    e.stopPropagation();
    const noteId = e.target.getAttribute('data-note-id');
    const noteElement = document.getElementById(noteId);
    const todoId = e.target.getAttribute('data-id');
    const noteToggleButton = document.querySelector(`.todo-item[data-id="${todoId}"] .note-toggle`);

    if (noteElement.style.display === 'none' || !noteElement.style.display) {
        noteElement.style.display = 'block';
        noteToggleButton.textContent = 'Notiz ausblenden';
    } else {
        noteElement.style.display = 'none';
        noteToggleButton.textContent = 'Notiz einblenden';
    }
}

// Notiz speichern
async function saveNote(e) {
    e.stopPropagation();
    const todoId = e.target.getAttribute('data-id');
    const noteTextareaId = e.target.getAttribute('data-note-id');
    const noteText = document.getElementById(noteTextareaId).value;

    try {
        await fetch(`${API_URL}/${todoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: noteText })
        });
        loadTodos();
    } catch (error) {
        console.error('Fehler beim Speichern der Notiz:', error);
    }
}

// Todos beim Laden der Seite anzeigen
loadTodos();