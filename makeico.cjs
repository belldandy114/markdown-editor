const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, 'icon.png').replace(/\\/g, '/');
const icoPath = path.join(__dirname, 'icon.ico').replace(/\\/g, '/');

const pyScript = `
from PIL import Image
img = Image.open("${pngPath}")
if img.mode != 'RGBA':
    img = img.convert('RGBA')
sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
img.save("${icoPath}", format='ICO', sizes=sizes)
import os
print('ICO OK:', os.path.getsize("${icoPath}"))
`;

const tmpFile = path.join(__dirname, '_makeico.py');
fs.writeFileSync(tmpFile, pyScript, 'utf-8');
try {
  const result = execSync(`python "${tmpFile}"`, { encoding: 'utf-8' });
  console.log(result.trim());
} finally {
  fs.unlinkSync(tmpFile);
}
