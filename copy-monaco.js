const fs = require('fs');
const path = require('path');

// Копируем electron.js
const electronSrc = path.join('public', 'electron.js');
const electronDest = path.join('build', 'electron.js');
if (fs.existsSync(electronSrc)) {
  fs.copyFileSync(electronSrc, electronDest);
  console.log('✓ Copied electron.js');
}

// Копируем Monaco Editor файлы
const monacoSrc = path.join('node_modules', 'monaco-editor', 'min', 'vs');
const monacoDest = path.join('build', 'static', 'monaco-editor', 'vs');

if (fs.existsSync(monacoSrc)) {
  const copyRecursive = (src, dest) => {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  };
  
  copyRecursive(monacoSrc, monacoDest);
  console.log('✓ Copied Monaco Editor files');
} else {
  console.log('⚠ Monaco Editor files not found at:', monacoSrc);
}


