const fs = require('fs');
const path = require('path');

module.exports = async function (buildResult) {
  const outputDir = buildResult.outDir;

  const allowedExtensions = ['.exe', '.blockmap', '.yml', '.appx'];

  const entries = fs.readdirSync(outputDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(outputDir, entry.name);

    if (entry.isDirectory()) {
      // win-unpacked gibi klasörleri sil
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`Silindi (klasör): ${entry.name}`);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      fs.unlinkSync(fullPath);
      console.log(`Silindi (dosya): ${entry.name}`);
    }
  }

  return buildResult.artifactPaths;
};
