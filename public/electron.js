const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const os = require('os');

// Пробуем использовать iconv-lite для поддержки всех кодировок
let iconv;
try {
  iconv = require('iconv-lite');
} catch (e) {
  // iconv-lite не установлен, будем использовать встроенные кодировки
  iconv = null;
}

// Определяем режим разработки без внешней зависимости
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

// Путь к файлу логов
const logPath = path.join(app.getPath('userData'), 'logs', 'app.log');
const logDir = path.dirname(logPath);

// Создаем директорию для логов, если её нет
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Функция для записи логов
function writeLog(level, message, error = null) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}\n`;
  
  if (error) {
    const errorDetails = `  Error: ${error.message}\n  Stack: ${error.stack}\n`;
    fs.appendFileSync(logPath, logEntry + errorDetails, 'utf8');
  } else {
    fs.appendFileSync(logPath, logEntry, 'utf8');
  }
  
  // Также выводим в консоль в режиме разработки
  if (isDev) {
    console.log(logEntry.trim());
    if (error) {
      console.error(error);
    }
  }
}

// Перехватываем необработанные ошибки
process.on('uncaughtException', (error) => {
  writeLog('ERROR', 'Uncaught Exception', error);
});

process.on('unhandledRejection', (reason, promise) => {
  writeLog('ERROR', 'Unhandled Rejection', reason instanceof Error ? reason : new Error(String(reason)));
});

let mainWindow;

function createWindow() {
  try {
    writeLog('INFO', 'Creating main window...');
    
    // Путь к иконке
    let iconPath;
    if (isDev) {
      iconPath = path.join(__dirname, '..', 'icon.ico');
    } else {
      // В production иконка должна быть в build/ или рядом с electron.js
      iconPath = path.join(__dirname, '..', 'icon.ico');
      if (!fs.existsSync(iconPath)) {
        iconPath = path.join(process.resourcesPath, '..', 'icon.ico');
      }
    }
    const iconExists = fs.existsSync(iconPath);
    if (iconExists) {
      writeLog('INFO', `Иконка найдена: ${iconPath}`);
    } else {
      writeLog('WARN', `Иконка не найдена. Проверьте путь: ${iconPath}`);
    }
    
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#1e1e1e',
      icon: iconExists ? iconPath : undefined,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      },
      frame: true,
      titleBarStyle: 'default'
    });

    // Определяем URL для загрузки
    let startUrl;
    if (isDev) {
      startUrl = 'http://localhost:3000';
      writeLog('INFO', 'Running in development mode');
    } else {
      // В production используем собранный build
      // app.getAppPath() возвращает путь к приложению (работает и в asar, и без него)
      const appPath = app.getAppPath();
      writeLog('INFO', `App path: ${appPath}`);
      writeLog('INFO', `__dirname: ${__dirname}`);
      
      // Пробуем разные пути к index.html
      // В упакованном приложении electron.js находится в build/, и index.html тоже в build/
      const possiblePaths = [
        path.join(__dirname, 'index.html'),                  // Если electron.js в build/ (основной путь)
        path.join(appPath, 'index.html'),                    // Альтернативный путь
        path.join(__dirname, '..', 'build', 'index.html'),   // Если electron.js в public
        path.join(process.resourcesPath, 'app', 'build', 'index.html'), // Альтернативный
      ];
      
      let foundPath = null;
      for (const indexPath of possiblePaths) {
        writeLog('INFO', `Checking path: ${indexPath}`);
        if (fs.existsSync(indexPath)) {
          foundPath = indexPath;
          writeLog('INFO', `Found index.html at: ${indexPath}`);
          break;
        }
      }
      
      if (foundPath) {
        // Нормализуем путь для file:// протокола (заменяем обратные слеши на прямые)
        startUrl = `file://${foundPath.replace(/\\/g, '/')}`;
        writeLog('INFO', `Loading URL: ${startUrl}`);
      } else {
        writeLog('ERROR', 'Index.html not found in any of the checked paths');
        // Показываем ошибку пользователю
        startUrl = 'about:blank';
      }
    }
    
    if (startUrl !== 'about:blank') {
      mainWindow.loadURL(startUrl).then(() => {
        writeLog('INFO', 'URL loaded successfully');
      }).catch((error) => {
        writeLog('ERROR', 'Failed to load URL', error);
      });
      
      // Логируем события загрузки
      mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        writeLog('ERROR', `Failed to load: ${errorCode} - ${errorDescription} - ${validatedURL}`);
      });
      
      mainWindow.webContents.on('did-finish-load', () => {
        writeLog('INFO', 'Page finished loading');
        // Проверяем, загрузился ли React
        mainWindow.webContents.executeJavaScript(`
          setTimeout(() => {
            const root = document.getElementById('root');
            if (!root || root.innerHTML.trim() === '') {
              console.error('React app not loaded!');
            }
          }, 1000);
        `);
      });
    } else {
      // Если файл не найден, показываем сообщение об ошибке
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Ошибка загрузки</title>
          <style>
            body {
              background: #1e1e1e;
              color: #d4d4d4;
              font-family: Arial, sans-serif;
              padding: 40px;
              text-align: center;
            }
            h1 { color: #ff6b6b; }
            p { margin: 20px 0; }
            code {
              background: #2d2d30;
              padding: 2px 6px;
              border-radius: 3px;
            }
          </style>
        </head>
        <body>
          <h1>⚠️ Ошибка загрузки приложения</h1>
          <p>Не удалось найти файлы приложения.</p>
          <p>Проверьте файл логов:</p>
          <p><code>${logPath}</code></p>
          <p style="margin-top: 40px; color: #858585; font-size: 14px;">
            Пересоберите приложение командой:<br>
            <code style="display: block; margin-top: 10px;">npm run electron-pack-win</code>
          </p>
        </body>
        </html>
      `));
    }

    // Открываем DevTools для отладки
    mainWindow.webContents.openDevTools();

    // Логируем события окна
    mainWindow.on('closed', () => {
      writeLog('INFO', 'Main window closed');
      mainWindow = null;
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      writeLog('ERROR', `Failed to load page: ${errorCode} - ${errorDescription}`);
    });

    mainWindow.webContents.on('crashed', () => {
      writeLog('ERROR', 'Renderer process crashed');
    });

    writeLog('INFO', 'Main window created successfully');
  } catch (error) {
    writeLog('ERROR', 'Error creating window', error);
  }
}

app.whenReady().then(() => {
  writeLog('INFO', 'Application ready');
  writeLog('INFO', `App version: ${app.getVersion()}`);
  writeLog('INFO', `User data path: ${app.getPath('userData')}`);
  writeLog('INFO', `Log file: ${logPath}`);
  createWindow();
}).catch((error) => {
  writeLog('ERROR', 'Error in app.whenReady', error);
});

app.on('window-all-closed', () => {
  writeLog('INFO', 'All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  writeLog('INFO', 'Application activated');
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('will-quit', () => {
  writeLog('INFO', 'Application quitting');
});

// Обработка ошибок при запуске
app.on('ready', () => {
  writeLog('INFO', 'App ready event fired');
});

app.on('before-quit', () => {
  writeLog('INFO', 'Application before quit');
});

// IPC обработчики для выполнения кода
const tempDir = path.join(os.tmpdir(), 'modern-notepad');

// Создаем временную директорию
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Выполнение Python
ipcMain.handle('execute-python', async (event, code) => {
  return new Promise((resolve) => {
    const tempFile = path.join(tempDir, `temp_${Date.now()}.py`);
    fs.writeFileSync(tempFile, code, 'utf8');
    
    // Таймаут для выполнения (30 секунд)
    const timeout = setTimeout(() => {
      try {
        python.kill();
        fs.unlinkSync(tempFile);
      } catch (e) {}
      resolve({
        error: 'Таймаут выполнения: код выполняется слишком долго (более 30 секунд).'
      });
    }, 30000);
    
    const python = spawn('python', ['-u', tempFile], {
      encoding: 'utf8'
    });
    let output = '';
    let error = '';
    
    python.stdout.setEncoding('utf8');
    python.stderr.setEncoding('utf8');
    
    python.stdout.on('data', (data) => {
      output += data.toString('utf8');
    });
    
    python.stderr.on('data', (data) => {
      error += data.toString('utf8');
    });
    
    python.on('close', (code) => {
      clearTimeout(timeout);
      fs.unlinkSync(tempFile);
      resolve({
        output: output || error,
        exitCode: code
      });
    });
    
    python.on('error', (err) => {
      clearTimeout(timeout);
      fs.unlinkSync(tempFile);
      resolve({
        error: `Ошибка запуска Python: ${err.message}\n\nУбедитесь, что Python установлен и доступен в PATH.`
      });
    });
  });
});

// Выполнение Java
ipcMain.handle('execute-java', async (event, code) => {
  return new Promise((resolve, reject) => {
    // Добавляем общий обработчик ошибок для гарантии разрешения Promise
    const safeResolve = (result) => {
      try {
        resolve(result);
      } catch (e) {
        writeLog('ERROR', `Ошибка при resolve: ${e.message}`);
        try {
          resolve({ error: `Ошибка обработки результата: ${e.message}` });
        } catch (e2) {
          // Если даже это не работает, просто логируем
          writeLog('ERROR', `Критическая ошибка при resolve: ${e2.message}`);
        }
      }
    };
    
    // Обработка ошибок на верхнем уровне
    process.once('uncaughtException', (error) => {
      writeLog('ERROR', `Необработанная ошибка в execute-java: ${error.message}`);
      safeResolve({ error: `Критическая ошибка: ${error.message}` });
    });
    
    try {
      // Проверяем наличие package в коде
      const packageMatch = code.match(/package\s+([\w.]+)\s*;/);
      const packageName = packageMatch ? packageMatch[1] : null;
      
      // Извлекаем имя класса из кода (ищем public class)
      let classMatch = code.match(/public\s+class\s+(\w+)/);
    // Если не нашли public class, ищем просто class
    if (!classMatch) {
      classMatch = code.match(/class\s+(\w+)/);
    }
    const className = classMatch ? classMatch[1] : 'Main';
    
    // Если есть package, создаем структуру директорий
    let javaFileDir = tempDir;
    let javaFileName = `${className}.java`;
    if (packageName) {
      const packagePath = packageName.replace(/\./g, path.sep);
      javaFileDir = path.join(tempDir, packagePath);
      if (!fs.existsSync(javaFileDir)) {
        fs.mkdirSync(javaFileDir, { recursive: true });
      }
    }
    
    const tempFile = path.join(javaFileDir, javaFileName);
    
    fs.writeFileSync(tempFile, code, 'utf8');
    
    // Компилируем с правильной кодировкой
    const compileEnv = { ...process.env };
    compileEnv.JAVA_TOOL_OPTIONS = '-Dfile.encoding=UTF-8';
    compileEnv._JAVA_OPTIONS = '-Dfile.encoding=UTF-8';
    
    // Компилируем Java файл в tempDir (создаст структуру пакетов если нужно)
    // Важно: используем абсолютные пути
    const tempDirAbsolute = path.resolve(tempDir);
    const tempFileAbsolute = path.resolve(tempFile);
    writeLog('INFO', `Компиляция Java: файл=${tempFileAbsolute}, выходная директория=${tempDirAbsolute}, класс=${className}, package=${packageName || 'нет'}`);
    writeLog('INFO', `Путь к логам: ${logPath}`);
    // Компилируем с явным указанием исходного файла
    const compileCmd = `javac -encoding UTF-8 -d "${tempDirAbsolute}" "${tempFileAbsolute}"`;
    writeLog('INFO', `Команда компиляции: ${compileCmd}`);
    writeLog('INFO', `Проверка перед компиляцией: исходный файл существует=${fs.existsSync(tempFileAbsolute)}`);
    exec(compileCmd, { env: compileEnv, encoding: 'utf8', cwd: tempDirAbsolute }, (compileError, compileStdout, compileStderr) => {
      // Проверяем наличие ошибок компиляции
      let errorMsg = '';
      if (compileStderr) {
        try {
          if (Buffer.isBuffer(compileStderr)) {
            errorMsg = compileStderr.toString('utf8');
          } else {
            errorMsg = String(compileStderr);
          }
        } catch (e) {
          try {
            if (Buffer.isBuffer(compileStderr)) {
              errorMsg = compileStderr.toString('cp866');
            } else {
              errorMsg = String(compileStderr);
            }
          } catch (e2) {
            errorMsg = String(compileStderr);
          }
        }
      }
      
      // Проверяем stdout на наличие ошибок (javac иногда выводит ошибки в stdout)
      let stdoutMsg = '';
      if (compileStdout) {
        try {
          if (Buffer.isBuffer(compileStdout)) {
            stdoutMsg = compileStdout.toString('utf8');
          } else {
            stdoutMsg = String(compileStdout);
          }
        } catch (e) {
          stdoutMsg = String(compileStdout);
        }
      }
      
      // Очищаем сообщения от предупреждений "Picked up"
      const cleanErrorMsg = errorMsg.replace(/Picked up.*\n/g, '').trim();
      const cleanStdoutMsg = stdoutMsg.replace(/Picked up.*\n/g, '').trim();
      
      // Если есть ошибка компиляции или stderr/stdout содержит ошибки (кроме "Picked up")
      const hasErrors = compileError || 
        (cleanErrorMsg && cleanErrorMsg.length > 0 && !cleanErrorMsg.match(/^Picked up/i)) ||
        (cleanStdoutMsg && cleanStdoutMsg.length > 0 && (cleanStdoutMsg.includes('error:') || cleanStdoutMsg.includes('Error:')));
      
      if (hasErrors) {
        const finalError = cleanErrorMsg || cleanStdoutMsg || compileError?.message || 'Неизвестная ошибка';
        writeLog('ERROR', `Ошибка компиляции: ${compileError ? compileError.message : 'stderr/stdout содержит ошибки'}, stderr=${cleanErrorMsg}, stdout=${cleanStdoutMsg}`);
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        resolve({
          error: `Ошибка компиляции:\n${finalError}\n\nУбедитесь, что:\n1. JDK установлен и доступен в PATH\n2. Код синтаксически корректен\n3. Класс объявлен как public class ${className}`
        });
        return;
      }
      
      // Проверяем, что исходный файл существует
      if (!fs.existsSync(tempFileAbsolute)) {
        writeLog('ERROR', `Исходный файл не найден после записи: ${tempFileAbsolute}`);
        resolve({
          error: `Исходный файл не найден: ${tempFileAbsolute}`
        });
        return;
      }
      
      // Логируем успешную компиляцию
      writeLog('INFO', `Компиляция завершена (exitCode=${compileError ? compileError.code : 0}). Проверяем наличие класса...`);
      
      // Сразу проверяем, что исходный файл существует и читаем его для отладки
      if (!fs.existsSync(tempFileAbsolute)) {
        writeLog('ERROR', `Исходный файл не найден: ${tempFileAbsolute}`);
        resolve({
          error: `Исходный файл не найден: ${tempFileAbsolute}`
        });
        return;
      }
      
      // Проверяем содержимое исходного файла
      const sourceContent = fs.readFileSync(tempFileAbsolute, 'utf8');
      const hasClass = sourceContent.includes(`class ${className}`) || sourceContent.includes(`public class ${className}`);
      writeLog('INFO', `Исходный файл существует, содержит класс ${className}: ${hasClass}`);
      
      // Ждем немного, чтобы файл точно был создан, затем проверяем и запускаем
      try {
        setTimeout(() => {
          try {
            // Определяем путь к скомпилированному классу
            // Используем абсолютные пути
            const tempDirAbsolute = path.resolve(tempDir);
        let classFile;
        let classDir = tempDirAbsolute; // Всегда используем tempDirAbsolute как classpath
        let fullClassName = className;
        
        if (packageName) {
          // Если есть package, класс будет в подпапке
          const packagePath = packageName.replace(/\./g, path.sep);
          classFile = path.join(tempDirAbsolute, packagePath, `${className}.class`);
          fullClassName = `${packageName}.${className}`;
          // classDir остается tempDirAbsolute - это корень пакетов
        } else {
          // Если нет package, класс в корне tempDir
          classFile = path.join(tempDirAbsolute, `${className}.class`);
          // classDir остается tempDirAbsolute
        }
        
        // Рекурсивно ищем все .class файлы для отладки
        const findAllClassFiles = (dir, fileList = []) => {
          try {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
              const filePath = path.join(dir, file);
              try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                  findAllClassFiles(filePath, fileList);
                } else if (file.endsWith('.class')) {
                  fileList.push(filePath);
                }
              } catch (e) {
                // Игнорируем ошибки
              }
            });
          } catch (e) {
            // Игнорируем ошибки
          }
          return fileList;
        };
        
        const allClassFiles = findAllClassFiles(tempDirAbsolute);
        
        // Также проверяем все файлы в директории для отладки
        let allFiles = [];
        try {
          const listFiles = (dir, fileList = []) => {
            try {
              const files = fs.readdirSync(dir);
              files.forEach(file => {
                const filePath = path.join(dir, file);
                try {
                  const stat = fs.statSync(filePath);
                  if (stat.isDirectory()) {
                    listFiles(filePath, fileList);
                  } else {
                    fileList.push(filePath);
                  }
                } catch (e) {}
              });
            } catch (e) {}
            return fileList;
          };
          allFiles = listFiles(tempDirAbsolute);
        } catch (e) {
          writeLog('ERROR', `Ошибка при чтении директории: ${e.message}`);
        }
        
        writeLog('INFO', `Проверка класса: ожидаемый файл=${classFile}, существует=${fs.existsSync(classFile)}, найдено .class файлов=${allClassFiles.length}, всего файлов=${allFiles.length}`);
        if (allClassFiles.length > 0) {
          writeLog('INFO', `Найденные .class файлы: ${allClassFiles.map(f => path.relative(tempDirAbsolute, f)).join(', ')}`);
        }
        if (allFiles.length > 0 && allFiles.length < 20) {
          writeLog('INFO', `Все файлы в директории: ${allFiles.map(f => path.relative(tempDirAbsolute, f)).join(', ')}`);
        }
        
        // Если класс не найден, выводим подробную информацию
        if (!fs.existsSync(classFile)) {
          writeLog('WARN', `Класс не найден по ожидаемому пути: ${classFile}`);
          
          // Проверяем, может быть класс скомпилировался, но в другом месте
          if (allClassFiles.length > 0) {
            writeLog('INFO', `Найдено ${allClassFiles.length} .class файлов, ищем класс ${className}...`);
            // Пробуем найти класс по имени (точное совпадение имени файла)
            const foundClass = allClassFiles.find(f => {
              const fileName = path.basename(f, '.class');
              return fileName === className;
            });
            
            if (foundClass) {
              writeLog('INFO', `Класс найден в другом месте: ${foundClass}`);
              // Обновляем путь к классу
              classFile = foundClass;
              // Определяем правильный classDir
              const foundClassDir = path.dirname(foundClass);
              if (packageName) {
                // Если есть package, classDir должен быть корнем пакетов (tempDirAbsolute)
                // Java ищет классы относительно classpath, начиная с корня пакетов
                classDir = tempDirAbsolute; // Всегда используем корень как classpath для пакетов
              } else {
                classDir = foundClassDir;
              }
              writeLog('INFO', `Обновленный classDir: ${classDir}, classFile: ${classFile}`);
            } else {
              // Выводим список всех найденных классов для отладки
              const classNames = allClassFiles.map(f => path.basename(f, '.class')).join(', ');
              writeLog('ERROR', `Класс ${className} не найден среди скомпилированных классов: ${classNames}`);
              try {
                fs.unlinkSync(tempFile);
              } catch (e) {}
              safeResolve({
                error: `Класс ${className} не найден после компиляции.\n\nОжидался файл: ${classFile}\n${packageName ? `Package: ${packageName}, полное имя: ${fullClassName}` : 'Нет package'}\n\nНайденные .class файлы (${allClassFiles.length}):\n${allClassFiles.length > 0 ? allClassFiles.map(f => `  - ${path.relative(tempDirAbsolute, f)}`).join('\n') : 'не найдено'}\n\nУбедитесь, что:\n1. В коде есть класс с именем ${className}\n2. Класс объявлен как public class ${className}\n3. Код компилируется без ошибок`
              });
              return;
            }
          } else {
            // Нет скомпилированных классов вообще - компиляция не создала файлы
            writeLog('ERROR', `Компиляция не создала ни одного .class файла в ${tempDirAbsolute}`);
            try {
              fs.unlinkSync(tempFile);
            } catch (e) {}
            
            // Проверяем, что исходный файл все еще существует
            if (!fs.existsSync(tempFileAbsolute)) {
            safeResolve({
              error: `Исходный файл был удален: ${tempFileAbsolute}`
            });
              return;
            }
            
            // Проверяем содержимое исходного файла
            const sourceContent = fs.readFileSync(tempFileAbsolute, 'utf8');
            const hasClass = sourceContent.includes(`class ${className}`) || sourceContent.includes(`public class ${className}`);
            
            safeResolve({
              error: `Компиляция не создала .class файлы.\n\nОжидался файл: ${classFile}\n${packageName ? `Package: ${packageName}` : 'Нет package'}\n\nПроверка исходного файла:\n- Файл существует: ${fs.existsSync(tempFileAbsolute)}\n- Содержит класс ${className}: ${hasClass}\n\nВозможные причины:\n1. Ошибки компиляции (проверьте синтаксис)\n2. Класс не объявлен как public class ${className}\n3. Проблемы с JDK или PATH`
            });
            return;
          }
        } else {
          writeLog('INFO', `Класс найден по ожидаемому пути: ${classFile}`);
        }
        
        // Запускаем с правильной кодировкой для Windows
        const javaEnv = { ...process.env };
        // Устанавливаем кодировку UTF-8 для Java
        javaEnv.JAVA_TOOL_OPTIONS = '-Dfile.encoding=UTF-8 -Dconsole.encoding=UTF-8';
        javaEnv._JAVA_OPTIONS = '-Dfile.encoding=UTF-8 -Dconsole.encoding=UTF-8';
        // Для Windows консоли
        if (process.platform === 'win32') {
          javaEnv.CHCP = '65001'; // UTF-8 кодовая страница
        }
        
        // Используем chcp для установки UTF-8 перед запуском Java
        // Используем classDir (tempDir) для правильного пути к классу
        // Важно: используем абсолютный путь для -cp
        // Если есть package, используем полное имя класса с package
        // classDir должен быть корнем пакетов (tempDirAbsolute) для классов с package
        const classDirAbsolute = path.resolve(classDir);
        
        // Дополнительная проверка: убеждаемся, что файл класса существует
        if (!fs.existsSync(classFile)) {
          fs.unlinkSync(tempFile);
          writeLog('ERROR', `Класс не найден: ${classFile} не существует. Найденные файлы: ${allClassFiles.map(f => path.relative(tempDirAbsolute, f)).join(', ')}`);
          safeResolve({
            error: `Класс ${fullClassName} не найден: файл ${classFile} не существует.\nНайденные .class файлы: ${allClassFiles.length > 0 ? allClassFiles.map(f => path.relative(tempDirAbsolute, f)).join(', ') : 'не найдено'}\nПроверьте, что компиляция прошла успешно.`
          });
          return;
        }
        
        // Логируем для отладки
        writeLog('INFO', `Запуск Java: класс=${fullClassName}, classpath=${classDirAbsolute}, файл=${classFile}, существует=${fs.existsSync(classFile)}`);
        
        // Проверяем все .class файлы в директории перед запуском
        const allClassFilesBefore = fs.readdirSync(tempDirAbsolute).filter(f => f.endsWith('.class'));
        writeLog('INFO', `Все .class файлы перед запуском: ${allClassFilesBefore.join(', ')}`);
        
        // Проверяем размер файла класса (должен быть больше 0)
        const classFileStats = fs.statSync(classFile);
        writeLog('INFO', `Размер файла класса: ${classFileStats.size} байт`);
        
        if (classFileStats.size === 0) {
          writeLog('ERROR', `Файл класса пустой: ${classFile}`);
          safeResolve({
            error: `Файл класса ${fullClassName}.class пустой. Возможно, компиляция не завершилась успешно.`
          });
          return;
        }
        
        // Используем точку (.) для classpath, так как cwd уже установлен в classDirAbsolute
        // Это более надежный способ для Windows
        // Используем прямой вызов java с правильными параметрами
        const javaArgs = [
          '-Dfile.encoding=UTF-8',
          '-Dconsole.encoding=UTF-8',
          '-Duser.language=ru',
          '-Duser.country=RU',
          '-cp',
          '.',
          fullClassName
        ];
        
        writeLog('INFO', `Java команда: java ${javaArgs.join(' ')}`);
        writeLog('INFO', `Текущая директория для Java: ${classDirAbsolute}`);
        writeLog('INFO', `Проверка файла класса перед запуском: ${classFile}, существует=${fs.existsSync(classFile)}, размер=${classFileStats.size}`);
        writeLog('INFO', `Classpath: ".", Полное имя класса: ${fullClassName}`);
        
        // Используем прямой вызов java с правильной обработкой кодировки
        // Java настроена на UTF-8 через JAVA_TOOL_OPTIONS, но консоль Windows может выводить в другой кодировке
        // Получаем Buffer и декодируем как UTF-8, так как Java выводит в UTF-8
        var java = spawn('java', javaArgs, {
          env: javaEnv,
          encoding: null, // null чтобы получать Buffer
          shell: false,
          cwd: classDirAbsolute
        });
        let output = '';
        let error = '';
        
        // Функция для декодирования вывода Java
        // Используем CP1251 (Windows-1251) как основную кодировку - это правильная кодировка для данной системы
        const decodeOutput = (buffer) => {
          if (!Buffer.isBuffer(buffer)) {
            return String(buffer);
          }
          
          // Всегда используем CP1251 (Windows-1251) через iconv-lite
          if (iconv) {
            try {
              return iconv.decode(buffer, 'cp1251');
            } catch (e) {
              // Пробуем альтернативное имя
              try {
                return iconv.decode(buffer, 'win1251');
              } catch (e2) {
                // Fallback на UTF-8
                return buffer.toString('utf8');
              }
            }
          } else {
            // Если iconv-lite не доступен, пробуем встроенные методы
            try {
              return buffer.toString('utf8');
            } catch (e) {
              return buffer.toString('latin1');
            }
          }
        };
        
        java.stdout.on('data', (data) => {
          output += decodeOutput(data);
        });
        
        java.stderr.on('data', (data) => {
          const errorStr = decodeOutput(data);
          error += errorStr;
          
          // Логируем ошибки ClassNotFoundException для отладки
          if (errorStr.includes('ClassNotFoundException') || errorStr.includes('Could not find or load main class')) {
            writeLog('ERROR', `ClassNotFoundException: ${errorStr.trim()}\nКласс: ${fullClassName}\nClasspath: ${classDirAbsolute}\nФайл класса: ${classFile}\nСуществует: ${fs.existsSync(classFile)}`);
          }
        });
        
        // Таймаут для выполнения (30 секунд)
        const timeout = setTimeout(() => {
          try {
            java.kill();
            fs.unlinkSync(tempFile);
            // Используем правильный путь к классу
            if (fs.existsSync(classFile)) {
              fs.unlinkSync(classFile);
            }
          } catch (e) {}
          safeResolve({
            error: 'Таймаут выполнения: код выполняется слишком долго (более 30 секунд).'
          });
        }, 30000);
        
        java.on('close', (code) => {
          clearTimeout(timeout);
          
          // Проверяем файлы после выполнения для отладки
          const allClassFilesAfter = fs.existsSync(tempDirAbsolute) ? fs.readdirSync(tempDirAbsolute).filter(f => f.endsWith('.class')) : [];
          writeLog('INFO', `Все .class файлы после выполнения: ${allClassFilesAfter.join(', ')}`);
          writeLog('INFO', `Файл класса после выполнения: ${classFile}, существует=${fs.existsSync(classFile)}`);
          
          // Удаляем файлы только если выполнение успешно (код 0)
          // Если ошибка, оставляем файлы для отладки
          if (code === 0) {
            try {
              fs.unlinkSync(tempFile);
              // Удаляем все .class файлы в директории
              if (fs.existsSync(tempDirAbsolute)) {
                const files = fs.readdirSync(tempDirAbsolute);
                files.forEach(file => {
                  if (file.endsWith('.class')) {
                    try {
                      fs.unlinkSync(path.join(tempDirAbsolute, file));
                    } catch (e) {}
                  }
                });
              }
            } catch (e) {
              writeLog('ERROR', `Ошибка при удалении файлов: ${e.message}`);
            }
          } else {
            // При ошибке оставляем файлы для отладки, но логируем
            writeLog('INFO', `Выполнение завершилось с кодом ${code}, файлы оставлены для отладки`);
          }
          
          // Если есть ошибка ClassNotFoundException, выводим подробную информацию
          if (error && (error.includes('ClassNotFoundException') || error.includes('Could not find or load main class'))) {
            writeLog('ERROR', `ClassNotFoundException при закрытии: ${error}\nКласс: ${fullClassName}\nClasspath: ${classDirAbsolute}\nФайл: ${classFile}\nСуществует: ${fs.existsSync(classFile)}`);
            safeResolve({
              error: `Ошибка: ${error}\n\nКласс: ${fullClassName}\nClasspath: ${classDirAbsolute}\nФайл класса: ${classFile}\nФайл существует: ${fs.existsSync(classFile)}\n\nПроверьте:\n1. Имя класса в коде совпадает с именем файла\n2. Класс объявлен как public class ${className}\n3. В коде есть метод public static void main(String[] args)`
            });
            return;
          }
          
          safeResolve({
            output: output || error,
            exitCode: code
          });
        });
        
        java.on('error', (err) => {
          clearTimeout(timeout);
          try {
            fs.unlinkSync(tempFile);
          } catch (e) {}
          writeLog('ERROR', `Ошибка запуска Java: ${err.message}, класс=${fullClassName}, classpath=${classDirAbsolute}`);
          safeResolve({
            error: `Ошибка запуска Java: ${err.message}\n\nКласс: ${fullClassName}\nClasspath: ${classDirAbsolute}\nФайл класса: ${classFile}\n\nУбедитесь, что JDK установлен и доступен в PATH.`
          });
        });
          } catch (innerError) {
            writeLog('ERROR', `Ошибка внутри setTimeout: ${innerError.message}`);
            safeResolve({
              error: `Ошибка выполнения: ${innerError.message}`
            });
          }
        }, 1000); // Увеличиваем время ожидания до 1000мс после компиляции перед запуском
      } catch (setTimeoutError) {
        writeLog('ERROR', `Ошибка при создании setTimeout: ${setTimeoutError.message}`);
        safeResolve({
          error: `Ошибка при запуске выполнения: ${setTimeoutError.message}`
        });
      }
    }); // Закрываем exec callback
    } catch (error) {
      // Обработка любых синхронных ошибок
      writeLog('ERROR', `Критическая ошибка в execute-java: ${error.message}\n${error.stack}`);
      safeResolve({
        error: `Критическая ошибка выполнения Java: ${error.message}\n\nПопробуйте перезапустить приложение.`
      });
    }
  });
});

// Выполнение C++
ipcMain.handle('execute-cpp', async (event, code) => {
  return new Promise((resolve) => {
    const tempFile = path.join(tempDir, `temp_${Date.now()}.cpp`);
    const exeFile = path.join(tempDir, `temp_${Date.now()}${process.platform === 'win32' ? '.exe' : ''}`);
    
    fs.writeFileSync(tempFile, code, 'utf8');
    
    // Компилируем
    const compiler = process.platform === 'win32' ? 'g++' : 'g++';
    exec(`${compiler} "${tempFile}" -o "${exeFile}"`, (compileError, compileStdout, compileStderr) => {
      if (compileError) {
        fs.unlinkSync(tempFile);
        resolve({
          error: `Ошибка компиляции:\n${compileStderr}\n\nУбедитесь, что компилятор C++ (g++ или clang) установлен и доступен в PATH.`
        });
        return;
      }
      
      // Запускаем
      const exe = spawn(exeFile, [], {
        encoding: 'utf8'
      });
      let output = '';
      let error = '';
      
      exe.stdout.setEncoding('utf8');
      exe.stderr.setEncoding('utf8');
      
      exe.stdout.on('data', (data) => {
        output += data.toString('utf8');
      });
      
      exe.stderr.on('data', (data) => {
        error += data.toString('utf8');
      });
      
      // Таймаут для выполнения (30 секунд)
      const timeout = setTimeout(() => {
        try {
          exe.kill();
          fs.unlinkSync(tempFile);
          if (fs.existsSync(exeFile)) {
            fs.unlinkSync(exeFile);
          }
        } catch (e) {}
        resolve({
          error: 'Таймаут выполнения: код выполняется слишком долго (более 30 секунд).'
        });
      }, 30000);
      
      exe.on('close', (code) => {
        clearTimeout(timeout);
        // Удаляем файлы
        try {
          fs.unlinkSync(tempFile);
          if (fs.existsSync(exeFile)) {
            fs.unlinkSync(exeFile);
          }
        } catch (e) {}
        
        resolve({
          output: output || error,
          exitCode: code
        });
      });
      
      exe.on('error', (err) => {
        clearTimeout(timeout);
        try {
          fs.unlinkSync(tempFile);
          if (fs.existsSync(exeFile)) {
            fs.unlinkSync(exeFile);
          }
        } catch (e) {}
        resolve({
          error: `Ошибка запуска: ${err.message}\n\nУбедитесь, что компилятор C++ установлен и доступен в PATH.`
        });
      });
    });
  });
});

// Выполнение C#
ipcMain.handle('execute-csharp', async (event, code) => {
  return new Promise((resolve) => {
    const tempFile = path.join(tempDir, `temp_${Date.now()}.cs`);
    const exeFile = path.join(tempDir, `temp_${Date.now()}${process.platform === 'win32' ? '.exe' : ''}`);
    
    fs.writeFileSync(tempFile, code, 'utf8');
    
    // Компилируем
    exec(`csc "${tempFile}" /out:"${exeFile}"`, (compileError, compileStdout, compileStderr) => {
      if (compileError) {
        // Пробуем dotnet
        exec(`dotnet new console -n temp_proj -o "${tempDir}" && dotnet build "${tempDir}/temp_proj.csproj"`, (dotnetError) => {
          fs.unlinkSync(tempFile);
          resolve({
            error: `Ошибка компиляции C#.\n\nУбедитесь, что .NET SDK или Visual Studio установлены и доступны в PATH.`
          });
        });
        return;
      }
      
      // Запускаем
      const exe = spawn(exeFile, [], {
        encoding: 'utf8'
      });
      let output = '';
      let error = '';
      
      exe.stdout.setEncoding('utf8');
      exe.stderr.setEncoding('utf8');
      
      exe.stdout.on('data', (data) => {
        output += data.toString('utf8');
      });
      
      exe.stderr.on('data', (data) => {
        error += data.toString('utf8');
      });
      
      // Таймаут для выполнения (30 секунд)
      const timeout = setTimeout(() => {
        try {
          exe.kill();
          fs.unlinkSync(tempFile);
          if (fs.existsSync(exeFile)) {
            fs.unlinkSync(exeFile);
          }
        } catch (e) {}
        resolve({
          error: 'Таймаут выполнения: код выполняется слишком долго (более 30 секунд).'
        });
      }, 30000);
      
      exe.on('close', (code) => {
        clearTimeout(timeout);
        try {
          fs.unlinkSync(tempFile);
          if (fs.existsSync(exeFile)) {
            fs.unlinkSync(exeFile);
          }
        } catch (e) {}
        
        resolve({
          output: output || error,
          exitCode: code
        });
      });
      
      exe.on('error', (err) => {
        clearTimeout(timeout);
        try {
          fs.unlinkSync(tempFile);
          if (fs.existsSync(exeFile)) {
            fs.unlinkSync(exeFile);
          }
        } catch (e) {}
        resolve({
          error: `Ошибка запуска: ${err.message}\n\nУбедитесь, что .NET SDK установлен и доступен в PATH.`
        });
      });
    });
  });
});

// Выполнение Go
ipcMain.handle('execute-go', async (event, code) => {
  return new Promise((resolve) => {
    const tempFile = path.join(tempDir, `temp_${Date.now()}.go`);
    
    fs.writeFileSync(tempFile, code, 'utf8');
    
    // Запускаем go run
    const go = spawn('go', ['run', tempFile], {
      encoding: 'utf8'
    });
    let output = '';
    let error = '';
    
    go.stdout.setEncoding('utf8');
    go.stderr.setEncoding('utf8');
    
    go.stdout.on('data', (data) => {
      output += data.toString('utf8');
    });
    
    go.stderr.on('data', (data) => {
      error += data.toString('utf8');
    });
    
    // Таймаут для выполнения (30 секунд)
    const timeout = setTimeout(() => {
      try {
        go.kill();
        fs.unlinkSync(tempFile);
      } catch (e) {}
      resolve({
        error: 'Таймаут выполнения: код выполняется слишком долго (более 30 секунд).'
      });
    }, 30000);
    
    go.on('close', (code) => {
      clearTimeout(timeout);
      fs.unlinkSync(tempFile);
      resolve({
        output: output || error,
        exitCode: code
      });
    });
    
    go.on('error', (err) => {
      clearTimeout(timeout);
      fs.unlinkSync(tempFile);
      resolve({
        error: `Ошибка запуска Go: ${err.message}\n\nУбедитесь, что Go установлен и доступен в PATH.`
      });
    });
  });
});

// PostgreSQL: выполнение SQL (нужен пакет pg и настроенное подключение)
ipcMain.handle('execute-postgres', async (event, { connection, query }) => {
  let pg;
  try {
    pg = require('pg');
  } catch (e) {
    return { error: 'Установите пакет pg: npm install pg' };
  }
  const { host = 'localhost', port = 5432, user, password, database } = connection || {};
  if (!user || !database) {
    return { error: 'Укажите пользователя и базу данных в настройках подключения PostgreSQL.' };
  }
  const client = new pg.Client({ host, port, user, password, database });
  try {
    await client.connect();
    const res = await client.query(query);
    const columns = res.fields ? res.fields.map((f) => f.name) : [];
    const rows = res.rows || [];

    // Схема таблиц для отображения справа (таблицы и ER-диаграмма)
    let tables = [];
    try {
      const schemaRes = await client.query(`
        SELECT c.table_name, c.column_name, c.data_type, c.is_nullable
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
        ORDER BY c.table_name, c.ordinal_position
      `);
      const pkRes = await client.query(`
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
      `);
      const pkSet = new Set((pkRes.rows || []).map((r) => `${r.table_name}.${r.column_name}`));
      const byTable = {};
      (schemaRes.rows || []).forEach((r) => {
        const tn = r.table_name;
        if (!byTable[tn]) byTable[tn] = [];
        byTable[tn].push({
          name: r.column_name,
          type: r.data_type || '',
          isPrimaryKey: pkSet.has(`${tn}.${r.column_name}`),
          isNotNull: r.is_nullable === 'NO',
          isUnique: false
        });
      });
      tables = Object.keys(byTable).map((name) => ({ name, columns: byTable[name] }));
    } catch (_) {}

    await client.end();
    return { output: '', rows, columns, tables };
  } catch (err) {
    try { await client.end(); } catch (_) {}
    return { error: err.message };
  }
});

// Oracle: выполнение SQL (нужен oracledb и Oracle Instant Client)
ipcMain.handle('execute-oracle', async (event, { connection, query }) => {
  let oracledb;
  try {
    oracledb = require('oracledb');
  } catch (e) {
    return { error: 'Установите пакет oracledb и настройте Oracle Instant Client: npm install oracledb' };
  }
  const { user, password, connectString } = connection || {};
  if (!user || !password || !connectString) {
    return { error: 'Укажите user, password и connectString в настройках подключения Oracle.' };
  }
  let connection_;
  try {
    connection_ = await oracledb.getConnection({ user, password, connectString });
    const result = await connection_.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const rows = result.rows || [];
    const columns = result.metaData ? result.metaData.map((m) => m.name) : (rows[0] ? Object.keys(rows[0]) : []);

    // Схема таблиц для отображения справа (USER_TAB_COLUMNS + первичные ключи)
    let tables = [];
    try {
      const schemaRes = await connection_.execute(`
        SELECT table_name, column_name, data_type, nullable
        FROM user_tab_columns
        ORDER BY table_name, column_id
      `);
      const pkRes = await connection_.execute(`
        SELECT acc.table_name, acc.column_name
        FROM user_constraints uc
        JOIN user_cons_columns acc ON uc.constraint_name = acc.constraint_name
        WHERE uc.constraint_type = 'P'
      `);
      const pkSet = new Set((pkRes.rows || []).map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`));
      const byTable = {};
      (schemaRes.rows || []).forEach((r) => {
        const tn = r.TABLE_NAME;
        if (!byTable[tn]) byTable[tn] = [];
        byTable[tn].push({
          name: r.COLUMN_NAME,
          type: r.DATA_TYPE || '',
          isPrimaryKey: pkSet.has(`${tn}.${r.COLUMN_NAME}`),
          isNotNull: (r.NULLABLE || 'Y') === 'N',
          isUnique: false
        });
      });
      tables = Object.keys(byTable).map((name) => ({ name, columns: byTable[name] }));
    } catch (_) {}

    await connection_.close();
    return { output: '', rows, columns, tables };
  } catch (err) {
    if (connection_) try { await connection_.close(); } catch (_) {}
    return { error: err.message };
  }
});