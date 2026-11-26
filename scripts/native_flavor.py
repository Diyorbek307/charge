"""Turns the Voli shell into Voli Business or Voli Admin, in a build machine's checkout.

    python3 scripts/native_flavor.py business ios
    python3 scripts/native_flavor.py admin android

Run before `npx cap sync` with VOLI_APP set to the same name (capacitor.config.ts).
It changes the app's ID, name and icon, and takes out what only the drivers' app
has: Android Auto, CarPlay and the Firebase files tied to uz.voli.app. Never run
it on a computer you commit from: it rewrites the native projects in place.
"""
import os
import plistlib
import re
import shutil
import sys

FLAVORS = {
    'business': {'id': 'uz.voli.business', 'name': 'Voli Business'},
    'admin': {'id': 'uz.voli.admin', 'name': 'Voli Admin'},
}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return f.read()


def write(path, text):
    with open(os.path.join(ROOT, path), 'w', encoding='utf-8') as f:
        f.write(text)


def sub(path, pattern, repl, count=0, must=True):
    text = read(path)
    new, n = re.subn(pattern, repl, text, count=count, flags=re.S)
    if must and not n:
        raise SystemExit(f'{path}: nothing matched {pattern!r}')
    write(path, new)


def ios(f, name):
    sub('ios/App/App.xcodeproj/project.pbxproj', r'PRODUCT_BUNDLE_IDENTIFIER = uz\.voli\.app;', f'PRODUCT_BUNDLE_IDENTIFIER = {f["id"]};')
    plist_path = os.path.join(ROOT, 'ios/App/App/Info.plist')
    with open(plist_path, 'rb') as fh:
        plist = plistlib.load(fh)
    plist['CFBundleDisplayName'] = f['name']
    # No CarPlay outside the drivers' app.
    scenes = plist.get('UIApplicationSceneManifest', {}).get('UISceneConfigurations', {})
    for key in [k for k in scenes if 'CarPlay' in k or 'CPTemplate' in k]:
        del scenes[key]
    with open(plist_path, 'wb') as fh:
        plistlib.dump(plist, fh)
    for gone in ['ios/App/App/GoogleService-Info.plist']:
        p = os.path.join(ROOT, gone)
        if os.path.exists(p):
            os.remove(p)
    shutil.copy(os.path.join(ROOT, f'native/{name}/ios/AppIcon-512@2x.png'),
                os.path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'))


def android(f, name):
    sub('android/app/build.gradle', r'applicationId "uz\.voli\.app"', f'applicationId "{f["id"]}"')
    sub('android/app/src/main/res/values/strings.xml', r'<string name="app_name">[^<]*</string>', f'<string name="app_name">{f["name"]}</string>')
    sub('android/app/src/main/res/values/strings.xml', r'<string name="title_activity_main">[^<]*</string>', f'<string name="title_activity_main">{f["name"]}</string>')
    # No Android Auto outside the drivers' app: the service, its two meta-data and the map permission.
    manifest = 'android/app/src/main/AndroidManifest.xml'
    sub(manifest, r'\s*<!-- Android Auto[^>]*-->\s*<service\s+android:name="\.car\.VoliCarAppService".*?</service>', '')
    sub(manifest, r'\s*<meta-data\s+android:name="com\.google\.android\.gms\.car\.application"[^>]*/>', '')
    sub(manifest, r'\s*<meta-data\s+android:name="androidx\.car\.app\.minCarApiLevel"[^>]*/>', '')
    sub(manifest, r'\s*(<!--[^>]*-->\s*)?<uses-permission android:name="androidx\.car\.app\.MAP_TEMPLATES" />', '', must=False)
    # Firebase's file names uz.voli.app: the build would stop on another ID.
    p = os.path.join(ROOT, 'android/app/google-services.json')
    if os.path.exists(p):
        os.remove(p)
    src = os.path.join(ROOT, f'native/{name}/android')
    res = os.path.join(ROOT, 'android/app/src/main/res')
    for d in os.listdir(src):
        for file in os.listdir(os.path.join(src, d)):
            shutil.copy(os.path.join(src, d, file), os.path.join(res, d, file))


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in FLAVORS or sys.argv[2] not in ('ios', 'android'):
        raise SystemExit('usage: native_flavor.py business|admin ios|android')
    name, platform = sys.argv[1], sys.argv[2]
    (ios if platform == 'ios' else android)(FLAVORS[name], name)
    print(f'{FLAVORS[name]["name"]} ({FLAVORS[name]["id"]}) for {platform}')
