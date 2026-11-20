#!/usr/bin/env bash
# 部署到 Cloud Run（台灣 asia-east1）。用法：在專案根目錄執行 bash deploy-cloud-run.sh
set -euo pipefail

PROJECT=workflow-515016
REGION=asia-east1
SERVICE=shengling-rush
SQL_INSTANCE="$PROJECT:$REGION:rush-db"
SECRETS="LINE_CHANNEL_SECRET LINE_CHANNEL_ACCESS_TOKEN LINE_LOGIN_CHANNEL_SECRET OPENAI_API_KEY DATABASE_URL SESSION_SECRET"
# 空白＝只用規則解析；要用 OpenAI 就填模型名稱（先在測試帳號試過）
OPENAI_MODEL="${OPENAI_MODEL:-}"

have=$(gcloud secrets list --project "$PROJECT" --format="value(name)")
for s in $SECRETS; do
  echo "$have" | grep -qx "$s" || { echo "缺少密鑰：$s（請先到 Secret Manager 建立）"; exit 1; }
done

SET_SECRETS=$(for s in $SECRETS; do printf '%s=%s:latest,' "$s" "$s"; done)
SET_SECRETS=${SET_SECRETS%,}

ENVS="PARSE_TIMEOUT_MS=8000,BIND_CODE_HOURS=24,LINE_LOGIN_CHANNEL_ID=2012663375,LIFF_ID=2012663375-iRuOgiAS"
[ -n "$OPENAI_MODEL" ] && ENVS="$ENVS,OPENAI_MODEL=$OPENAI_MODEL"

gcloud run deploy "$SERVICE" --source server \
  --project "$PROJECT" --region "$REGION" \
  --allow-unauthenticated \
  --no-cpu-throttling --min-instances 0 --max-instances 2 \
  --add-cloudsql-instances "$SQL_INSTANCE" \
  --set-env-vars "$ENVS" \
  --set-secrets "$SET_SECRETS"

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')
gcloud run services update "$SERVICE" --project "$PROJECT" --region "$REGION" --update-env-vars "PUBLIC_URL=$URL"

echo
echo "網址：$URL"
echo "健康檢查：$URL/api/config（Cloud Run 會攔截 /healthz）"
echo "Webhook：$URL/line/webhook"
echo "Callback：$URL/auth/callback"
echo "LIFF Endpoint：$URL/liff/"
