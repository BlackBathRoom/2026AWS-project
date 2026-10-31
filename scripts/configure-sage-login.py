#!/usr/bin/env python3
"""Preview/apply A's colors to an EXISTING Cognito managed-login style.

Uses AWS CLI, preserves auth/client/domain settings and unmodified style values.
No request that changes AWS is sent without --apply.
"""
import argparse
import base64
import copy
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def sage_settings():
    def color(value):
        return value.lstrip('#') + 'ff'

    primary = {}
    secondary = {}
    for state, value in [('defaults', '#527160'), ('hover', '#405d4d'), ('active', '#344e3e')]:
        primary[state] = {'backgroundColor': color(value), 'textColor': 'ffffffff'}
        secondary[state] = {'backgroundColor': color('#ffffff' if state == 'defaults' else '#eaf0e6'),
                            'borderColor': color(value), 'textColor': color(value)}
    return {
        'categories': {'global': {'colorSchemeMode': 'LIGHT', 'spacingDensity': 'REGULAR'}},
        'componentClasses': {
            'buttons': {'borderRadius': 9.0},
            'divider': {'lightMode': {'borderColor': 'e0e3dbff'}},
            'focusState': {'lightMode': {'borderColor': '8a652eff'}},
            'input': {'borderRadius': 8.0, 'lightMode': {
                'defaults': {'backgroundColor': 'ffffffff', 'borderColor': 'b7c0b3ff'},
                'placeholderColor': '737c72ff'}},
            'inputDescription': {'lightMode': {'textColor': '626c63ff'}},
            'inputLabel': {'lightMode': {'textColor': '28342eff'}},
            'link': {'lightMode': {'defaults': {'textColor': '527160ff'}, 'hover': {'textColor': '405d4dff'}}},
            'optionControls': {'lightMode': {
                'defaults': {'backgroundColor': 'ffffffff', 'borderColor': 'b7c0b3ff'},
                'selected': {'backgroundColor': '527160ff', 'foregroundColor': 'ffffffff'}}}
        },
        'components': {
            'form': {'borderRadius': 12.0,
                     'backgroundImage': {'enabled': False},
                     'lightMode': {'backgroundColor': 'ffffffff', 'borderColor': 'e0e3dbff'},
                     'logo': {'enabled': True, 'formInclusion': 'IN', 'location': 'CENTER', 'position': 'TOP'}},
            'pageBackground': {'image': {'enabled': False}, 'lightMode': {'color': 'f6f5f1ff'}},
            'pageText': {'lightMode': {'bodyColor': '28342eff', 'descriptionColor': '626c63ff', 'headingColor': '28342eff'}},
            'primaryButton': {'lightMode': primary},
            'secondaryButton': {'lightMode': secondary}
        }
    }


def merge_known(target, patch, prefix=''):
    """Only use keys confirmed by the current merged API response."""
    changes = []
    for key, value in patch.items():
        path = f'{prefix}.{key}' if prefix else key
        if key not in target:
            raise ValueError(f'現在のスタイルに設定項目 {path} がありません。AWSのブランドエディターで確認してください。')
        if isinstance(value, dict):
            if not isinstance(target[key], dict):
                raise ValueError(f'設定の形式が異なります: {path}')
            changes.extend(merge_known(target[key], value, path))
        else:
            if target[key] != value:
                changes.append({'setting': path, 'before': target[key], 'after': value})
            target[key] = value
    return changes


def aws(args, operation, *extra):
    cmd = ['aws', 'cognito-idp', operation, '--region', args.region, '--output', 'json', '--no-cli-pager']
    if args.profile:
        cmd.extend(['--profile', args.profile])
    result = subprocess.run(cmd + list(extra), capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or 'AWS CLIの実行に失敗しました。')
    return json.loads(result.stdout or '{}')


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.chmod(path, 0o600)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='プレビューしたブランド設定をAWSへ反映')
    parser.add_argument('--region', default='us-east-1')
    parser.add_argument('--user-pool-id', default='us-east-1_03JsIXY1G')
    parser.add_argument('--client-id', default='5ght6jocv0lr305v9khr8h4rm5')
    parser.add_argument('--profile')
    parser.add_argument('--output-dir', type=Path, default=Path('cognito-branding-backups'))
    args = parser.parse_args()
    current = aws(args, 'describe-managed-login-branding-by-client',
                  '--user-pool-id', args.user_pool_id, '--client-id', args.client_id,
                  '--return-merged-resources')
    style = current.get('ManagedLoginBranding', {})
    branding_id = style.get('ManagedLoginBrandingId')
    if not branding_id or not isinstance(style.get('Settings'), dict):
        raise ValueError('既存のマネージドログインのスタイルを取得できませんでした。スタイルの新規作成は行いません。')
    settings = copy.deepcopy(style['Settings'])
    changes = merge_known(settings, sage_settings())
    logo = ROOT / 'public/assets/bittomo-logo.svg'
    if not logo.is_file():
        raise FileNotFoundError(f'ロゴがありません: {logo}')
    request = {'UserPoolId': args.user_pool_id, 'ManagedLoginBrandingId': branding_id,
               'UseCognitoProvidedValues': False, 'Settings': settings,
               'Assets': [{'Category': 'FORM_LOGO', 'ColorMode': 'LIGHT', 'Extension': 'SVG',
                           'Bytes': base64.b64encode(logo.read_bytes()).decode('ascii')}]}
    # Omitted assets remain intact under the API's PATCH behavior.
    restore = {'UserPoolId': args.user_pool_id, 'ManagedLoginBrandingId': branding_id,
               'UseCognitoProvidedValues': bool(style.get('UseCognitoProvidedValues', False))}
    if not restore['UseCognitoProvidedValues']:
        restore['Settings'] = style['Settings']
        assets = [{k: v for k, v in a.items() if k in {'Category', 'ColorMode', 'Extension', 'Bytes', 'ResourceId'}}
                  for a in style.get('Assets', [])]
        if assets:
            restore['Assets'] = assets
    args.output_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup = args.output_dir / f'before-{stamp}.json'
    proposed = args.output_dir / f'proposed-{stamp}.json'
    write_json(backup, current)
    write_json(args.output_dir / f'restore-{stamp}.json', restore)
    write_json(proposed, request)
    print(json.dumps(changes, ensure_ascii=False, indent=2))
    print(f'現在の設定の保存先: {backup}')
    print(f'反映する設定: {proposed}')
    print('ロゴ: bittomo / 配色: セージ × グレージュ')
    if not args.apply:
        print('プレビューのみです。AWSの設定は変更していません。反映する場合は --apply を付けて実行してください。')
        return
    aws(args, 'update-managed-login-branding', '--cli-input-json', f'file://{proposed.resolve()}')
    print('既存ログイン画面のブランド設定を更新しました。新しいブラウザータブで表示を確認してください。')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, FileNotFoundError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
