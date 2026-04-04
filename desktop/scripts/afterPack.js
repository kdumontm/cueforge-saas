/**
 * afterPack hook — Signe correctement l'app pour macOS sans certificat Apple Developer.
 *
 * Le problème : codesign --deep donne des Team IDs différents au binaire principal
 * et à Electron Framework, ce qui cause "different Team IDs" au lancement.
 *
 * La solution : signer chaque composant individuellement (frameworks d'abord,
 * app ensuite) avec un entitlement qui désactive la validation de librairie.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  // Seulement sur macOS
  if (process.platform !== 'darwin' && context.electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const entitlements = path.join(__dirname, 'entitlements.plist');
  const frameworksPath = path.join(appPath, 'Contents', 'Frameworks');

  console.log(`\n🔏 Signing CueForge: ${appPath}`);

  try {
    // 1. Retirer tous les attributs de quarantaine
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });

    // 2. Signer tous les frameworks et helpers d'abord
    if (fs.existsSync(frameworksPath)) {
      const items = fs.readdirSync(frameworksPath);
      for (const item of items) {
        const itemPath = path.join(frameworksPath, item);
        console.log(`  → Signing framework: ${item}`);
        try {
          execSync(
            `codesign --force --sign - --entitlements "${entitlements}" "${itemPath}"`,
            { stdio: 'inherit' }
          );
        } catch (e) {
          console.warn(`  ⚠️ Framework signing skipped for ${item}: ${e.message}`);
        }
      }
    }

    // 3. Signer les binaires helper dans Frameworks
    const helperApps = [
      'CueForge Helper.app',
      'CueForge Helper (GPU).app',
      'CueForge Helper (Plugin).app',
      'CueForge Helper (Renderer).app',
    ];
    for (const helper of helperApps) {
      const helperPath = path.join(frameworksPath, helper);
      if (fs.existsSync(helperPath)) {
        console.log(`  → Signing helper: ${helper}`);
        try {
          execSync(
            `codesign --force --sign - --entitlements "${entitlements}" "${helperPath}"`,
            { stdio: 'inherit' }
          );
        } catch (e) {
          // Helpers may not exist in all Electron versions
        }
      }
    }

    // 4. Signer les modules natifs (.node files)
    try {
      const nodeModules = execSync(
        `find "${appPath}" -name "*.node" -type f`,
        { encoding: 'utf-8' }
      ).trim().split('\n').filter(Boolean);

      for (const nodeMod of nodeModules) {
        console.log(`  → Signing native module: ${path.basename(nodeMod)}`);
        execSync(`codesign --force --sign - "${nodeMod}"`, { stdio: 'inherit' });
      }
    } catch (e) {
      console.warn('  ⚠️ No .node files found or signing failed');
    }

    // 5. Signer l'app principale en dernier (avec entitlements)
    console.log('  → Signing main app bundle');
    execSync(
      `codesign --force --sign - --entitlements "${entitlements}" "${appPath}"`,
      { stdio: 'inherit' }
    );

    // 6. Vérifier la signature
    execSync(`codesign --verify --verbose "${appPath}"`, { stdio: 'inherit' });

    console.log('✅ Signing complet — tous les composants ont le même Team ID\n');
  } catch (err) {
    console.warn('⚠️ Signing échoué (non bloquant):', err.message);
  }
};
