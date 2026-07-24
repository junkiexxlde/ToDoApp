// index.js - Backend mit SQLite, Backup-Funktion und korrigierten Routen
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Pfade relativ zum Skriptstandort (index.js liegt in /ToDoApp/)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'todos.db');
const BACKUP_DIR = path.join(__dirname, 'backups');
const ATTACHMENTS_DIR = path.join(__dirname, 'attachments');
const MAX_ATTACHMENT_SIZE = 12 * 1024 * 1024;

// Backup-Verzeichnis erstellen, falls nicht vorhanden
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(ATTACHMENTS_DIR)) {
    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

const attachmentStorage = multer.diskStorage({
    destination: ATTACHMENTS_DIR,
    filename: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        callback(null, `${crypto.randomUUID()}${extension}`);
    }
});
const uploadAttachment = multer({
    storage: attachmentStorage,
    limits: { fileSize: MAX_ATTACHMENT_SIZE }
});

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Datenbank initialisieren (mit automatischer Aktualisierung der Tabelle)
let db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Fehler beim Öffnen der Datenbank:', err.message);
        return;
    }
    console.log('Verbunden mit der SQLite-Datenbank.');

    db.run(`
        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            todo_id INTEGER NOT NULL,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL UNIQUE,
            mime_type TEXT DEFAULT 'application/octet-stream',
            size INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
        )
    `, (tableErr) => {
        if (tableErr) {
            console.error('Fehler beim Erstellen der Anhang-Tabelle:', tableErr.message);
        }
    });

    // Prüfe, ob die Tabelle existiert
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='todos'", (err, row) => {
        if (err) {
            console.error('Fehler beim Prüfen der Tabelle:', err.message);
            return;
        }

        if (!row) {
            // Tabelle existiert nicht → erstellen
            db.run(`
                CREATE TABLE todos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    text TEXT NOT NULL,
                    completed BOOLEAN DEFAULT 0,
                    note TEXT DEFAULT '',
                    subtasks TEXT DEFAULT '[]',
                    position INTEGER NOT NULL DEFAULT 0
                )
            `, (err) => {
                if (err) {
                    console.error('Fehler beim Erstellen der Tabelle:', err.message);
                } else {
                    console.log('Tabelle todos erstellt.');
                }
            });
        } else {
            // Tabelle existiert → prüfe, ob benötigte Spalten existieren
            db.all("PRAGMA table_info(todos)", (err, rows) => {
                if (err) {
                    console.error('Fehler beim Prüfen der Spalten:', err.message);
                    return;
                }

                const columns = rows ? rows.map(row => row.name) : [];
                if (!columns.includes('subtasks')) {
                    db.run("ALTER TABLE todos ADD COLUMN subtasks TEXT DEFAULT '[]'", (err) => {
                        if (err) {
                            console.error('Fehler beim Hinzufügen der Spalte subtasks:', err.message);
                        } else {
                            console.log('Spalte subtasks hinzugefügt.');
                        }
                    });
                }

                if (!columns.includes('position')) {
                    db.run("ALTER TABLE todos ADD COLUMN position INTEGER NOT NULL DEFAULT 0", (err) => {
                        if (err) {
                            console.error('Fehler beim Hinzufügen der Spalte position:', err.message);
                            return;
                        }
                        db.run('UPDATE todos SET position = id WHERE position = 0', (updateErr) => {
                            if (updateErr) {
                                console.error('Fehler beim Initialisieren der Todo-Reihenfolge:', updateErr.message);
                            }
                        });
                    });
                } else {
                    console.log('Tabelle todos ist aktuell.');
                }
            });
        }
    });
});

function addAttachmentsToTodos(todos, callback) {
    if (todos.length === 0) {
        callback([]);
        return;
    }

    db.all(
        'SELECT id, todo_id, original_name, mime_type, size, created_at FROM attachments WHERE todo_id IN (' + todos.map(() => '?').join(',') + ') ORDER BY created_at ASC, id ASC',
        todos.map(todo => todo.id),
        (err, attachments) => {
            if (err) {
                callback(null, err);
                return;
            }
            const attachmentsByTodo = new Map(todos.map(todo => [todo.id, []]));
            attachments.forEach(attachment => {
                attachmentsByTodo.get(attachment.todo_id).push(attachment);
            });
            callback(todos.map(todo => ({
                ...todo,
                attachments: attachmentsByTodo.get(todo.id)
            })));
        }
    );
}

function addAttachmentsToTodo(todo, callback) {
    addAttachmentsToTodos([todo], (todos, err) => callback(todos ? todos[0] : null, err));
}

// Backup-Funktion
function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `todos-backup-${timestamp}.db`;
    const backupPath = path.join(BACKUP_DIR, backupFilename);

    fs.copyFile(DB_PATH, backupPath, (err) => {
        if (err) {
            console.error('Fehler beim Erstellen des Backups:', err.message);
        } else {
            console.log(`Backup erstellt: ${backupPath}`);
        }
    });
    return backupFilename;
}

// Backup-Endpunkt
app.get('/backup', (req, res) => {
    const backupFilename = createBackup();
    res.json({
        message: 'Backup wurde erstellt.',
        filename: backupFilename
    });
});

// Alle Backups auflisten
app.get('/backups', (req, res) => {
    fs.readdir(BACKUP_DIR, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Fehler beim Lesen der Backups.' });
        }
        const backups = files.filter(file => file.endsWith('.db'));
        res.json({ backups });
    });
});

// Backup wiederherstellen
app.post('/restore', (req, res) => {
    const { filename } = req.body;
    if (!filename) {
        return res.status(400).json({ error: 'Dateiname ist erforderlich.' });
    }

    let backupPath = filename.includes('/') || filename.includes('\\')
        ? filename
        : path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ error: 'Backup-Datei nicht gefunden.' });
    }

    db.close((err) => {
        if (err) {
            console.error('Fehler beim Schließen der Datenbank:', err.message);
        }

        fs.copyFile(backupPath, DB_PATH, (err) => {
            if (err) {
                console.error('Fehler beim Wiederherstellen des Backups:', err.message);
                return res.status(500).json({ error: 'Fehler beim Wiederherstellen des Backups.' });
            }

            // Datenbank neu öffnen
            db = new sqlite3.Database(DB_PATH, (err) => {
                if (err) {
                    console.error('Fehler beim Öffnen der wiederhergestellten Datenbank:', err.message);
                    return res.status(500).json({ error: 'Fehler beim Öffnen der wiederhergestellten Datenbank.' });
                }
                res.json({ message: 'Backup wurde wiederhergestellt.' });
            });
        });
    });
});

// Root-Route (MUSS nach allen API-Routen stehen!)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Alle Todos abrufen
app.get('/todos', (req, res) => {
    db.all('SELECT * FROM todos ORDER BY position ASC, id ASC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        // subtasks von String zu Array konvertieren
        const todos = rows.map(row => ({
            ...row,
            subtasks: JSON.parse(row.subtasks || '[]')
        }));
        addAttachmentsToTodos(todos, (todosWithAttachments, attachmentErr) => {
            if (attachmentErr) {
                return res.status(500).json({ error: attachmentErr.message });
            }
            res.json(todosWithAttachments);
        });
    });
});

// Reihenfolge der Todos speichern
app.put('/todos/reorder', (req, res) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.some(id => !Number.isInteger(Number(id)))) {
        return res.status(400).json({ error: 'Eine gültige Todo-Reihenfolge ist erforderlich.' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const statement = db.prepare('UPDATE todos SET position = ? WHERE id = ?');
        ids.forEach((id, position) => statement.run(position, Number(id)));
        statement.finalize((err) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
            }
            db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                    return res.status(500).json({ error: commitErr.message });
                }
                res.json({ message: 'Todo-Reihenfolge gespeichert.' });
            });
        });
    });
});

// Einzelnes Todo abrufen (wird u.a. für Teilschritte benötigt)
app.get('/todos/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM todos WHERE id = ?', [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Todo nicht gefunden' });
        }
        addAttachmentsToTodo({
            ...row,
            subtasks: JSON.parse(row.subtasks || '[]')
        }, (todo, attachmentErr) => {
            if (attachmentErr) {
                return res.status(500).json({ error: attachmentErr.message });
            }
            res.json(todo);
        });
    });
});

// Anhang eines Todos herunterladen
app.get('/todos/:id/attachments/:attachmentId', (req, res) => {
    db.get(
        'SELECT * FROM attachments WHERE id = ? AND todo_id = ?',
        [req.params.attachmentId, req.params.id],
        (err, attachment) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!attachment) {
                return res.status(404).json({ error: 'Anhang nicht gefunden' });
            }
            const filePath = path.join(ATTACHMENTS_DIR, attachment.stored_name);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Anhang-Datei nicht gefunden' });
            }
            res.download(filePath, attachment.original_name);
        }
    );
});

// Anhang an ein Todo anhängen
app.post('/todos/:id/attachments', (req, res) => {
    uploadAttachment.single('attachment')(req, res, (uploadErr) => {
        if (uploadErr) {
            if (uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'Anhänge dürfen höchstens 12 MB groß sein.' });
            }
            return res.status(400).json({ error: 'Anhang konnte nicht verarbeitet werden.' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Keine Datei ausgewählt.' });
        }

        db.get('SELECT id FROM todos WHERE id = ?', [req.params.id], (todoErr, todo) => {
            if (todoErr || !todo) {
                fs.unlink(req.file.path, () => {});
                return res.status(todoErr ? 500 : 404).json({ error: todoErr ? todoErr.message : 'Todo nicht gefunden' });
            }
            db.run(
                'INSERT INTO attachments (todo_id, original_name, stored_name, mime_type, size) VALUES (?, ?, ?, ?, ?)',
                [req.params.id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size],
                function (insertErr) {
                    if (insertErr) {
                        fs.unlink(req.file.path, () => {});
                        return res.status(500).json({ error: insertErr.message });
                    }
                    res.status(201).json({
                        id: this.lastID,
                        todo_id: Number(req.params.id),
                        original_name: req.file.originalname,
                        mime_type: req.file.mimetype,
                        size: req.file.size
                    });
                }
            );
        });
    });
});

// Anhang eines Todos löschen
app.delete('/todos/:id/attachments/:attachmentId', (req, res) => {
    db.get(
        'SELECT stored_name FROM attachments WHERE id = ? AND todo_id = ?',
        [req.params.attachmentId, req.params.id],
        (findErr, attachment) => {
            if (findErr) {
                return res.status(500).json({ error: findErr.message });
            }
            if (!attachment) {
                return res.status(404).json({ error: 'Anhang nicht gefunden' });
            }
            db.run('DELETE FROM attachments WHERE id = ? AND todo_id = ?', [req.params.attachmentId, req.params.id], (deleteErr) => {
                if (deleteErr) {
                    return res.status(500).json({ error: deleteErr.message });
                }
                fs.unlink(path.join(ATTACHMENTS_DIR, attachment.stored_name), (unlinkErr) => {
                    if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                        console.error('Fehler beim Löschen der Anhang-Datei:', unlinkErr.message);
                    }
                    res.status(204).end();
                });
            });
        }
    );
});

// Neues Todo hinzufügen
app.post('/todos', (req, res) => {
    const { text, note = '', subtasks = [] } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Text ist erforderlich' });
    }
    db.get('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM todos', (positionErr, row) => {
        if (positionErr) {
            return res.status(500).json({ error: positionErr.message });
        }
        db.run(
            'INSERT INTO todos (text, completed, note, subtasks, position) VALUES (?, 0, ?, ?, ?)',
            [text, note, JSON.stringify(subtasks), row.position],
            function (err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.status(201).json({ id: this.lastID, text, completed: false, note, subtasks, position: row.position });
            }
        );
    });
});

// Todo aktualisieren (erledigt/Notiz/Subtasks)
app.put('/todos/:id', (req, res) => {
    const { id } = req.params;
    const { completed, note, subtasks } = req.body;

    let updateFields = [];
    let values = [];

    if (completed !== undefined) {
        updateFields.push('completed = ?');
        values.push(completed ? 1 : 0);
    }
    if (note !== undefined) {
        updateFields.push('note = ?');
        values.push(note);
    }
    if (subtasks !== undefined) {
        updateFields.push('subtasks = ?');
        values.push(JSON.stringify(subtasks));
    }

    if (updateFields.length === 0) {
        return res.status(400).json({ error: 'Keine Felder zum Aktualisieren angegeben' });
    }

    values.push(id);
    const query = `UPDATE todos SET ${updateFields.join(', ')} WHERE id = ?`;

    db.run(query, values, function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Todo nicht gefunden' });
        }

        const finishAndRespond = () => {
            // Aktuellen Stand aus der DB zurückgeben, damit die Response
            // (z. B. der auto-berechnete completed-Status) immer korrekt ist.
            db.get('SELECT * FROM todos WHERE id = ?', [id], (err, row) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({
                    ...row,
                    completed: !!row.completed,
                    subtasks: JSON.parse(row.subtasks || '[]')
                });
            });
        };

        // Wenn Teilschritte aktualisiert wurden: erledigt-Status automatisch
        // ableiten (nur erledigt, wenn es Teilschritte gibt und alle erledigt sind).
        if (subtasks !== undefined) {
            const allSubtasksCompleted = subtasks.length > 0 && subtasks.every(st => st.completed);
            db.run('UPDATE todos SET completed = ? WHERE id = ?', [allSubtasksCompleted ? 1 : 0, id], (err) => {
                if (err) {
                    console.error('Fehler beim Aktualisieren des Todo-Status:', err.message);
                }
                finishAndRespond();
            });
        } else {
            finishAndRespond();
        }
    });
});

// Todo löschen
app.delete('/todos/:id', (req, res) => {
    const { id } = req.params;
    db.all('SELECT stored_name FROM attachments WHERE todo_id = ?', [id], (attachmentErr, attachments) => {
        if (attachmentErr) {
            return res.status(500).json({ error: attachmentErr.message });
        }
        db.run('DELETE FROM attachments WHERE todo_id = ?', [id], (deleteAttachmentsErr) => {
            if (deleteAttachmentsErr) {
                return res.status(500).json({ error: deleteAttachmentsErr.message });
            }
            db.run('DELETE FROM todos WHERE id = ?', [id], function (err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Todo nicht gefunden' });
                }
                attachments.forEach(attachment => {
                    fs.unlink(path.join(ATTACHMENTS_DIR, attachment.stored_name), () => {});
                });
                res.status(204).end();
            });
        });
    });
});

// Server starten
app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});

// Datenbank schließen, wenn der Server beendet wird
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Fehler beim Schließen der Datenbank:', err.message);
        } else {
            console.log('Datenbank Verbindung geschlossen.');
        }
        process.exit();
    });
});