#!/usr/bin/env bash
# Axia live-site check. Usage (from anywhere):  bash deploy/check.sh play.yourbrand.in
# Runs 10 checks (HTTPS, redirect, API, games, security headers, robots.txt,
# dev login off, Google client ID baked in, fake tokens rejected).
# Exit code = number of failed checks, so it also works in scripts.
D="${1:?usage: bash deploy/check.sh <domain>}"
K=""; [ "${INSECURE:-}" = "1" ] && K="-k"   # only for local testing with a self-signed cert
pass=0; fail=0
ok()   { echo "  ✅ $1"; pass=$((pass+1)); }
bad()  { echo "  ❌ $1"; fail=$((fail+1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

echo "Checking https://$D ..."
check "HTTPS works with a valid certificate" "curl -s $K -o /dev/null --max-time 15 https://$D/"
check "http:// redirects to https://"        "[ \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 http://$D/)\" = 308 ] || [ \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 http://$D/)\" = 301 ]"
check "API health is ok"                    "curl -s $K --max-time 15 https://$D/api/health | grep -q '\"ok\":true'"
games=$(curl -s $K --max-time 15 https://$D/api/games | grep -o '"slug"' | wc -l)
check "5 games are live (found $games)"     "[ $games -eq 5 ]"
hdrs=$(curl -s $K -I --max-time 15 https://$D/)
check "HSTS header present"                 "echo \"\$hdrs\" | grep -qi strict-transport-security"
check "Clickjacking protection header"      "echo \"\$hdrs\" | grep -qi 'x-frame-options: deny'"
check "robots.txt blocks search engines"    "curl -s $K --max-time 15 https://$D/robots.txt | grep -q 'Disallow: /'"
check "Developer login is disabled"         "[ \"\$(curl -s $K -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{\"email\":\"probe@example.com\"}' https://$D/api/auth/dev-login)\" = 404 ]"
check "Google client ID is built into the site" "curl -s $K --max-time 15 https://$D/login | grep -o '/_next/static/chunks/app/login/page-[a-z0-9]*\.js' | head -1 | xargs -I{} curl -s $K https://$D{} | grep -q 'apps.googleusercontent.com'"
check "Fake Google token is rejected"       "curl -s $K -X POST -H 'content-type: application/json' -d '{\"idToken\":\"fake\"}' https://$D/api/auth/google | grep -q 'Invalid Google token'"
echo
echo "Result: $pass passed, $fail failed."
[ $fail -eq 0 ] && echo "🎉 Site looks ready. Sign in with your ADMIN_EMAILS Google account and create invite codes."
exit $fail
