const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, '..', 'public', 'assets', 'clasptek_logo.png');
const pngBuf = fs.readFileSync(pngPath);

// Create valid ICO wrapping the PNG
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // ICO type
header.writeUInt16LE(1, 4); // 1 image

header.writeUInt8(0, 6); // Width (0 means 256 or auto)
header.writeUInt8(0, 7); // Height
header.writeUInt8(0, 8); // Color palette
header.writeUInt8(0, 9); // Reserved
header.writeUInt16LE(1, 10); // Color planes
header.writeUInt16LE(32, 12); // Bits per pixel
header.writeUInt32LE(pngBuf.length, 14); // Image data size
header.writeUInt32LE(22, 18); // Offset to image data

const icoBuf = Buffer.concat([header, pngBuf]);

fs.writeFileSync(path.join(__dirname, '..', 'public', 'favicon.ico'), icoBuf);
fs.writeFileSync(path.join(__dirname, '..', 'favicon.ico'), icoBuf);

console.log('Successfully generated public/favicon.ico and favicon.ico (' + icoBuf.length + ' bytes)');
