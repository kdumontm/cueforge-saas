/**
 * afterPack hook — Signe l'app en ad-hoc avec hardenedRuntime
 * pour minimiser les blocages Gatekeeper sur macOS.
 *
 * Sans certificat Apple Developer, les utilisateurs doivent
 * faire clic-droit > Ouvrir au premier lancement, ou lancer :
 *   xattr -cr /Applications/CueForge.app
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

  console.log(`\n🔏 Ad-hoc signing with options: ${appPath}`);

  try {
    // 1. Retirer tout attribut de quarantaine existant
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });

    // 2. Signer en ad-hoc avec les options recommandées
    //    --options runtime active le hardened runtime (requis pour notarization future)
    //    --deep signe tous les frameworks et helpers internes
    //    --force remplace toute signature existante
    execSync(
      `codesign --force --deep --sign - --options runtime "${appPath}"`,
      { stdio: 'inherit' }
    );

    // 3. Vérifier la signature
    execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' });

    console.log('✅ Ad-hoc signing réussi\n');
  } catch (err) {
    console.warn('⚠️ Ad-hoc signing échoué (non bloquant):', err.message);
  }
};
