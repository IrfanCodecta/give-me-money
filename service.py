#!/usr/bin/env python3
"""Give me money: charge one 10-credit payment to irfani from this owner's credits.

POST /give {key, price_micro}  -> 200 {charge_id, charged_micro}
                               or the credits refusal {detail, code}.
The page retries the same key while Möbius waits for the owner's Pay.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

SELLER, APP, ACTION = 'irfani', 'give-me-money', 'give'
KEY = re.compile(r'^[A-Za-z0-9-]{8,64}$')


def credits(method, path, body=None):
  request = urllib.request.Request(
    os.environ['API_BASE_URL'].rstrip('/') + path, method=method,
    data=json.dumps(body).encode() if body is not None else None,
    headers={'Authorization': 'Bearer ' + os.environ['APP_TOKEN'], 'Content-Type': 'application/json'})
  try:
    with urllib.request.urlopen(request, timeout=25) as response:
      return response.status, json.loads(response.read() or b'{}')
  except urllib.error.HTTPError as error:
    try:
      data = json.loads(error.read() or b'{}')
    except ValueError:
      data = {}
    return error.code, data
  except (urllib.error.URLError, TimeoutError):
    return 503, {'detail': {'code': 'unreachable', 'message': 'Credits can’t be reached right now.'}}


def refused(status, data):
  detail = data.get('detail') if isinstance(data, dict) else None
  if isinstance(detail, dict):
    return {'status': status, 'body': {'code': detail.get('code') or 'error',
                                       'detail': detail.get('message') or 'That didn’t go through.'}}
  return {'status': status, 'body': {'code': 'error', 'detail': str(detail or 'That didn’t go through.')}}


def dispatch(request):
  path = str(request.get('path', '')).strip('/')
  method = str(request.get('method', 'GET')).upper()
  body = request.get('body') if isinstance(request.get('body'), dict) else {}
  if path == 'price' and method == 'GET':
    status, data = credits('GET', f'/api/identity/credits/prices/{SELLER}?app_slug={APP}')
    if status >= 400:
      return refused(status, data)
    price = next((p for p in data.get('prices') or [] if p.get('action') == ACTION and p.get('enabled')), None)
    if not price:
      return {'status': 404, 'body': {'code': 'price_not_found', 'detail': 'The price isn’t set up yet.'}}
    return {'status': 200, 'body': {'price_micro': price['price_micro'],
                                    'seller_receives_micro': price.get('seller_receives_micro')}}
  if path == 'give' and method == 'POST':
    key, shown = body.get('key'), body.get('price_micro')
    if not isinstance(key, str) or not KEY.match(key):
      return {'status': 422, 'body': {'code': 'bad_key', 'detail': 'Missing payment key.'}}
    if not isinstance(shown, int) or isinstance(shown, bool) or shown <= 0:
      return {'status': 422, 'body': {'code': 'bad_price', 'detail': 'Say the price you were shown.'}}
    status, data = credits('POST', '/api/identity/credits/charges', {
      'seller': SELLER, 'app': APP, 'action': ACTION,
      'idempotency_key': 'give-' + key, 'max_price_micro': shown, 'method': 'credits'})
    if status >= 400:
      return refused(status, data)
    return {'status': 200, 'body': {'charge_id': data.get('charge_id'),
                                    'charged_micro': data.get('amount_micro', shown)}}
  return {'status': 404, 'body': {'code': 'no_route', 'detail': 'No such route.'}}


if __name__ == '__main__':
  print(json.dumps(dispatch(json.loads(sys.stdin.read() or '{}')), separators=(',', ':')))
