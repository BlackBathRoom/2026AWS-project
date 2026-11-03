#!/usr/bin/env python3
"""Read-only AWS preflight. Prints real KB/model ARNs for CDK; never deploys."""
import argparse
import json
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--knowledge-base-id', required=True)
    parser.add_argument('--model-id', required=True, help='Nova Pro model ID, or its inference profile ID/ARN')
    parser.add_argument('--region', default='us-east-1')
    args = parser.parse_args()

    def aws(service, operation, *parameters):
        call = subprocess.run(['aws', service, operation, *parameters, '--region', args.region,
                               '--output', 'json', '--no-cli-pager'], capture_output=True, text=True)
        if call.returncode:
            print(f'AWS確認失敗: {service} {operation}\n{call.stderr.strip()}', file=sys.stderr)
            raise SystemExit(call.returncode)
        return json.loads(call.stdout)

    identity = aws('sts', 'get-caller-identity')
    kb = aws('bedrock-agent', 'get-knowledge-base', '--knowledge-base-id', args.knowledge_base_id)['knowledgeBase']
    if kb.get('status') != 'ACTIVE':
        raise SystemExit('Knowledge BaseがACTIVEではありません。同期・設定を確認してください。')
    model = args.model_id
    is_profile = ':inference-profile/' in model or ':application-inference-profile/' in model or model.startswith(('us.', 'eu.', 'apac.', 'global.'))
    if is_profile:
        profile = aws('bedrock', 'get-inference-profile', '--inference-profile-identifier', model)
        if profile.get('status') != 'ACTIVE':
            raise SystemExit('Inference profileがACTIVEではありません。')
        foundation_arns = [item['modelArn'] for item in profile.get('models', [])]
        if not foundation_arns or any(not arn.endswith('/amazon.nova-pro-v1:0') for arn in foundation_arns):
            raise SystemExit('この手順はNova Pro用です。指定したprofileの基盤モデルを確認してください。')
        model_id = profile['inferenceProfileArn']
        invocation_arns = [model_id, *foundation_arns]
    else:
        if model != 'amazon.nova-pro-v1:0':
            raise SystemExit('プロトタイプと同じNova Proのmodel IDまたはprofileを指定してください。')
        details = aws('bedrock', 'get-foundation-model', '--model-identifier', model)['modelDetails']
        model_id = details['modelId']
        invocation_arns = [details['modelArn']]

    # These APIs inspect configuration only. Actual invocation permissions and
    # retrieval quality are checked by smoke-textbook-ai.ts and the live worker.
    print(json.dumps({
        'account': identity['Account'], 'region': args.region,
        'knowledgeBase': {'id': kb['knowledgeBaseId'], 'name': kb['name'], 'status': kb['status']},
        'parameters': {'KnowledgeBaseId': args.knowledge_base_id, 'ModelId': model_id,
                       'ModelInvokeArns': ','.join(dict.fromkeys(invocation_arns))},
        'note': '読み取り確認のみ。モデル呼出権限、教材同期、回答品質は実機テストで別途確認します。',
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
