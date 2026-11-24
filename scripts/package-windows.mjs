// Builds the Windows installer: dist/RxMunshi-Setup-<version>.exe
//   1. copy the static export (out/) into the Electron app
//   2. electron-builder packages the app for Windows x64 (no Wine needed)
//   3. native makensis compiles desktop/installer.nsi into a setup wizard
// Needs: npm, makensis (apt install nsis / choco install nsis). Run `npm run build:windows`.
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';

const version = JSON.parse(readFileSync('desktop/package.json', 'utf8')).version;
rmSync('desktop/web', { recursive: true, force: true });
cpSync('out', 'desktop/web', { recursive: true });
execSync('npm install --no-audit --no-fund', { cwd: 'desktop', stdio: 'inherit' });
execSync('npx electron-builder --win dir --x64 --publish never', { cwd: 'desktop', stdio: 'inherit' });
execSync(`makensis -V2 -DVERSION=${version} -DSRC=../dist/win-unpacked -DOUT=../dist/RxMunshi-Setup-${version}.exe installer.nsi`, { cwd: 'desktop', stdio: 'inherit' });
console.log(`dist/RxMunshi-Setup-${version}.exe`);
