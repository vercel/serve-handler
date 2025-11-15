#!/usr/bin/env python3
import json, sys
from collections import defaultdict

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(obj, path):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)

def build_scancode_license_map(scancode):
    mapping = {}
    results = scancode.get('files') or scancode.get('results') or []
    for r in results:
        p = r.get('path') or r.get('location') or r.get('filename')
        lic_objs = r.get('licenses') or []
        lic_exprs = [l.get('license_expression') or l.get('spdx_license_key') or l.get('short_name') for l in lic_objs if l]
        if lic_exprs:
            mapping[p] = list(dict.fromkeys([e for e in lic_exprs if e]))
    return mapping

def main():
    if len(sys.argv) != 4:
        print("Usage: merge-scancode-to-spdx.py sbom.syft.spdx.json scancode.json sbom.final.spdx.json")
        sys.exit(2)
    spdx_path, scancode_path, out_path = sys.argv[1:]
    spdx = load_json(spdx_path)
    try:
        scancode = load_json(scancode_path)
    except Exception:
        print("scancode.json not found or invalid; copying syft SPDX to final")
        save_json(spdx, out_path)
        return

    file_license_map = build_scancode_license_map(scancode)

    pkg_map_by_name = {}
    for p in spdx.get('packages', []):
        key = p.get('name') + "@" + (p.get('versionInfo') or "")
        pkg_map_by_name[key] = p

    for path, licenses in file_license_map.items():
        for key, pkg in pkg_map_by_name.items():
            name = key.split('@')[0]
            if name and name in path:
                if pkg.get('licenseDeclared') in (None, '', 'NOASSERTION'):
                    pkg['licenseDeclared'] = ' OR '.join(licenses)
                anns = pkg.get('annotations', [])
                anns.append({
                    "type": "scancode:license-evidence",
                    "file": path,
                    "licenses": licenses
                })
                pkg['annotations'] = anns

    for p in spdx.get('packages', []):
        if p.get('licenseDeclared') in (None, '', 'NOASSERTION'):
            anns = p.get('annotations', [])
            anns.append({
                "type": "note",
                "comment": "license not auto-detected; requires manual review or registry/package file inspection."
            })
            p['annotations'] = anns

    save_json(spdx, out_path)
    print(f"Merged SPDX saved to {out_path}")

if __name__ == '__main__':
    main()
