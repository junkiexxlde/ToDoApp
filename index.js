// index.js - Backend mit SQLite, Backup-Funktion und korrigierten Routen
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// Pfade relativ zum Skriptstandort (index.js liegt in /ToDoApp/)
const DB_PATH = path.join(__dirname, 'todos.db');
const BACKUP_DIR = path.join(__dirname, 'backups');

// Backup-Verzeichnis erstellen, falls nicht vorhanden
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

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
                    subtasks TEXT DEFAULT '[]'
                )
            `, (err) => {
                if (err) {
                    console.error('Fehler beim Erstellen der Tabelle:', err.message);
                } else {
                    console.log('Tabelle todos erstellt.');
                }
            });
        } else {
            // Tabelle existiert → prüfe, ob 'subtasks' Spalte existiert
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
                } else {
                    console.log('Tabelle todos ist aktuell.');
                }
            });
        }
    });
});

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
    db.all('SELECT * FROM todos', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        // subtasks von String zu Array konvertieren
        const todos = rows.map(row => ({
            ...row,
            subtasks: JSON.parse(row.subtasks || '[]')
        }));
        res.json(todos);
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
        res.json({
            ...row,
            subtasks: JSON.parse(row.subtasks || '[]')
        });
    });
});

// Neues Todo hinzufügen
app.post('/todos', (req, res) => {
    const { text, note = '', subtasks = [] } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Text ist erforderlich' });
    }
    db.run(
        'INSERT INTO todos (text, completed, note, subtasks) VALUES (?, 0, ?, ?)',
        [text, note, JSON.stringify(subtasks)],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ id: this.lastID, text, completed: false, note, subtasks });
        }
    );
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
    db.run('DELETE FROM todos WHERE id = ?', [id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Todo nicht gefunden' });
        }
        res.status(204).end();
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