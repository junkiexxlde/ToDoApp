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
const closeSettingsBtn = document.getElementById('close-settings-btn');

const expandedSubtaskTodoIds = new Set();

// Settings-Menü ein-/ausblenden
settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsMenu.style.display = settingsMenu.style.display === 'none' ? 'block' : 'none';
});

closeSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsMenu.style.display = 'none';
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
    } catch (error) {
        alert('Fehler beim Erstellen des Backups: ' + error.message);
    } finally {
        backupTodosBtn.disabled = false;
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

// Fortschritts-Ring und Zähler aktualisieren
function updateProgress(todos) {
    const total = todos.length;
    const completedCount = todos.filter(todo => {
        const hasSubtasks = todo.subtasks && todo.subtasks.length > 0;
        const allSubtasksCompleted = hasSubtasks && todo.subtasks.every(st => st.completed);
        return todo.completed || allSubtasksCompleted;
    }).length;
    const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);

    const circumference = 169.6;
    const ringFill = document.getElementById('progress-ring-fill');
    const ringLabel = document.getElementById('progress-ring-label');
    ringFill.style.strokeDashoffset = circumference - (circumference * percent) / 100;
    ringFill.classList.toggle('complete', total > 0 && percent === 100);
    ringLabel.textContent = `${percent}%`;

    const taskCount = document.getElementById('task-count');
    taskCount.textContent = total === 0
        ? ''
        : `${total - completedCount} offen · ${completedCount} erledigt`;
}

// Todos rendern (mit Teilschritten direkt unter dem Todo)
function renderTodos(todos) {
    todoList.innerHTML = '';
    updateProgress(todos);

    if (todos.length === 0) {
        todoList.innerHTML = `
            <li class="empty-state">
                <span class="empty-state-icon">✓</span>
                <p>Keine Todos vorhanden</p>
                <span class="empty-state-hint">Füge oben dein erstes Todo hinzu</span>
            </li>
        `;
        return;
    }

    todos.forEach(todo => {
        const todoItem = document.createElement('li');
        const hasSubtasks = todo.subtasks && todo.subtasks.length > 0;
        const allSubtasksCompleted = hasSubtasks && todo.subtasks.every(st => st.completed);
        const isCompleted = todo.completed || allSubtasksCompleted;
        const isSubtaskContainerVisible = expandedSubtaskTodoIds.has(todo.id);

        todoItem.className = `todo-item ${isCompleted ? 'completed' : ''} ${hasSubtasks ? 'has-subtasks' : ''}`;
        todoItem.dataset.id = todo.id;

        const noteId = `note-${todo.id}`;
        const noteDisplayId = `note-display-${todo.id}`;
        const subtaskContainerId = `subtask-container-${todo.id}`;
        const newSubtaskInputId = `new-subtask-input-${todo.id}`;
        const noteButtonText = todo.note ? 'Notiz ausblenden' : 'Notiz einblenden';

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
            <div id="${noteId}" class="todo-note" ${todo.note ? '' : 'style="display: none;"'}>
                <textarea id="${noteDisplayId}" placeholder="Notiz eingeben...">${escapeHtml(todo.note || '')}</textarea>
                <button class="note-save" data-id="${todo.id}" data-note-id="${noteDisplayId}">Speichern</button>
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