const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'output', 'gpu');
const goldenDir = path.join(__dirname, 'golden', 'gpu');

// Ensure golden directory exists
if (!fs.existsSync(goldenDir)) {
  fs.mkdirSync(goldenDir, { recursive: true });
}

// Copy all GPU outputs to goldens
function copyOutputsToGoldens(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    console.log(`Source directory not found: ${srcDir}`);
    return;
  }

  const items = fs.readdirSync(srcDir);
  
  for (const item of items) {
    const srcPath = path.join(srcDir, item);
    const destPath = path.join(destDir, item);
    
    const stat = fs.statSync(srcPath);
    
    if (stat.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyOutputsToGoldens(srcPath, destPath);
    } else if (item.endsWith('.png') && !item.includes('_diff')) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${item} -> ${destPath}`);
    }
  }
}

console.log('Copying GPU outputs to goldens...');
copyOutputsToGoldens(outputDir, goldenDir);
console.log('Done!');
