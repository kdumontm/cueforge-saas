#!/usr/bin/env python3
"""
Test simple du endpoint PATCH /admin/{user_id}/comp.
"""
import requests
import json
import time

BASE_URL = "https://cueforge-saas-production.up.railway.app"

# Login
print("Logging in...")
res = requests.post(
    f"{BASE_URL}/api/v1/auth/login",
    json={"identifier": "kenin", "password": "kenin33"}
)
data = res.json()
token = data["access_token"]
print(f"✓ Logged in as admin (token={token[:20]}...)")

def auth_header():
    return {"Authorization": f"Bearer {token}"}

# Get initial stats
print("\nGetting initial stats...")
res = requests.get(
    f"{BASE_URL}/api/v1/admin/stats/overview",
    headers=auth_header()
)
stats1 = res.json()
mrr1 = stats1["revenue_metrics"]["mrr_estimate"]
comp_unlimited_1 = stats1["revenue_metrics"].get("comp_unlimited_users", 0)
print(f"  MRR: {mrr1}€, comp_unlimited: {comp_unlimited_1}")

# Toggle comp ON for user 1 (kenin, unlimited)
print("\nToggling comp ON for user 1...")
res = requests.patch(
    f"{BASE_URL}/api/v1/admin/1/comp?is_comp=true",
    headers=auth_header()
)
print(f"  Response: {res.status_code}")
if res.status_code == 200:
    print(f"  {res.json()}")

# Wait and get new stats
time.sleep(1)
print("\nGetting stats after toggle ON...")
res = requests.get(
    f"{BASE_URL}/api/v1/admin/stats/overview",
    headers=auth_header()
)
stats2 = res.json()
mrr2 = stats2["revenue_metrics"]["mrr_estimate"]
comp_unlimited_2 = stats2["revenue_metrics"].get("comp_unlimited_users", 0)
print(f"  MRR: {mrr2}€, comp_unlimited: {comp_unlimited_2}")

# Toggle OFF
print("\nToggling comp OFF for user 1...")
res = requests.patch(
    f"{BASE_URL}/api/v1/admin/1/comp?is_comp=false",
    headers=auth_header()
)
print(f"  Response: {res.status_code}")

# Wait and verify
time.sleep(1)
print("\nGetting stats after toggle OFF...")
res = requests.get(
    f"{BASE_URL}/api/v1/admin/stats/overview",
    headers=auth_header()
)
stats3 = res.json()
mrr3 = stats3["revenue_metrics"]["mrr_estimate"]
comp_unlimited_3 = stats3["revenue_metrics"].get("comp_unlimited_users", 0)
print(f"  MRR: {mrr3}€, comp_unlimited: {comp_unlimited_3}")

# Check results
print("\n" + "="*50)
if comp_unlimited_2 > comp_unlimited_1 and mrr2 < mrr1:
    print("✓ TEST PASS: Comp flag reduces MRR correctly")
    print(f"  Before: MRR={mrr1}€, comp={comp_unlimited_1}")
    print(f"  After ON: MRR={mrr2}€, comp={comp_unlimited_2}")
    print(f"  After OFF: MRR={mrr3}€, comp={comp_unlimited_3}")
else:
    print("❌ TEST FAIL: Comp flag did not affect MRR")
    print(f"  Before: MRR={mrr1}€, comp={comp_unlimited_1}")
    print(f"  After ON: MRR={mrr2}€, comp={comp_unlimited_2}")
    print(f"  After OFF: MRR={mrr3}€, comp={comp_unlimited_3}")
