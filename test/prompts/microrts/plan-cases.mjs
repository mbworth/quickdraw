// Behaviour cases for bin/plan-bench.mjs: a real recorded commander packet + a hand-written S block, scored by a
// predicate on the tool input. Each packet is game layers + F (its `plan`/`expect` clause cut, this is steps mode)
// + a hand-written S block consistent with the packet + O lines. Sources are runs/microrts-basesWorkers16x16-*.jsonl.

const okStep = s => s && typeof s.do === 'string' && s.do.length > 0 && s && s.until && typeof s.until.metric === 'string'
  && ['>=', '<=', '=='].includes(s.until.op) && Number.isFinite(s.until.value) && Number.isFinite(s.until.by);
const okSteps = steps => Array.isArray(steps) && steps.length >= 1 && steps.length <= 4 && steps.every(okStep);

export const cases = [
  {
    name: 'first-plan',
    note: 'HeavyRush-mukigrph seq1 (apiPacketN=1, t0): no plan yet',
    packet: `H t0 r5 u1/1
D none
T IDLE #20; r wk; started
P ba#20 IDLE
E
rs#16@0,0 o25 d4
rs#17@0,1 o25 d3
rs#18@15,14 o25 d25
rs#19@15,15 o25 d26
A
wk x1@1,1 i #22
B ba#20@2,2 hp10
X
ba x1@13,13 d22/24 #21
wk x1@14,14 d24/26 #23
L none
N none
F none
S none
O home: my base hp10; my army 0; my wk 1 at base; their nearest mobile d24
O trig: pushLight 3: my army 0; barracksAt 3: my wk 1, br 0; pushWorkers 6: my fighters 0; defend 6/panic 2: their nearest mobile d24, outside defend
O econ: my bank 5
O mine: harvesters 2: 1st rs#17 d3 o25; 2nd rs#16 d4 o25; next 3rd rs#18 d25 o25, d3 from their ba`,
    expect: input => okSteps(input.steps) && typeof input.why === 'string' && input.why.length > 0,
  },

  {
    name: 'keep-on-track',
    note: 'HeavyRush-mukigrph seq12 (apiPacketN=39, t634): army3, on-schedule mass-to-5 plan',
    packet: `H t634 r2 u9/2
D +li#38 r-2
T idle #37; done li#38; IDLE #29
P ba#20 wk 36; br#29 IDLE
E
rs#16@0,0 o20 d4
rs#17@0,1 o13 d3
rs#18@15,14 o14 d25
rs#19@15,15 o25 d26
A
wk x2@1,1 h #22,#24
wk x1@2,3 i #26
wk x2@4,3 a #27,#30
li x2@3,5 a #33,#36
wk x1@1,2 a #37
li x1@1,4 i #38
B ba#20@2,2 hp10 br#29@1,3 hp4
X
ba x1@13,13 d22/19 #21
wk x1@13,14 d23/20 #23
br x1@14,13 d23/20 #25
hv x1@5,11 d12/9 #35
L t 29 li 5 ok; a #37,#27,#30,#33,#36 3,3 ok
N br#29 up t259. Their hv#32,#35 seen near d6. Holding guard1 vs hv threat. Waiting army=3 to push, li standing.
F set 10 in force 5 decisions: guard 0>1 | orders differed 0/5 | set 11 landed: workers 6>5 guard 1>0
S plan 3 set t400; kept 4 calls; replaced 1x, last why: barracks up, wk cap reached
S1 done t400: grow econ to 6 wk, barracks up | wk>=3 by t400: MET t400
S2 now since t400: mass li to 5 | army>=5 by t830: pending (max 3, t634)
S3 next: push their base | foe_br==0 by t1400
O home: my base hp10; my army 3: 3 within d6 of my base; my wk 6 at base; their nearest mobile d12
O trig: pushLight 3: my army 3 (+1 in last 85c); barracksAt 3: my wk 6, br 1; defend 6/panic 2: their nearest mobile d12, outside defend
O econ: my bank 2 (1 committed); mined +3/85c, spent 5/85c (li 2, wk 1); ba#20 idle 30/85c, br#29 idle 0/85c; most idle ba#20
O push: my army 3 nearest d18 to their ba@13,13, was d18 @t549; orders last 85c: 4 at their unit, 4 at my base
O mine: harvesters 2: 1st rs#17 d3 o13; 2nd rs#16 d4 o20; next 3rd rs#18 d25 o14, d3 from their ba
O threat: their hv x1 d12 to my base; my base hp10
O seen: their hv 2 seen: 1st t369, 2nd t524`,
    expect: input => input.steps === null && input.why === null,
  },

  {
    name: 'keep-after-advance',
    note: 'HeavyRush-mukiaby5 seq13 (apiPacketN=43, t699): step 1 just done, step 2 now, pending',
    packet: `H t699 r4 u7/3
D -li#37 Ehv#35 hp6
T lost li#37
P ba#20 IDLE; br#29 li 11
E
rs#16@0,0 o19 d4
rs#17@0,1 o11 d3
rs#18@15,14 o13 d25
rs#19@15,15 o25 d26
A
wk x1@1,1 h #22
wk x1@3,2 h #24
wk x1@2,3 i #26
wk x1@6,4 a #27
wk x1@8,5 a #30
li x1@4,7 a #33
li x1@6,6 a #36
B ba#20@2,2 hp10 br#29@1,3 hp4
X
ba x1@13,13 d22/13 #21
wk x1@13,14 d23/14 #23
br x1@14,13 d23/14 #25
hv x1@2,8 d6/3 #35
hv x1@11,12 d19/10 #38
L t 29 li 5 ok; a #33,#36,#37,#27,#30 13,13 ok
N br#29 training li. hv#32 dead, hv#35 seen d18. li count 2, awaiting 3rd for push at their ba@13,13.
F set 11 in force 5 decisions: unchanged | orders differed 0/5 | set 12 landed: defend 6>8 panic 2>3 pushLight 3>4 guard 0>1
S plan 2 set t664; kept 1 calls; replaced 1x, last why: workers at cap
S1 done t664: grow workers to 5 | wk>=5 by t664: MET t664
S2 now since t664: mass li to 4 | army>=4 by t900: pending (max 2, t699)
O home: my base hp10; my army 2: 2 within d8 of my base; my wk 4 at base; their nearest mobile d6
O trig: pushLight 4: my army 2 (0 in last 90c); barracksAt 3: my wk 5, br 1; defend 8/panic 3: their nearest mobile d6, inside defend
O econ: my bank 4 (2 committed); mined +2/90c, spent 2/90c (li 1); ba#20 idle 90/90c, br#29 idle 0/90c; most idle ba#20
O push: my army 2 nearest d14 to their ba@13,13, was d18 @t609; orders last 90c: 3 at their ba, 4 at my base
O mine: harvesters 2: 1st rs#17 d3 o11; 2nd rs#16 d4 o19; next 3rd rs#18 d25 o13, d3 from their ba
O threat: their hv x1 d6 to my base; my base hp10
O seen: their hv 3 seen: 1st t369, 2nd t524, 3rd t664`,
    expect: input => input.steps === null,
  },

  {
    name: 'replace-missed',
    note: 'HeavyRush-mukiaby5 seq12 (apiPacketN=38, t634): army3, their hv on the board, deadline missed',
    packet: `H t634 r3 u8/2
D +li#37 r-2
T done li#37
P ba#20 IDLE; br#29 li 76
E
rs#16@0,0 o20 d4
rs#17@0,1 o13 d3
rs#18@15,14 o14 d25
rs#19@15,15 o25 d26
A
wk x2@1,1 h #22,#24
wk x1@2,3 i #26
wk x2@4,3 a #27,#30
li x2@3,5 a #33,#36
li x1@1,4 i #37
B ba#20@2,2 hp10 br#29@1,3 hp4
X
ba x1@13,13 d22/18 #21
wk x1@13,14 d23/19 #23
br x1@14,13 d23/19 #25
hv x1@5,11 d12/8 #35
L t 29 li 5 ok; a #27,#30,#33,#36 3,3 ok
N br#29 training li since t259. their hv#32,hv#35 seen near d3-6. push planned at li x3, watch hv threat.
F set 10 in force 4 decisions: unchanged | orders differed 0/4 | set 11 landed: unchanged
S plan 2 set t420; kept 6 calls; replaced 1x, last why: econ opening done
S1 done t420: grow economy, barracksAt 3 | wk>=4 by t420: MET t420
S2 now since t420: mass li to 5 | army>=5 by t600: MISSED (max 3)
S3 next: push their base | foe_br==0 by t1300
O home: my base hp10; my army 3: 3 within d6 of my base; my wk 5 at base; their nearest mobile d12
O trig: pushLight 3: my army 3 (+1 in last 85c); barracksAt 3: my wk 5, br 1; defend 6/panic 2: their nearest mobile d12, outside defend
O econ: my bank 3 (2 committed); mined +3/85c, spent 4/85c (li 2); ba#20 idle 85/85c, br#29 idle 0/85c; most idle ba#20
O push: my army 3 nearest d18 to their ba@13,13, was d18 @t549; orders last 85c: 4 at their unit, 3 at my base
O mine: harvesters 2: 1st rs#17 d3 o13; 2nd rs#16 d4 o20; next 3rd rs#18 d25 o14, d3 from their ba
O threat: their hv x1 d12 to my base; my base hp10
O seen: their hv 2 seen: 1st t369, 2nd t524`,
    expect: input => okSteps(input.steps) && typeof input.why === 'string' && input.why.length > 0,
  },

  {
    name: 'replace-not-deadline-only',
    note: 'same packet as replace-missed (HeavyRush-mukiaby5 seq12, apiPacketN=38): new plan must be more than a later `by`',
    packet: `H t634 r3 u8/2
D +li#37 r-2
T done li#37
P ba#20 IDLE; br#29 li 76
E
rs#16@0,0 o20 d4
rs#17@0,1 o13 d3
rs#18@15,14 o14 d25
rs#19@15,15 o25 d26
A
wk x2@1,1 h #22,#24
wk x1@2,3 i #26
wk x2@4,3 a #27,#30
li x2@3,5 a #33,#36
li x1@1,4 i #37
B ba#20@2,2 hp10 br#29@1,3 hp4
X
ba x1@13,13 d22/18 #21
wk x1@13,14 d23/19 #23
br x1@14,13 d23/19 #25
hv x1@5,11 d12/8 #35
L t 29 li 5 ok; a #27,#30,#33,#36 3,3 ok
N br#29 training li since t259. their hv#32,hv#35 seen near d3-6. push planned at li x3, watch hv threat.
F set 10 in force 4 decisions: unchanged | orders differed 0/4 | set 11 landed: unchanged
S plan 2 set t420; kept 6 calls; replaced 1x, last why: econ opening done
S1 done t420: grow economy, barracksAt 3 | wk>=4 by t420: MET t420
S2 now since t420: mass li to 5 | army>=5 by t600: MISSED (max 3)
S3 next: push their base | foe_br==0 by t1300
O home: my base hp10; my army 3: 3 within d6 of my base; my wk 5 at base; their nearest mobile d12
O trig: pushLight 3: my army 3 (+1 in last 85c); barracksAt 3: my wk 5, br 1; defend 6/panic 2: their nearest mobile d12, outside defend
O econ: my bank 3 (2 committed); mined +3/85c, spent 4/85c (li 2); ba#20 idle 85/85c, br#29 idle 0/85c; most idle ba#20
O push: my army 3 nearest d18 to their ba@13,13, was d18 @t549; orders last 85c: 4 at their unit, 3 at my base
O mine: harvesters 2: 1st rs#17 d3 o13; 2nd rs#16 d4 o20; next 3rd rs#18 d25 o14, d3 from their ba
O threat: their hv x1 d12 to my base; my base hp10
O seen: their hv 2 seen: 1st t369, 2nd t524`,
    expect: input => okSteps(input.steps) && !(input.steps[0].until.metric === 'army' && input.steps[0].until.op === '>=' && input.steps[0].until.value === 5),
  },

  {
    name: 'follow-train',
    note: 'HeavyRush-mukiaby5 seq26 (apiPacketN=108, t1449): plan says train hv, br is still on li',
    packet: `H t1449 r2 u7/4
D +wk#56 Ehv#49 hp2 r-1
T done wk#56; IDLE #20
P ba#20 IDLE; br#29 li 56
E
rs#16@0,0 o9 d4
rs#17@0,1 o5 d3
rs#19@15,15 o24 d26
A
wk x2@2,1 h #24,#26
li x3@3,5 a #40,#50,#55
wk x2@2,2 i #53,#56
B ba#20@2,2 hp10 br#29@1,3 hp4
X
ba x1@13,13 d22/18 #21
wk x1@14,15 d25/21 #23
br x1@14,13 d23/19 #25
hv x1@3,6 d5/1 #49
hv x1@2,8 d6/3 #52
hv x1@11,12 d19/15 #54
L t 29 li 5 ok; t 20 wk ok; a #40,#50,#55 #49 ok
N hv#49 d5 t1344, hv#52 d14. army2, bank3. br#29 idle. train li. hold post d1, defend8/panic3. rebuild to 5 before push.
F set 24 in force 5 decisions: engage 2>3 | orders differed 3/5 | last: t 29 li 5; t 20 wk 1; a #40,#50 3,3 / was t 29 li 5; t 20 wk 1; a #40,#50 49 | set 25 landed: unchanged
S plan 3 set t1300; kept 2 calls; replaced 2x, last why: hv threat building near base
S1 done t1300: hold post vs early li | li>=3 by t1300: MET t1300
S2 now since t1300: train hv to meet their hv | hv>=2 by t1700: pending (max 0, t1449)
S3 next: push their base | foe_br==0 by t2200
O home: my base hp10; my army 3: 3 within d8 of my base; my wk 4 at base; their nearest mobile d5
O trig: pushLight 5: my army 3 (+1 in last 75c); barracksAt 3: my wk 4, br 1; defend 8/panic 3: their nearest mobile d5, inside defend
O econ: my bank 2 (2 committed); mined +2/75c, spent 4/75c (wk 2, li 1); ba#20 idle 0/75c, br#29 idle 0/75c
O push: my army 3 nearest d18 to their ba@13,13, was d17 @t1374; orders last 75c: 3 at their unit, 3 at my base
O mine: harvesters 2: 1st rs#17 d3 o5; 2nd rs#16 d4 o9; next 3rd rs#19 d26 o24, d4 from their ba
O threat: their hv x1 d5 to my base; my base hp10
O seen: their hv 8 seen: 5th t964, 6th t1124, 7th t1269, 8th t1429`,
    expect: input => typeof input.train === 'string' && input.train.split(',').includes('hv'),
  },

  {
    name: 'follow-hold',
    note: 'LightRush-muki1jck seq16 (apiPacketN=66, t799): army3, plan holds the post until army 5',
    packet: `H t799 r2 u7/3
D +li#44 r-1
T seen at 0,1; done li#44; IDLE #29
P ba#20 wk 26; br#29 IDLE
E
rs#16@0,0 o18 d4
rs#17@0,1 o12 d3
rs#18@15,14 o11 d25
rs#19@15,15 o25 d26
A
wk x2@2,1 h #22,#24
wk x1@1,2 i #37
wk x1@3,3 a #38
li x2@3,4 i #40,#42
li x1@0,3 i #44
B ba#20@2,2 hp6 br#29@1,3 hp4
X
ba x1@13,13 d22/19 #21
wk x1@13,14 d23/20 #23
br x1@14,13 d23/20 #25
li x1@3,7 d6/3 #41
li x1@11,12 d19/16 #43
L t 29 li 5 ok; t 20 wk ok; a #38,#40,#42 3,3 ok
N t694: base hp6, br#29 training li(2 alive). bank3(2 committed). Their li seen 5, nearest d7. Hold post guard1 until li=3 then push.
F set 14 in force 4 decisions: unchanged | orders differed 0/4 | set 15 landed: workers 5>4 guard 1>0
S plan 2 set t700; kept 3 calls; replaced 1x, last why: base took hp damage, hold before pushing
S1 done t700: rebuild base defense | base_hp>=6 by t700: MET t700
S2 now since t700: hold at post, no push before army 5 | army>=5 by t1100: pending (max 3, t799)
S3 next: push their base | foe_br==0 by t1600
O home: my base hp6; my army 3: 3 within d6 of my base; my wk 4 at base; their nearest mobile d6
O trig: pushLight 3: my army 3 (0 in last 90c); barracksAt 3: my wk 4, br 1; defend 6/panic 2: their nearest mobile d6, inside defend
O econ: my bank 2 (1 committed); mined +3/90c, spent 2/90c (li 1); ba#20 idle 90/90c, br#29 idle 10/90c; most idle ba#20
O push: my army 3 nearest d19 to their ba@13,13, was d19 @t709; orders last 90c: 2 at their unit, 5 at my base
O mine: harvesters 2: 1st rs#17 d3 o12; 2nd rs#16 d4 o18; next 3rd rs#18 d25 o11, d3 from their ba
O threat: their li x1 d6 to my base; my base hp6
O seen: their li 6 seen: 3rd t474, 4th t579, 5th t674, 6th t774`,
    expect: input => input.pushLight > 3,
  },

  {
    name: 'follow-advance',
    note: 'LightRush-muki1jck seq33 (apiPacketN=156, t1750): army5, plan pushes with the whole army',
    packet: `H t1750 r1 u11/2
D none
T seen at 2,1; idle #52; idle #56
P ba#20 IDLE; br#29 IDLE
E
rs#16@0,0 o9 d4
rs#19@15,15 o19 d26
A
wk x1@0,1 i #22
wk x1@5,6 a #24
wk x1@1,0 h #37
wk x1@15,7 h #45
wk x1@8,4 a #52
wk x1@2,5 a #53
li x1@4,6 a #56
li x4@2,4 a #59,#61,#63,#64
B ba#20@2,2 hp6 br#29@1,3 hp4
X
ba x1@13,13 d22/8 #21
wk x1@13,14 d23/9 #23
br x1@14,13 d23/7 #25
li x1@8,5 d9/1 #62
L a #59,#61,#63,#64,#53,#24,#52 13,13 ok; a #56 2,4 wait
N t1650: army4 pushing d17 to their ba. br#29 training li, bank1. their li14 seen. their nearest mobile d20. hold course.
F set 31 in force 8 decisions: unchanged | orders differed 0/8 | set 32 landed: pushLight 4>3 group 2>4
S plan 4 set t1710; kept 1 calls; replaced 3x, last why: army reached 5, ready to push
S1 done t1710: mass li to 5 | army>=5 by t1710: MET t1710
S2 now since t1710: push their base with the whole army | foe_br==0 by t2200: pending (last 1, t1750)
O home: my base hp6; my army 5: 5 within d6 of my base; my wk 3 at base; their nearest mobile d9
O trig: pushLight 3: my army 5 (+1 in last 100c); barracksAt 3: my wk 6, br 1; defend 6/panic 2: their nearest mobile d9, outside defend
O econ: my bank 1; mined +2/100c, spent 2/100c (li 1); ba#20 idle 100/100c, br#29 idle 35/100c; most idle ba#20
O push: my army 5 nearest d16 to their ba@13,13, was d17 @t1650; orders last 100c: 1 at their ba, 13 at my base
O mine: harvesters 2: 1st rs#16 d4 o9; 2nd rs#19 d26 o19, d4 from their ba
O threat: their li x1 d9 to my base; my base hp6
O seen: their li 14 seen: 11th t1279, 12th t1379, 13th t1494, 14th t1650`,
    expect: input => input.pushLight <= 5,
  },
];
