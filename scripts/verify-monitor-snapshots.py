"""Independent Decimal verification of authenticated live-source snapshot exports.
No credentials, network requests, application math imports or advertising writes.
Usage: python3 scripts/verify-monitor-snapshots.py /private/tmp/aiads-live-monitor-act_*-7d.json /private/tmp/aiads-live-monitor-act_*-30d.json
"""
import json, sys
from decimal import Decimal, ROUND_HALF_UP, localcontext
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path

failures, results = [], []
D = Decimal
Q = D('0.000001')

def equal(actual, expected, label):
    if actual is None or expected is None:
        ok = actual is None and expected is None
    else:
        try: ok = D(str(actual)) == D(str(expected))
        except Exception: ok = actual == expected
    if not ok: failures.append(label + ': value differs from independently checked source/calculation')

def verify(s, path):
    facts = {f['id']: f for f in s['evidence']}
    assert len(facts) == len(s['evidence']), 'Duplicate evidence IDs'
    a, w, pw = s['account'], s['window'], s['previousWindow']
    start, end = datetime.fromisoformat(w['since']), datetime.fromisoformat(w['until'])
    days = (end-start).days+1
    assert days == (7 if s['period']=='7d' else 30), 'Incorrect window length'
    assert datetime.fromisoformat(pw['until']) == start-timedelta(days=1), 'Overlapping comparison'
    assert (datetime.fromisoformat(pw['until'])-datetime.fromisoformat(pw['since'])).days+1 == days, 'Unequal comparison'
    retrieved = datetime.fromisoformat(s['completedAt'].replace('Z','+00:00'))
    assert end.date() < retrieved.astimezone(ZoneInfo(a['timezone'])).date(), 'Incomplete reporting day'
    checked, unavailable = 0, 0
    for f in s['evidence']:
        for ref in f.get('inputs',[]): assert ref in facts, 'Unknown calculation input'
        if f.get('formula'):
            vals = [facts[k]['value'] for k in f.get('inputs',[])]
            expected = None
            formula = f['formula']
            if all(v is not None for v in vals):
                nums = [D(v) for v in vals]
                if formula == 'sum of all campaign spend': expected = sum(nums,D(0))
                elif formula == 'campaign spend sum - account spend': expected = nums[0]-nums[1]
                elif len(nums)==2 and nums[1] != 0:
                    expected = nums[0]/nums[1]
                    if '× 100' in formula: expected *= 100
                    expected = expected.quantize(Q, rounding=ROUND_HALF_UP)
            equal(f['value'], expected, f['id'])
            checked += 1
            continue
        source = f['source']
        if source == 'profile':
            if f['value'] is not None:
                c = s['context']; assert c and c['accountId']==a['id'] and c['currency']==a['currency'], 'Wrong target identity'
                candidates = {'costTarget':['targetCostPerResult','targetCpa' if c['primaryOutcome']=='purchases' else 'targetCpl' if c['primaryOutcome']=='leads' else ''], 'monthlyBudget':['monthlyBudget'], 'roasTarget':['targetRoas']}[f['metric']]
                expected = next((c[k] for k in candidates if k and c.get(k) is not None), None)
                equal(f['value'],expected,f['id']); checked += 1
            else: unavailable += 1
            continue
        src = s['sources'][source]
        rows = src.get('data') or []
        if f['value'] is None:
            unavailable += 1; continue
        assert src['state']=='available', 'Value from unavailable source'
        if f['metric']=='disapprovedAds': expected = sum(1 for row in rows if row.get('effective_status')=='DISAPPROVED')
        else:
            matched = [row for row in rows if str(row.get('ad_id') if f['scope']=='ad' else row.get('campaign_id') if f['scope']=='campaign' else row.get('account_id',row.get('id',''))).replace('act_','') == f['entityId'].replace('act_','')]
            assert len(matched)==1, 'Ambiguous or missing source entity'
            row = matched[0]
            if f['window']:
                assert row.get('account_currency')==a['currency'], 'Wrong currency'
                assert row.get('date_start')==f['window']['since'] and row.get('date_stop')==f['window']['until'], 'Wrong source period'
            field=f['field']
            if ':action_type=' in field:
                origin,action_type=field.split(':action_type=',1)
                actions = [v for v in row.get(origin,[]) if v.get('action_type')==action_type]
                assert len(actions)==1, 'Ambiguous action'
                expected=actions[0]['value']
                if f['metric']=='leads': assert 'lead' in action_type, 'Wrong outcome identity'
                if f['metric'] in ['purchases','purchaseValue']: assert 'purchase' in action_type, 'Wrong outcome identity'
            else: expected=row.get(field)
        equal(f['value'],expected,f['id']); checked += 1
    applicable=[c for c in s['checks'] if c['state']!='not_applicable']
    known=[c for c in applicable if c['state']!='unknown']
    equal(s['coverage']['evaluated'],len(known),'Coverage count')
    equal(s['coverage']['applicable'],len(applicable),'Applicable count')
    if s['score'] is not None:
        assert s['integrity']=='verified' and len(known)==len(applicable), 'Score without complete evidence'
        total=sum(D(c['weight']) for c in applicable)
        points=sum(D(c['weight'])*(D(1) if c['state']=='pass' else D('.5') if c['state']=='review' else D(0)) for c in applicable)
        equal(s['score'],(points*100/total).quantize(D(1),rounding=ROUND_HALF_UP),'Check score')
    native=s['sources']['nativeScore'].get('data')
    if s['nativeScore'] is not None: equal(s['nativeScore'],native[0]['opportunity_score'],'Native Meta score')
    results.append({'accountId':a['id'],'period':s['period'],'window':w,'figuresVerified':checked,'unavailableFigures':unavailable,'integrity':s['integrity'],'checksEvaluated':len(known),'applicableChecks':len(applicable),'nativeScoreAvailable':s['nativeScore'] is not None,'snapshotId':s['id']})

with localcontext() as ctx:
    ctx.prec=80
    for name in sys.argv[1:]:
        try:
            data=json.loads(Path(name).read_text()); verify(data.get('snapshot',data),name)
        except Exception as error: failures.append(Path(name).name+': '+str(error))
report={'snapshots':len(results),'figuresVerified':sum(r['figuresVerified'] for r in results),'failures':failures,'results':results}
print(json.dumps(report,indent=2))
raise SystemExit(1 if failures or not results else 0)
