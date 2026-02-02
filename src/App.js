import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { go } from '@codemirror/lang-go';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';

import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { autocompletion, CompletionContext } from '@codemirror/autocomplete';
import { keymap } from '@codemirror/view';
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { StateField, EditorState, EditorSelection } from '@codemirror/state';
import { selectAll, toggleComment } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import './App.css';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

function App() {
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [language1, setLanguage1] = useState('javascript'); // Язык для окна 1 в split view
  const [language2, setLanguage2] = useState('javascript'); // Язык для окна 2 в split view
  const [isRunning, setIsRunning] = useState(false);
  const [outputHeight, setOutputHeight] = useState(300);
  const [outputWidth, setOutputWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingVertical, setIsResizingVertical] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [showWindowChoiceModal, setShowWindowChoiceModal] = useState(false);
  const [showTabSplitModal, setShowTabSplitModal] = useState(false);
  const [errorLines, setErrorLines] = useState([]);
  const [showColorSettings, setShowColorSettings] = useState(false);
  const [showFontColor, setShowFontColor] = useState(false);
  const [showKeywordColor, setShowKeywordColor] = useState(false);
  const [showClassNameColor, setShowClassNameColor] = useState(false);
  const [showVariableColor, setShowVariableColor] = useState(false);
  const [showBackgroundColor, setShowBackgroundColor] = useState(false);
  const [showHotkeys, setShowHotkeys] = useState(true);
  const [tabs, setTabs] = useState([{ id: 'tab-1', name: 'Вкладка 1', code: '', output: '', language: 'javascript' }]); // Вкладки для single view: [{id, name, code, output, language}]
  const [activeTab, setActiveTab] = useState('tab-1');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  // Режим SQL: специальный режим для работы с запросами и таблицами
  const [sqlMode, setSqlMode] = useState(false);
  const [sqlDialect, setSqlDialect] = useState('sql'); // sql | postgres | oracle
  const [sqlTables, setSqlTables] = useState([]); // [{ name, columns: [] }]
  const [postgresConn, setPostgresConn] = useState({ host: 'localhost', port: 5432, user: '', password: '', database: '' });
  const [oracleConn, setOracleConn] = useState({ user: '', password: '', connectString: 'localhost:1521/ORCL' });
  const [showPgConn, setShowPgConn] = useState(false);
  const [showOracleConn, setShowOracleConn] = useState(false);
  const [sqlViewMode, setSqlViewMode] = useState('tables'); // 'tables' | 'erd' - режим отображения справа
  const [erdPositions, setErdPositions] = useState({}); // { tableName: { x, y } } - позиции таблиц в ER диаграмме
  const [draggingTable, setDraggingTable] = useState(null); // Имя таблицы, которую перетаскиваем
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }); // Смещение при перетаскивании
  const [createTableModalTableName, setCreateTableModalTableName] = useState(null); // Имя таблицы для мини-окна CREATE TABLE (null = закрыто)
  const [sqlTableDataView, setSqlTableDataView] = useState(null); // { tableName, columns, rows } — данные таблицы по кнопке справа (null = не показывать)
  // Для запоминания кода между режимами (SQL ↔ обычный)
  const [lastSqlCode, setLastSqlCode] = useState('');
  const [lastNonSqlCode, setLastNonSqlCode] = useState('');
  const lastSqlTabsRef = useRef({ tabs1: null, tabs2: null, activeTab1: null, activeTab2: null });
  const lastSqlSchemaRef = useRef({ tables: [], tableDataView: null, erdPositions: {} });
  // Хранилище вкладок для каждого языка (включая SQL)
  const tabsByLanguageRef = useRef({});
  // Язык, с которого вошли в SQL (чтобы при выходе восстанавливать вкладки по нему)
  const langBeforeSqlRef = useRef(null);

  // Состояния для split view - независимые окна
  const [code1, setCode1] = useState('');
  const [code2, setCode2] = useState('');
  // Вкладки для каждого окна в split view
  const [tabs1, setTabs1] = useState([{ id: 'tab1-1', name: 'Вкладка 1', code: '', output: '', language: 'javascript' }]);
  const [activeTab1, setActiveTab1] = useState('tab1-1');
  const [tabs2, setTabs2] = useState([{ id: 'tab2-1', name: 'Вкладка 1', code: '', output: '', language: 'javascript' }]);
  const [activeTab2, setActiveTab2] = useState('tab2-1');
  const [output1, setOutput1] = useState('');
  const [output2, setOutput2] = useState('');
  const [isRunning1, setIsRunning1] = useState(false);
  const [isRunning2, setIsRunning2] = useState(false);
  const [outputHeight1, setOutputHeight1] = useState(200);
  const [outputHeight2, setOutputHeight2] = useState(200);
  const [isResizingVertical1, setIsResizingVertical1] = useState(false);
  const [isResizingVertical2, setIsResizingVertical2] = useState(false);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const [splitPaneWidth, setSplitPaneWidth] = useState(50); // Процент ширины первого окна
  
  // Настройки шрифта
  const [fontFamily, setFontFamily] = useState('Consolas');
  const [fontSize, setFontSize] = useState(14);
  const [fontStyle, setFontStyle] = useState('normal');
  const [fontColor, setFontColor] = useState('#d4d4d4');
  const [selectedTheme, setSelectedTheme] = useState(() => {
    try {
      return localStorage.getItem('codeforge_theme') || 'enderTheme';
    } catch (e) {
      return 'enderTheme';
    }
  });
  
  // Настройки цветов синтаксиса (Ender Theme по умолчанию)
  const [keywordColor, setKeywordColor] = useState('#ff7b72'); // Ключевые слова (new, class, etc) - красный
  const [classNameColor, setClassNameColor] = useState('#d2a8ff'); // Имена классов - фиолетовый
  const [variableColor, setVariableColor] = useState('#79c0ff'); // Переменные - синий
  const [backgroundColor, setBackgroundColor] = useState(() => {
    try {
      return localStorage.getItem('codeforge_bg_color') || '#1e1e1e';
    } catch (e) {
      return '#1e1e1e';
    }
  }); // Цвет фона редактора
  
  // Настройки табуляции
  const [useSpaces, setUseSpaces] = useState(true); // Использовать пробелы вместо табов
  const [tabSize, setTabSize] = useState(4); // Размер табуляции
  const [showMinimap, setShowMinimap] = useState(true); // Показывать мини-карту
  
  const editorRef = useRef(null);
  const editorRef1 = useRef(null);
  const editorRef2 = useRef(null);
  const editorViewRef1 = useRef(null);
  const editorViewRef2 = useRef(null);
  const splitDividerRef = useRef(null);
  const editorViewRef = useRef(null);
  // In-memory SQLite (sql.js) для выполнения SQL
  const sqlJsDbRef = useRef(null);
  const sqlJsInitPromiseRef = useRef(null);
  // Отдельный код для каждого диалекта SQL (sql / postgres / oracle)
  const codeByDialectRef = useRef({ sql: '', postgres: '', oracle: '' });

  const languages = [
    { value: 'text', label: 'Text' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'python', label: 'Python' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'java', label: 'Java' },
    { value: 'cpp', label: 'C++' },
    { value: 'csharp', label: 'C#' },
    { value: 'go', label: 'Go' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
  ];

  // Простенький парсер CREATE TABLE для вывода списка таблиц справа в SQL-режиме
  const parseSqlTablesFromCode = (source) => {
    if (!source) return [];
    const tables = [];
    const regex = /create\s+table\s+([A-Za-z0-9_"]+)\s*\(([\s\S]*?)\);/gi;
    let match;

    while ((match = regex.exec(source)) !== null) {
      const rawName = match[1] || '';
      const name = rawName.replace(/"/g, '');
      const body = match[2] || '';

      const rawColumns = body.split(',');
      const parsedColumns = rawColumns
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
        .filter((c) => !/^constraint\b/i.test(c))
        .filter((c) => !/^primary\s+key\b/i.test(c))
        .filter((c) => !/^foreign\s+key\b/i.test(c))
        .map((col) => {
          // Парсим колонку: имя тип [дополнительные параметры]
          const parts = col.trim().split(/\s+/);
          const colName = parts[0] || '';
          const colType = parts[1] || '';
          const rest = parts.slice(2).join(' ') || '';
          const isPrimaryKey = /primary\s+key/i.test(col) || /primary\s+key/i.test(rest);
          const isNotNull = /not\s+null/i.test(col) || /not\s+null/i.test(rest);
          const isUnique = /unique/i.test(col) || /unique/i.test(rest);
          
          return {
            name: colName,
            type: colType,
            full: col,
            isPrimaryKey,
            isNotNull,
            isUnique
          };
        });

      // Сохраняем исходный CREATE TABLE запрос для восстановления
      const fullMatch = match[0]; // Полный текст CREATE TABLE ... ;
      tables.push({ 
        name, 
        columns: parsedColumns,
        originalSql: fullMatch // Сохраняем исходный SQL
      });
    }

    return tables;
  };

  const updateSqlTables = () => {
    const source = splitView ? code1 : code;
    const parsed = parseSqlTablesFromCode(source);
    setSqlTables(parsed);
    // Инициализируем позиции для новых таблиц
    const newPositions = { ...erdPositions };
    parsed.forEach((table, idx) => {
      if (!newPositions[table.name]) {
        newPositions[table.name] = { x: 50 + (idx % 3) * 300, y: 50 + Math.floor(idx / 3) * 250 };
      }
    });
    setErdPositions(newPositions);
  };

  // Инициализация sql.js (SQLite в памяти) для полного выполнения SQL
  const getSqlJs = useCallback(() => {
    if (sqlJsInitPromiseRef.current) return sqlJsInitPromiseRef.current;
    sqlJsInitPromiseRef.current = import('sql.js').then(({ default: initSqlJs }) =>
      initSqlJs({ locateFile: (f) => `${process.env.PUBLIC_URL || ''}/sql-wasm.wasm` })
    ).catch((err) => {
      sqlJsInitPromiseRef.current = null;
      throw err;
    });
    return sqlJsInitPromiseRef.current;
  }, []);

  const resetSqlDb = useCallback(() => {
    try {
      sqlJsDbRef.current = null;
      localStorage.removeItem('codeforge_sqlite_db');
      setSqlTables([]);
      setSqlTableDataView(null);
    } catch (_) {}
  }, []);

  const saveSqlDbToStorage = useCallback(() => {
    try {
      const db = sqlJsDbRef.current;
      if (!db) return;
      const data = db.export();
      if (!data || data.length === 0) return;
      let binary = '';
      for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
      localStorage.setItem('codeforge_sqlite_db', btoa(binary));
    } catch (e) {
      console.warn('Не удалось сохранить SQLite БД:', e);
    }
  }, []);

  const getOrCreateSqlDb = useCallback(async () => {
    const SQL = await getSqlJs();
    if (!sqlJsDbRef.current) {
      try {
        const saved = localStorage.getItem('codeforge_sqlite_db');
        if (saved) {
          const binary = atob(saved);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          sqlJsDbRef.current = new SQL.Database(bytes);
        } else {
          sqlJsDbRef.current = new SQL.Database();
        }
      } catch (_) {
        sqlJsDbRef.current = new SQL.Database();
      }
      sqlJsDbRef.current.run('PRAGMA foreign_keys = ON');
    }
    return sqlJsDbRef.current;
  }, [getSqlJs]);

  // Форматирование строк результата (PostgreSQL/Oracle)
  const formatRows = useCallback((rows, columns) => {
    if (!rows || rows.length === 0) return 'Нет строк.';
    const colNames = columns || (rows[0] && Object.keys(rows[0])) || [];
    const colWidths = colNames.map((c, j) =>
      Math.min(30, Math.max(String(c).length, ...rows.map((r) => String((r && r[c]) ?? (Array.isArray(r) ? r[j] : '')).length)))
    );
    const sep = colWidths.map((w) => '-'.repeat(w + 2)).join('+');
    const header = colNames.map((c, j) => String(c).padEnd(colWidths[j])).join(' | ');
    const lines = [header, sep, ...rows.slice(0, 500).map((r) =>
      colNames.map((c, j) => String((r && r[c]) ?? (Array.isArray(r) ? r[j] : 'NULL')).padEnd(colWidths[j])).join(' | ')
    )];
    if (rows.length > 500) lines.push(`... (показано 500 из ${rows.length})`);
    return lines.join('\n');
  }, []);

  // Препроцессинг одного оператора для SQLite (ENUM, BOOLEAN, CREATE TYPE и т.д.)
  const preprocessSqlStatement = useCallback((stmt) => {
    let s = stmt
      .replace(/\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi, 'CREATE TABLE IF NOT EXISTS ')
      .replace(/\bINT\s+PRIMARY\s+KEY\s+AUTO_INCREMENT\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
      .replace(/\bAUTO_INCREMENT\b/gi, 'AUTOINCREMENT')
      .replace(/\bSERIAL\b/gi, 'INTEGER')
      .replace(/\bBOOLEAN\b/gi, 'INTEGER')
      .replace(/\bDEFAULT\s+TRUE\b/gi, 'DEFAULT 1')
      .replace(/\bDEFAULT\s+FALSE\b/gi, 'DEFAULT 0')
      .replace(/\bENUM\s*\([^)]+\)/gi, 'TEXT')
      .replace(/\bNUMERIC\s*\(\d+\s*,\s*\d+\)/gi, 'REAL')
      .replace(/\bTIMESTAMP\b/gi, 'TEXT')
      .replace(/\bVARCHAR\s*\(\d+\)/gi, 'TEXT')
      .replace(/\border_status\b/gi, 'TEXT')
      .replace(/\bUNIQUE\s+KEY\s+\w+\s*\(/gi, 'UNIQUE (');
    // SQLite не поддерживает INDEX/KEY внутри CREATE TABLE — удаляем
    s = s.replace(/,?\s*INDEX\s+\w+\s*\([^)]+\)\s*,/gi, ',');
    s = s.replace(/,?\s*INDEX\s+\w+\s*\([^)]+\)\s*\)/gi, ')');
    s = s.replace(/,?\s*KEY\s+\w+\s*\([^)]+\)\s*,/gi, ',');
    s = s.replace(/,?\s*KEY\s+\w+\s*\([^)]+\)\s*\)/gi, ')');
    s = s.replace(/,(\s*)\)/g, '$1)');
    // Убираем двойные/пустые запятые после удаления INDEX (иначе "incomplete input")
    let prev;
    while ((prev = s) !== (s = s.replace(/,\s*,/g, ',').replace(/,,/g, ','))) {}
    return s;
  }, []);

  // Выполнение SQL в in-memory SQLite: CREATE, INSERT, SELECT, JOIN и т.д.
  const runSqlInMemory = useCallback(async (codeText) => {
    // Удаляем однострочные комментарии (-- до конца строки), чтобы точка с запятой в комментарии не ломала разбор
    let sql = (codeText || '').replace(/^\s*--[^\n]*/gm, '\n');
    sql = preprocessSqlStatement(sql);

    const db = await getOrCreateSqlDb();
    const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
    const outputLines = [];
    let lastSelectResult = null;
    let hadSelect = false;

    for (let i = 0; i < statements.length; i++) {
      let stmt = statements[i] + ';';
      stmt = preprocessSqlStatement(stmt);
      const upper = stmt.toUpperCase();
      try {
        if (/^\s*CREATE\s+TYPE\b/i.test(stmt)) {
          outputLines.push('CREATE TYPE пропущен (SQLite не поддерживает, тип заменён на TEXT).');
          outputLines.push('');
          continue;
        }
        if (upper.includes('SELECT')) {
          hadSelect = true;
          const result = db.exec(stmt);
          lastSelectResult = result;
          if (result.length > 0 && result[0].columns) {
            const { columns } = result[0];
            const values = result[0].values ?? [];
            const colWidths = columns.map((c, j) =>
              Math.max(String(c).length, ...values.map((row) => String(row[j] ?? '').length))
            );
            const sep = colWidths.map((w) => '-'.repeat(Math.min(w + 2, 30))).join('+');
            outputLines.push(columns.map((c, j) => String(c).padEnd(colWidths[j])).join(' | '));
            outputLines.push(sep);
            values.slice(0, 500).forEach((row) => {
              outputLines.push(row.map((v, j) => String(v ?? 'NULL').padEnd(colWidths[j])).join(' | '));
            });
            if (values.length > 500) outputLines.push(`... (показано 500 из ${values.length} строк)`);
            if (values.length === 0) {
              outputLines.push('(0 строк)');
              outputLines.push('Если таблицы пусты — выполните CREATE TABLE и INSERT в том же блоке до SELECT.');
            }
            outputLines.push('');
          } else {
            outputLines.push('(0 строк)');
            outputLines.push('');
          }
        } else {
          db.run(stmt);
          saveSqlDbToStorage();
          if (upper.includes('CREATE TABLE')) outputLines.push(upper.includes('IF NOT EXISTS') ? 'CREATE TABLE выполнено (или уже существовала).' : 'CREATE TABLE выполнено.');
          else if (upper.includes('INSERT')) outputLines.push('INSERT выполнено.');
          else if (upper.includes('UPDATE')) outputLines.push('UPDATE выполнено.');
          else if (upper.includes('DELETE')) outputLines.push('DELETE выполнено.');
        }
      } catch (err) {
        // Даже при ошибке возвращаем текущую схему, чтобы таблицы справа обновились
        let tables = [];
        try {
          const tableNames = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
          if (tableNames.length > 0 && tableNames[0].values) {
            for (const [name] of tableNames[0].values) {
              const info = db.exec(`PRAGMA table_info("${name.replace(/"/g, '""')}")`);
              const columns = (info[0] && info[0].values) ? info[0].values.map((row) => ({
                name: row[1],
                type: row[2] || '',
                isPrimaryKey: row[5] === 1,
                isNotNull: row[3] === 1,
                isUnique: false
              })) : [];
              tables.push({ name, columns });
            }
          }
        } catch (_) {}
        return { output: outputLines.join('\n'), error: err.message, tables };
      }
    }

    // Схема из sqlite_master для отображения таблиц справа
    let tables = [];
    try {
      const tableNames = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      if (tableNames.length > 0 && tableNames[0].values) {
        for (const [name] of tableNames[0].values) {
          const info = db.exec(`PRAGMA table_info("${name.replace(/"/g, '""')}")`);
          const columns = (info[0] && info[0].values) ? info[0].values.map((row) => ({
            name: row[1],
            type: row[2] || '',
            isPrimaryKey: row[5] === 1,
            isNotNull: row[3] === 1,
            isUnique: false
          })) : [];
          tables.push({ name, columns });
        }
      }
    } catch (_) {}

    const finalOutput = outputLines.join('\n').trim();
    return { output: finalOutput || (hadSelect ? '(0 строк)' : 'Выполнено.'), error: null, tables };
  }, [getOrCreateSqlDb, preprocessSqlStatement, saveSqlDbToStorage]);

  // Находим связи между таблицами (по именам колонок: user_id -> users, order_id -> orders и т.д.)
  const findTableRelations = () => {
    const relations = [];
    const seen = new Set(); // избегаем дубликатов
    sqlTables.forEach(table => {
      table.columns.forEach(col => {
        const colName = col.name.toLowerCase();
        sqlTables.forEach(targetTable => {
          if (targetTable.name === table.name) return;
          const targetName = targetTable.name.toLowerCase();
          // Колонка точно совпадает с именем целевой таблицы + _id (например user_id -> users)
          if (colName === targetName + '_id' || colName === targetName + 'id') {
            const key = `${table.name}->${targetTable.name}:${col.name}`;
            if (!seen.has(key)) {
              seen.add(key);
              relations.push({ from: table.name, to: targetTable.name, column: col.name });
            }
            return;
          }
          // Убираем суффикс _id и сравниваем с именем таблицы (user_id -> user, таблица users)
          const withoutId = colName.replace(/_id$|id$/i, '');
          if (!withoutId) return;
          const targetBase = targetName.replace(/s$/, ''); // users -> user
          const targetPlural = targetBase + 's';
          if (withoutId === targetBase || withoutId === targetName || withoutId === targetPlural) {
            const key = `${table.name}->${targetTable.name}:${col.name}`;
            if (!seen.has(key)) {
              seen.add(key);
              relations.push({ from: table.name, to: targetTable.name, column: col.name });
            }
          }
        });
      });
    });
    return relations;
  };

  // Загрузка содержимого таблицы по кнопке справа (SELECT * FROM table_name)
  const loadTableData = useCallback(async (tableName) => {
    setSqlTableDataView(null);
    try {
      if (sqlDialect === 'sql') {
        const db = await getOrCreateSqlDb();
        const escaped = `"${String(tableName).replace(/"/g, '""')}"`;
        const result = db.exec(`SELECT * FROM ${escaped}`);
        if (result.length > 0 && result[0].columns) {
          const columns = result[0].columns;
          const rows = result[0].values ?? [];
          setSqlTableDataView({ tableName, columns, rows });
        } else {
          setSqlTableDataView({ tableName, columns: [], rows: [] });
        }
      } else if (sqlDialect === 'postgres' && ipcRenderer) {
        const result = await ipcRenderer.invoke('execute-postgres', { connection: postgresConn, query: `SELECT * FROM "${String(tableName).replace(/"/g, '""')}"` }).catch((e) => ({ error: e.message }));
        if (result.error) return;
        const columns = result.columns ?? [];
        const rows = result.rows ?? [];
        setSqlTableDataView({ tableName, columns, rows });
      } else if (sqlDialect === 'oracle' && ipcRenderer) {
        const result = await ipcRenderer.invoke('execute-oracle', { connection: oracleConn, query: `SELECT * FROM "${String(tableName).replace(/"/g, '""')}"` }).catch((e) => ({ error: e.message }));
        if (result.error) return;
        const columns = result.columns ?? [];
        const rows = result.rows ?? [];
        setSqlTableDataView({ tableName, columns, rows });
      }
    } catch (err) {
      console.warn('loadTableData:', err);
    }
  }, [sqlDialect, getOrCreateSqlDb, postgresConn, oracleConn, ipcRenderer]);

  // Генерируем CREATE TABLE запрос для таблицы (используем оригинальный SQL если есть)
  const generateCreateTable = (table) => {
    // Если есть оригинальный SQL, используем его
    if (table.originalSql) {
      return table.originalSql;
    }
    // Иначе генерируем из колонок
    let sql = `CREATE TABLE ${table.name} (\n`;
    const columns = table.columns.map(col => {
      let colDef = `  ${col.name} ${col.type}`;
      if (col.isNotNull) colDef += ' NOT NULL';
      if (col.isPrimaryKey) colDef += ' PRIMARY KEY';
      if (col.isUnique) colDef += ' UNIQUE';
      return colDef;
    });
    sql += columns.join(',\n');
    sql += '\n);';
    return sql;
  };

  // Обработчик клика по имени таблицы: открыть мини-окно с CREATE TABLE (редактор кода не меняется)
  const handleTableNameClick = (tableName) => {
    const table = sqlTables.find(t => t.name === tableName);
    if (!table) return;
    setCreateTableModalTableName(tableName);
  };

  const toggleSqlMode = () => {
    if (!sqlMode) {
      const currentLang = splitView ? language1 : language;
      langBeforeSqlRef.current = currentLang;
      if (splitView) {
        tabsByLanguageRef.current[currentLang] = {
          tabs1: [...tabs1],
          tabs2: [...tabs2],
          activeTab1,
          activeTab2,
          code1,
          code2
        };
      } else {
        tabsByLanguageRef.current[currentLang] = {
          tabs: [...tabs],
          activeTab,
          code
        };
      }

      const currentCode = splitView ? code1 : code;
      setLastNonSqlCode(currentCode || '');

      const saved = lastSqlTabsRef.current;
      let hasSavedTabs = saved.tabs1 && saved.tabs1.length > 0;
      let dataToUse = hasSavedTabs ? saved : null;
      if (!hasSavedTabs) {
        const fromStorage = loadSqlFromStorage();
        if (fromStorage) {
          dataToUse = fromStorage;
          hasSavedTabs = true;
          lastSqlTabsRef.current = fromStorage;
        }
      } else {
        dataToUse = saved;
      }

      setSqlMode(true);
      setSplitView(true);
      setOutput1('');
      setOutput2('');

      const schema = lastSqlSchemaRef.current;
      let schemaTables = schema.tables;
      let schemaErd = schema.erdPositions;
      if (!schema.tables || schema.tables.length === 0) {
        try {
          const rawSchema = localStorage.getItem('codeforge_sql_schema');
          if (rawSchema) {
            const parsed = JSON.parse(rawSchema);
            if (parsed.tables && parsed.tables.length > 0) {
              schemaTables = parsed.tables;
              schemaErd = parsed.erdPositions || {};
              lastSqlSchemaRef.current = { ...lastSqlSchemaRef.current, tables: schemaTables, erdPositions: schemaErd };
            }
          }
        } catch (_) {}
      }
      if (schemaTables && schemaTables.length > 0) {
        setSqlTables(schemaTables);
        setSqlTableDataView(schema.tableDataView);
        setErdPositions(schemaErd || {});
      } else {
        setSqlTables([]);
        setSqlTableDataView(null);
      }

      if (hasSavedTabs && dataToUse) {
        setTabs1(dataToUse.tabs1);
        setTabs2(dataToUse.tabs2);
        setActiveTab1(dataToUse.activeTab1 || dataToUse.tabs1[0]?.id || 'tab1-1');
        setActiveTab2(dataToUse.activeTab2 || dataToUse.tabs2[0]?.id || 'tab2-1');
        const activeId1 = dataToUse.activeTab1 || dataToUse.tabs1[0]?.id;
        const activeId2 = dataToUse.activeTab2 || dataToUse.tabs2[0]?.id;
        const activeTab1Obj = dataToUse.tabs1.find(t => t.id === activeId1);
        const activeTab2Obj = dataToUse.tabs2.find(t => t.id === activeId2);
        const code1Restore = activeTab1Obj?.code !== undefined ? activeTab1Obj.code : (lastSqlCode || currentCode || '');
        const code2Restore = activeTab2Obj?.code !== undefined ? activeTab2Obj.code : '';
        setCode1(code1Restore);
        setCode2(code2Restore);
        codeByDialectRef.current.sql = code1Restore;
      } else {
        const baseCode = lastSqlCode || currentCode || '';
        setCode1(baseCode);
        setCode2('');
        setTabs1([{ id: 'tab1-1', name: 'SQL вкладка', code: baseCode, output: '', language: language1 || 'javascript' }]);
        setTabs2([{ id: 'tab2-1', name: 'Схемы', code: '', output: '', language: language2 || 'javascript' }]);
        setActiveTab1('tab1-1');
        setActiveTab2('tab2-1');
        codeByDialectRef.current.sql = baseCode;
      }
      setLanguage1(language1 || 'javascript');
      setLanguage2(language2 || 'javascript');
    } else {
      // ВЫХОД из SQL-режима — сохраняем вкладки и схему (таблицы, диаграммы) для следующего входа
      const t1 = tabs1.map(t => t.id === activeTab1 ? { ...t, code: code1 } : t);
      const t2 = tabs2.map(t => t.id === activeTab2 ? { ...t, code: code2 } : t);
      lastSqlTabsRef.current = { tabs1: t1, tabs2: t2, activeTab1, activeTab2 };
      lastSqlSchemaRef.current = {
        tables: [...sqlTables],
        tableDataView: sqlTableDataView ? { ...sqlTableDataView } : null,
        erdPositions: { ...erdPositions }
      };
      try {
        localStorage.setItem('codeforge_sql_tabs1', JSON.stringify(t1));
        localStorage.setItem('codeforge_sql_tabs2', JSON.stringify(t2));
        localStorage.setItem('codeforge_sql_activeTab1', activeTab1);
        localStorage.setItem('codeforge_sql_activeTab2', activeTab2);
        localStorage.setItem('codeforge_sql_schema', JSON.stringify({ tables: sqlTables, erdPositions }));
      } catch (_) {}
      const currentSqlCode = splitView ? code1 : code;
      setLastSqlCode(currentSqlCode || '');

      setSqlMode(false);
      setOutput1('');
      setOutput2('');
      setOutput('');

      const targetLang = langBeforeSqlRef.current != null ? langBeforeSqlRef.current : (splitView ? language1 : language);
      const savedForLang = tabsByLanguageRef.current[targetLang];

      if (savedForLang) {
        if (savedForLang.tabs1 && savedForLang.tabs1.length > 0) {
          setTabs1(savedForLang.tabs1);
          setTabs2(savedForLang.tabs2 || [{ id: 'tab2-1', name: 'Вкладка 2', code: '', output: '', language: targetLang }]);
          setActiveTab1(savedForLang.activeTab1 || savedForLang.tabs1[0]?.id);
          setActiveTab2(savedForLang.activeTab2 || (savedForLang.tabs2?.[0]?.id) || 'tab2-1');
          setCode1(savedForLang.code1 || '');
          setCode2(savedForLang.code2 || '');
          setLanguage1(targetLang);
          setLanguage2(targetLang);
          setSplitView(true);
        } else if (savedForLang.tabs) {
          setTabs(savedForLang.tabs);
          setActiveTab(savedForLang.activeTab);
          setCode(savedForLang.code || '');
          setLanguage(targetLang);
          setSplitView(false);
        }
      } else {
        setCode('');
        setTabs([{ id: 'tab-1', name: 'Вкладка 1', code: '', output: '', language: language }]);
        setActiveTab('tab-1');
        setSplitView(false);
      }

      setSqlTables([]);
    }
  };

  // Варианты настроек (по 10 штук)
  const fontFamilies = [
    'Consolas', 'Courier New', 'Monaco', 'Menlo', 'Fira Code',
    'Source Code Pro', 'JetBrains Mono', 'Roboto Mono', 'Ubuntu Mono', 'Inconsolata'
  ];
  
  const fontSizes = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24];
  
  const fontStyles = [
    'normal', 'italic', 'bold', 'bold italic', 'lighter',
    'bolder', 'oblique', 'small-caps', 'inherit', 'initial'
  ];
  
  const fontColors = [
    // Красные тона
    '#CD5C5C', '#F08080', '#FA8072', '#E9967A', '#FFA07A', '#DC143C', '#FF0000', '#B22222', '#8B0000',
    // Розовые тона
    '#FFC0CB', '#FFB6C1', '#FF69B4', '#FF1493', '#C71585', '#DB7093',
    // Оранжевые тона
    '#FF7F50', '#FF6347', '#FF4500', '#FF8C00', '#FFA500',
    // Жёлтые тона
    '#FFD700', '#FFFF00', '#FFFFE0', '#FFFACD', '#FAFAD2', '#FFEFD5', '#FFE4B5', '#FFDAB9', '#EEE8AA', '#F0E68C', '#BDB76B',
    // Фиолетовые тона
    '#E6E6FA', '#D8BFD8', '#DDA0DD', '#EE82EE', '#DA70D6', '#FF00FF', '#BA55D3', '#9370DB', '#8A2BE2', '#9400D3', '#9932CC', '#8B008B', '#800080', '#4B0082', '#6A5ACD', '#483D8B',
    // Коричневые тона
    '#FFF8DC', '#FFEBCD', '#FFE4C4', '#FFDEAD', '#F5DEB3', '#DEB887', '#D2B48C', '#BC8F8F', '#F4A460', '#DAA520', '#B8860B', '#CD853F', '#D2691E', '#8B4513', '#A0522D', '#A52A2A', '#800000',
    // Зеленые тона
    '#ADFF2F', '#7FFF00', '#7CFC00', '#00FF00', '#32CD32', '#98FB98', '#90EE90', '#00FA9A', '#00FF7F', '#3CB371', '#2E8B57', '#228B22', '#008000', '#006400', '#9ACD32', '#6B8E23', '#808000', '#556B2F', '#66CDAA', '#8FBC8F', '#20B2AA', '#008B8B', '#008080',
    // Синие тона
    '#00FFFF', '#E0FFFF', '#AFEEEE', '#7FFFD4', '#40E0D0', '#48D1CC', '#00CED1', '#5F9EA0', '#4682B4', '#B0C4DE', '#B0E0E6', '#ADD8E6', '#87CEEB', '#87CEFA', '#00BFFF', '#1E90FF', '#6495ED', '#7B68EE', '#4169E1', '#0000FF', '#0000CD', '#00008B', '#000080', '#191970',
    // Белые тона
    '#FFFFFF', '#FFFAFA', '#F0FFF0', '#F5FFFA', '#F0FFFF', '#F0F8FF', '#F8F8FF', '#F5F5F5', '#FFF5EE', '#F5F5DC', '#FDF5E6', '#FFFAF0', '#FFFFF0', '#FAEBD7', '#FAF0E6', '#FFF0F5', '#FFE4E1',
    // Серые тона
    '#DCDCDC', '#D3D3D3', '#C0C0C0', '#A9A9A9', '#808080', '#696969', '#778899', '#708090', '#4C5866', '#000000',
    // Дополнительные цвета (из списка)
    '#c93f38', '#a59344', '#7b463b', '#dd3366', '#191971', '#e56e24', '#dfc685', '#225577', '#c0a98e', '#d2d2c0', '#9bafad', '#990066', '#3d1c02', '#f2850d', '#94568c', '#5ba8ff', '#88ddbb', '#ffccda', '#ffaabb', '#d1edee', '#d3dde4', '#456789', '#f6ecde', '#ffbcc5', '#bcddb3', '#bfaf92', '#f3e9d9', '#88ffcc', '#05a3ad', '#00b89f', '#1150af', '#231f20', '#f2f1e6', '#e1ded9', '#f8f3f6', '#94877e', '#746e6a', '#747a8a', '#cd716b', '#a79f92', '#aba798', '#ece6d0', '#4c4f56', '#4d3c2d', '#166461', '#eae3d2', '#c04641', '#f1cbcd', '#77aa77', '#966165', '#eec400', '#15151c', '#76b583', '#008a60', '#ff9944', '#0048ba', '#ede9dd', '#e4cb97', '#629763', '#a19361', '#8f9e9d', '#1b2632', '#00035b', '#10246a', '#005765', '#404c57', '#3d5758', '#000033', '#486241', '#969c92', '#dacd65', '#2c3e56', '#525367', '#e5b7be', '#35312c', '#42314b', '#942193', '#46295a', '#4c2f27', '#90977a', '#9899a7', '#7fa8a7', '#4e9aa8', '#65a7dd', '#eb8a44', '#75aa94', '#208468', '#e56d00', '#d2c7b7', '#7c94b2', '#727a5f', '#4e4f48', '#efedd7', '#a8c74d', '#11ff22', '#8ffe09', '#badf30', '#00ee22', '#33ee66', '#30ff21', '#4fc172', '#00ff22', '#9e9991', '#ffd8b1', '#7249d6', '#9c52f2', '#d48948', '#b87439', '#eda740', '#7e5e52', '#efece1', '#b3e1e8', '#ff44ee', '#00504b', '#00a67e', '#006f72', '#bb1133', '#a7a6a3', '#46adf9', '#3b845e', '#661111', '#867e70', '#585d58', '#ccb0b5', '#293947', '#50647f', '#404e61', '#f6f3d3', '#fb9587', '#dcbfa6', '#ba9f99', '#e8dec5', '#e5c1a7', '#c3a998', '#e6dbc4', '#bd6c48', '#a99681', '#efbf4d', '#64b5bf', '#8d8dc9', '#e3beb0', '#5c899b', '#96c6cd', '#d3ece4', '#016081', '#93b8e3', '#4b9099', '#20726a', '#f87858', '#6f9fb9', '#eda367', '#3063af', '#34788c', '#72664f', '#7cac88', '#d8cb4b', '#0081a8', '#53a079', '#e6d3b6', '#4e6e81', '#4c8c72', '#9cbbe2', '#508fa2', '#e48b59', '#9ba0a4', '#a0b2c8', '#c0e8d5', '#7cb9e8', '#a2c348', '#2b3448', '#ff4f00', '#355376', '#e3ddd3', '#745085', '#baffff', '#fed2a5', '#905e26', '#e2d7b5', '#d3a95c', '#78a3c2', '#c7927a', '#939899', '#cd4a4a', '#826c68', '#86714a', '#645e42', '#b16b40', '#ccaa88', '#b085b7', '#fd8b60', '#3c3535', '#e3f5e5', '#d6eae8', '#3d2e24', '#38393f', '#c1dbea', '#fec65f', '#24246d', '#8bc4d1', '#33616a', '#c95efb', '#85c0cd', '#f3e6c9', '#d91fff', '#d9c5a1', '#594e40', '#fbcb78', '#bbc5de', '#956a60', '#599f99', '#b1b09f', '#5a5b74', '#5a6e6a', '#6b7169', '#879c67', '#879d99', '#886b2e', '#846262', '#d7cfc0', '#87413f', '#5f4947', '#e0dcda', '#898253', '#dd9944', '#6c6956', '#73343a', '#7e7e7e', '#6e6e30', '#7e7666', '#ceb588', '#e9ddca', '#889999', '#c99f99', '#fffa86', '#a442a0', '#7a4134', '#9d7147', '#e8decd', '#895460', '#a58ea9', '#e7a995', '#ececdf', '#6fffff', '#ff7799', '#6a5b4e', '#393121', '#d1cbc1', '#a17c59', '#00fbff', '#f0e2d3', '#9fc5cc', '#00fa92', '#c22147', '#0082a1', '#2a3149', '#199ebd', '#274447', '#b4c8b6', '#ecf7f7', '#eee5e1', '#2e372e', '#77acc7', '#d7d1e9', '#5d8aa8', '#72a0c1', '#d8f2ee', '#f6dcd2', '#a2c2d0', '#aa6c51', '#354f58', '#939498', '#2a2c1f', '#edf2f8', '#d9e5e4', '#364d70', '#8c9632', '#aec1d4', '#88ccee', '#dbe0c4', '#dae6e9', '#faecd9', '#d3de7b', '#c3272b', '#bc012e', '#f07f5e', '#c90b42', '#beb29a', '#cf3a24', '#983fb2', '#fa7b62', '#b0e313', '#601ef9', '#e12120', '#871646', '#a32638', '#e9e3d2', '#f0debd', '#dfd4bf', '#f3e7db', '#5500ff', '#81585b', '#8e8c97', '#ffae52', '#ca9234', '#939b71', '#ec0003', '#2ce335', '#dadad1', '#6da9d2', '#bcbebc', '#7e9ec2', '#ecf0e5', '#05472a', '#cddced', '#bae3eb', '#cc0001', '#38546e', '#4f5845', '#e1dacb', '#fbeee5', '#cca47e', '#e7cf8c', '#aaa492', '#7a4b49', '#954e2c', '#f1ceb3', '#4d7eaa', '#9a9eb3', '#db9785', '#ff8f73', '#fcefc1', '#bcd9dc', '#767853', '#598c74', '#416082', '#a55232', '#78ad6d', '#546940', '#b7b59f', '#80365a', '#8da98d', '#93dfb8', '#983d53', '#54ac68', '#21c36f', '#479784', '#fc5a50', '#00859c', '#c1dbec', '#f7f2e1', '#00a465', '#008778', '#d4cbc4', '#c2ced2', '#886b2e', '#d7cfc0', '#87413f', '#5f4947', '#e0dcda', '#898253', '#dd9944', '#6c6956', '#73343a', '#7e7e7e', '#6e6e30', '#7e7666', '#ceb588', '#e9ddca', '#889999', '#c99f99', '#fffa86', '#a442a0', '#7a4134', '#9d7147', '#e8decd', '#895460', '#a58ea9', '#e7a995', '#ececdf', '#6fffff', '#ff7799', '#6a5b4e', '#393121', '#d1cbc1', '#a17c59', '#00fbff', '#f0e2d3', '#9fc5cc', '#00fa92', '#c22147', '#0082a1', '#2a3149', '#199ebd', '#274447', '#b4c8b6', '#ecf7f7', '#eee5e1', '#2e372e', '#77acc7', '#d7d1e9', '#5d8aa8', '#72a0c1', '#d8f2ee', '#f6dcd2', '#a2c2d0', '#aa6c51', '#354f58', '#939498', '#2a2c1f', '#edf2f8', '#d9e5e4', '#364d70', '#8c9632', '#aec1d4', '#88ccee', '#dbe0c4', '#dae6e9', '#faecd9', '#d3de7b', '#c3272b', '#bc012e', '#f07f5e', '#c90b42', '#beb29a', '#cf3a24', '#983fb2', '#fa7b62', '#b0e313', '#601ef9', '#e12120', '#871646', '#a32638', '#e9e3d2', '#f0debd', '#dfd4bf', '#f3e7db', '#5500ff', '#81585b', '#8e8c97', '#ffae52', '#ca9234', '#939b71', '#ec0003', '#2ce335', '#dadad1', '#6da9d2', '#bcbebc', '#7e9ec2', '#ecf0e5', '#05472a', '#cddced', '#bae3eb', '#cc0001', '#38546e', '#4f5845', '#e1dacb', '#fbeee5', '#cca47e', '#e7cf8c', '#aaa492', '#7a4b49', '#954e2c', '#f1ceb3', '#4d7eaa', '#9a9eb3', '#db9785', '#ff8f73', '#fcefc1', '#bcd9dc', '#767853', '#598c74', '#416082', '#a55232', '#78ad6d', '#546940', '#b7b59f', '#80365a', '#8da98d', '#93dfb8', '#983d53', '#54ac68', '#21c36f', '#479784', '#fc5a50', '#00859c', '#c1dbec', '#f7f2e1', '#00a465', '#008778', '#d4cbc4', '#c2ced2'
  ];

  // Создаем темы вручную с полной поддержкой цветов
  const createTheme = (name, colors) => {
    // Определяем цвета для синтаксиса на основе темы
    const syntaxColors = colors.syntaxColors || {
      keyword: colors.keyword || '#ff7b72',
      className: colors.className || '#d2a8ff',
      variable: colors.variable || '#79c0ff',
      function: colors.function || '#d2a8ff',
      string: colors.string || '#a5d6ff',
      number: colors.number || '#79c0ff',
      comment: colors.comment || '#8b949e',
      operator: colors.operator || '#ff7b72',
      bracket: colors.bracket || colors.foreground,
      punctuation: colors.punctuation || colors.foreground,
    };
    
    return EditorView.theme({
      '&': {
        backgroundColor: colors.background,
        color: colors.foreground,
      },
      '.cm-content': {
        backgroundColor: colors.background,
        color: colors.foreground,
      },
      '.cm-editor': {
        backgroundColor: colors.background,
      },
      '.cm-gutters': {
        backgroundColor: colors.gutterBg,
        color: colors.gutterFg,
        borderRight: `1px solid ${colors.border}`,
      },
      '.cm-lineNumbers .cm-lineNumber': {
        color: colors.gutterFg,
      },
      '.cm-cursor': {
        borderLeftColor: colors.cursor,
      },
      '.cm-selectionBackground': {
        backgroundColor: colors.selection,
      },
      // Применяем цвета синтаксиса через CSS переменные для использования в highlightStyle
      '.cm-content': {
        '--syntax-keyword': syntaxColors.keyword,
        '--syntax-class': syntaxColors.className,
        '--syntax-variable': syntaxColors.variable,
        '--syntax-function': syntaxColors.function,
        '--syntax-string': syntaxColors.string,
        '--syntax-number': syntaxColors.number,
        '--syntax-comment': syntaxColors.comment,
        '--syntax-operator': syntaxColors.operator,
        '--syntax-bracket': syntaxColors.bracket,
        '--syntax-punctuation': syntaxColors.punctuation,
      },
    }, { dark: colors.dark || false });
  };

  // Доступные темы CodeMirror
  const availableThemes = [
    { value: 'enderTheme', label: 'Ender Theme', theme: createTheme('enderTheme', {
      background: '#0d1117', foreground: '#c9d1d9', gutterBg: '#161b22', gutterFg: '#6e7681',
      cursor: '#58a6ff', selection: '#264f78', border: '#30363d', dark: true
    })},
    { value: 'oneDark', label: 'One Dark', theme: oneDark },
    { value: 'dracula', label: 'Dracula', theme: createTheme('dracula', {
      background: '#282a36', foreground: '#f8f8f2', gutterBg: '#282a36', gutterFg: '#6272a4',
      cursor: '#f8f8f0', selection: '#44475a', border: '#44475a', dark: true
    })},
    { value: 'githubDark', label: 'GitHub Dark', theme: createTheme('githubDark', {
      background: '#0d1117', foreground: '#c9d1d9', gutterBg: '#161b22', gutterFg: '#6e7681',
      cursor: '#58a6ff', selection: '#264f78', border: '#30363d', dark: true
    })},
    { value: 'githubLight', label: 'GitHub Light', theme: createTheme('githubLight', {
      background: '#ffffff', foreground: '#24292e', gutterBg: '#f6f8fa', gutterFg: '#959da5',
      cursor: '#0366d6', selection: '#c8e1ff', border: '#e1e4e8', dark: false
    })},
    { value: 'materialDark', label: 'Material Dark', theme: createTheme('materialDark', {
      background: '#263238', foreground: '#eeffff', gutterBg: '#263238', gutterFg: '#546e7a',
      cursor: '#ffcc02', selection: '#546e7a', border: '#37474f', dark: true
    })},
    { value: 'materialLight', label: 'Material Light', theme: createTheme('materialLight', {
      background: '#fafafa', foreground: '#90a4ae', gutterBg: '#eceff1', gutterFg: '#90a4ae',
      cursor: '#4285f4', selection: '#e3f2fd', border: '#cfd8dc', dark: false
    })},
    { value: 'monokai', label: 'Monokai', theme: createTheme('monokai', {
      background: '#272822', foreground: '#f8f8f2', gutterBg: '#272822', gutterFg: '#75715e',
      cursor: '#f8f8f0', selection: '#49483e', border: '#49483e', dark: true
    })},
    { value: 'nord', label: 'Nord', theme: createTheme('nord', {
      background: '#2e3440', foreground: '#d8dee9', gutterBg: '#2e3440', gutterFg: '#4c566a',
      cursor: '#d8dee9', selection: '#434c5e', border: '#3b4252', dark: true
    })},
    { value: 'okaidia', label: 'Okaidia', theme: createTheme('okaidia', {
      background: '#272822', foreground: '#f8f8f2', gutterBg: '#272822', gutterFg: '#6f705e',
      cursor: '#f8f8f0', selection: '#49483e', border: '#49483e', dark: true
    })},
    { value: 'solarizedDark', label: 'Solarized Dark', theme: createTheme('solarizedDark', {
      background: '#002b36', foreground: '#839496', gutterBg: '#002b36', gutterFg: '#586e75',
      cursor: '#839496', selection: '#073642', border: '#073642', dark: true
    })},
    { value: 'solarizedLight', label: 'Solarized Light', theme: createTheme('solarizedLight', {
      background: '#fdf6e3', foreground: '#657b83', gutterBg: '#eee8d5', gutterFg: '#93a1a1',
      cursor: '#657b83', selection: '#eee8d5', border: '#eee8d5', dark: false
    })},
    { value: 'tokyoNight', label: 'Tokyo Night', theme: createTheme('tokyoNight', {
      background: '#1a1b26', foreground: '#a9b1d6', gutterBg: '#1a1b26', gutterFg: '#565f89',
      cursor: '#c0caf5', selection: '#283457', border: '#24283b', dark: true
    })},
    { value: 'tokyoNightDay', label: 'Tokyo Night Day', theme: createTheme('tokyoNightDay', {
      background: '#d5d6db', foreground: '#343b59', gutterBg: '#d5d6db', gutterFg: '#9699a3',
      cursor: '#343b59', selection: '#b4b9c7', border: '#c0c6d1', dark: false
    })},
    { value: 'vscodeDark', label: 'VS Code Dark', theme: createTheme('vscodeDark', {
      background: '#1e1e1e', foreground: '#d4d4d4', gutterBg: '#1e1e1e', gutterFg: '#858585',
      cursor: '#aeafad', selection: '#264f78', border: '#3e3e3e', dark: true
    })},
    { value: 'xcodeDark', label: 'Xcode Dark', theme: createTheme('xcodeDark', {
      background: '#1f1f24', foreground: '#d4d4d4', gutterBg: '#1f1f24', gutterFg: '#6e7681',
      cursor: '#d4d4d4', selection: '#264f78', border: '#3e3e3e', dark: true
    })},
    // Новые современные темы
    { value: 'catppuccinMocha', label: 'Catppuccin Mocha', theme: createTheme('catppuccinMocha', {
      background: '#1e1e2e', foreground: '#cdd6f4', gutterBg: '#181825', gutterFg: '#6c7086',
      cursor: '#f5e0dc', selection: '#45475a', border: '#313244', dark: true
    })},
    { value: 'catppuccinLatte', label: 'Catppuccin Latte', theme: createTheme('catppuccinLatte', {
      background: '#eff1f5', foreground: '#4c4f69', gutterBg: '#e6e9ef', gutterFg: '#9ca0b0',
      cursor: '#dc8a78', selection: '#ccd0da', border: '#dce0e8', dark: false
    })},
    { value: 'gruvboxDark', label: 'Gruvbox Dark', theme: createTheme('gruvboxDark', {
      background: '#282828', foreground: '#ebdbb2', gutterBg: '#282828', gutterFg: '#928374',
      cursor: '#ebdbb2', selection: '#458588', border: '#3c3836', dark: true
    })},
    { value: 'gruvboxLight', label: 'Gruvbox Light', theme: createTheme('gruvboxLight', {
      background: '#fbf1c7', foreground: '#3c3836', gutterBg: '#f9f5d7', gutterFg: '#928374',
      cursor: '#3c3836', selection: '#d5c4a1', border: '#ebdbb2', dark: false
    })},
    { value: 'rosePine', label: 'Rosé Pine', theme: createTheme('rosePine', {
      background: '#191724', foreground: '#e0def4', gutterBg: '#1f1d2e', gutterFg: '#6e6a86',
      cursor: '#e0def4', selection: '#31748f', border: '#26233a', dark: true
    })},
    { value: 'rosePineMoon', label: 'Rosé Pine Moon', theme: createTheme('rosePineMoon', {
      background: '#232136', foreground: '#e0def4', gutterBg: '#2a273f', gutterFg: '#6e6a86',
      cursor: '#e0def4', selection: '#3e8fb0', border: '#2a273f', dark: true
    })},
    { value: 'everforestDark', label: 'Everforest Dark', theme: createTheme('everforestDark', {
      background: '#2d353b', foreground: '#d3c6aa', gutterBg: '#232a2e', gutterFg: '#7a8478',
      cursor: '#d3c6aa', selection: '#5c6a72', border: '#343f44', dark: true
    })},
    { value: 'everforestLight', label: 'Everforest Light', theme: createTheme('everforestLight', {
      background: '#fdf6e3', foreground: '#5c6a72', gutterBg: '#f4f0e6', gutterFg: '#a6b0a0',
      cursor: '#5c6a72', selection: '#d3c6aa', border: '#e8e3d3', dark: false
    })},
    { value: 'kanagawa', label: 'Kanagawa', theme: createTheme('kanagawa', {
      background: '#1f1f28', foreground: '#dcd7ba', gutterBg: '#16161d', gutterFg: '#54546d',
      cursor: '#dcd7ba', selection: '#2d4f67', border: '#223249', dark: true
    })},
    { value: 'nightfox', label: 'Nightfox', theme: createTheme('nightfox', {
      background: '#192330', foreground: '#cdcecf', gutterBg: '#131b24', gutterFg: '#738091',
      cursor: '#cdcecf', selection: '#2b3b51', border: '#1e2832', dark: true
    })},
    { value: 'onedarkPro', label: 'OneDark Pro', theme: createTheme('onedarkPro', {
      background: '#282c34', foreground: '#abb2bf', gutterBg: '#21252b', gutterFg: '#5c6370',
      cursor: '#abb2bf', selection: '#3e4451', border: '#181a1f', dark: true
    })},
    { value: 'palenight', label: 'Palenight', theme: createTheme('palenight', {
      background: '#292d3e', foreground: '#a6accd', gutterBg: '#1e2132', gutterFg: '#676e95',
      cursor: '#a6accd', selection: '#3d425b', border: '#32374d', dark: true
    })},
    { value: 'ayuDark', label: 'Ayu Dark', theme: createTheme('ayuDark', {
      background: '#0d1117', foreground: '#b3b1ad', gutterBg: '#0a0e14', gutterFg: '#6c7680',
      cursor: '#b3b1ad', selection: '#1f2329', border: '#151a20', dark: true
    })},
    { value: 'ayuMirage', label: 'Ayu Mirage', theme: createTheme('ayuMirage', {
      background: '#1f2430', foreground: '#cbccc6', gutterBg: '#191e2a', gutterFg: '#707a8c',
      cursor: '#cbccc6', selection: '#2a3343', border: '#232834', dark: true
    })},
    { value: 'ayuLight', label: 'Ayu Light', theme: createTheme('ayuLight', {
      background: '#fafafa', foreground: '#5c6773', gutterBg: '#f0f0f0', gutterFg: '#adb3ba',
      cursor: '#5c6773', selection: '#d4d7d9', border: '#e6e6e6', dark: false
    })},
    { value: 'sonokai', label: 'Sonokai', theme: createTheme('sonokai', {
      background: '#2c2e34', foreground: '#e2e2e3', gutterBg: '#24262b', gutterFg: '#6b6d72',
      cursor: '#e2e2e3', selection: '#3d4046', border: '#353941', dark: true
    })},
    { value: 'falcon', label: 'Falcon', theme: createTheme('falcon', {
      background: '#020221', foreground: '#c6c6c6', gutterBg: '#0a0a1a', gutterFg: '#4a4a5a',
      cursor: '#c6c6c6', selection: '#1a1a2a', border: '#0f0f1f', dark: true
    })},
    { value: 'horizon', label: 'Horizon', theme: createTheme('horizon', {
      background: '#1c1e26', foreground: '#c7c9cb', gutterBg: '#16161c', gutterFg: '#6f6f70',
      cursor: '#c7c9cb', selection: '#2e303e', border: '#232530', dark: true
    })},
    { value: 'nordic', label: 'Nordic', theme: createTheme('nordic', {
      background: '#2e3440', foreground: '#d8dee9', gutterBg: '#242933', gutterFg: '#4c566a',
      cursor: '#d8dee9', selection: '#434c5e', border: '#3b4252', dark: true
    })},
    { value: 'moonlight', label: 'Moonlight', theme: createTheme('moonlight', {
      background: '#1e1e2e', foreground: '#c8d3f5', gutterBg: '#161620', gutterFg: '#6e6a86',
      cursor: '#c8d3f5', selection: '#2d2d44', border: '#222436', dark: true
    })},
    // Дополнительные темы
    { value: 'synthwave84', label: 'Synthwave 84', theme: createTheme('synthwave84', {
      background: '#262335', foreground: '#f0eff1', gutterBg: '#241b2f', gutterFg: '#495495',
      cursor: '#ff7edb', selection: '#34294f', border: '#34294f', dark: true
    })},
    { value: 'cobalt2', label: 'Cobalt2', theme: createTheme('cobalt2', {
      background: '#193549', foreground: '#e1efff', gutterBg: '#122738', gutterFg: '#4f6e8c',
      cursor: '#ffc600', selection: '#0d3a58', border: '#0d3a58', dark: true
    })},
    { value: 'nightOwl', label: 'Night Owl', theme: createTheme('nightOwl', {
      background: '#011627', foreground: '#d6deeb', gutterBg: '#011627', gutterFg: '#4b6479',
      cursor: '#80a4c2', selection: '#1d3b53', border: '#122d42', dark: true
    })},
    { value: 'nightOwlLight', label: 'Night Owl Light', theme: createTheme('nightOwlLight', {
      background: '#f0f0f0', foreground: '#403f53', gutterBg: '#fbfbfb', gutterFg: '#90a7b2',
      cursor: '#403f53', selection: '#d9d9d9', border: '#e0e0e0', dark: false
    })},
    { value: 'shades', label: 'Shades of Purple', theme: createTheme('shades', {
      background: '#2d2b55', foreground: '#e3dfff', gutterBg: '#1e1d40', gutterFg: '#4d48a0',
      cursor: '#fad000', selection: '#4d3d8b', border: '#3e3975', dark: true
    })},
    { value: 'panda', label: 'Panda', theme: createTheme('panda', {
      background: '#292a2b', foreground: '#e6e6e6', gutterBg: '#292a2b', gutterFg: '#545556',
      cursor: '#ff75b5', selection: '#3e4042', border: '#3e4042', dark: true
    })},
    { value: 'winter', label: 'Winter Is Coming', theme: createTheme('winter', {
      background: '#001627', foreground: '#d4d4d4', gutterBg: '#001424', gutterFg: '#236e8d',
      cursor: '#6ed0ff', selection: '#233f54', border: '#1a3a50', dark: true
    })},
    { value: 'slack', label: 'Slack Dark', theme: createTheme('slack', {
      background: '#222222', foreground: '#e6e6e6', gutterBg: '#1a1a1a', gutterFg: '#555555',
      cursor: '#e6e6e6', selection: '#3a3a3a', border: '#333333', dark: true
    })},
    { value: 'sublime', label: 'Sublime', theme: createTheme('sublime', {
      background: '#303030', foreground: '#f8f8f0', gutterBg: '#2e2e2e', gutterFg: '#8f908a',
      cursor: '#f8f8f0', selection: '#49483e', border: '#3b3b3b', dark: true
    })},
    { value: 'atomOne', label: 'Atom One', theme: createTheme('atomOne', {
      background: '#282c34', foreground: '#abb2bf', gutterBg: '#282c34', gutterFg: '#636d83',
      cursor: '#528bff', selection: '#3e4451', border: '#3b4048', dark: true
    })},
    { value: 'cyberpunk', label: 'Cyberpunk', theme: createTheme('cyberpunk', {
      background: '#000b1e', foreground: '#0affe9', gutterBg: '#00071a', gutterFg: '#0a4f5f',
      cursor: '#ff00ff', selection: '#00203f', border: '#003366', dark: true
    })},
    { value: 'matrix', label: 'Matrix', theme: createTheme('matrix', {
      background: '#0d0208', foreground: '#00ff41', gutterBg: '#0a0107', gutterFg: '#00992a',
      cursor: '#00ff41', selection: '#003b00', border: '#003300', dark: true
    })},
    { value: 'retro', label: 'Retro', theme: createTheme('retro', {
      background: '#1a1a2e', foreground: '#eaeaea', gutterBg: '#16213e', gutterFg: '#0f3460',
      cursor: '#e94560', selection: '#0f3460', border: '#0f3460', dark: true
    })},
    { value: 'oceanDark', label: 'Ocean Dark', theme: createTheme('oceanDark', {
      background: '#1b2b34', foreground: '#cdd3de', gutterBg: '#1b2b34', gutterFg: '#5c6773',
      cursor: '#fac863', selection: '#4f5b66', border: '#343d46', dark: true
    })},
    { value: 'oceanLight', label: 'Ocean Light', theme: createTheme('oceanLight', {
      background: '#eff1f5', foreground: '#5c6773', gutterBg: '#e6e8eb', gutterFg: '#a7adba',
      cursor: '#343d46', selection: '#c0c5ce', border: '#cdd3de', dark: false
    })},
    { value: 'vitesse', label: 'Vitesse Dark', theme: createTheme('vitesse', {
      background: '#121212', foreground: '#dbd7ca', gutterBg: '#121212', gutterFg: '#454545',
      cursor: '#dbd7ca', selection: '#282828', border: '#252525', dark: true
    })},
    { value: 'vitesseLight', label: 'Vitesse Light', theme: createTheme('vitesseLight', {
      background: '#f7f7f7', foreground: '#393a34', gutterBg: '#f7f7f7', gutterFg: '#999999',
      cursor: '#393a34', selection: '#ddd6c1', border: '#e5e5e5', dark: false
    })},
    { value: 'darcula', label: 'Darcula', theme: createTheme('darcula', {
      background: '#2b2b2b', foreground: '#a9b7c6', gutterBg: '#313335', gutterFg: '#606366',
      cursor: '#ababab', selection: '#214283', border: '#323232', dark: true
    })},
    { value: 'intellij', label: 'IntelliJ Light', theme: createTheme('intellij', {
      background: '#ffffff', foreground: '#080808', gutterBg: '#ececec', gutterFg: '#999999',
      cursor: '#000000', selection: '#a6d2ff', border: '#d1d1d1', dark: false
    })},
    { value: 'blueberry', label: 'Blueberry', theme: createTheme('blueberry', {
      background: '#232937', foreground: '#7390aa', gutterBg: '#1e2430', gutterFg: '#4e576a',
      cursor: '#88b5d5', selection: '#2b3a50', border: '#2b3544', dark: true
    })},
    { value: 'forest', label: 'Forest', theme: createTheme('forest', {
      background: '#1e2a1e', foreground: '#9dc79d', gutterBg: '#1a251a', gutterFg: '#5a735a',
      cursor: '#9dc79d', selection: '#2a3c2a', border: '#2a3c2a', dark: true
    })},
    { value: 'sepia', label: 'Sepia', theme: createTheme('sepia', {
      background: '#f5e6d3', foreground: '#5b4636', gutterBg: '#efe0cc', gutterFg: '#a39382',
      cursor: '#5b4636', selection: '#e1d0bb', border: '#d4c4ae', dark: false
    })},
    { value: 'purple', label: 'Purple Rain', theme: createTheme('purple', {
      background: '#1e1e3f', foreground: '#d0b4ff', gutterBg: '#181835', gutterFg: '#5a5a8a',
      cursor: '#d0b4ff', selection: '#3a3a6a', border: '#2e2e5a', dark: true
    })},
    { value: 'oceanicNext', label: 'Oceanic Next', theme: createTheme('oceanicNext', {
      background: '#1b2b34', foreground: '#cdd3de', gutterBg: '#1b2b34', gutterFg: '#65737e',
      cursor: '#fac863', selection: '#4f5b66', border: '#343d46', dark: true
    })},
    { value: 'railscast', label: 'Railscast', theme: createTheme('railscast', {
      background: '#2b2b2b', foreground: '#e6e1dc', gutterBg: '#2b2b2b', gutterFg: '#6e7276',
      cursor: '#e6e1dc', selection: '#5a647e', border: '#3a3a3a', dark: true
    })},
    // Дополнительные 30 тем
    { value: 'aurora', label: 'Aurora', theme: createTheme('aurora', {
      background: '#1a1c2c', foreground: '#9badb7', gutterBg: '#15172a', gutterFg: '#5a6a7a',
      cursor: '#ff77a8', selection: '#2a3550', border: '#252840', dark: true
    })},
    { value: 'neon', label: 'Neon', theme: createTheme('neon', {
      background: '#0a0a0f', foreground: '#00f0ff', gutterBg: '#080812', gutterFg: '#006066',
      cursor: '#ff00ff', selection: '#1a0030', border: '#1a1a2e', dark: true
    })},
    { value: 'midnight', label: 'Midnight Blue', theme: createTheme('midnight', {
      background: '#0f111a', foreground: '#8f93a2', gutterBg: '#090b10', gutterFg: '#464b5d',
      cursor: '#80cbc4', selection: '#1f2233', border: '#1a1c28', dark: true
    })},
    { value: 'ember', label: 'Ember', theme: createTheme('ember', {
      background: '#1a1110', foreground: '#e8c4b8', gutterBg: '#151010', gutterFg: '#6a5550',
      cursor: '#ff6b35', selection: '#2a1515', border: '#2a1a18', dark: true
    })},
    { value: 'ice', label: 'Ice', theme: createTheme('ice', {
      background: '#f0f5f9', foreground: '#1e3a5f', gutterBg: '#e8f0f5', gutterFg: '#7094b0',
      cursor: '#1e3a5f', selection: '#c0d8e8', border: '#d0e0ed', dark: false
    })},
    { value: 'lavender', label: 'Lavender', theme: createTheme('lavender', {
      background: '#1a1a2e', foreground: '#e0d0ff', gutterBg: '#151528', gutterFg: '#6a5090',
      cursor: '#e0b0ff', selection: '#2a2040', border: '#252040', dark: true
    })},
    { value: 'mint', label: 'Mint', theme: createTheme('mint', {
      background: '#0d1f1c', foreground: '#a0e8c0', gutterBg: '#0a1815', gutterFg: '#5a8a70',
      cursor: '#40e090', selection: '#153028', border: '#152820', dark: true
    })},
    { value: 'coral', label: 'Coral', theme: createTheme('coral', {
      background: '#1f1515', foreground: '#ffa0a0', gutterBg: '#1a1010', gutterFg: '#805050',
      cursor: '#ff6060', selection: '#2a1818', border: '#2a1a1a', dark: true
    })},
    { value: 'sandstorm', label: 'Sandstorm', theme: createTheme('sandstorm', {
      background: '#1f1c15', foreground: '#e8d8b0', gutterBg: '#1a1710', gutterFg: '#806a40',
      cursor: '#ffd060', selection: '#2a2515', border: '#2a2218', dark: true
    })},
    { value: 'obsidian', label: 'Obsidian', theme: createTheme('obsidian', {
      background: '#1e1e1e', foreground: '#e0e2e4', gutterBg: '#1a1a1a', gutterFg: '#6b6b6b',
      cursor: '#e0e2e4', selection: '#334455', border: '#2a2a2a', dark: true
    })},
    { value: 'paper', label: 'Paper', theme: createTheme('paper', {
      background: '#f5f5f0', foreground: '#333333', gutterBg: '#ebebeb', gutterFg: '#999999',
      cursor: '#333333', selection: '#d0d0c8', border: '#e0e0d8', dark: false
    })},
    { value: 'twilight', label: 'Twilight', theme: createTheme('twilight', {
      background: '#141414', foreground: '#f7f7f7', gutterBg: '#0f0f0f', gutterFg: '#5f5a60',
      cursor: '#a7a7a7', selection: '#303030', border: '#2a2a2a', dark: true
    })},
    { value: 'espresso', label: 'Espresso', theme: createTheme('espresso', {
      background: '#2a211c', foreground: '#bdae9d', gutterBg: '#251c17', gutterFg: '#6d5d50',
      cursor: '#bdae9d', selection: '#3a2f28', border: '#332820', dark: true
    })},
    { value: 'blackboard', label: 'Blackboard', theme: createTheme('blackboard', {
      background: '#0c1021', foreground: '#f8f8f8', gutterBg: '#080c18', gutterFg: '#4f5a65',
      cursor: '#f8f8f8', selection: '#253b76', border: '#1a2040', dark: true
    })},
    { value: 'clouds', label: 'Clouds', theme: createTheme('clouds', {
      background: '#ffffff', foreground: '#000000', gutterBg: '#f5f5f5', gutterFg: '#aaaaaa',
      cursor: '#000000', selection: '#bdd5fc', border: '#e8e8e8', dark: false
    })},
    { value: 'dawn', label: 'Dawn', theme: createTheme('dawn', {
      background: '#f9f9f9', foreground: '#22272e', gutterBg: '#f0f0f0', gutterFg: '#9098a0',
      cursor: '#22272e', selection: '#d4e0ec', border: '#e5e5e5', dark: false
    })},
    { value: 'darkPlus', label: 'Dark+', theme: createTheme('darkPlus', {
      background: '#1e1e1e', foreground: '#d4d4d4', gutterBg: '#1e1e1e', gutterFg: '#6e7681',
      cursor: '#d4d4d4', selection: '#264f78', border: '#3e3e3e', dark: true
    })},
    { value: 'lightPlus', label: 'Light+', theme: createTheme('lightPlus', {
      background: '#ffffff', foreground: '#000000', gutterBg: '#f3f3f3', gutterFg: '#6e7681',
      cursor: '#000000', selection: '#add6ff', border: '#e5e5e5', dark: false
    })},
    { value: 'nebula', label: 'Nebula', theme: createTheme('nebula', {
      background: '#13111b', foreground: '#b4a5d0', gutterBg: '#0f0d15', gutterFg: '#5a5070',
      cursor: '#b4a5d0', selection: '#2a2040', border: '#1f1830', dark: true
    })},
    { value: 'sunset', label: 'Sunset', theme: createTheme('sunset', {
      background: '#1a1214', foreground: '#f0c0a0', gutterBg: '#150f12', gutterFg: '#7a5a50',
      cursor: '#ff8060', selection: '#2a1818', border: '#251a1a', dark: true
    })},
    { value: 'ocean', label: 'Ocean', theme: createTheme('ocean', {
      background: '#0b1620', foreground: '#8cb4d2', gutterBg: '#081218', gutterFg: '#4a6a80',
      cursor: '#8cb4d2', selection: '#1a3050', border: '#152030', dark: true
    })},
    { value: 'candy', label: 'Candy', theme: createTheme('candy', {
      background: '#1a1520', foreground: '#ffb0d0', gutterBg: '#151018', gutterFg: '#8a5070',
      cursor: '#ff80c0', selection: '#2a1530', border: '#251828', dark: true
    })},
    { value: 'arctic', label: 'Arctic', theme: createTheme('arctic', {
      background: '#eef2f5', foreground: '#3b4252', gutterBg: '#e5ecf0', gutterFg: '#7a8a9a',
      cursor: '#3b4252', selection: '#c8d8e8', border: '#d8e0e8', dark: false
    })},
    { value: 'volcano', label: 'Volcano', theme: createTheme('volcano', {
      background: '#1a0c0c', foreground: '#f0a080', gutterBg: '#150808', gutterFg: '#6a4040',
      cursor: '#ff4020', selection: '#2a1010', border: '#251010', dark: true
    })},
    { value: 'jade', label: 'Jade', theme: createTheme('jade', {
      background: '#0c1a14', foreground: '#a0d0b0', gutterBg: '#081510', gutterFg: '#5a7a60',
      cursor: '#60c080', selection: '#102820', border: '#102018', dark: true
    })},
    { value: 'ruby', label: 'Ruby', theme: createTheme('ruby', {
      background: '#180c10', foreground: '#e0a0b0', gutterBg: '#140810', gutterFg: '#7a4050',
      cursor: '#e06080', selection: '#281018', border: '#200c14', dark: true
    })},
    { value: 'sapphire', label: 'Sapphire', theme: createTheme('sapphire', {
      background: '#0c1018', foreground: '#a0c0e0', gutterBg: '#080c14', gutterFg: '#4a5a7a',
      cursor: '#6090d0', selection: '#101828', border: '#101420', dark: true
    })},
    { value: 'amethyst', label: 'Amethyst', theme: createTheme('amethyst', {
      background: '#140c18', foreground: '#c0a0e0', gutterBg: '#10081a', gutterFg: '#604a7a',
      cursor: '#9060d0', selection: '#1c1028', border: '#180c20', dark: true
    })},
    { value: 'topaz', label: 'Topaz', theme: createTheme('topaz', {
      background: '#18140c', foreground: '#e0c0a0', gutterBg: '#141008', gutterFg: '#7a604a',
      cursor: '#d09060', selection: '#281c10', border: '#201808', dark: true
    })},
    { value: 'pearl', label: 'Pearl', theme: createTheme('pearl', {
      background: '#f8f8f8', foreground: '#404040', gutterBg: '#f0f0f0', gutterFg: '#a0a0a0',
      cursor: '#404040', selection: '#d8d8e8', border: '#e0e0e0', dark: false
    })},
  ];

  // Получаем цвета синтаксиса для темы
  const getThemeSyntaxColors = useCallback((themeName) => {
    const themeColors = {
      'dracula': { keyword: '#ff79c6', className: '#bd93f9', variable: '#8be9fd', function: '#50fa7b' },
      'gruvboxDark': { keyword: '#fb4934', className: '#fabd2f', variable: '#83a598', function: '#8ec07c' },
      'gruvboxLight': { keyword: '#9d0006', className: '#b57614', variable: '#076678', function: '#79740e' },
      'rosePine': { keyword: '#eb6f92', className: '#9ccfd8', variable: '#c4a7e7', function: '#f6c177' },
      'catppuccinMocha': { keyword: '#f38ba8', className: '#a6e3a1', variable: '#89b4fa', function: '#f9e2af' },
      'kanagawa': { keyword: '#ff5d62', className: '#957fb8', variable: '#7e9cd8', function: '#98bb6c' },
      'nightfox': { keyword: '#c94f6d', className: '#86abdc', variable: '#9ece6a', function: '#e0af68' },
      'onedarkPro': { keyword: '#c678dd', className: '#e5c07b', variable: '#61afef', function: '#98c379' },
      'palenight': { keyword: '#c792ea', className: '#82aaff', variable: '#7fdbca', function: '#addb67' },
      'ayuDark': { keyword: '#ff6b9d', className: '#ffcc66', variable: '#5ccfe6', function: '#bae67e' },
      'ayuMirage': { keyword: '#ff6b9d', className: '#ffcc66', variable: '#5ccfe6', function: '#bae67e' },
      'ayuLight': { keyword: '#f07178', className: '#ff9940', variable: '#36a3d9', function: '#86b300' },
      'sonokai': { keyword: '#fc5d7c', className: '#9ed072', variable: '#7dd3e0', function: '#e7c547' },
      'falcon': { keyword: '#c7a0dc', className: '#b5b4e6', variable: '#00d9e9', function: '#6eb958' },
      'horizon': { keyword: '#e95678', className: '#25b0bc', variable: '#21bfc2', function: '#fab795' },
      'nordic': { keyword: '#81a1c1', className: '#88c0d0', variable: '#8fbcbb', function: '#a3be8c' },
      'moonlight': { keyword: '#c099ff', className: '#82aaff', variable: '#7fdbca', function: '#addb67' },
      'everforestDark': { keyword: '#e67e80', className: '#a7c080', variable: '#7fbbb3', function: '#dbbc7f' },
      'everforestLight': { keyword: '#f85552', className: '#8da101', variable: '#3a94c5', function: '#dfa000' },
      'tokyoNight': { keyword: '#bb9af7', className: '#7aa2f7', variable: '#7dcfff', function: '#9ece6a' },
      'tokyoNightDay': { keyword: '#34548a', className: '#0f4c6a', variable: '#1e6f96', function: '#485e30' },
      'vscodeDark': { keyword: '#569cd6', className: '#4ec9b0', variable: '#9cdcfe', function: '#dcdcaa' },
      'xcodeDark': { keyword: '#ff7ab2', className: '#ffab70', variable: '#5dd8ff', function: '#a8d977' },
      'githubDark': { keyword: '#ff7b72', className: '#d2a8ff', variable: '#79c0ff', function: '#a5d6ff' },
      'githubLight': { keyword: '#cf222e', className: '#8250df', variable: '#0969da', function: '#0a3069' },
      'materialDark': { keyword: '#c792ea', className: '#82aaff', variable: '#7fdbca', function: '#addb67' },
      'materialLight': { keyword: '#7c4dff', className: '#039be5', variable: '#00acc1', function: '#00897b' },
      'monokai': { keyword: '#f92672', className: '#a6e22e', variable: '#66d9ef', function: '#e6db74' },
      'nord': { keyword: '#81a1c1', className: '#88c0d0', variable: '#8fbcbb', function: '#a3be8c' },
      'okaidia': { keyword: '#f92672', className: '#a6e22e', variable: '#66d9ef', function: '#e6db74' },
      'solarizedDark': { keyword: '#859900', className: '#b58900', variable: '#268bd2', function: '#2aa198' },
      'solarizedLight': { keyword: '#859900', className: '#b58900', variable: '#268bd2', function: '#2aa198' },
      'synthwave84': { keyword: '#ff7edb', className: '#72f1b8', variable: '#36f9f6', function: '#fede5d' },
      'cobalt2': { keyword: '#ff9d00', className: '#9effff', variable: '#ffc600', function: '#9effff' },
      'nightOwl': { keyword: '#c792ea', className: '#82aaff', variable: '#addb67', function: '#7fdbca' },
      'nightOwlLight': { keyword: '#7c4dff', className: '#39adb5', variable: '#91b859', function: '#39adb5' },
      'shades': { keyword: '#ff9d00', className: '#fad000', variable: '#a599e9', function: '#9effff' },
      'panda': { keyword: '#ff75b5', className: '#19f9d8', variable: '#e6e6e6', function: '#ffb86c' },
      'winter': { keyword: '#89ddff', className: '#c3e88d', variable: '#82aaff', function: '#ffcb6b' },
      'slack': { keyword: '#e47777', className: '#a4c439', variable: '#70b0ff', function: '#f4b400' },
      'sublime': { keyword: '#f92672', className: '#a6e22e', variable: '#66d9ef', function: '#fd971f' },
      'atomOne': { keyword: '#c678dd', className: '#e5c07b', variable: '#61afef', function: '#98c379' },
      'cyberpunk': { keyword: '#ff00ff', className: '#00ff00', variable: '#0affe9', function: '#ffff00' },
      'matrix': { keyword: '#00ff41', className: '#00cc33', variable: '#00ff41', function: '#00992a' },
      'retro': { keyword: '#e94560', className: '#16c79a', variable: '#eaeaea', function: '#ffc300' },
      'oceanDark': { keyword: '#c594c5', className: '#fac863', variable: '#99c794', function: '#ec5f67' },
      'oceanLight': { keyword: '#a77dc2', className: '#d4a436', variable: '#6b9e5f', function: '#c44036' },
      'vitesse': { keyword: '#4d9375', className: '#d19a66', variable: '#b8a965', function: '#80a665' },
      'vitesseLight': { keyword: '#1e754f', className: '#b56959', variable: '#998418', function: '#59873a' },
      'darcula': { keyword: '#cc7832', className: '#ffc66d', variable: '#a9b7c6', function: '#ffc66d' },
      'intellij': { keyword: '#0000ff', className: '#006400', variable: '#660e7a', function: '#7a7a43' },
      'blueberry': { keyword: '#8fa3bf', className: '#88b5d5', variable: '#7390aa', function: '#6399c1' },
      'forest': { keyword: '#7cb77c', className: '#b5ce8a', variable: '#9dc79d', function: '#8ab58a' },
      'sepia': { keyword: '#8b4513', className: '#2e8b57', variable: '#5b4636', function: '#cd853f' },
      'purple': { keyword: '#d0b4ff', className: '#b4d4ff', variable: '#ffb4d0', function: '#ffd4b4' },
      'oceanicNext': { keyword: '#c594c5', className: '#fac863', variable: '#99c794', function: '#6699cc' },
      'railscast': { keyword: '#da4939', className: '#ffc66d', variable: '#a5c261', function: '#6d9cbe' },
      // Новые 30 тем
      'aurora': { keyword: '#ff77a8', className: '#5fcde4', variable: '#9badb7', function: '#ffd857' },
      'neon': { keyword: '#ff00ff', className: '#00ff00', variable: '#00f0ff', function: '#ffff00' },
      'midnight': { keyword: '#c792ea', className: '#80cbc4', variable: '#82aaff', function: '#c3e88d' },
      'ember': { keyword: '#ff6b35', className: '#ffc857', variable: '#e8c4b8', function: '#ff9d5c' },
      'ice': { keyword: '#1e3a5f', className: '#0969da', variable: '#1e3a5f', function: '#218bff' },
      'lavender': { keyword: '#e0b0ff', className: '#b0a0ff', variable: '#e0d0ff', function: '#d0a0ff' },
      'mint': { keyword: '#40e090', className: '#60d080', variable: '#a0e8c0', function: '#80d0a0' },
      'coral': { keyword: '#ff6060', className: '#ff8080', variable: '#ffa0a0', function: '#ff7070' },
      'sandstorm': { keyword: '#ffd060', className: '#e0c080', variable: '#e8d8b0', function: '#f0c040' },
      'obsidian': { keyword: '#93a1a1', className: '#b58900', variable: '#e0e2e4', function: '#268bd2' },
      'paper': { keyword: '#d73a49', className: '#22863a', variable: '#333333', function: '#6f42c1' },
      'twilight': { keyword: '#cda869', className: '#cf6a4c', variable: '#f7f7f7', function: '#9b859d' },
      'espresso': { keyword: '#43a8ed', className: '#bdae9d', variable: '#bdae9d', function: '#43a8ed' },
      'blackboard': { keyword: '#fbde2d', className: '#61ce3c', variable: '#f8f8f8', function: '#8da6ce' },
      'clouds': { keyword: '#af956f', className: '#00698f', variable: '#000000', function: '#7a3e9d' },
      'dawn': { keyword: '#794938', className: '#234a2f', variable: '#22272e', function: '#6d5a86' },
      'darkPlus': { keyword: '#569cd6', className: '#4ec9b0', variable: '#9cdcfe', function: '#dcdcaa' },
      'lightPlus': { keyword: '#0000ff', className: '#267f99', variable: '#001080', function: '#795e26' },
      'nebula': { keyword: '#9060d0', className: '#7080c0', variable: '#b4a5d0', function: '#c080b0' },
      'sunset': { keyword: '#ff8060', className: '#e0a080', variable: '#f0c0a0', function: '#f08060' },
      'ocean': { keyword: '#6090d0', className: '#80b0d0', variable: '#8cb4d2', function: '#60a0c0' },
      'candy': { keyword: '#ff80c0', className: '#c080ff', variable: '#ffb0d0', function: '#ff90b0' },
      'arctic': { keyword: '#5e81ac', className: '#88c0d0', variable: '#3b4252', function: '#a3be8c' },
      'volcano': { keyword: '#ff4020', className: '#f08060', variable: '#f0a080', function: '#ff6040' },
      'jade': { keyword: '#60c080', className: '#80d0a0', variable: '#a0d0b0', function: '#70b090' },
      'ruby': { keyword: '#e06080', className: '#c080a0', variable: '#e0a0b0', function: '#d07090' },
      'sapphire': { keyword: '#6090d0', className: '#80a0d0', variable: '#a0c0e0', function: '#7090c0' },
      'amethyst': { keyword: '#9060d0', className: '#a080c0', variable: '#c0a0e0', function: '#8070b0' },
      'topaz': { keyword: '#d09060', className: '#c0a080', variable: '#e0c0a0', function: '#b08050' },
      'pearl': { keyword: '#606080', className: '#506060', variable: '#404040', function: '#705070' },
    };
    
    return themeColors[themeName] || { keyword: keywordColor, className: classNameColor, variable: variableColor };
  }, [keywordColor, classNameColor, variableColor]);

  // Получаем текущую тему
  const getCurrentTheme = () => {
    const themeObj = availableThemes.find(t => t.value === selectedTheme);
    const baseTheme = themeObj ? themeObj.theme : oneDark;
    
    // Применяем пользовательский цвет фона, если он изменен
    if (backgroundColor !== '#1e1e1e') {
      return [
        baseTheme,
        EditorView.theme({
          '&': { backgroundColor: backgroundColor },
          '.cm-content': { backgroundColor: backgroundColor },
          '.cm-editor': { backgroundColor: backgroundColor },
        })
      ];
    }
    
    return baseTheme;
  };

  // Создаем кастомный highlightStyle для цветов синтаксиса
  // Используем цвета из темы или пользовательские настройки
  const customHighlightStyle = useMemo(() => {
    const styleRules = [];
    
    // Получаем цвета из темы или используем пользовательские настройки
    const themeColors = getThemeSyntaxColors(selectedTheme);
    const useThemeColors = selectedTheme !== 'enderTheme' && selectedTheme !== 'oneDark';
    
    // Для SQL-режима используем мягкие тёплые жёлтоватые оттенки
    const isSqlMode = sqlMode === true;
    // Очень мягкий, светлый жёлтый для ключевых слов и общего акцента
    const sqlKeywordColor = '#f6e6a9';
    // Чуть более тёплый жёлтый для имён функций / типов
    const sqlFunctionColor = '#f3dea0';
    // Мягкий светло-жёлтый для переменных / идентификаторов
    const sqlVariableColor = '#f2e3b5';
    // Светлый жёлто-кремовый для строк
    const sqlStringColor = '#f7f0c5';
    
    const finalKeywordColor = isSqlMode ? sqlKeywordColor : (useThemeColors ? themeColors.keyword : keywordColor);
    const finalClassNameColor = isSqlMode ? sqlFunctionColor : (useThemeColors ? themeColors.className : classNameColor);
    const finalVariableColor = isSqlMode ? sqlVariableColor : (useThemeColors ? themeColors.variable : variableColor);
    const finalFunctionColor = isSqlMode ? sqlFunctionColor : (useThemeColors ? themeColors.function : classNameColor);
    
    // Ключевые слова (new, class, function, if, else, public, static, private, final, etc)
    if (tags.keyword) styleRules.push({ tag: tags.keyword, color: finalKeywordColor });
    
    // Модификаторы доступа (public, private, protected, static, final) - тоже ключевые слова
    if (tags.modifier) styleRules.push({ tag: tags.modifier, color: finalKeywordColor });
    
    // Имена классов - фиолетовый
    if (tags.className) styleRules.push({ tag: tags.className, color: finalClassNameColor });
    if (tags.typeName) styleRules.push({ tag: tags.typeName, color: finalClassNameColor });
    
    // Переменные - синий
    if (tags.variableName) styleRules.push({ tag: tags.variableName, color: finalVariableColor });
    
    // Функции - фиолетовый
    if (tags.function) styleRules.push({ tag: tags.function, color: finalFunctionColor });
    
    // Свойства и поля - синий
    if (tags.propertyName) styleRules.push({ tag: tags.propertyName, color: finalVariableColor });
    
    // Операторы - цвет ключевых слов
    if (tags.operator) styleRules.push({ tag: tags.operator, color: finalKeywordColor });
    
    // Скобки и пунктуация - цвет текста темы
    const themeObj = availableThemes.find(t => t.value === selectedTheme);
    const bracketColor = useThemeColors ? (themeObj?.theme?.spec?.foreground || fontColor) : '#c9d1d9';
    if (tags.bracket) styleRules.push({ tag: tags.bracket, color: bracketColor });
    if (tags.punctuation) styleRules.push({ tag: tags.punctuation, color: bracketColor });
    
    // Строки - мягкий желтоватый для SQL, светло-синий для остальных языков
    const stringColor = isSqlMode ? sqlStringColor : '#a5d6ff';
    if (tags.string) styleRules.push({ tag: tags.string, color: stringColor });
    if (tags.string2) styleRules.push({ tag: tags.string2, color: stringColor });
    
    // Числа - синий
    if (tags.number) styleRules.push({ tag: tags.number, color: finalVariableColor });
    
    // Комментарии - серый
    if (tags.comment) styleRules.push({ tag: tags.comment, color: '#8b949e' });
    
    // Теги HTML/XML - цвет ключевых слов
    if (tags.tagName) styleRules.push({ tag: tags.tagName, color: finalKeywordColor });
    
    // Атрибуты - синий
    if (tags.attributeName) styleRules.push({ tag: tags.attributeName, color: finalVariableColor });
    
    // Константы - синий
    if (tags.constant) styleRules.push({ tag: tags.constant, color: finalVariableColor });
    
    const highlightStyle = HighlightStyle.define(styleRules);
    // Обертываем в syntaxHighlighting для использования как расширение
    return syntaxHighlighting(highlightStyle);
  }, [keywordColor, classNameColor, variableColor, selectedTheme, fontColor, getThemeSyntaxColors, availableThemes, sqlMode]);

  // Ключевые слова для разных языков
  const languageKeywords = useMemo(() => {
    const keywords = {
      text: [],
      javascript: ['let', 'const', 'var', 'function', 'class', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'extends', 'implements', 'import', 'export', 'default', 'async', 'await', 'promise', 'then', 'catch', 'finally', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined'],
      typescript: ['let', 'const', 'var', 'function', 'class', 'interface', 'type', 'enum', 'namespace', 'module', 'declare', 'public', 'private', 'protected', 'readonly', 'abstract', 'static', 'async', 'await', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'extends', 'implements', 'import', 'export', 'default', 'as', 'is', 'keyof', 'typeof', 'infer'],
      java: ['public', 'private', 'protected', 'static', 'final', 'abstract', 'class', 'interface', 'enum', 'extends', 'implements', 'import', 'package', 'new', 'this', 'super', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'throws', 'void', 'int', 'long', 'double', 'float', 'boolean', 'char', 'String', 'Object', 'true', 'false', 'null'],
      python: ['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'with', 'as', 'import', 'from', 'return', 'yield', 'pass', 'break', 'continue', 'raise', 'assert', 'lambda', 'and', 'or', 'not', 'in', 'is', 'True', 'False', 'None', 'async', 'await'],
      cpp: ['int', 'float', 'double', 'char', 'bool', 'void', 'auto', 'const', 'static', 'public', 'private', 'protected', 'class', 'struct', 'enum', 'namespace', 'using', 'typedef', 'template', 'typename', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'try', 'catch', 'throw', 'new', 'delete', 'this', 'virtual', 'override', 'final'],
      csharp: ['public', 'private', 'protected', 'internal', 'static', 'readonly', 'const', 'class', 'interface', 'enum', 'struct', 'namespace', 'using', 'new', 'this', 'base', 'if', 'else', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'void', 'int', 'string', 'bool', 'var', 'true', 'false', 'null'],
      go: ['package', 'import', 'func', 'var', 'const', 'type', 'struct', 'interface', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'return', 'go', 'defer', 'chan', 'map', 'make', 'new', 'nil', 'true', 'false'],
      html: ['html', 'head', 'body', 'div', 'span', 'p', 'a', 'img', 'input', 'button', 'form', 'table', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      css: ['color', 'background', 'margin', 'padding', 'border', 'width', 'height', 'display', 'flex', 'grid', 'position', 'top', 'left', 'right', 'bottom', 'font', 'text', 'align', 'justify', 'center']
    };
    return keywords[language] || keywords.javascript;
  }, [language]);

  // Умное автодополнение - находит переменные, функции и классы из текущего кода + ключевые слова языка
  const smartAutocomplete = useMemo(() => {
    return autocompletion({
      override: [
        (context) => {
          const word = context.matchBefore(/\w*/);
          if (!word || word.text.length < 1) return null;
          
          const text = context.state.doc.toString();
          const suggestions = [];
          const seen = new Set();
          
          // Добавляем ключевые слова языка
          const keywords = languageKeywords;
          keywords.forEach(keyword => {
            if (!seen.has(keyword)) {
              seen.add(keyword);
              suggestions.push({
                label: keyword,
                type: 'keyword',
                info: 'Ключевое слово'
              });
            }
          });
          
          // Находим все переменные (let, const, var, int, float, etc)
          const variablePattern = /(?:let|const|var|int|float|double|String|bool|char|long)\s+(\w+)/g;
          let match;
          while ((match = variablePattern.exec(text)) !== null) {
            const name = match[1];
            if (!seen.has(name) && !keywords.includes(name)) {
              seen.add(name);
              suggestions.push({
                label: name,
                type: 'variable',
                info: 'Переменная из вашего кода'
              });
            }
          }
          
          // Находим все функции
          const functionPattern = /(?:function|def|func)\s+(\w+)\s*\(/g;
          while ((match = functionPattern.exec(text)) !== null) {
            const name = match[1];
            if (!seen.has(name)) {
              seen.add(name);
              suggestions.push({
                label: name,
                type: 'function',
                info: 'Функция из вашего кода'
              });
            }
          }
          
          // Находим стрелочные функции
          const arrowFunctionPattern = /const\s+(\w+)\s*=\s*\(/g;
          while ((match = arrowFunctionPattern.exec(text)) !== null) {
            const name = match[1];
            if (!seen.has(name)) {
              seen.add(name);
              suggestions.push({
                label: name,
                type: 'function',
                info: 'Стрелочная функция из вашего кода'
              });
            }
          }
          
          // Находим классы
          const classPattern = /class\s+(\w+)/g;
          while ((match = classPattern.exec(text)) !== null) {
            const name = match[1];
            if (!seen.has(name)) {
              seen.add(name);
              suggestions.push({
                label: name,
                type: 'class',
                info: 'Класс из вашего кода'
              });
            }
          }
          
          // Находим методы классов (для Java, C++, etc)
          const methodPattern = /(?:public|private|protected)?\s*(?:static)?\s*\w+\s+(\w+)\s*\(/g;
          while ((match = methodPattern.exec(text)) !== null) {
            const name = match[1];
            if (!seen.has(name) && name !== 'main') {
              seen.add(name);
              suggestions.push({
                label: name,
                type: 'method',
                info: 'Метод из вашего кода'
              });
            }
          }
          
          // Фильтруем по текущему слову
          const wordLower = word.text.toLowerCase();
          const filtered = suggestions.filter(s => 
            s.label.toLowerCase().startsWith(wordLower)
          );
          
          if (filtered.length === 0) return null;
          
          return {
            from: word.from,
            options: filtered
          };
        }
      ]
    });
  }, [code, language, languageKeywords]); // Пересоздаем при изменении кода или языка

  // Расширение для табуляции
  const tabExtension = useMemo(() => {
    return EditorState.tabSize.of(tabSize);
  }, [tabSize]);

  // Расширение для использования пробелов вместо табов
  const indentExtension = useMemo(() => {
    if (useSpaces) {
      return [
        EditorView.domEventHandlers({
          beforeinput(view, event) {
            if (event.inputType === 'insertText' && event.data === '\t') {
              event.preventDefault();
              const spaces = ' '.repeat(tabSize);
              view.dispatch({
                changes: {
                  from: view.state.selection.main.from,
                  to: view.state.selection.main.to,
                  insert: spaces
                },
                selection: {
                  anchor: view.state.selection.main.from + spaces.length
                }
              });
              return true;
            }
            return false;
          },
          keydown(view, event) {
            if (event.key === 'Tab' && !event.shiftKey) {
              event.preventDefault();
              const spaces = ' '.repeat(tabSize);
              view.dispatch({
                changes: {
                  from: view.state.selection.main.from,
                  to: view.state.selection.main.to,
                  insert: spaces
                },
                selection: {
                  anchor: view.state.selection.main.from + spaces.length
                }
              });
              return true;
            }
            return false;
          }
        })
      ];
    }
    return [];
  }, [useSpaces, tabSize]);

  // Расширение для улучшенной подсветки парных скобок
  const enhancedBracketMatching = useMemo(() => {
    return [
      bracketMatching(),
      EditorView.theme({
        '.cm-matchingBracket': {
          backgroundColor: 'rgba(79, 195, 247, 0.3)',
          outline: '1px solid rgba(79, 195, 247, 0.5)',
          borderRadius: '2px'
        },
        '.cm-nonmatchingBracket': {
          backgroundColor: 'rgba(255, 123, 114, 0.3)',
          outline: '1px solid rgba(255, 123, 114, 0.5)',
          borderRadius: '2px'
        }
      })
    ];
  }, []);

  // Клик в любом месте — снять выделение с первого раза (в т.ч. при клике по выделенному тексту)
  const clickToDeselectExtension = useMemo(() => {
    return EditorView.domEventHandlers({
      mousedown(view, e) {
        if (!view?.state?.selection?.main || e.button !== 0) return;
        const { from, to } = view.state.selection.main;
        if (from !== to) {
          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
          const cursorPos = pos != null ? pos : from;
          view.dispatch({ selection: EditorSelection.cursor(cursorPos) });
        }
      }
    });
  }, []);

  // Мини-карта кода (minimap) - отключаем пока, так как требует сложной реализации
  const minimapExtension = useMemo(() => {
    // Временно отключаем minimap, так как ViewPlugin вызывает ошибки
    return [];
  }, [showMinimap]);

  // Создаем кастомную тему с настройками шрифта (Ender Theme стиль)
  const customTheme = useMemo(() => {
    const isEnderTheme = selectedTheme === 'enderTheme';
    const isSqlMode = sqlMode === true;
    const sqlTextColor = '#f6e6a9'; // мягкий светло-жёлтый для текста SQL
    return EditorView.theme({
      '&': {
        fontSize: `${fontSize}px`,
        fontFamily: isEnderTheme ? 'JetBrains Mono, Consolas, monospace' : fontFamily,
        fontStyle: fontStyle,
      },
      '.cm-content': {
        fontSize: `${fontSize}px`,
        fontFamily: isEnderTheme ? 'JetBrains Mono, Consolas, monospace' : fontFamily,
        fontStyle: fontStyle,
        color: isSqlMode ? sqlTextColor : fontColor,
      },
      '.cm-line': {
        fontSize: `${fontSize}px`,
        fontFamily: isEnderTheme ? 'JetBrains Mono, Consolas, monospace' : fontFamily,
        fontStyle: fontStyle,
        color: isSqlMode ? sqlTextColor : fontColor,
      },
      '.cm-gutters': {
        fontSize: `${fontSize}px`,
        fontFamily: isEnderTheme ? 'JetBrains Mono, Consolas, monospace' : fontFamily,
      },
    }, { dark: true });
  }, [fontFamily, fontSize, fontStyle, selectedTheme, sqlMode, fontColor]);

  // Получаем язык для CodeMirror
  const getLanguageExtension = (lang = language) => {
    switch (lang) {
      case 'text':
        return []; // обычный текст, без подсветки синтаксиса
      case 'javascript':
      case 'typescript':
        return javascript({ jsx: true, typescript: lang === 'typescript' });
      case 'python':
        return python();
      case 'java':
        return java();
      case 'cpp':
        return cpp();
      case 'html':
        return html();
      case 'css':
        return css();
      case 'go':
        return go();
      default:
        return javascript();
    }
  };

  // Получаем язык для окна 1 в split view
  const getLanguageExtension1 = () => getLanguageExtension(language1);
  
  // Получаем язык для окна 2 в split view
  const getLanguageExtension2 = () => getLanguageExtension(language2);

  const executeCode = async () => {
    if (isRunning) return;
    
    if (!code.trim()) {
      setOutput('Введите код для выполнения.');
      return;
    }
    
    setIsRunning(true);
    setOutput('Выполнение...\n');

    try {
      const currentLang = language;
      
      // Оборачиваем выполнение в дополнительный try-catch для безопасности
      try {
        if (currentLang === 'text') {
          setOutput('Текст — выполнение не требуется.');
        } else if (currentLang === 'go') {
          await executeGo();
        } else if (currentLang === 'python') {
          await executePython();
        } else if (currentLang === 'java') {
          await executeJava();
        } else if (currentLang === 'cpp') {
          await executeCpp();
        } else if (currentLang === 'csharp') {
          await executeCSharp();
        } else if (currentLang === 'javascript' || currentLang === 'typescript') {
          await executeJavaScript();
        } else if (currentLang === 'html') {
          setOutput('HTML код можно просмотреть в браузере.');
        } else if (currentLang === 'css') {
          setOutput('CSS код используется для стилизации.');
        } else {
          setOutput(`Компиляция для языка ${currentLang} пока не реализована.`);
        }
      } catch (innerError) {
        console.error('Внутренняя ошибка выполнения:', innerError);
        setOutput(`Ошибка выполнения: ${innerError.message || 'Неизвестная ошибка'}\n${innerError.stack || ''}`);
      }
    } catch (error) {
      console.error('Критическая ошибка:', error);
      setOutput(`Критическая ошибка: ${error.message || 'Неизвестная ошибка'}\n${error.stack || ''}\n\nПопробуйте перезапустить приложение.`);
    } finally {
      // Гарантируем, что состояние всегда сбрасывается
      setIsRunning(false);
    }
  };

  const executeJavaScript = () => {
    return new Promise((resolve) => {
      if (language !== 'javascript' && language !== 'typescript') {
        setOutput(`Ошибка: Код для языка ${language} не должен выполняться как JavaScript.`);
        resolve();
        return;
      }

      const originalLog = console.log;
      const originalError = console.error;
      let outputText = '';

      console.log = (...args) => {
        outputText += args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ') + '\n';
      };

      console.error = (...args) => {
        outputText += 'ERROR: ' + args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ') + '\n';
      };

      try {
        // Проверяем наличие import/export и обрабатываем их
        let processedCode = code;
        if (code.includes('import ') || code.includes('export ')) {
          // Если есть import/export, удаляем их для выполнения
          processedCode = code
            .replace(/import\s+.*?from\s+['"][^'"]*['"];?\s*/g, '')
            .replace(/import\s+['"][^'"]*['"];?\s*/g, '')
            .replace(/export\s+(default\s+)?/g, '')
            .replace(/export\s*\{[^}]*\}\s*;?\s*/g, '');
        }
        const wrappedCode = `(function() { ${processedCode} })()`;
        const result = eval(wrappedCode);
        
        if (result !== undefined && result !== null) {
          outputText += `Результат: ${typeof result === 'object' ? JSON.stringify(result, null, 2) : result}\n`;
        }
        
        setOutput(outputText || 'Код выполнен успешно.\n');
      } catch (error) {
        setOutput(`Ошибка выполнения:\n${error.name}: ${error.message}\n${error.stack}\n`);
      } finally {
        console.log = originalLog;
        console.error = originalError;
        resolve();
      }
    });
  };

  const executePython = async () => {
    if (!ipcRenderer) {
      setOutput('Python выполнение требует Electron IPC.');
      return;
    }
    try {
      const result = await Promise.race([
        ipcRenderer.invoke('execute-python', code),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения')), 30000))
      ]);
      setOutput(result.output || result.error || 'Выполнение завершено.');
    } catch (error) {
      setOutput(`Ошибка: ${error.message}\n\nУбедитесь, что Python установлен и доступен в PATH.`);
    }
  };

  const executeJava = async () => {
    if (!ipcRenderer) {
      setOutput('Выполнение Java доступно только в десктопной версии (Electron).\n\nЗапустите приложение через npm run electron-dev или собранный exe — в браузере Java не выполняется.');
      return;
    }
    try {
      const result = await Promise.race([
        ipcRenderer.invoke('execute-java', code),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения (30 секунд)')), 30000))
      ]);
      
      // Проверяем результат
      if (result && typeof result === 'object') {
        if (result.error) {
          setOutput(result.error);
        } else if (result.output) {
          setOutput(result.output);
        } else {
          setOutput('Выполнение завершено.');
        }
      } else {
        setOutput('Выполнение завершено.');
      }
    } catch (error) {
      console.error('Ошибка выполнения Java:', error);
      setOutput(`Ошибка: ${error.message || 'Неизвестная ошибка'}\n\nУбедитесь, что JDK установлен и доступен в PATH.`);
    }
  };

  const executeCpp = async () => {
    if (!ipcRenderer) {
      setOutput('C++ выполнение требует Electron IPC.');
      return;
    }
    try {
      const result = await Promise.race([
        ipcRenderer.invoke('execute-cpp', code),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения')), 30000))
      ]);
      setOutput(result.output || result.error || 'Выполнение завершено.');
    } catch (error) {
      setOutput(`Ошибка: ${error.message}\n\nУбедитесь, что компилятор C++ установлен и доступен в PATH.`);
    }
  };

  const executeCSharp = async () => {
    if (!ipcRenderer) {
      setOutput('C# выполнение требует Electron IPC.');
      return;
    }
    try {
      const result = await Promise.race([
        ipcRenderer.invoke('execute-csharp', code),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения')), 30000))
      ]);
      setOutput(result.output || result.error || 'Выполнение завершено.');
    } catch (error) {
      setOutput(`Ошибка: ${error.message}\n\nУбедитесь, что .NET SDK установлен и доступен в PATH.`);
    }
  };

  const executeGo = async () => {
    if (!ipcRenderer) {
      setOutput('Go выполнение требует Electron IPC.');
      return;
    }
    try {
      const result = await Promise.race([
        ipcRenderer.invoke('execute-go', code),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения')), 30000))
      ]);
      setOutput(result.output || result.error || 'Выполнение завершено.');
    } catch (error) {
      setOutput(`Ошибка: ${error.message}\n\nУбедитесь, что Go установлен и доступен в PATH.`);
    }
  };

  // Функции выполнения для окна 1
  const executeCode1 = async () => {
    if (isRunning1) return;
    
    if (!code1.trim()) {
      setOutput1('Введите код для выполнения.');
      return;
    }

    // В SQL-режиме проверяем выделение и выполняем только выделенный запрос
    const hasSqlKeywords = /CREATE\s+TABLE|SELECT\s+.*\s+FROM|INSERT\s+INTO|UPDATE\s+.*\s+SET|DELETE\s+FROM/i.test(code1);
    
    if (sqlMode === true || hasSqlKeywords) {
      setIsRunning1(true);
      setOutput1('Выполнение SQL...\n');
      try {
        let codeToParse = code1;
        if (editorViewRef1.current) {
          const selection = editorViewRef1.current.state.selection.main;
          if (selection.from !== selection.to) {
            codeToParse = editorViewRef1.current.state.doc.sliceString(selection.from, selection.to);
            setOutput1('Выполняется выделенный фрагмент...\n');
          }
        }

        if (sqlDialect === 'sql') {
          // SQL (SQLite в памяти): полное выполнение CREATE, INSERT, SELECT, JOIN и т.д.
          try {
            const { output, error, tables } = await runSqlInMemory(codeToParse);
            const errMsg = error ? `Ошибка: ${error}\n\n${output}` : (output || 'Выполнено.');
            const hint = error && /no such table/i.test(error)
              ? '\n\nПодсказка: одна БД общая для всех вкладок. Сначала выполните скрипт с CREATE TABLE (во вкладке 1), затем SELECT можно делать в любой вкладке.'
              : '';
            setOutput1(errMsg + hint);
            // Справа обновляем таблицы только если в запросе были CREATE/DROP TABLE — при простом SELECT панель не трогаем
            const hasCreateOrDrop = /CREATE\s+TABLE|DROP\s+TABLE/i.test(codeToParse);
            if (hasCreateOrDrop && tables != null && tables.length > 0) {
              setSqlTables(tables);
              setErdPositions(prev => {
                const next = { ...prev };
                tables.forEach((t, idx) => {
                  if (!next[t.name]) next[t.name] = { x: 50 + (idx % 3) * 320, y: 50 + Math.floor(idx / 3) * 250 };
                });
                return next;
              });
            }
          } catch (loadErr) {
            setOutput1('Для выполнения SQL установите sql.js: npm install sql.js\nПосле установки скопируйте public/sql-wasm.wasm (или перезапустите npm install).\nОшибка: ' + loadErr.message);
          }
        } else if (sqlDialect === 'postgres' && ipcRenderer) {
          const result = await ipcRenderer.invoke('execute-postgres', { connection: postgresConn, query: codeToParse }).catch((e) => ({ error: e.message }));
          setOutput1(result.error ? `Ошибка PostgreSQL: ${result.error}` : (result.output || (result.rows && result.rows.length >= 0 ? formatRows(result.rows, result.columns) : 'Выполнено.')));
          if (result.tables && result.tables.length > 0) {
            setSqlTables(result.tables);
            setErdPositions(prev => {
              const next = { ...prev };
              result.tables.forEach((t, idx) => {
                if (!next[t.name]) next[t.name] = { x: 50 + (idx % 3) * 320, y: 50 + Math.floor(idx / 3) * 250 };
              });
              return next;
            });
          }
        } else if (sqlDialect === 'oracle' && ipcRenderer) {
          const result = await ipcRenderer.invoke('execute-oracle', { connection: oracleConn, query: codeToParse }).catch((e) => ({ error: e.message }));
          setOutput1(result.error ? `Ошибка Oracle: ${result.error}` : (result.output || (result.rows && result.rows.length >= 0 ? formatRows(result.rows, result.columns) : 'Выполнено.')));
          if (result.tables && result.tables.length > 0) {
            setSqlTables(result.tables);
            setErdPositions(prev => {
              const next = { ...prev };
              result.tables.forEach((t, idx) => {
                if (!next[t.name]) next[t.name] = { x: 50 + (idx % 3) * 320, y: 50 + Math.floor(idx / 3) * 250 };
              });
              return next;
            });
          }
        } else {
          // Fallback: только разбор CREATE TABLE для отображения схемы
          const parsed = parseSqlTablesFromCode(codeToParse);
          if (parsed.length > 0) {
            setSqlTables(parsed);
            setOutput1(`Схема разобрана. Таблиц: ${parsed.length}. Для выполнения SELECT/JOIN выберите диалект SQL (in-memory).`);
          } else {
            setOutput1('Для выполнения запросов выберите диалект SQL. Для PostgreSQL/Oracle настройте подключение в настройках.');
          }
        }
      } catch (error) {
        setOutput1(`Ошибка: ${error.message}`);
      } finally {
        setIsRunning1(false);
      }
      return;
    }

    setIsRunning1(true);
    setOutput1('Выполнение...\n');

    try {
      const currentLang = language1;
      if (currentLang === 'text') {
        setOutput1('Текст — выполнение не требуется.');
        setIsRunning1(false);
        return;
      }
      try {
        if (currentLang === 'go') {
          const result = await Promise.race([
            ipcRenderer.invoke('execute-go', code1),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения')), 30000))
          ]);
          setOutput1(result.output || result.error || 'Выполнение завершено.');
        } else if (currentLang === 'python') {
          const result = await Promise.race([
            ipcRenderer.invoke('execute-python', code1),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения')), 30000))
          ]);
          setOutput1(result.output || result.error || 'Выполнение завершено.');
        } else if (currentLang === 'java') {
          const result = await Promise.race([
            ipcRenderer.invoke('execute-java', code1),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения (30 секунд)')), 30000))
          ]);
          if (result && typeof result === 'object') {
            setOutput1(result.error || result.output || 'Выполнение завершено.');
          } else {
            setOutput1('Выполнение завершено.');
          }
        } else if (currentLang === 'cpp') {
          const result = await Promise.race([
            ipcRenderer.invoke('execute-cpp', code1),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения')), 30000))
          ]);
          setOutput1(result.output || result.error || 'Выполнение завершено.');
        } else if (currentLang === 'csharp') {
          const result = await Promise.race([
            ipcRenderer.invoke('execute-csharp', code1),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения')), 30000))
          ]);
          setOutput1(result.output || result.error || 'Выполнение завершено.');
        } else if (currentLang === 'javascript' || currentLang === 'typescript') {
          const originalLog = console.log;
          const originalError = console.error;
          let outputText = '';
          console.log = (...args) => {
            outputText += args.map(arg => 
              typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ') + '\n';
          };
          console.error = (...args) => {
            outputText += 'ERROR: ' + args.map(arg => 
              typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ') + '\n';
          };
          try {
            // Обрабатываем import/export для окна 1
            let processedCode1 = code1;
            if (code1.includes('import ') || code1.includes('export ')) {
              processedCode1 = code1
                .replace(/import\s+.*?from\s+['"][^'"]*['"];?\s*/g, '')
                .replace(/import\s+['"][^'"]*['"];?\s*/g, '')
                .replace(/export\s+(default\s+)?/g, '')
                .replace(/export\s*\{[^}]*\}\s*;?\s*/g, '');
            }
            const wrappedCode = `(function() { ${processedCode1} })()`;
            const result = eval(wrappedCode);
            if (result !== undefined && result !== null) {
              outputText += `Результат: ${typeof result === 'object' ? JSON.stringify(result, null, 2) : result}\n`;
            }
            setOutput1(outputText || 'Код выполнен успешно.\n');
          } catch (error) {
            setOutput1(`Ошибка выполнения:\n${error.name}: ${error.message}\n${error.stack}\n`);
          } finally {
            console.log = originalLog;
            console.error = originalError;
          }
        } else {
          setOutput1(`Компиляция для языка ${currentLang} пока не реализована.`);
        }
      } catch (innerError) {
        console.error('Внутренняя ошибка выполнения:', innerError);
        setOutput1(`Ошибка выполнения: ${innerError.message || 'Неизвестная ошибка'}\n${innerError.stack || ''}`);
      }
    } catch (error) {
      console.error('Критическая ошибка:', error);
      setOutput1(`Критическая ошибка: ${error.message || 'Неизвестная ошибка'}\n${error.stack || ''}\n\nПопробуйте перезапустить приложение.`);
    } finally {
      setIsRunning1(false);
    }
  };

  // Функции выполнения для окна 2
  const executeCode2 = async () => {
    if (isRunning2) return;
    
    if (!code2.trim()) {
      setOutput2('Введите код для выполнения.');
      return;
    }
    
    setIsRunning2(true);
    setOutput2('Выполнение...\n');

    try {
      const currentLang = language2;
      if (currentLang === 'text') {
        setOutput2('Текст — выполнение не требуется.');
        setIsRunning2(false);
        return;
      }
      try {
        if (currentLang === 'go') {
          const result = await Promise.race([
            ipcRenderer.invoke('execute-go', code2),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения')), 30000))
          ]);
          setOutput2(result.output || result.error || 'Выполнение завершено.');
        } else if (currentLang === 'python') {
          const result = await Promise.race([
            ipcRenderer.invoke('execute-python', code2),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения')), 30000))
          ]);
          setOutput2(result.output || result.error || 'Выполнение завершено.');
        } else if (currentLang === 'java') {
          const result = await Promise.race([
            ipcRenderer.invoke('execute-java', code2),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения (30 секунд)')), 30000))
          ]);
          if (result && typeof result === 'object') {
            setOutput2(result.error || result.output || 'Выполнение завершено.');
          } else {
            setOutput2('Выполнение завершено.');
          }
        } else if (currentLang === 'cpp') {
          const result = await Promise.race([
            ipcRenderer.invoke('execute-cpp', code2),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения')), 30000))
          ]);
          setOutput2(result.output || result.error || 'Выполнение завершено.');
        } else if (currentLang === 'csharp') {
          const result = await Promise.race([
            ipcRenderer.invoke('execute-csharp', code2),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут выполнения')), 30000))
          ]);
          setOutput2(result.output || result.error || 'Выполнение завершено.');
        } else if (currentLang === 'javascript' || currentLang === 'typescript') {
          const originalLog = console.log;
          const originalError = console.error;
          let outputText = '';
          console.log = (...args) => {
            outputText += args.map(arg => 
              typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ') + '\n';
          };
          console.error = (...args) => {
            outputText += 'ERROR: ' + args.map(arg => 
              typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ') + '\n';
          };
          try {
            // Обрабатываем import/export для окна 2
            let processedCode2 = code2;
            if (code2.includes('import ') || code2.includes('export ')) {
              processedCode2 = code2
                .replace(/import\s+.*?from\s+['"][^'"]*['"];?\s*/g, '')
                .replace(/import\s+['"][^'"]*['"];?\s*/g, '')
                .replace(/export\s+(default\s+)?/g, '')
                .replace(/export\s*\{[^}]*\}\s*;?\s*/g, '');
            }
            const wrappedCode = `(function() { ${processedCode2} })()`;
            const result = eval(wrappedCode);
            if (result !== undefined && result !== null) {
              outputText += `Результат: ${typeof result === 'object' ? JSON.stringify(result, null, 2) : result}\n`;
            }
            setOutput2(outputText || 'Код выполнен успешно.\n');
          } catch (error) {
            setOutput2(`Ошибка выполнения:\n${error.name}: ${error.message}\n${error.stack}\n`);
          } finally {
            console.log = originalLog;
            console.error = originalError;
          }
        } else {
          setOutput2(`Компиляция для языка ${currentLang} пока не реализована.`);
        }
      } catch (innerError) {
        console.error('Внутренняя ошибка выполнения:', innerError);
        setOutput2(`Ошибка выполнения: ${innerError.message || 'Неизвестная ошибка'}\n${innerError.stack || ''}`);
      }
    } catch (error) {
      console.error('Критическая ошибка:', error);
      setOutput2(`Критическая ошибка: ${error.message || 'Неизвестная ошибка'}\n${error.stack || ''}\n\nПопробуйте перезапустить приложение.`);
    } finally {
      setIsRunning2(false);
    }
  };

  // Вспомогательная функция форматирования для любого кода
  const formatCodeForLanguage = useCallback((codeToFormat, lang) => {
    if (!codeToFormat || !codeToFormat.trim()) return codeToFormat;
    if (lang === 'text') {
      return codeToFormat.split('\n').map(l => l.replace(/\s+$/, '')).join('\n').trimEnd();
    }
    let formatted = codeToFormat;
    const lines = formatted.split('\n');
    
    // Классическое форматирование для разных языков
    if (lang === 'javascript' || lang === 'typescript') {
      formatted = lines.map((line) => {
        let trimmed = line.trim();
        if (!trimmed) return '';
        const baseIndent = line.match(/^\s*/)?.[0] || '';
        const indentLevel = Math.floor(baseIndent.length / 2);
        const newIndent = '  '.repeat(indentLevel);
        trimmed = trimmed.replace(/\s+/g, ' ');
        trimmed = trimmed.replace(/\s*{\s*/g, ' { ');
        trimmed = trimmed.replace(/\s*}\s*/g, ' } ');
        trimmed = trimmed.replace(/\s*\(\s*/g, ' ( ');
        trimmed = trimmed.replace(/\s*\)\s*/g, ' ) ');
        trimmed = trimmed.replace(/\s*\[\s*/g, ' [ ');
        trimmed = trimmed.replace(/\s*\]\s*/g, ' ] ');
        trimmed = trimmed.replace(/  +/g, ' ').trim();
        trimmed = trimmed.replace(/\s+{/g, ' {');
        trimmed = trimmed.replace(/}\s+/g, '} ');
        trimmed = trimmed.replace(/\s+\(/g, ' (');
        trimmed = trimmed.replace(/\)\s+/g, ') ');
        trimmed = trimmed.replace(/\s+\[/g, ' [');
        trimmed = trimmed.replace(/\]\s+/g, '] ');
        return newIndent + trimmed;
      }).join('\n');
      formatted = formatted.replace(/\n\n\n+/g, '\n\n');
    } else if (lang === 'python') {
      formatted = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        const indent = line.match(/^\s*/)?.[0] || '';
        const indentLevel = Math.floor(indent.length / 4);
        const newIndent = '    '.repeat(indentLevel);
        let cleaned = trimmed.replace(/\s+/g, ' ');
        cleaned = cleaned.replace(/\s*=\s*/g, ' = ');
        cleaned = cleaned.replace(/\s*\+\s*/g, ' + ');
        cleaned = cleaned.replace(/\s*-\s*/g, ' - ');
        cleaned = cleaned.replace(/\s*\*\s*/g, ' * ');
        cleaned = cleaned.replace(/\s*\/\s*/g, ' / ');
        cleaned = cleaned.replace(/\s*:\s*/g, ': ');
        cleaned = cleaned.replace(/\s*,\s*/g, ', ');
        cleaned = cleaned.replace(/  +/g, ' ').trim();
        return newIndent + cleaned;
      }).join('\n');
    } else if (lang === 'java' || lang === 'cpp' || lang === 'csharp') {
      // Улучшенное форматирование для Java/C++/C# - исправляет отступы и пробелы
      let indentLevel = 0;
      formatted = lines.map((line, index) => {
        let trimmed = line.trim();
        if (!trimmed) {
          return '';
        }
        
        // Удаляем эмодзи из комментариев (заменяем на пустую строку или оставляем текст)
        if (trimmed.startsWith('//')) {
          // Удаляем эмодзи из комментариев
          trimmed = trimmed.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').replace(/[\u{2600}-\u{26FF}]/gu, '').replace(/[\u{2700}-\u{27BF}]/gu, '');
        }
        
        // Уменьшаем отступ для закрывающих скобок
        if (trimmed.startsWith('}') || trimmed.startsWith(']') || trimmed.startsWith(')')) {
          indentLevel = Math.max(0, indentLevel - 1);
        }
        
        const newIndent = '    '.repeat(indentLevel);
        
        // Нормализуем пробелы - убираем множественные пробелы
        trimmed = trimmed.replace(/\s+/g, ' ');
        
        // ВАЖНО: Сначала защищаем составные операторы от разбиения пробелами
        // Заменяем составные операторы на временные маркеры
        const markers = {
          arrow: '__ARROW__',
          doubleColon: '__DOUBLECOLON__',
          doubleEqual: '__DOUBLEEQUAL__',
          notEqual: '__NOTEQUAL__',
          lessEqual: '__LESSEQUAL__',
          greaterEqual: '__GREATEREQUAL__',
          andAnd: '__ANDAND__',
          orOr: '__OROR__',
          generic: '__GENERIC__'
        };
        
        // Защищаем составные операторы
        trimmed = trimmed.replace(/->/g, markers.arrow);
        trimmed = trimmed.replace(/::/g, markers.doubleColon);
        trimmed = trimmed.replace(/==/g, markers.doubleEqual);
        trimmed = trimmed.replace(/!=/g, markers.notEqual);
        trimmed = trimmed.replace(/<=/g, markers.lessEqual);
        trimmed = trimmed.replace(/>=/g, markers.greaterEqual);
        trimmed = trimmed.replace(/&&/g, markers.andAnd);
        trimmed = trimmed.replace(/\|\|/g, markers.orOr);
        
        // Защищаем угловые скобки дженериков (паттерн: <Type> или <Type, Type2>)
        // Заменяем < Type > на маркер, чтобы потом восстановить без пробелов
        // Ищем паттерны вида < Type >, <Type, Type2>, List<Type> и т.д.
        trimmed = trimmed.replace(/<\s*([A-Za-z_][A-Za-z0-9_,\s<>]*?)\s*>/g, (match, content) => {
          // Убираем пробелы внутри дженериков, но сохраняем запятые
          const cleaned = content.replace(/\s+/g, '').replace(/,/g, ', ');
          return markers.generic + cleaned + markers.generic;
        });
        
        // Теперь исправляем пробелы вокруг операторов (но не внутри защищенных)
        trimmed = trimmed.replace(/\s*=\s*/g, ' = ');
        trimmed = trimmed.replace(/\s*,\s*/g, ', ');
        trimmed = trimmed.replace(/\s*;\s*/g, '; ');
        trimmed = trimmed.replace(/\s*:\s*/g, ': ');
        
        // Исправляем пробелы вокруг скобок (но не внутри угловых скобок дженериков)
        trimmed = trimmed.replace(/\s*{\s*/g, ' { ');
        trimmed = trimmed.replace(/\s*}\s*/g, ' } ');
        trimmed = trimmed.replace(/\s*\(\s*/g, ' ( ');
        trimmed = trimmed.replace(/\s*\)\s*/g, ' ) ');
        trimmed = trimmed.replace(/\s*\[\s*/g, ' [ ');
        trimmed = trimmed.replace(/\s*\]\s*/g, ' ] ');
        
        // Убираем лишние пробелы
        trimmed = trimmed.replace(/  +/g, ' ').trim();
        
        // Исправляем пробелы перед открывающими скобками после ключевых слов
        trimmed = trimmed.replace(/\s+{/g, ' {');
        trimmed = trimmed.replace(/}\s+/g, '} ');
        trimmed = trimmed.replace(/\s+\(/g, ' (');
        trimmed = trimmed.replace(/\)\s+/g, ') ');
        trimmed = trimmed.replace(/\s+\[/g, ' [');
        trimmed = trimmed.replace(/\]\s+/g, '] ');
        trimmed = trimmed.replace(/\s+;/g, ';');
        
        // Восстанавливаем угловые скобки дженериков (заменяем маркеры обратно на < и >)
        trimmed = trimmed.replace(new RegExp(markers.generic + '([A-Za-z0-9_,]+)' + markers.generic, 'g'), '<$1>');
        
        // Восстанавливаем составные операторы
        trimmed = trimmed.replace(new RegExp(markers.arrow, 'g'), '->');
        trimmed = trimmed.replace(new RegExp(markers.doubleColon, 'g'), '::');
        trimmed = trimmed.replace(new RegExp(markers.doubleEqual, 'g'), '==');
        trimmed = trimmed.replace(new RegExp(markers.notEqual, 'g'), '!=');
        trimmed = trimmed.replace(new RegExp(markers.lessEqual, 'g'), '<=');
        trimmed = trimmed.replace(new RegExp(markers.greaterEqual, 'g'), '>=');
        trimmed = trimmed.replace(new RegExp(markers.andAnd, 'g'), '&&');
        trimmed = trimmed.replace(new RegExp(markers.orOr, 'g'), '||');
        
        // Увеличиваем отступ для открывающих скобок
        if (trimmed.endsWith('{') || trimmed.endsWith('[') || trimmed.endsWith('(')) {
          indentLevel++;
        }
        
        return newIndent + trimmed;
      }).join('\n');
      formatted = formatted.replace(/\n\n\n+/g, '\n\n');
    } else {
      formatted = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        const indent = line.match(/^\s*/)?.[0] || '';
        return indent + trimmed.replace(/\s+/g, ' ');
      }).join('\n');
    }
    
    return formatted;
  }, []);

  // Функция автоформатирования кода (классическое форматирование)
  const formatCode = useCallback(() => {
    if (!code.trim()) return;
    
    let formatted = code;
    const lines = formatted.split('\n');
    
    // Классическое форматирование для разных языков
    if (language === 'javascript' || language === 'typescript') {
      // JavaScript/TypeScript форматирование
      formatted = lines.map((line, index) => {
        let trimmed = line.trim();
        if (!trimmed) return '';
        
        // Определяем базовый отступ
        const baseIndent = line.match(/^\s*/)?.[0] || '';
        const indentLevel = Math.floor(baseIndent.length / 2);
        
        // Форматируем отступы (2 пробела)
        const newIndent = '  '.repeat(indentLevel);
        
        // Убираем лишние пробелы внутри строки
        trimmed = trimmed.replace(/\s+/g, ' ');
        
        // Форматируем скобки
        trimmed = trimmed.replace(/\s*{\s*/g, ' { ');
        trimmed = trimmed.replace(/\s*}\s*/g, ' } ');
        trimmed = trimmed.replace(/\s*\(\s*/g, ' ( ');
        trimmed = trimmed.replace(/\s*\)\s*/g, ' ) ');
        trimmed = trimmed.replace(/\s*\[\s*/g, ' [ ');
        trimmed = trimmed.replace(/\s*\]\s*/g, ' ] ');
        
        // Убираем двойные пробелы
        trimmed = trimmed.replace(/  +/g, ' ').trim();
        
        // Исправляем форматирование скобок
        trimmed = trimmed.replace(/\s+{/g, ' {');
        trimmed = trimmed.replace(/}\s+/g, '} ');
        trimmed = trimmed.replace(/\s+\(/g, ' (');
        trimmed = trimmed.replace(/\)\s+/g, ') ');
        trimmed = trimmed.replace(/\s+\[/g, ' [');
        trimmed = trimmed.replace(/\]\s+/g, '] ');
        
        return newIndent + trimmed;
      }).join('\n');
      
      // Убираем множественные пустые строки
      formatted = formatted.replace(/\n\n\n+/g, '\n\n');
      
    } else if (language === 'python') {
      // Python форматирование (PEP 8 стиль)
      formatted = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        
        // Сохраняем отступы (4 пробела для Python)
        const indent = line.match(/^\s*/)?.[0] || '';
        const indentLevel = Math.floor(indent.length / 4);
        const newIndent = '    '.repeat(indentLevel);
        
        // Убираем лишние пробелы
        let cleaned = trimmed.replace(/\s+/g, ' ');
        
        // Форматируем операторы
        cleaned = cleaned.replace(/\s*=\s*/g, ' = ');
        cleaned = cleaned.replace(/\s*\+\s*/g, ' + ');
        cleaned = cleaned.replace(/\s*-\s*/g, ' - ');
        cleaned = cleaned.replace(/\s*\*\s*/g, ' * ');
        cleaned = cleaned.replace(/\s*\/\s*/g, ' / ');
        cleaned = cleaned.replace(/\s*:\s*/g, ': ');
        cleaned = cleaned.replace(/\s*,\s*/g, ', ');
        
        // Убираем двойные пробелы
        cleaned = cleaned.replace(/  +/g, ' ').trim();
        
        return newIndent + cleaned;
      }).join('\n');
      
    } else if (language === 'java' || language === 'cpp' || language === 'csharp') {
      // Полное форматирование для Java/C++/C# - исправляет отступы, пробелы и выравнивание
      let indentLevel = 0;
      formatted = lines.map((line, index) => {
        let trimmed = line.trim();
        if (!trimmed) {
          return '';
        }
        
        // Уменьшаем отступ для закрывающих скобок ПЕРЕД обработкой строки
        if (trimmed.startsWith('}') || trimmed.startsWith(']') || trimmed.startsWith(')')) {
          indentLevel = Math.max(0, indentLevel - 1);
        }
        
        const newIndent = '    '.repeat(indentLevel);
        
        // Нормализуем пробелы - убираем множественные пробелы
        trimmed = trimmed.replace(/\s+/g, ' ');
        
        // Исправляем пробелы вокруг операторов
        trimmed = trimmed.replace(/\s*=\s*/g, ' = ');
        trimmed = trimmed.replace(/\s*,\s*/g, ', ');
        trimmed = trimmed.replace(/\s*;\s*/g, '; ');
        trimmed = trimmed.replace(/\s*:\s*/g, ': ');
        trimmed = trimmed.replace(/\s*\+\s*/g, ' + ');
        trimmed = trimmed.replace(/\s*-\s*/g, ' - ');
        trimmed = trimmed.replace(/\s*\*\s*/g, ' * ');
        trimmed = trimmed.replace(/\s*\/\s*/g, ' / ');
        trimmed = trimmed.replace(/\s*>\s*/g, ' > ');
        trimmed = trimmed.replace(/\s*<\s*/g, ' < ');
        trimmed = trimmed.replace(/\s*>=\s*/g, ' >= ');
        trimmed = trimmed.replace(/\s*<=\s*/g, ' <= ');
        trimmed = trimmed.replace(/\s*==\s*/g, ' == ');
        trimmed = trimmed.replace(/\s*!=\s*/g, ' != ');
        trimmed = trimmed.replace(/\s*&&\s*/g, ' && ');
        trimmed = trimmed.replace(/\s*\|\|\s*/g, ' || ');
        
        // Исправляем пробелы вокруг скобок
        trimmed = trimmed.replace(/\s*{\s*/g, ' { ');
        trimmed = trimmed.replace(/\s*}\s*/g, ' } ');
        trimmed = trimmed.replace(/\s*\(\s*/g, ' ( ');
        trimmed = trimmed.replace(/\s*\)\s*/g, ' ) ');
        trimmed = trimmed.replace(/\s*\[\s*/g, ' [ ');
        trimmed = trimmed.replace(/\s*\]\s*/g, ' ] ');
        
        // Убираем все множественные пробелы
        trimmed = trimmed.replace(/  +/g, ' ').trim();
        
        // Исправляем пробелы перед открывающими скобками после ключевых слов
        trimmed = trimmed.replace(/\b(public|private|protected|static|final|if|else|for|while|switch|case|try|catch|class|interface|enum)\s+{/g, '$1 {');
        trimmed = trimmed.replace(/\b(public|private|protected|static|final|if|else|for|while|switch|case|try|catch|class|interface|enum)\s+\(/g, '$1 (');
        
        // Исправляем пробелы после закрывающих скобок
        trimmed = trimmed.replace(/}\s+/g, '} ');
        trimmed = trimmed.replace(/\)\s+/g, ') ');
        trimmed = trimmed.replace(/\]\s+/g, '] ');
        trimmed = trimmed.replace(/\s+\(/g, ' (');
        trimmed = trimmed.replace(/\s+\[/g, ' [');
        trimmed = trimmed.replace(/\s+;/g, ';');
        
        // Увеличиваем отступ для открывающих скобок ПОСЛЕ обработки строки
        if (trimmed.endsWith('{') || trimmed.endsWith('[') || (trimmed.endsWith('(') && !trimmed.includes(')'))) {
          indentLevel++;
        }
        
        return newIndent + trimmed;
      }).join('\n');
      formatted = formatted.replace(/\n\n\n+/g, '\n\n');
      
      // Убираем множественные пустые строки
      formatted = formatted.replace(/\n\n\n+/g, '\n\n');
      
    } else {
      // Для остальных языков - базовая очистка
      formatted = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        const indent = line.match(/^\s*/)?.[0] || '';
        return indent + trimmed.replace(/\s+/g, ' ');
      }).join('\n');
    }
    
    setCode(formatted);
  }, [code, language]);

  // Функция для парсинга ошибок и определения строк с ошибками
  const parseErrors = useCallback((outputText) => {
    const errorLines = [];
    if (!outputText) return errorLines;
    
    const lines = outputText.split('\n');
    const codeLines = code.split('\n');
    
    lines.forEach((line) => {
      // Паттерны для поиска ошибок с номерами строк
      const patterns = [
        /(?:at|line|строка|:)\s*(\d+)/i,
        /:(\d+):/,
        /\((\d+)\)/,
        /\[(\d+)\]/,
      ];
      
      patterns.forEach(pattern => {
        const match = line.match(pattern);
        if (match) {
          const lineNum = parseInt(match[1], 10);
          if (lineNum > 0 && lineNum <= codeLines.length) {
            errorLines.push(lineNum - 1); // Индекс с 0
          }
        }
      });
    });
    
    return [...new Set(errorLines)]; // Убираем дубликаты
  }, [code]);

  // Подсветка ошибок в редакторе
  const errorHighlightExtension = useMemo(() => {
    // Временно отключаем подсветку ошибок, чтобы избежать проблем с сортировкой
    // TODO: Включить после исправления проблемы с сортировкой
    return [];
    
    /* Временно закомментировано
    if (!errorLines || errorLines.length === 0) return [];
    if (!code || code.trim().length === 0) return [];
    
    const lineMark = Decoration.line({
      class: 'cm-error-line'
    });
    
    const errorField = StateField.define({
      create(state) {
        try {
          const decorations = [];
          // Сортируем номера строк по возрастанию для правильного порядка декораций
          const sortedLines = [...errorLines].filter(ln => typeof ln === 'number' && ln >= 0).sort((a, b) => a - b);
          
          sortedLines.forEach(lineNum => {
            try {
              if (lineNum >= 0 && lineNum < state.doc.lines) {
                const line = state.doc.line(lineNum + 1);
                if (line && line.from !== undefined) {
                  decorations.push(lineMark.range(line.from));
                }
              }
            } catch (e) {
              // Игнорируем ошибки для несуществующих строк
              console.warn(`Ошибка при создании декорации для строки ${lineNum}:`, e);
            }
          });
          
          // Создаем Decoration.set с отсортированными декорациями
          if (decorations.length === 0) {
            return Decoration.none;
          }
          
          // Убеждаемся, что декорации отсортированы по позиции from
          decorations.sort((a, b) => a.from - b.from);
          
          return Decoration.set(decorations, true); // true = отсортировано
        } catch (e) {
          console.error('Ошибка при создании errorHighlightExtension:', e);
          return Decoration.none;
        }
      },
      update(decorations, tr) {
        if (!decorations || decorations.size === 0) return Decoration.none;
        try {
          return decorations.map(tr.changes);
        } catch (e) {
          console.error('Ошибка при обновлении декораций:', e);
          return Decoration.none;
        }
      },
      provide: f => EditorView.decorations.from(f)
    });
    
    return [errorField];
    */
  }, [errorLines, code]);

  // Обновляем ошибки при изменении вывода
  useEffect(() => {
    const errors = parseErrors(output);
    setErrorLines(errors);
  }, [output, parseErrors]);

  // Автосохранение кода в localStorage (всегда включено)
  useEffect(() => {
    if (code) {
      try {
        localStorage.setItem(`codeforge_code_${language}`, code);
        localStorage.setItem('codeforge_last_language', language);
      } catch (e) {
        console.warn('Не удалось сохранить код:', e);
      }
    }
  }, [code, language]);

  // Загрузка сохраненного кода при монтировании
  useEffect(() => {
    try {
      const savedLanguage = localStorage.getItem('codeforge_last_language') || language;
      const savedCode = localStorage.getItem(`codeforge_code_${savedLanguage}`);
      if (savedCode && !code) {
        setCode(savedCode);
        if (savedLanguage !== language) {
          setLanguage(savedLanguage);
        }
      }
    } catch (e) {
      console.warn('Не удалось загрузить сохраненный код:', e);
    }
  }, []); // Только при монтировании

  // Сохранение SQL вкладок и кода в localStorage (при перезапуске приложения)
  const saveSqlToStorage = useCallback(() => {
    try {
      const t1 = tabs1.map(t => t.id === activeTab1 ? { ...t, code: code1 } : t);
      const t2 = tabs2.map(t => t.id === activeTab2 ? { ...t, code: code2 } : t);
      localStorage.setItem('codeforge_sql_tabs1', JSON.stringify(t1));
      localStorage.setItem('codeforge_sql_tabs2', JSON.stringify(t2));
      localStorage.setItem('codeforge_sql_activeTab1', activeTab1);
      localStorage.setItem('codeforge_sql_activeTab2', activeTab2);
      localStorage.setItem('codeforge_sql_schema', JSON.stringify({ tables: sqlTables, erdPositions }));
    } catch (e) {
      console.warn('Не удалось сохранить SQL:', e);
    }
  }, [tabs1, tabs2, activeTab1, activeTab2, code1, code2, sqlTables, erdPositions]);

  useEffect(() => {
    if (sqlMode) saveSqlToStorage();
  }, [sqlMode, saveSqlToStorage]);

  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        if (sqlMode) {
          const t1 = tabs1.map(t => t.id === activeTab1 ? { ...t, code: code1 } : t);
          const t2 = tabs2.map(t => t.id === activeTab2 ? { ...t, code: code2 } : t);
          localStorage.setItem('codeforge_sql_tabs1', JSON.stringify(t1));
          localStorage.setItem('codeforge_sql_tabs2', JSON.stringify(t2));
          localStorage.setItem('codeforge_sql_activeTab1', activeTab1);
          localStorage.setItem('codeforge_sql_activeTab2', activeTab2);
          localStorage.setItem('codeforge_sql_schema', JSON.stringify({ tables: sqlTables, erdPositions }));
        }
        saveSqlDbToStorage();
      } catch (_) {}
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [sqlMode, tabs1, tabs2, activeTab1, activeTab2, code1, code2, sqlTables, erdPositions, saveSqlDbToStorage]);

  const loadSqlFromStorage = useCallback(() => {
    try {
      const raw1 = localStorage.getItem('codeforge_sql_tabs1');
      const raw2 = localStorage.getItem('codeforge_sql_tabs2');
      const t1 = raw1 ? JSON.parse(raw1) : null;
      const t2 = raw2 ? JSON.parse(raw2) : null;
      if (Array.isArray(t1) && t1.length > 0) {
        return {
          tabs1: t1,
          tabs2: Array.isArray(t2) && t2.length > 0 ? t2 : [{ id: 'tab2-1', name: 'Схемы', code: '', output: '', language: 'javascript' }],
          activeTab1: localStorage.getItem('codeforge_sql_activeTab1') || t1[0]?.id || 'tab1-1',
          activeTab2: localStorage.getItem('codeforge_sql_activeTab2') || 'tab2-1'
        };
      }
    } catch (e) {
      console.warn('Не удалось загрузить SQL из localStorage:', e);
    }
    return null;
  }, []);

  // Функции для работы с вкладками (single view)
  const createNewTab = useCallback(() => {
    const newTabId = `tab-${Date.now()}`;
    const newTab = {
      id: newTabId,
      name: `Вкладка ${tabs.length + 1}`,
      code: '',
      output: '',
      language: language
    };
    setTabs(prev => {
      const withCurrentSaved = prev.map(tab =>
        tab.id === activeTab ? { ...tab, code, output, language } : tab
      );
      return [...withCurrentSaved, newTab];
    });
    setActiveTab(newTabId);
    setCode('');
    setOutput('');
    return newTabId;
  }, [tabs.length, language, activeTab, code, output]);

  const closeTab = useCallback((tabId) => {
    if (tabs.length === 1) return; // Нельзя закрыть последнюю вкладку
    setTabs(prev => prev.filter(tab => tab.id !== tabId));
    if (activeTab === tabId) {
      const remainingTabs = tabs.filter(tab => tab.id !== tabId);
      setActiveTab(remainingTabs[0]?.id || 'tab-1');
    }
  }, [tabs, activeTab]);

  const switchTab = useCallback((tabId) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTab(tabId);
      setCode(tab.code);
      setOutput(tab.output);
      setLanguage(tab.language);
    }
  }, [tabs]);

  // Функции для работы с вкладками окна 1 (split view)
  const createNewTab1 = useCallback(() => {
    const newTabId = `tab1-${Date.now()}`;
    const newTab = {
      id: newTabId,
      name: `Вкладка ${tabs1.length + 1}`,
      code: '',
      output: '',
      language: language1
    };
    setTabs1(prev => {
      const withCurrentSaved = prev.map(tab =>
        tab.id === activeTab1 ? { ...tab, code: code1, output: output1, language: language1 } : tab
      );
      return [...withCurrentSaved, newTab];
    });
    setActiveTab1(newTabId);
    setCode1('');
    setOutput1('');
    return newTabId;
  }, [tabs1.length, language1, activeTab1, code1, output1]);

  const closeTab1 = useCallback((tabId) => {
    if (tabs1.length === 1) return; // Нельзя закрыть последнюю вкладку
    setTabs1(prev => prev.filter(tab => tab.id !== tabId));
    if (activeTab1 === tabId) {
      const remainingTabs = tabs1.filter(tab => tab.id !== tabId);
      const newActiveTab = remainingTabs[0]?.id || 'tab1-1';
      setActiveTab1(newActiveTab);
      const tab = remainingTabs[0];
      if (tab) {
        setCode1(tab.code);
        setOutput1(tab.output);
      }
    }
  }, [tabs1, activeTab1]);

  const switchTab1 = useCallback((tabId) => {
    const tab = tabs1.find(t => t.id === tabId);
    if (tab) {
      setActiveTab1(tabId);
      setCode1(tab.code);
      setOutput1(tab.output);
      setLanguage(tab.language);
    }
  }, [tabs1]);

  // Функции для работы с вкладками окна 2 (split view)
  const createNewTab2 = useCallback(() => {
    const newTabId = `tab2-${Date.now()}`;
    const newTab = {
      id: newTabId,
      name: `Вкладка ${tabs2.length + 1}`,
      code: '',
      output: '',
      language: language2
    };
    setTabs2(prev => {
      const withCurrentSaved = prev.map(tab =>
        tab.id === activeTab2 ? { ...tab, code: code2, output: output2, language: language2 } : tab
      );
      return [...withCurrentSaved, newTab];
    });
    setActiveTab2(newTabId);
    setCode2('');
    setOutput2('');
    return newTabId;
  }, [tabs2.length, language2, activeTab2, code2, output2]);

  const closeTab2 = useCallback((tabId) => {
    if (tabs2.length === 1) return; // Нельзя закрыть последнюю вкладку
    setTabs2(prev => prev.filter(tab => tab.id !== tabId));
    if (activeTab2 === tabId) {
      const remainingTabs = tabs2.filter(tab => tab.id !== tabId);
      const newActiveTab = remainingTabs[0]?.id || 'tab2-1';
      setActiveTab2(newActiveTab);
      const tab = remainingTabs[0];
      if (tab) {
        setCode2(tab.code);
        setOutput2(tab.output);
      }
    }
  }, [tabs2, activeTab2]);

  const switchTab2 = useCallback((tabId) => {
    const tab = tabs2.find(t => t.id === tabId);
    if (tab) {
      setActiveTab2(tabId);
      setCode2(tab.code);
      setOutput2(tab.output);
      setLanguage2(tab.language);
    }
  }, [tabs2]);

  // Сохраняем изменения в активную вкладку (single view)
  useEffect(() => {
    if (activeTab && !splitView) {
      setTabs(prev => prev.map(tab => 
        tab.id === activeTab 
          ? { ...tab, code, output, language }
          : tab
      ));
    }
  }, [code, output, language, activeTab, splitView]);

  // Сохраняем изменения в активную вкладку окна 1 (split view)
  useEffect(() => {
    if (activeTab1 && splitView) {
      setTabs1(prev => prev.map(tab => 
        tab.id === activeTab1 
          ? { ...tab, code: code1, output: output1, language: language1 }
          : tab
      ));
    }
  }, [code1, output1, language1, activeTab1, splitView]);

  // Сохраняем изменения в активную вкладку окна 2 (split view)
  useEffect(() => {
    if (activeTab2 && splitView) {
      setTabs2(prev => prev.map(tab => 
        tab.id === activeTab2 
          ? { ...tab, code: code2, output: output2, language: language2 }
          : tab
      ));
    }
  }, [code2, output2, language2, activeTab2, splitView]);

  // Загружаем данные активной вкладки при переключении
  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTab);
    if (tab && (tab.code !== code || tab.output !== output || tab.language !== language)) {
      // Обновляем только если данные вкладки отличаются от текущих
      // Это предотвращает бесконечный цикл
    }
  }, [activeTab, tabs]);

  // Функция дублирования строки (дублирует СНИЗУ)
  const duplicateLine = useCallback((view) => {
    const selection = view.state.selection.main;
    const line = view.state.doc.lineAt(selection.from);
    const lineText = line.text;
    const newLine = '\n' + lineText; // Добавляем новую строку СНИЗУ текущей
    view.dispatch({
      changes: {
        from: line.to,
        to: line.to,
        insert: newLine
      },
      selection: { anchor: line.to + newLine.length }
    });
    return true;
  }, []);

  // Горячие клавиши
  useEffect(() => {
    const handleKeyDown = (e) => {
      // F8 для выполнения
      if (e.key === 'F8') {
        e.preventDefault();
        if (!isRunning && code.trim()) {
          executeCode();
        }
      }
      // Ctrl+Enter для выполнения
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isRunning && code.trim()) {
          executeCode();
        }
      }
      // Ctrl+Alt+L для автоформатирования
      if (e.ctrlKey && e.altKey && (e.key.toLowerCase() === 'l' || e.key === 'L')) {
        e.preventDefault();
        e.stopPropagation();
        formatCode();
        return false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [code, language, isRunning, formatCode, executeCode]);

  // Ctrl+A — для Electron: execCommand + native Selection API
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key?.toLowerCase() !== 'a') return;
      const el = document.activeElement;
      if (!el?.closest?.('.cm-editor')) return;
      const refs = [editorViewRef1, editorViewRef2, editorViewRef];
      for (const r of refs) {
        const v = r.current;
        if (v?.dom?.contains(el)) {
          e.preventDefault();
          e.stopPropagation();
          v.contentDOM.focus();
          const len = v.state.doc.length;
          v.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, len)]) });
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            const range = document.createRange();
            range.selectNodeContents(v.contentDOM);
            sel.addRange(range);
          }
          break;
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // Клик по выделенному тексту — снять выделение (без preventDefault, чтобы не ломать выделение мышкой)
  useEffect(() => {
    const handleMouseDown = (e) => {
      if (e.button !== 0) return;
      const el = e.target;
      if (!el?.closest?.('.cm-editor')) return;
      const refs = [editorViewRef1, editorViewRef2, editorViewRef];
      for (const r of refs) {
        const v = r.current;
        const main = v?.state?.selection?.main;
        if (main && main.from !== main.to && v.dom?.contains(el)) {
          const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
          v.dispatch({ selection: EditorSelection.cursor(pos != null ? pos : main.from) });
          break;
        }
      }
    };
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
  }, []);

  // В SQL-режиме: таблицы обновляются ТОЛЬКО после выполнения запроса (executeCode1).
  // Динамическое обновление при вводе кода отключено по требованию пользователя —
  // таблицы не должны появляться справа при вставке кода, только после нажатия "Выполнить".
  // const sqlSourceForTables = sqlMode && splitView ? code1 : (sqlMode ? code : '');
  // useEffect отключен - обновление таблиц происходит только в executeCode1

  // Обработчик горизонтального ресайза (для одного окна - устаревший, оставляем для совместимости)
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizing) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= 200 && newWidth <= window.innerWidth - 400) {
          setOutputWidth(newWidth);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing]);

  // Обработчик вертикального ресайза (для одного окна)
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingVertical) return;
      const newHeight = window.innerHeight - e.clientY;
      setOutputHeight(Math.max(100, Math.min(600, newHeight)));
    };

    const handleMouseUp = () => {
      setIsResizingVertical(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizingVertical) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizingVertical]);

  // Обработчик вертикального ресайза для окна 1
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingVertical1) return;
      const container = document.querySelector('.split-pane-container:first-child');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newHeight = rect.bottom - e.clientY;
      setOutputHeight1(Math.max(100, Math.min(600, newHeight)));
    };

    const handleMouseUp = () => {
      setIsResizingVertical1(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizingVertical1) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizingVertical1]);

  // Обработчик вертикального ресайза для окна 2
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingVertical2) return;
      const containers = document.querySelectorAll('.split-pane-container');
      const container = containers[1];
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newHeight = rect.bottom - e.clientY;
      setOutputHeight2(Math.max(100, Math.min(600, newHeight)));
    };

    const handleMouseUp = () => {
      setIsResizingVertical2(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizingVertical2) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizingVertical2]);

  // Обработчик изменения размера split view
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingSplit) return;
      const container = document.querySelector('.split-container');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const totalWidth = rect.width;
      const mouseX = e.clientX - rect.left;
      const percentage = (mouseX / totalWidth) * 100;
      // Ограничиваем от 20% до 80%
      const clampedPercentage = Math.max(20, Math.min(80, percentage));
      setSplitPaneWidth(clampedPercentage);
    };

    const handleMouseUp = () => {
      setIsResizingSplit(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizingSplit) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizingSplit]);

  // Обработчик mousedown на разделителе — слушаем document в capture-фазе и проверяем target
  useEffect(() => {
    if (!splitView) return;
    const handleDown = (e) => {
      const divider = e.target && e.target.closest && e.target.closest('.split-divider');
      if (divider) {
        e.preventDefault();
        e.stopPropagation();
        setIsResizingSplit(true);
      }
    };
    document.addEventListener('mousedown', handleDown, true);
    return () => document.removeEventListener('mousedown', handleDown, true);
  }, [splitView]);

  // Обработчик зума с помощью Ctrl + колесико мыши
  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        setFontSize(prev => {
          const newSize = prev + delta;
          return Math.max(8, Math.min(32, newSize)); // Ограничиваем от 8 до 32
        });
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const clearOutput = () => {
    setOutput('');
  };

  const clearCode = () => {
    if (window.confirm('Точно удалить весь код?')) {
      setCode('');
      setTabs(prev => prev.map(tab => tab.id === activeTab ? { ...tab, code: '' } : tab));
    }
  };

  const clearCode1 = () => {
    if (window.confirm('Точно удалить весь код в левом окне?')) {
      setCode1('');
      setTabs1(prev => prev.map(tab => tab.id === activeTab1 ? { ...tab, code: '' } : tab));
    }
  };

  const clearOutput1 = () => {
    setOutput1('');
  };

  const clearCode2 = () => {
    if (window.confirm('Точно удалить весь код в правом окне?')) {
      setCode2('');
      setTabs2(prev => prev.map(tab => tab.id === activeTab2 ? { ...tab, code: '' } : tab));
    }
  };

  const clearOutput2 = () => {
    setOutput2('');
  };

  return (
    <div className="app">
      <div className="toolbar">
        <div className="toolbar-left">
          <h1 className="app-title">CodeForge Studio</h1>
          <span className="app-creator">Создано: Aleksey Volkov</span>
          {!splitView && (
            <select 
              className="language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {languages.map(lang => (
                <option key={lang.value} value={lang.value}>{lang.label}</option>
              ))}
            </select>
          )}
          <button
            className={`btn btn-secondary ${sqlMode ? 'active' : ''}`}
            style={{ marginLeft: '8px' }}
            onClick={toggleSqlMode}
            title="SQL режим: слева запросы, справа таблицы"
          >
            SQL
          </button>
        </div>
        <div className="toolbar-right">
          <div style={{ position: 'relative' }}>
            <button 
              className="btn btn-secondary"
              onClick={() => setShowSettings(!showSettings)}
              title="Настройки"
            >
              ⚙️ Настройки
            </button>
            {showSettings && (
              <div className="settings-panel">
                <div className="settings-header">
                  <h3 style={{ margin: 0, color: '#d4d4d4', fontSize: '14px' }}>Настройки отображения</h3>
                  <button 
                    onClick={() => setShowSettings(false)}
                    style={{ 
                      background: 'transparent', 
                      border: 'none', 
                      color: '#d4d4d4', 
                      cursor: 'pointer', 
                      fontSize: '18px',
                      padding: '0 8px',
                      lineHeight: '1'
                    }}
                    title="Закрыть"
                  >
                    ×
                  </button>
                </div>
                <div className="settings-fixed">
                  <div className="setting-group">
                    <label>Шрифт:</label>
                    <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                      {fontFamilies.map(font => (
                        <option key={font} value={font}>{font}</option>
                      ))}
                    </select>
                  </div>
                  <div className="setting-group">
                    <label>Размер шрифта:</label>
                    <select value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}>
                      {fontSizes.map(size => (
                        <option key={size} value={size}>{size}px</option>
                      ))}
                    </select>
                  </div>
                  <div className="setting-group">
                    <label>Стиль шрифта:</label>
                    <select value={fontStyle} onChange={(e) => setFontStyle(e.target.value)}>
                      {fontStyles.map(style => (
                        <option key={style} value={style}>{style}</option>
                      ))}
                    </select>
                  </div>
                  <div className="setting-group">
                    <label>Тема редактора:</label>
                    <select value={selectedTheme} onChange={(e) => {
                      const v = e.target.value;
                      setSelectedTheme(v);
                      try { localStorage.setItem('codeforge_theme', v); } catch (err) {}
                    }}>
                      {availableThemes.map(theme => (
                        <option key={theme.value} value={theme.value}>{theme.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="setting-group" style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <label style={{ margin: 0 }}>Настройки цветов:</label>
                      <button
                        onClick={() => setShowColorSettings(!showColorSettings)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #3e3e3e',
                          color: '#d4d4d4',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          fontSize: '12px',
                          borderRadius: '4px'
                        }}
                        title={showColorSettings ? 'Скрыть настройки цветов' : 'Показать настройки цветов'}
                      >
                        {showColorSettings ? '▼ Скрыть' : '▶ Показать'}
                      </button>
                    </div>
                  </div>
                  {showColorSettings && (
                    <>
                      <div className="setting-group" style={{ marginBottom: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                          <label style={{ margin: 0 }}>Цвет текста:</label>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowFontColor(!showFontColor);
                            }}
                            style={{
                              background: 'transparent',
                              border: '1px solid #3e3e3e',
                              color: '#d4d4d4',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              fontSize: '11px',
                              borderRadius: '4px'
                            }}
                            title={showFontColor ? 'Скрыть' : 'Показать'}
                          >
                            {showFontColor ? '▼' : '▶'}
                          </button>
                        </div>
                      </div>
                      <div className="setting-group" style={{ marginBottom: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                          <label style={{ margin: 0 }}>Цвет ключевых слов (new, class, etc):</label>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowKeywordColor(!showKeywordColor);
                            }}
                            style={{
                              background: 'transparent',
                              border: '1px solid #3e3e3e',
                              color: '#d4d4d4',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              fontSize: '11px',
                              borderRadius: '4px'
                            }}
                            title={showKeywordColor ? 'Скрыть' : 'Показать'}
                          >
                            {showKeywordColor ? '▼' : '▶'}
                          </button>
                        </div>
                      </div>
                      <div className="setting-group" style={{ marginBottom: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                          <label style={{ margin: 0 }}>Цвет классов:</label>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowClassNameColor(!showClassNameColor);
                            }}
                            style={{
                              background: 'transparent',
                              border: '1px solid #3e3e3e',
                              color: '#d4d4d4',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              fontSize: '11px',
                              borderRadius: '4px'
                            }}
                            title={showClassNameColor ? 'Скрыть' : 'Показать'}
                          >
                            {showClassNameColor ? '▼' : '▶'}
                          </button>
                        </div>
                      </div>
                      <div className="setting-group" style={{ marginBottom: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                          <label style={{ margin: 0 }}>Цвет переменных:</label>
                          <button
                            onClick={() => setShowVariableColor(!showVariableColor)}
                            style={{
                              background: 'transparent',
                              border: '1px solid #3e3e3e',
                              color: '#d4d4d4',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              fontSize: '11px',
                              borderRadius: '4px'
                            }}
                            title={showVariableColor ? 'Скрыть' : 'Показать'}
                          >
                            {showVariableColor ? '▼' : '▶'}
                          </button>
                        </div>
                      </div>
                      <div className="setting-group" style={{ marginBottom: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                          <label style={{ margin: 0 }}>Цвет фона редактора:</label>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowBackgroundColor(!showBackgroundColor);
                            }}
                            style={{
                              background: 'transparent',
                              border: '1px solid #3e3e3e',
                              color: '#d4d4d4',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              fontSize: '11px',
                              borderRadius: '4px'
                            }}
                            title={showBackgroundColor ? 'Скрыть' : 'Показать'}
                          >
                            {showBackgroundColor ? '▼' : '▶'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="setting-group" style={{ marginTop: '12px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <label style={{ margin: 0 }}>Горячие клавиши:</label>
                      <button
                        onClick={() => setShowHotkeys(!showHotkeys)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #3e3e3e',
                          color: '#d4d4d4',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          fontSize: '12px',
                          borderRadius: '4px'
                        }}
                        title={showHotkeys ? 'Скрыть горячие клавиши' : 'Показать горячие клавиши'}
                      >
                        {showHotkeys ? '▼ Скрыть' : '▶ Показать'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="settings-content">
                  {showColorSettings && (
                    <>
                      {showFontColor && (
                        <div className="setting-group">
                          <div className="color-picker">
                            {fontColors.map(color => (
                              <button
                                key={color}
                                className={`color-option ${fontColor === color ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => setFontColor(color)}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {showKeywordColor && (
                        <div className="setting-group">
                          <div className="color-picker">
                            {fontColors.map(color => (
                              <button
                                key={color}
                                className={`color-option ${keywordColor === color ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => setKeywordColor(color)}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {showClassNameColor && (
                        <div className="setting-group">
                          <div className="color-picker">
                            {fontColors.map(color => (
                              <button
                                key={color}
                                className={`color-option ${classNameColor === color ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => setClassNameColor(color)}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {showVariableColor && (
                        <div className="setting-group">
                          <div className="color-picker">
                            {fontColors.map(color => (
                              <button
                                key={color}
                                className={`color-option ${variableColor === color ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => setVariableColor(color)}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {showBackgroundColor && (
                        <div className="setting-group">
                          <div className="color-picker">
                            {fontColors.map(color => (
                              <button
                                key={color}
                                className={`color-option ${backgroundColor === color ? 'active' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => {
                                  setBackgroundColor(color);
                                  try {
                                    localStorage.setItem('codeforge_bg_color', color);
                                  } catch (err) {}
                                }}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {showHotkeys && (
                    <div style={{ 
                      background: '#2d2d30', 
                      border: '1px solid #3e3e3e', 
                      borderRadius: '4px', 
                      padding: '12px',
                      marginBottom: '12px'
                    }}>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1fr', 
                        gap: '8px 16px',
                        fontSize: '12px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span style={{ color: '#858585' }}>Выполнить код:</span>
                          <span style={{ color: '#d4d4d4', fontFamily: 'monospace', fontWeight: 'bold' }}>F8</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span style={{ color: '#858585' }}>Выполнить код (альт.):</span>
                          <span style={{ color: '#d4d4d4', fontFamily: 'monospace', fontWeight: 'bold' }}>Alt+F8</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span style={{ color: '#858585' }}>Выполнить код:</span>
                          <span style={{ color: '#d4d4d4', fontFamily: 'monospace', fontWeight: 'bold' }}>Ctrl+Enter</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span style={{ color: '#858585' }}>Автоформатирование:</span>
                          <span style={{ color: '#d4d4d4', fontFamily: 'monospace', fontWeight: 'bold' }}>Ctrl+Alt+L</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span style={{ color: '#858585' }}>Выделить все:</span>
                          <span style={{ color: '#d4d4d4', fontFamily: 'monospace', fontWeight: 'bold' }}>Ctrl+A</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span style={{ color: '#858585' }}>Закомментировать:</span>
                          <span style={{ color: '#d4d4d4', fontFamily: 'monospace', fontWeight: 'bold' }}>Ctrl+/</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span style={{ color: '#858585' }}>Дублировать строку:</span>
                          <span style={{ color: '#d4d4d4', fontFamily: 'monospace', fontWeight: 'bold' }}>Ctrl+D</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span style={{ color: '#858585' }}>Создать вкладку:</span>
                          <span style={{ color: '#d4d4d4', fontFamily: 'monospace', fontWeight: 'bold' }}>Ctrl+T</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span style={{ color: '#858585' }}>Удалить пробелы в строке:</span>
                          <span style={{ color: '#d4d4d4', fontFamily: 'monospace', fontWeight: 'bold' }}>Ctrl+L</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {!splitView && (
            <button 
              className={`btn btn-primary ${isRunning ? 'running' : ''}`}
              onClick={executeCode}
              disabled={isRunning}
              title="Выполнить код (Ctrl+Enter или F8)"
            >
              {isRunning ? '⏳ Выполнение...' : '▶️ Выполнить'}
            </button>
          )}
          <button 
            className={`btn btn-secondary ${splitView ? 'active' : ''}`}
            onClick={() => {
              if (splitView) {
                if (code1.trim() && code2.trim() && code1 !== code2) {
                  setShowWindowChoiceModal(true);
                } else {
                  setCode(code1 || code2);
                  setOutput(output1 || output2);
                  setSplitView(false);
                }
              } else {
                if (tabs.length > 1) {
                  setShowTabSplitModal(true);
                } else {
                  setCode1(code);
                  setCode2(code);
                  setTabs1([{ id: 'tab1-1', name: 'Вкладка 1', code: code, output: output, language: language }]);
                  setTabs2([{ id: 'tab2-1', name: 'Вкладка 1', code: code, output: output, language: language }]);
                  setLanguage1(language);
                  setLanguage2(language);
                  setActiveTab1('tab1-1');
                  setActiveTab2('tab2-1');
                  setSplitView(true);
                }
              }
            }}
            title="Разделить окно на 2 части"
          >
            {splitView ? '📑 Одно окно' : '📑 Два окна'}
          </button>
        </div>
      </div>

      <div className="main-container">
        {splitView ? (
          <div className="split-container" style={{ position: 'relative' }}>
            {/* Окно 1 - слева */}
            <div className="split-pane-container" style={{ width: `${splitPaneWidth}%`, flex: '0 0 auto' }}>
              <div className="editor-container split-pane">
                <div className="editor-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="editor-title">{sqlMode ? 'SQL редактор (запросы)' : 'Редактор кода (1)'}</span>
                      {!sqlMode && (
                        <select
                          className="language-select"
                          value={language1}
                          onChange={(e) => {
                            const newLang = e.target.value;
                            setLanguage1(newLang);
                            setTabs1(prev => prev.map(tab => tab.id === activeTab1 ? { ...tab, language: newLang } : tab));
                          }}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                          {languages.map(lang => (
                            <option key={lang.value} value={lang.value}>{lang.label}</option>
                          ))}
                        </select>
                      )}
                      {sqlMode && (
                        <select
                          className="language-select"
                          value={sqlDialect}
                          onChange={(e) => {
                            const newDialect = e.target.value;
                            codeByDialectRef.current[sqlDialect] = code1;
                            setSqlDialect(newDialect);
                            const nextCode = codeByDialectRef.current[newDialect] ?? '';
                            setCode1(nextCode);
                            setTabs1(prev => prev.map(tab => tab.id === activeTab1 ? { ...tab, code: nextCode } : tab));
                          }}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                          <option value="sql">SQL (in-memory)</option>
                          <option value="postgres">PostgreSQL</option>
                          <option value="oracle">Oracle</option>
                        </select>
                      )}
                      {sqlMode && (sqlDialect === 'postgres' || sqlDialect === 'oracle') && (
                        <button
                          type="button"
                          onClick={() => sqlDialect === 'postgres' ? setShowPgConn(!showPgConn) : setShowOracleConn(!showOracleConn)}
                          style={{ fontSize: '11px', padding: '4px 8px', background: '#2d2d30', border: '1px solid #3e3e3e', color: '#d4d4d4', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          {sqlDialect === 'postgres' ? (showPgConn ? '▼ Скрыть подключение' : 'Подключение PostgreSQL') : (showOracleConn ? '▼ Скрыть подключение' : 'Подключение Oracle')}
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          createNewTab1();
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid #3e3e3e',
                          color: '#d4d4d4',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          fontSize: '11px',
                          borderRadius: '4px'
                        }}
                        title="Создать новую вкладку (Ctrl+T)"
                      >
                        ➕ Вкладка
                      </button>
                      {tabs1.length > 1 && (
                        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', flexWrap: 'wrap' }}>
                          {tabs1.map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => switchTab1(tab.id)}
                              style={{
                                background: activeTab1 === tab.id ? '#4C5866' : 'transparent',
                                border: '1px solid #3e3e3e',
                                color: activeTab1 === tab.id ? '#ffffff' : '#d4d4d4',
                                cursor: 'pointer',
                                padding: '2px 8px',
                                fontSize: '11px',
                                borderRadius: '4px'
                              }}
                              title={tab.name}
                            >
                              {tab.name}
                              {tabs1.length > 1 && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    closeTab1(tab.id);
                                  }}
                                  style={{ marginLeft: '4px', cursor: 'pointer' }}
                                >
                                  ×
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button 
                        className="btn btn-secondary"
                        onClick={clearCode1}
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                        title="Очистить код (с подтверждением)"
                      >
                        🗑️ Очистить
                      </button>
                      <button 
                        className={`btn btn-primary ${isRunning1 ? 'running' : ''}`}
                        onClick={executeCode1}
                        disabled={isRunning1}
                        style={{ padding: '4px 12px', fontSize: '12px' }}
                        title={sqlMode ? 'Разобрать SQL и обновить таблицы' : 'Выполнить код (Ctrl+Enter или F8)'}
                      >
                        {sqlMode
                          ? (isRunning1 ? '⏳ SQL...' : '▶️ Выполнить')
                          : (isRunning1 ? '⏳ Выполнение...' : '▶️ Выполнить')}
                      </button>
                    </div>
                  </div>
                  <span className="editor-hint"></span>
                  {sqlMode && showPgConn && sqlDialect === 'postgres' && (
                    <div style={{ padding: '8px 12px', background: '#252526', borderTop: '1px solid #3e3e3e', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
                      <input placeholder="host" value={postgresConn.host} onChange={(e) => setPostgresConn(c => ({ ...c, host: e.target.value }))} style={{ width: 100, padding: '4px 8px', background: '#2d2d30', border: '1px solid #3e3e3e', color: '#d4d4d4', borderRadius: 4 }} />
                      <input type="number" placeholder="port" value={postgresConn.port} onChange={(e) => setPostgresConn(c => ({ ...c, port: Number(e.target.value) || 5432 }))} style={{ width: 88, minWidth: 88, padding: '4px 8px', background: '#2d2d30', border: '1px solid #3e3e3e', color: '#d4d4d4', borderRadius: 4 }} />
                      <input placeholder="user" value={postgresConn.user} onChange={(e) => setPostgresConn(c => ({ ...c, user: e.target.value }))} style={{ width: 100, padding: '4px 8px', background: '#2d2d30', border: '1px solid #3e3e3e', color: '#d4d4d4', borderRadius: 4 }} />
                      <input type="password" placeholder="password" value={postgresConn.password} onChange={(e) => setPostgresConn(c => ({ ...c, password: e.target.value }))} style={{ width: 100, padding: '4px 8px', background: '#2d2d30', border: '1px solid #3e3e3e', color: '#d4d4d4', borderRadius: 4 }} />
                      <input placeholder="database" value={postgresConn.database} onChange={(e) => setPostgresConn(c => ({ ...c, database: e.target.value }))} style={{ width: 120, padding: '4px 8px', background: '#2d2d30', border: '1px solid #3e3e3e', color: '#d4d4d4', borderRadius: 4 }} />
                    </div>
                  )}
                  {sqlMode && showOracleConn && sqlDialect === 'oracle' && (
                    <div style={{ padding: '8px 12px', background: '#252526', borderTop: '1px solid #3e3e3e', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
                      <input placeholder="user" value={oracleConn.user} onChange={(e) => setOracleConn(c => ({ ...c, user: e.target.value }))} style={{ width: 100, padding: '4px 8px', background: '#2d2d30', border: '1px solid #3e3e3e', color: '#d4d4d4', borderRadius: 4 }} />
                      <input type="password" placeholder="password" value={oracleConn.password} onChange={(e) => setOracleConn(c => ({ ...c, password: e.target.value }))} style={{ width: 100, padding: '4px 8px', background: '#2d2d30', border: '1px solid #3e3e3e', color: '#d4d4d4', borderRadius: 4 }} />
                      <input placeholder="connectString (host:port/service)" value={oracleConn.connectString} onChange={(e) => setOracleConn(c => ({ ...c, connectString: e.target.value }))} style={{ width: 220, padding: '4px 8px', background: '#2d2d30', border: '1px solid #3e3e3e', color: '#d4d4d4', borderRadius: 4 }} />
                    </div>
                  )}
                </div>
                <div 
                  className="codemirror-wrapper" 
                  style={{
                    '--editor-font-family': fontFamily,
                    '--editor-font-size': `${fontSize}px`,
                    '--editor-font-style': fontStyle,
                    '--editor-font-color': fontColor,
                  }}
                >
                  <CodeMirror
                    value={code1}
                    theme={[getCurrentTheme(), customTheme]}
                    editable={true}
                    extensions={[
                      getLanguageExtension1(), 
                      customHighlightStyle,
                      smartAutocomplete,
                      tabExtension,
                      clickToDeselectExtension,
                      ...indentExtension,
                      ...enhancedBracketMatching,
                      ...minimapExtension,
                      keymap.of([
                        { key: 'Mod-a', run: selectAll },
                        {
                          key: 'Mod-l',
                          run: (view) => {
                            const selection = view.state.selection.main;
                            const line = view.state.doc.lineAt(selection.from);
                            const text = line.text;
                            // Удаляем все лишние пробелы в строке, сохраняя только отступ
                            const indent = text.match(/^\s*/)?.[0] || '';
                            // Удаляем все пробелы между словами, оставляя только один
                            const trimmed = text.trim().replace(/\s+/g, ' ');
                            view.dispatch({
                              changes: {
                                from: line.from,
                                to: line.to,
                                insert: indent + trimmed
                              }
                            });
                            return true;
                          }
                        },
                        {
                          key: 'F8',
                          run: () => {
                            if (!isRunning1 && code1.trim()) {
                              executeCode1();
                            }
                            return true;
                          }
                        },
                        {
                          key: 'Alt-F8',
                          run: () => {
                            if (!isRunning1 && code1.trim()) {
                              executeCode1();
                            }
                            return true;
                          }
                        },
                        {
                          key: 'Mod-Enter',
                          run: () => {
                            if (!isRunning1 && code1.trim()) {
                              executeCode1();
                            }
                            return true;
                          }
                        },
                        {
                          key: 'Ctrl-Alt-l',
                          run: () => {
                            const formatted = formatCodeForLanguage(code1, language1);
                            if (formatted !== code1) {
                              setCode1(formatted);
                            }
                            return true;
                          }
                        },
                        {
                          key: 'Mod-/',
                          run: (view) => {
                            toggleComment(view);
                            return true;
                          }
                        },
                        {
                          key: 'Mod-d',
                          run: (view) => {
                            return duplicateLine(view);
                          }
                        },
                        {
                          key: 'Mod-t',
                          run: () => {
                            createNewTab1();
                            return true;
                          }
                        }
                      ])
                    ]}
                    onChange={(value) => {
                      setCode1(value);
                      if (sqlMode) codeByDialectRef.current[sqlDialect] = value;
                    }}
                    onCreateEditor={(view) => {
                      editorViewRef1.current = view;
                    }}
                    basicSetup={{
                      lineNumbers: true,
                      foldGutter: true,
                      dropCursor: false,
                      drawSelection: true,
                      defaultKeymap: true,
                      allowMultipleSelections: false,
                      indentOnInput: true,
                      bracketMatching: false, // Используем улучшенную версию
                      closeBrackets: true,
                      autocompletion: true,
                      highlightSelectionMatches: true,
                      tabSize: tabSize,
                      indentUnit: useSpaces ? tabSize : 1,
                    }}
                  />
                </div>
              </div>
              <div 
                className="output-resizer-vertical"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsResizingVertical1(true); }}
              />
              <div className="output-container" style={{ flex: `0 0 ${outputHeight1}px`, minHeight: `${outputHeight1}px`, maxHeight: `${outputHeight1}px`, display: 'flex', flexDirection: 'column' }}>
                <div className="output-header">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span className="output-title">
                      {sqlMode ? 'Результат выполнения' : 'Результат выполнения (1)'}
                    </span>
                    <button 
                      className="btn btn-secondary"
                      onClick={clearOutput1}
                      style={{ padding: '2px 8px', fontSize: '11px' }}
                      title="Очистить вывод"
                    >
                      🧹
                    </button>
                  </div>
                </div>
                <div className="output-content">
                  <pre 
                    className="output-text"
                    style={{
                      fontFamily: fontFamily,
                      fontSize: `${fontSize}px`,
                      fontStyle: fontStyle,
                      color: output1 ? fontColor : '#6a6a6a'
                    }}
                  >
                    {output1 || (sqlMode ? 'Результат появится здесь после нажатия «Выполнить» (Ctrl+Enter / F8)' : 'Вывод появится здесь после выполнения кода...')}
                  </pre>
                </div>
              </div>
            </div>
            {/* Разделитель — поверх контента, всегда получает клики */}
            <div 
              ref={splitDividerRef}
              className="split-divider split-divider-overlay"
              style={{
                left: `calc(${splitPaneWidth}% - 8px)`,
                width: 16
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsResizingSplit(true);
              }}
              role="separator"
              aria-orientation="vertical"
              title="Перетащите для изменения ширины окон"
            />
            
            {/* Окно 2 - справа */}
            <div className="split-pane-container" style={{ width: `${100 - splitPaneWidth}%`, flex: '0 0 auto', minWidth: 0 }}>
              {sqlMode ? (
                <div className="editor-container split-pane">
                  <div className="editor-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="editor-title">
                          Схемы  ({sqlDialect === 'sql' ? 'SQL' : sqlDialect === 'postgres' ? 'PostgreSQL' : 'Oracle'})
                        </span>
                        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => sqlDialect === 'sql' && executeCode1()}
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                            title="Выполнить скрипт слева (создать таблицы и заполнить данные)"
                          >
                            📊 Обновить
                          </button>
                          <button
                            className="btn btn-secondary"
                            onClick={() => { if (window.confirm('Сбросить БД? Все таблицы и данные будут удалены.')) resetSqlDb(); }}
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                            title="Удалить все таблицы и начать заново"
                          >
                            🗑️ Сбросить БД
                          </button>
                          <button
                            className={`btn btn-secondary ${sqlViewMode === 'tables' && !sqlTableDataView ? 'active' : ''}`}
                            onClick={() => { setSqlViewMode('tables'); setSqlTableDataView(null); }}
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                            title="Показать схемы таблиц"
                          >
                            📋 Схемы
                          </button>
                          <button
                            className={`btn btn-secondary ${sqlViewMode === 'erd' && !sqlTableDataView ? 'active' : ''}`}
                            onClick={() => { setSqlViewMode('erd'); setSqlTableDataView(null); }}
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                            title="Показать ER диаграмму"
                          >
                            🔷 ER диаграмма
                          </button>
                          {sqlTables.length > 0 && (
                            <>
                              <span style={{ color: '#6a6a6a', fontSize: '11px', marginLeft: '4px' }}>Данные:</span>
                              {sqlTables.map((t) => (
                                <button
                                  key={t.name}
                                  className="btn btn-secondary"
                                  onClick={() => { setSqlViewMode('tables'); loadTableData(t.name); }}
                                  style={{ padding: '2px 8px', fontSize: '11px' }}
                                  title={`Показать содержимое таблицы ${t.name}`}
                                >
                                  {t.name}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="editor-hint"></span>
                    <details style={{ marginTop: '12px', fontSize: '11px', color: '#858585', border: '1px solid #3e3e3e', borderRadius: '4px', padding: '6px 10px', background: '#1e1e1e' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#aaa' }}>Справка по режимам SQL</summary>
                      <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', lineHeight: 1.5 }}>
                        <li><strong>SQL (in-memory)</strong>: одна БД на сессию для всех вкладок — сначала выполните скрипт с CREATE TABLE (в любой вкладке), затем SELECT можно делать в любой вкладке. Нужен: <code>npm install sql.js</code></li>
                        <li><strong>PostgreSQL</strong>: подключение к существующей БД (host, port, user, password, database). Кнопка «Подключение PostgreSQL» выше. Нужен: <code>npm install pg</code></li>
                        <li><strong>Oracle</strong>: подключение по user, password, connectString (например localhost:1521/ORCL). Кнопка «Подключение Oracle». Нужен: <code>npm install oracledb</code> и Oracle Instant Client</li>
                      </ul>
                    </details>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      overflow: 'auto',
                      padding: '8px',
                      background: '#1e1e1e',
                      borderTop: '1px solid #3e3e3e'
                    }}
                  >
                    {sqlTableDataView && (
                      <div style={{ marginBottom: '12px', border: '1px solid #3e3e3e', borderRadius: '4px', background: '#252526', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#2d2d30', borderBottom: '1px solid #3e3e3e' }}>
                          <span style={{ fontWeight: 'bold', color: '#f6e6a9', fontSize: '12px' }}>Данные таблицы: {sqlTableDataView.tableName}</span>
                          <button className="btn btn-secondary" onClick={() => setSqlTableDataView(null)} style={{ padding: '2px 8px', fontSize: '11px' }}>Закрыть</button>
                        </div>
                        <div style={{ overflow: 'auto', maxHeight: '280px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #3e3e3e', background: '#2a2a2a' }}>
                                {(sqlTableDataView.columns || []).map((c, i) => (
                                  <th key={i} style={{ textAlign: 'left', padding: '6px 8px', color: '#f6e6a9', fontWeight: 'bold' }}>{c}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(sqlTableDataView.rows || []).length === 0 ? (
                                <tr><td colSpan={(sqlTableDataView.columns || []).length} style={{ padding: '12px', color: '#858585' }}>(0 строк)</td></tr>
                              ) : (sqlTableDataView.rows || []).map((row, ri) => (
                                <tr key={ri} style={{ borderBottom: '1px solid #2a2a2a' }}>
                                  {(sqlTableDataView.columns || []).map((colName, ci) => {
                                    const val = Array.isArray(row) ? row[ci] : row[colName];
                                    return <td key={ci} style={{ padding: '6px 8px', color: '#d4d4d4', fontFamily: 'monospace' }}>{String(val ?? 'NULL')}</td>;
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {sqlTables.length === 0 ? (
                      <div style={{ color: '#858585', fontSize: '12px' }}>
                        Не найдены операторы <code>CREATE TABLE</code>.<br />
                        Напишите их слева и нажмите «📊 Обновить».
                      </div>
                    ) : sqlTableDataView ? (
                      // Когда показываются данные таблицы - не показываем ни схемы, ни ER диаграмму
                      null
                    ) : sqlViewMode === 'tables' ? (
                      sqlTables.map((table) => (
                        <div
                          key={table.name}
                          style={{
                            border: '1px solid #3e3e3e',
                            borderRadius: '4px',
                            padding: '8px',
                            marginBottom: '12px',
                            background: '#252526'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '8px',
                              paddingBottom: '4px',
                              borderBottom: '1px solid #3e3e3e'
                            }}
                          >
                            <span 
                              style={{ 
                                fontWeight: 'bold', 
                                color: '#f6e6a9', 
                                fontSize: '13px',
                                cursor: 'pointer',
                                textDecoration: 'underline'
                              }}
                              onClick={() => handleTableNameClick(table.name)}
                              title="Кликните, чтобы открыть CREATE TABLE для этой таблицы"
                            >
                              {table.name}
                            </span>
                            <span style={{ fontSize: '11px', color: '#aaaaaa' }}>
                              {table.columns.length} колонок
                            </span>
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #3e3e3e' }}>
                                <th style={{ textAlign: 'left', padding: '4px 8px', color: '#858585', fontWeight: 'bold' }}>Колонка</th>
                                <th style={{ textAlign: 'left', padding: '4px 8px', color: '#858585', fontWeight: 'bold' }}>Тип</th>
                                <th style={{ textAlign: 'center', padding: '4px 8px', color: '#858585', fontWeight: 'bold' }}>PK</th>
                                <th style={{ textAlign: 'center', padding: '4px 8px', color: '#858585', fontWeight: 'bold' }}>NN</th>
                                <th style={{ textAlign: 'center', padding: '4px 8px', color: '#858585', fontWeight: 'bold' }}>UQ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {table.columns.map((col, idx) => (
                                <tr
                                  key={idx}
                                  style={{
                                    borderBottom: idx < table.columns.length - 1 ? '1px solid #2a2a2a' : 'none'
                                  }}
                                >
                                  <td style={{ padding: '4px 8px', color: '#d4d4d4', fontFamily: 'monospace' }}>
                                    {col.name}
                                  </td>
                                  <td style={{ padding: '4px 8px', color: '#f6e6a9', fontFamily: 'monospace' }}>
                                    {col.type}
                                  </td>
                                  <td style={{ textAlign: 'center', padding: '4px 8px', color: col.isPrimaryKey ? '#f6e6a9' : '#555' }}>
                                    {col.isPrimaryKey ? '✓' : ''}
                                  </td>
                                  <td style={{ textAlign: 'center', padding: '4px 8px', color: col.isNotNull ? '#ff7b72' : '#555' }}>
                                    {col.isNotNull ? '✓' : ''}
                                  </td>
                                  <td style={{ textAlign: 'center', padding: '4px 8px', color: col.isUnique ? '#d2a8ff' : '#555' }}>
                                    {col.isUnique ? '✓' : ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))
                    ) : (() => {
                        const TABLE_BOX_W = 300;
                        const TABLE_BOX_H = 180;
                        const padding = 80;
                        const contentWidth = sqlTables.length === 0 ? 800 : Math.max(...sqlTables.map((t, i) => (erdPositions[t.name] || { x: 50 + (i % 3) * 320, y: 50 + Math.floor(i / 3) * 250 }).x + TABLE_BOX_W)) + padding;
                        const contentHeight = sqlTables.length === 0 ? 400 : Math.max(...sqlTables.map((t, i) => (erdPositions[t.name] || { x: 50 + (i % 3) * 320, y: 50 + Math.floor(i / 3) * 250 }).y + TABLE_BOX_H)) + padding;
                        const relations = findTableRelations();
                        return (
                      <div 
                        style={{ 
                          width: '100%',
                          height: '100%',
                          overflow: 'auto',
                          background: '#1e1e1e'
                        }}
                        onMouseMove={(e) => {
                          if (draggingTable) {
                            const scrollEl = e.currentTarget;
                            const contentEl = scrollEl.querySelector('[data-erd-content]');
                            if (!contentEl) return;
                            const rect = contentEl.getBoundingClientRect();
                            const scrollLeft = scrollEl.scrollLeft || 0;
                            const scrollTop = scrollEl.scrollTop || 0;
                            const newX = e.clientX - rect.left - dragOffset.x + scrollLeft;
                            const newY = e.clientY - rect.top - dragOffset.y + scrollTop;
                            setErdPositions(prev => ({
                              ...prev,
                              [draggingTable]: { x: Math.max(0, newX), y: Math.max(0, newY) }
                            }));
                          }
                        }}
                        onMouseUp={() => {
                          setDraggingTable(null);
                          setDragOffset({ x: 0, y: 0 });
                        }}
                      >
                        <div style={{ marginBottom: '8px', color: '#858585', padding: '8px', fontSize: '12px' }}>
                          ER диаграмма — перетаскивайте таблицы; линии соединяют таблицы по колонкам вида <em>таблица_id</em> (например user_id → users).
                        </div>
                        <div
                          data-erd-content
                          style={{
                            position: 'relative',
                            width: contentWidth,
                            height: contentHeight,
                            minWidth: contentWidth,
                            minHeight: contentHeight
                          }}
                        >
                        {/* SVG линий связей — поверх таблиц, в одной системе координат с блоками */}
                        <svg
                          width={contentWidth}
                          height={contentHeight}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            pointerEvents: 'none',
                            zIndex: 10
                          }}
                        >
                          <defs>
                            <marker id="erd-arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                              <polygon points="0 0, 10 3, 0 6" fill="#f6e6a9" />
                            </marker>
                          </defs>
                          {relations.map((rel, idx) => {
                            const fromPos = erdPositions[rel.from];
                            const toPos = erdPositions[rel.to];
                            if (fromPos == null || toPos == null) return null;
                            const cxA = fromPos.x + TABLE_BOX_W / 2;
                            const cyA = fromPos.y + TABLE_BOX_H / 2;
                            const cxB = toPos.x + TABLE_BOX_W / 2;
                            const cyB = toPos.y + TABLE_BOX_H / 2;
                            const intersectSegmentRect = (x1, y1, x2, y2, rx, ry, rw, rh) => {
                              const pts = [];
                              const dx = x2 - x1; const dy = y2 - y1;
                              if (dx !== 0) {
                                const tL = (rx - x1) / dx; const tR = (rx + rw - x1) / dx;
                                [tL, tR].forEach(t => {
                                  if (t >= 0 && t <= 1) {
                                    const y = y1 + t * dy;
                                    if (y >= ry && y <= ry + rh) pts.push({ x: x1 + t * dx, y, t });
                                  }
                                });
                              }
                              if (dy !== 0) {
                                const tT = (ry - y1) / dy; const tB = (ry + rh - y1) / dy;
                                [tT, tB].forEach(t => {
                                  if (t >= 0 && t <= 1) {
                                    const x = x1 + t * dx;
                                    if (x >= rx && x <= rx + rw) pts.push({ x, y: y1 + t * dy, t });
                                  }
                                });
                              }
                              return pts.sort((a, b) => a.t - b.t).map(({ x, y }) => ({ x, y }));
                            };
                            const exitA = intersectSegmentRect(cxA, cyA, cxB, cyB, fromPos.x, fromPos.y, TABLE_BOX_W, TABLE_BOX_H);
                            const enterB = intersectSegmentRect(cxA, cyA, cxB, cyB, toPos.x, toPos.y, TABLE_BOX_W, TABLE_BOX_H);
                            let ptFrom = exitA.length >= 1 ? exitA[exitA.length - 1] : { x: fromPos.x + TABLE_BOX_W, y: cyA };
                            let ptTo = enterB.length >= 1 ? enterB[0] : { x: toPos.x, y: cyB };
                            const dx = ptTo.x - ptFrom.x;
                            const dy = ptTo.y - ptFrom.y;
                            const len = Math.hypot(dx, dy) || 1;
                            // INSET_FROM = 0: линия начинается точно от края таблицы
                            // INSET_TO = 10: линия заканчивается чуть до края таблицы (arrow marker refX=9 компенсирует)
                            const INSET_FROM = 0;
                            const INSET_TO = 10;
                            const totalInset = INSET_FROM + INSET_TO;
                            if (len > totalInset) {
                              const kFrom = INSET_FROM / len;
                              const kTo = INSET_TO / len;
                              ptFrom = { x: ptFrom.x + dx * kFrom, y: ptFrom.y + dy * kFrom };
                              ptTo = { x: ptTo.x - dx * kTo, y: ptTo.y - dy * kTo };
                            }
                            return (
                              <line
                                key={`${rel.from}-${rel.to}-${rel.column}-${idx}`}
                                x1={ptFrom.x}
                                y1={ptFrom.y}
                                x2={ptTo.x}
                                y2={ptTo.y}
                                stroke="#f6e6a9"
                                strokeWidth="2"
                                markerEnd="url(#erd-arrowhead)"
                              />
                            );
                          })}
                        </svg>
                        {/* Таблицы */}
                        {sqlTables.map((table, tableIdx) => {
                          const pos = erdPositions[table.name] || { x: 50 + (tableIdx % 3) * 320, y: 50 + Math.floor(tableIdx / 3) * 250 };
                          return (
                            <div
                              key={table.name}
                              style={{
                                border: '2px solid #f6e6a9',
                                borderRadius: '6px',
                                padding: '12px',
                                background: '#252526',
                                position: 'absolute',
                                left: `${pos.x}px`,
                                top: `${pos.y}px`,
                                width: '300px',
                                cursor: draggingTable === table.name ? 'grabbing' : 'grab',
                                zIndex: 2,
                                userSelect: 'none'
                              }}
                              onMouseDown={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const container = e.currentTarget.parentElement;
                                const containerRect = container.getBoundingClientRect();
                                setDraggingTable(table.name);
                                setDragOffset({
                                  x: e.clientX - rect.left,
                                  y: e.clientY - rect.top
                                });
                                e.preventDefault();
                              }}
                            >
                              <div
                              style={{
                                fontWeight: 'bold',
                                color: '#f6e6a9',
                                fontSize: '14px',
                                marginBottom: '8px',
                                paddingBottom: '4px',
                                borderBottom: '1px solid #3e3e3e',
                                cursor: 'pointer',
                                textDecoration: 'underline'
                              }}
                              onClick={() => handleTableNameClick(table.name)}
                              title="Кликните, чтобы открыть CREATE TABLE для этой таблицы"
                            >
                              {table.name}
                            </div>
                              {table.columns.map((col, colIdx) => (
                                <div
                                  key={colIdx}
                                  style={{
                                    padding: '4px 0',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    color: '#d4d4d4',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                  }}
                                >
                                  <span style={{ color: col.isPrimaryKey ? '#f6e6a9' : col.isNotNull ? '#ff7b72' : '#d4d4d4' }}>
                                    {col.isPrimaryKey ? '🔑' : col.isNotNull ? '⚠' : '○'}
                                  </span>
                                  <span style={{ fontWeight: col.isPrimaryKey ? 'bold' : 'normal' }}>
                                    {col.name}
                                  </span>
                                  <span style={{ color: '#f6e6a9' }}>: {col.type}</span>
                                  {col.isUnique && <span style={{ color: '#d2a8ff', fontSize: '10px' }}>[UNIQUE]</span>}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                        </div>
                      </div>
                        );
                      })()}
                  </div>
                </div>
              ) : (
                <>
                  <div className="editor-container split-pane">
                    <div className="editor-header">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="editor-title">Редактор кода (2)</span>
                          <select
                            className="language-select"
                            value={language2}
                            onChange={(e) => {
                              const newLang = e.target.value;
                              setLanguage2(newLang);
                              // Обновляем язык активной вкладки
                              setTabs2(prev => prev.map(tab => 
                                tab.id === activeTab2 ? { ...tab, language: newLang } : tab
                              ));
                            }}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                          >
                            <option value="text">Text</option>
                            <option value="javascript">JavaScript</option>
                            <option value="typescript">TypeScript</option>
                            <option value="python">Python</option>
                            <option value="java">Java</option>
                            <option value="cpp">C++</option>
                            <option value="html">HTML</option>
                            <option value="css">CSS</option>
                            <option value="go">Go</option>
                          </select>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              createNewTab2();
                            }}
                            style={{
                              background: 'transparent',
                              border: '1px solid #3e3e3e',
                              color: '#d4d4d4',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              fontSize: '11px',
                              borderRadius: '4px'
                            }}
                            title="Создать новую вкладку (Ctrl+T)"
                          >
                            ➕ Вкладка
                          </button>
                          {tabs2.length > 1 && (
                            <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', flexWrap: 'wrap' }}>
                              {tabs2.map(tab => (
                                <button
                                  key={tab.id}
                                  onClick={() => switchTab2(tab.id)}
                                  style={{
                                    background: activeTab2 === tab.id ? '#4C5866' : 'transparent',
                                    border: '1px solid #3e3e3e',
                                    color: activeTab2 === tab.id ? '#ffffff' : '#d4d4d4',
                                    cursor: 'pointer',
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    borderRadius: '4px'
                                  }}
                                  title={tab.name}
                                >
                                  {tab.name}
                                  {tabs2.length > 1 && (
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        closeTab2(tab.id);
                                      }}
                                      style={{ marginLeft: '4px', cursor: 'pointer' }}
                                    >
                                      ×
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button 
                            className="btn btn-secondary"
                            onClick={clearCode2}
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            title="Очистить код (с подтверждением)"
                          >
                            🗑️ Очистить
                          </button>
                          <button 
                            className={`btn btn-primary ${isRunning2 ? 'running' : ''}`}
                            onClick={executeCode2}
                            disabled={isRunning2}
                            style={{ padding: '4px 12px', fontSize: '12px' }}
                            title="Выполнить код (Ctrl+Enter или F8)"
                          >
                            {isRunning2 ? '⏳ Выполнение...' : '▶️ Выполнить'}
                          </button>
                        </div>
                      </div>
                      <span className="editor-hint"></span>
                    </div>
                    <div 
                      className="codemirror-wrapper" 
                      style={{
                        '--editor-font-family': fontFamily,
                        '--editor-font-size': `${fontSize}px`,
                        '--editor-font-style': fontStyle,
                        '--editor-font-color': fontColor,
                      }}
                    >
                      <CodeMirror
                        ref={editorRef2}
                        value={code2}
                        theme={[getCurrentTheme(), customTheme]}
                        editable={true}
                        extensions={[
                          getLanguageExtension2(), 
                          customHighlightStyle,
                          smartAutocomplete,
                          tabExtension,
                          clickToDeselectExtension,
                          ...indentExtension,
                          ...enhancedBracketMatching,
                          ...minimapExtension,
                          keymap.of([
                            { key: 'Mod-a', run: selectAll },
                            {
                              key: 'Mod-l',
                              run: (view) => {
                                const selection = view.state.selection.main;
                                const line = view.state.doc.lineAt(selection.from);
                                const text = line.text;
                                // Удаляем все лишние пробелы в строке, сохраняя только отступ
                                const indent = text.match(/^\s*/)?.[0] || '';
                                // Удаляем все пробелы между словами, оставляя только один
                                const trimmed = text.trim().replace(/\s+/g, ' ');
                                view.dispatch({
                                  changes: {
                                    from: line.from,
                                    to: line.to,
                                    insert: indent + trimmed
                                  }
                                });
                                return true;
                              }
                            },
                            {
                              key: 'F8',
                              run: () => {
                                if (!isRunning2 && code2.trim()) {
                                  executeCode2();
                                }
                                return true;
                              }
                            },
                            {
                              key: 'Alt-f8',
                              run: () => {
                                if (!isRunning2 && code2.trim()) {
                                  executeCode2();
                                }
                                return true;
                              }
                            },
                            {
                              key: 'Mod-Enter',
                              run: () => {
                                if (!isRunning2 && code2.trim()) {
                                  executeCode2();
                                }
                                return true;
                              }
                            },
                            {
                              key: 'Ctrl-Alt-l',
                              run: () => {
                                const formatted = formatCodeForLanguage(code2, language2);
                                if (formatted !== code2) {
                                  setCode2(formatted);
                                }
                                return true;
                              }
                            },
                            {
                              key: 'Mod-/',
                              run: (view) => {
                                toggleComment(view);
                                return true;
                              }
                            },
                            {
                              key: 'Mod-d',
                              run: (view) => {
                                return duplicateLine(view);
                              }
                            },
                            {
                              key: 'Mod-t',
                              run: () => {
                                createNewTab2();
                                return true;
                              }
                            }
                          ])
                        ]}
                        onChange={(value) => setCode2(value)}
                        onCreateEditor={(view) => {
                          editorViewRef2.current = view;
                        }}
                        basicSetup={{
                          lineNumbers: true,
                          foldGutter: true,
                          dropCursor: false,
                          drawSelection: true,
                          defaultKeymap: true,
                          allowMultipleSelections: false,
                          indentOnInput: true,
                          bracketMatching: false, // Используем улучшенную версию
                          closeBrackets: true,
                          autocompletion: true,
                          highlightSelectionMatches: true,
                          tabSize: tabSize,
                          indentUnit: useSpaces ? tabSize : 1,
                        }}
                      />
                    </div>
                  </div>
                  <div 
                    className="output-resizer-vertical"
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsResizingVertical2(true); }}
                  />
                  <div className="output-container" style={{ flex: `0 0 ${outputHeight2}px`, minHeight: `${outputHeight2}px`, maxHeight: `${outputHeight2}px`, display: 'flex', flexDirection: 'column' }}>
                    <div className="output-header">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span className="output-title">Результат выполнения (2)</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {/* <button 
                            className="btn btn-secondary"
                            onClick={clearCode2}
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                            title="Очистить код"
                          >
                          </button> */}
                          <button 
                            className="btn btn-secondary"
                            onClick={clearOutput2}
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                            title="Очистить вывод"
                          >
                            🧹
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="output-content">
                      <pre 
                        className="output-text"
                        style={{
                      fontFamily: fontFamily,
                      fontSize: `${fontSize}px`,
                      fontStyle: fontStyle,
                      color: output2 ? fontColor : '#6a6a6a'
                    }}
                  >
                    {output2 || 'Вывод появится здесь после выполнения кода...'}
                      </pre>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="editor-container">
              <div className="editor-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="editor-title">Редактор кода</span>
                    <button 
                      className="btn btn-secondary"
                      onClick={clearCode}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      title="Очистить код (с подтверждением)"
                    >
                      🗑️ Очистить
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        createNewTab();
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid #3e3e3e',
                        color: '#d4d4d4',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        fontSize: '11px',
                        borderRadius: '4px'
                      }}
                      title="Создать новую вкладку (Ctrl+T)"
                    >
                      ➕ Вкладка
                    </button>
                    {tabs.length > 1 && (
                      <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', flexWrap: 'wrap' }}>
                        {tabs.map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => switchTab(tab.id)}
                            style={{
                              background: activeTab === tab.id ? '#4C5866' : 'transparent',
                              border: '1px solid #3e3e3e',
                              color: activeTab === tab.id ? '#ffffff' : '#d4d4d4',
                              cursor: 'pointer',
                              padding: '2px 8px',
                              fontSize: '11px',
                              borderRadius: '4px'
                            }}
                            title={tab.name}
                          >
                            {tab.name}
                            {tabs.length > 1 && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  closeTab(tab.id);
                                }}
                                style={{ marginLeft: '4px', cursor: 'pointer' }}
                              >
                                ×
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="editor-hint"></span>
                </div>
              </div>
              <div 
                className="codemirror-wrapper" 
                ref={editorRef}
                style={{
                  '--editor-font-family': fontFamily,
                  '--editor-font-size': `${fontSize}px`,
                  '--editor-font-style': fontStyle,
                  '--editor-font-color': fontColor,
                }}
              >
                <CodeMirror
                  value={code}
                  theme={[getCurrentTheme(), customTheme]}
                  editable={true}
                  extensions={[
                    getLanguageExtension(), 
                    customHighlightStyle,
                    smartAutocomplete,
                    tabExtension,
                    clickToDeselectExtension,
                    ...indentExtension,
                    ...enhancedBracketMatching,
                    ...minimapExtension,
                    ...errorHighlightExtension,
                    keymap.of([
                      { key: 'Mod-a', run: selectAll },
                      {
                        key: 'Mod-l',
                        run: (view) => {
                          const selection = view.state.selection.main;
                          const line = view.state.doc.lineAt(selection.from);
                          const text = line.text;
                          // Удаляем все лишние пробелы в строке, сохраняя только отступ
                          const indent = text.match(/^\s*/)?.[0] || '';
                          // Удаляем все пробелы между словами, оставляя только один
                          const trimmed = text.trim().replace(/\s+/g, ' ');
                          view.dispatch({
                            changes: {
                              from: line.from,
                              to: line.to,
                              insert: indent + trimmed
                            }
                          });
                          return true;
                        }
                      },
                      {
                        key: 'F8',
                        run: () => {
                          if (!isRunning && code.trim()) {
                            executeCode();
                          }
                          return true;
                        }
                      },
                      {
                        key: 'Alt-f8',
                        run: () => {
                          if (!isRunning && code.trim()) {
                            executeCode();
                          }
                          return true;
                        }
                      },
                      {
                        key: 'Mod-Enter',
                        run: () => {
                          if (!isRunning && code.trim()) {
                            executeCode();
                          }
                          return true;
                        }
                      },
                      {
                        key: 'Ctrl-Alt-l',
                        run: () => {
                          const formatted = formatCodeForLanguage(code, language);
                          if (formatted !== code) {
                            setCode(formatted);
                          }
                          return true;
                        }
                      },
                      {
                        key: 'Mod-/',
                        run: (view) => {
                          toggleComment(view);
                          return true;
                        }
                      },
                      {
                        key: 'Mod-d',
                        run: (view) => {
                          return duplicateLine(view);
                        }
                      },
                      {
                        key: 'Mod-t',
                        run: () => {
                          createNewTab();
                          return true;
                        }
                      }
                    ])
                  ]}
                  onChange={(value) => setCode(value)}
                  onCreateEditor={(view) => {
                    editorViewRef.current = view;
                  }}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    dropCursor: false,
                    drawSelection: true,
                    defaultKeymap: true,
                    allowMultipleSelections: false,
                    indentOnInput: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    autocompletion: true,
                    highlightSelectionMatches: true,
                  }}
                />
              </div>
            </div>
            <div 
              className="output-resizer"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsResizing(true); }}
            />
            <div className="output-container" style={{ width: `${outputWidth}px` }}>
              <div className="output-header">
                <span className="output-title">Результат выполнения</span>
              </div>
              <div className="output-content">
                <pre 
                  className="output-text"
                  style={{
                    fontFamily: fontFamily,
                    fontSize: `${fontSize}px`,
                    fontStyle: fontStyle,
                    color: output ? fontColor : '#6a6a6a'
                  }}
                >
                  {output || 'Вывод появится здесь после выполнения кода...'}
                </pre>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Модальное окно выбора окна */}
      {showWindowChoiceModal && (
        <div className="modal-overlay" onClick={() => setShowWindowChoiceModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Выберите окно для отображения</h3>
            <p>В обоих окнах разный код. Какое окно вы хотите сохранить?</p>
            <div className="modal-buttons">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setCode(code1);
                  setOutput(output1);
                  setCode1('');
                  setCode2('');
                  setOutput1('');
                  setOutput2('');
                  setSplitView(false);
                  setShowWindowChoiceModal(false);
                }}
              >
                Окно 1 (слева)
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setCode(code2);
                  setOutput(output2);
                  setCode1('');
                  setCode2('');
                  setOutput1('');
                  setOutput2('');
                  setSplitView(false);
                  setShowWindowChoiceModal(false);
                }}
              >
                Окно 2 (справа)
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowWindowChoiceModal(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно разделения вкладок */}
      {showTabSplitModal && (
        <div className="modal-overlay" onClick={() => setShowTabSplitModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', width: '90%' }}>
            <h3>Разделить вкладки между окнами</h3>
            <p>Выберите, какие вкладки поместить в каждое окно (можно выбрать одни и те же вкладки в оба окна):</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
              <div>
                <h4 style={{ marginTop: 0, marginBottom: '10px', color: '#d4d4d4' }}>Окно 1 (слева):</h4>
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #3e3e3e', borderRadius: '4px', padding: '8px', background: '#1e1e1e' }}>
                  {tabs.map((tab, index) => (
                    <label key={`tab1-${tab.id}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        defaultChecked={index < Math.ceil(tabs.length / 2)}
                        data-tab-id={tab.id}
                        data-window="1"
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ color: '#d4d4d4' }}>{tab.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h4 style={{ marginTop: 0, marginBottom: '10px', color: '#d4d4d4' }}>Окно 2 (справа):</h4>
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #3e3e3e', borderRadius: '4px', padding: '8px', background: '#1e1e1e' }}>
                  {tabs.map((tab, index) => (
                    <label key={`tab2-${tab.id}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        defaultChecked={index >= Math.ceil(tabs.length / 2)}
                        data-tab-id={tab.id}
                        data-window="2"
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ color: '#d4d4d4' }}>{tab.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-buttons" style={{ marginTop: '20px' }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const checkboxes1 = Array.from(document.querySelectorAll('[data-window="1"]:checked'));
                  const checkboxes2 = Array.from(document.querySelectorAll('[data-window="2"]:checked'));
                  const tabs1Selected = checkboxes1.map(cb => {
                    const tabId = cb.getAttribute('data-tab-id');
                    const tab = tabs.find(t => t.id === tabId);
                    return tab ? { ...tab, id: `tab1-${Date.now()}-${tabId}` } : null;
                  }).filter(Boolean);
                  const tabs2Selected = checkboxes2.map(cb => {
                    const tabId = cb.getAttribute('data-tab-id');
                    const tab = tabs.find(t => t.id === tabId);
                    return tab ? { ...tab, id: `tab2-${Date.now()}-${tabId}` } : null;
                  }).filter(Boolean);
                  if (tabs1Selected.length === 0) {
                    tabs1Selected.push({ id: 'tab1-1', name: 'Вкладка 1', code: '', output: '', language: language });
                  }
                  if (tabs2Selected.length === 0) {
                    tabs2Selected.push({ id: 'tab2-1', name: 'Вкладка 1', code: '', output: '', language: language });
                  }
                  setTabs1(tabs1Selected);
                  setTabs2(tabs2Selected);
                  setActiveTab1(tabs1Selected[0].id);
                  setActiveTab2(tabs2Selected[0].id);
                  setCode1(tabs1Selected[0].code);
                  setCode2(tabs2Selected[0].code);
                  setOutput1(tabs1Selected[0].output);
                  setOutput2(tabs2Selected[0].output);
                  setSplitView(true);
                  setShowTabSplitModal(false);
                }}
              >
                Разделить
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowTabSplitModal(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Мини-окно CREATE TABLE при клике на имя таблицы справа (код в редакторе не меняется) */}
      {createTableModalTableName && (() => {
        const table = sqlTables.find(t => t.name === createTableModalTableName);
        const createTableSql = table ? generateCreateTable(table) : '';
        return (
          <div className="modal-overlay" onClick={() => setCreateTableModalTableName(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#d4d4d4' }}>CREATE TABLE «{createTableModalTableName}»</h3>
              <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#858585' }}>Запрос на создание таблицы</p>
              <pre
                style={{
                  flex: 1,
                  overflow: 'auto',
                  margin: 0,
                  padding: '12px',
                  background: '#1e1e1e',
                  border: '1px solid #3e3e3e',
                  borderRadius: '4px',
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: '13px',
                  color: '#d4d4d4',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {createTableSql || '—'}
              </pre>
              <div className="modal-buttons" style={{ marginTop: '12px' }}>
                <button className="btn btn-primary" onClick={() => setCreateTableModalTableName(null)}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default App;
