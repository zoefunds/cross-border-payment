#!/bin/bash
set -e

BASE="http://127.0.0.1:5001/demo-crossborder/us-central1"
AUTH="http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1"

echo "========================================="
echo "  Cross-Border Payment API Tests"
echo "========================================="

echo ""
echo "1. Health Check"
curl -s $BASE/healthCheck | jq .status

echo ""
echo "2. Wipe emulator data"
curl -s -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/demo-crossborder/databases/(default)/documents" > /dev/null
curl -s -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/demo-crossborder/accounts" > /dev/null
echo "Wiped."

echo ""
echo "3. Register Sender"
SENDER_RESPONSE=$(curl -s -X POST $BASE/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"sender@nigeria.com","password":"Password123!","phoneNumber":"+2348012345678","fullName":"Emeka Okafor","country":"NG"}')
echo $SENDER_RESPONSE | jq .
SENDER_UID=$(echo $SENDER_RESPONSE | jq -r .data.uid)
echo "SENDER_UID: $SENDER_UID"

echo ""
echo "4. Register Receiver (with crypto wallet)"
RECEIVER_RESPONSE=$(curl -s -X POST $BASE/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"receiver@ghana.com","password":"Password123!","phoneNumber":"+233201234567","fullName":"Kwame Mensah","country":"GH","cryptoWalletAddress":"0xc5BaB95d4738143b8967A2cF14f411F36787DC44"}')
echo $RECEIVER_RESPONSE | jq .
RECEIVER_UID=$(echo $RECEIVER_RESPONSE | jq -r .data.uid)
echo "RECEIVER_UID: $RECEIVER_UID"
echo "RECEIVER_WALLET: $(echo $RECEIVER_RESPONSE | jq -r .data.primaryCryptoWallet)"

echo ""
echo "5. Login Sender"
TOKEN=$(curl -s -X POST \
  "$AUTH/accounts:signInWithPassword?key=fake-api-key" \
  -H "Content-Type: application/json" \
  -d '{"email":"sender@nigeria.com","password":"Password123!","returnSecureToken":true}' | jq -r .idToken)
echo "TOKEN: ${TOKEN:0:30}..."

echo ""
echo "6. Get Sender Profile"
curl -s $BASE/api/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq .data.fullName

echo ""
echo "7. Seed NGN wallet"
node /Users/macbook/cross-border-payment/seed.js $SENDER_UID NGN 500000

echo ""
echo "8. Check NGN Balance"
curl -s $BASE/api/ledger/balance/NGN \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "9. FX Quote"
curl -s "$BASE/api/fx/quote?sourceAmount=10000&pair=NGN%2FGHS" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "10. Add wallet to sender too"
curl -s -X POST $BASE/api/auth/wallets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"address":"0xc5BaB95d4738143b8967A2cF14f411F36787DC44","label":"MetaMask"}' | jq .data.primaryCryptoWallet

echo ""
echo "11. Initiate Transaction"
TIMESTAMP=$(date +%s)
TX_RESPONSE=$(curl -s -X POST $BASE/api/transactions/initiate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"receiverId\":\"$RECEIVER_UID\",\"sourceAmount\":10000,\"sourceCurrency\":\"NGN\",\"idempotencyKey\":\"test-tx-$TIMESTAMP\"}")
echo $TX_RESPONSE | jq .
TX_ID=$(echo $TX_RESPONSE | jq -r .data.transactionId)
echo "TX_ID: $TX_ID"

echo ""
echo "12. Polling for completion (max 90s)..."
for i in $(seq 1 18); do
  sleep 5
  STATUS=$(curl -s $BASE/api/transactions/$TX_ID \
    -H "Authorization: Bearer $TOKEN" | jq -r .data.status)
  echo "  [${i}] ${i}0s → Status: $STATUS"
  if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "REFUNDED" ]; then
    echo "  Terminal status reached!"
    break
  fi
done

echo ""
echo "13. Final Transaction Status"
curl -s $BASE/api/transactions/$TX_ID \
  -H "Authorization: Bearer $TOKEN" | jq .data.status

echo ""
echo "14. Ledger Entries"
curl -s $BASE/api/transactions/$TX_ID/ledger \
  -H "Authorization: Bearer $TOKEN" | jq '[.data[] | {type:.type, amount:.amount, currency:.currency}]'

echo ""
echo "15. Final NGN Balance (should be 490000)"
curl -s $BASE/api/ledger/balance/NGN \
  -H "Authorization: Bearer $TOKEN" | jq .data.balance

echo ""
echo "16. Liquidity Status"
curl -s $BASE/api/liquidity/status \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "17. Verify on-chain (totalLocked should be 0)"
cast call 0xC8Abf536BE8AD155F0C30fFcAb3ae7852e072B48 \
  "totalLocked()(uint256)" \
  --rpc-url https://sepolia.base.org

echo ""
echo "========================================="
echo "  Tests Complete"
echo "========================================="
