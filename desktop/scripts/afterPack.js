/**
 * afterPack hook — Signe l'app en ad-hoc pour éviter le message
 * "CueForge est endommagé" sur macOS (Gatekeeper).
 * Sans certificat Apple Developer, l'ad-hoc signing permet au moins
 * d'ouvrir l'app via clic-droit > Ouvrir au lieu du blocage total.
 */
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  // Seulement sur macOS
  if (process.platform !== 'darwin' && context.electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`\n🔏 Ad-hoc signing: ${appPath}`);

  try {
    // Supprimer les attributs de quarantaine et signer en ad-hoc
    execSync(`codesign --force --deep --sign - "${appPath}"`, {
      stdio: 'inherit',
    });
    console.log('✅ Ad-hoc signing réussi\n');
  } catch (err) {
    console.warn('⚠️ Ad-hoc signing échoué (non bloquant):', err.message);
  }
};
