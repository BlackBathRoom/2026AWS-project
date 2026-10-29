#!/usr/bin/env python3
"""Preserve existing S3 CORS rules; append the textbook read rule. No ACL/policy changes."""
import argparse, datetime, json, pathlib, subprocess
p = argparse.ArgumentParser()
p.add_argument('--apply', action='store_true')
a = p.parse_args()
bucket = 'info2-materials-432410731458-us-east-1-an'
command = ['aws', 's3api', 'get-bucket-cors', '--bucket', bucket, '--region', 'us-east-1']
r = subprocess.run(command, text=True, capture_output=True)
if r.returncode:
    if 'NoSuchCORSConfiguration' in r.stderr: current = {'CORSRules': []}
    else: raise SystemExit(r.stderr)
else: current = json.loads(r.stdout)
rule = json.loads((pathlib.Path(__file__).resolve().parent.parent / 'config/s3-textbook-cors-rule.json').read_text())
merged = {'CORSRules': [x for x in current.get('CORSRules', []) if x.get('ID') != rule['ID']] + [rule]}
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
backup = pathlib.Path(f'textbook-cors-before-{stamp}.json')
after = pathlib.Path(f'textbook-cors-after-{stamp}.json')
backup.write_text(json.dumps(current, indent=2)+'\n');after.write_text(json.dumps(merged, indent=2)+'\n')
print(json.dumps(merged, indent=2))
print(f'Backup: {backup}; proposed config: {after}')
if a.apply:
    subprocess.run(['aws', 's3api', 'put-bucket-cors', '--bucket', bucket, '--region', 'us-east-1', '--cors-configuration', 'file://'+str(after.resolve())], check=True)
    print('CORS updated.')
else: print('Preview only. Run with --apply to write this rule.')
