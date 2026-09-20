# MicroRTS vs the built-in scripted AIs

Local engine, `maps/16x16/basesWorkers16x16.xml` against `ai.abstraction.WorkerRush` unless noted, `--microrts-cycle-ms 100`
(the adapter's reply delay is the game's clock, so a cycle is 100 ms of real time). The clone must carry
`src/games/microrts/remote-game-utt.patch`. Scripted-policy games cost $0.

| game | id | model | result | time | notes |
|---|---|---|---|---|---|
| 1 | basesWorkers16x16-WorkerRush-mu2jndx2 | script:rush, quickdraw | **win** | 2:30 | 140 decisions (55.1/min), reaction p50 0.5 s / p90 0.5 s, packet est p50 ~120, kept 61.7%, $0 |
| 2 | basesWorkers16x16-WorkerRush-mu2jqntf | script:rush, quickdraw | **win** | 2:36 | 145 decisions (56.1/min), reaction p50 0.5 s / p90 0.5 s, kept 57.5%, $0 |
| 3 | basesWorkers16x16-WorkerRush-mu2jtzn4 | script:rush, quickdraw | **win** | 2:24 | 135 decisions (56.9/min), reaction p50 0.5 s / p90 0.5 s, kept 60.7%, $0 |
| 4 | basesWorkers16x16-WorkerRush-mu2jx1of | script:rush, quickdraw | **win** | 2:24 | 140 decisions (58/min), reaction p50 0.5 s / p90 0.5 s, kept 62.4%, $0 |
| 5 | basesWorkers16x16-WorkerRush-mu2k05k9 | script:rush, quickdraw | **win** | 2:36 | 156 decisions (60.4/min), reaction p50 0.4 s / p90 0.5 s, kept 61.4%, $0 |
| 6 | basesWorkers16x16-WorkerRush-mu346lqi | script:rush, quickdraw | **win** | 3:54 | campaign 1/5: 229 decisions (58.5/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 61.1%, 165 rejected, cache null%, $0 |
| 7 | basesWorkers16x16-WorkerRush-mu34br82 | script:rush, quickdraw | **win** | 2:48 | campaign 2/5: 174 decisions (62.5/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 55.8%, 146 rejected, cache null%, $0 |
| 8 | basesWorkers16x16-WorkerRush-mu34fg74 | script:rush, quickdraw | loss | 2:54 | campaign 3/5: 166 decisions (58.1/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 53.8%, 160 rejected, cache null%, $0 |
| 9 | basesWorkers16x16-WorkerRush-mu34j8np | script:rush, quickdraw | loss | 2:36 | campaign 4/5: 148 decisions (56.9/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 56%, 116 rejected, cache null%, $0 |
| 10 | basesWorkers16x16-WorkerRush-mu34mp5b | script:rush, quickdraw | loss | 0:54 | campaign 5/5: 44 decisions (48.4/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 62.9%, 22 rejected, cache null%, $0 |
| 11 | basesWorkers16x16-WorkerRush-mu35721h | script:rush, quickdraw | **win** | 1:30 | campaign 1/5: 89 decisions (57.7/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 54.3%, 23 rejected, cache null%, $0 |
| 12 | basesWorkers16x16-WorkerRush-mu3595j6 | script:rush, quickdraw | **win** | 1:42 | campaign 2/5: 98 decisions (57.1/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 54.4%, 25 rejected, cache null%, $0 |
| 13 | basesWorkers16x16-WorkerRush-mu35bh6d | script:rush, quickdraw | **win** | 1:30 | campaign 3/5: 87 decisions (56.2/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 53.9%, 19 rejected, cache null%, $0 |
| 14 | basesWorkers16x16-WorkerRush-mu35dkxf | script:rush, quickdraw | **win** | 2:00 | campaign 4/5: 108 decisions (55.4/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 54.2%, 30 rejected, cache null%, $0 |
| 15 | basesWorkers16x16-WorkerRush-mu35g7bd | script:rush, quickdraw | **win** | 1:36 | campaign 5/5: 89 decisions (54.2/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 52.7%, 22 rejected, cache null%, $0 |
| 16 | basesWorkers16x16-WorkerRush-mu35s4kh | claude-sonnet-5, quickdraw | loss | 0:42 | model 1: plain: 17 decisions (22.9/min), reaction p50 3.1 s / p90 5.6 s (wait 0.8 s), model p50 2.1 s, 47 out tokens, packet 490 real, 0 timeouts, kept 39.4%, 4 rejected, cache 100% (2821 written), $0.0403 |
| 17 | basesWorkers16x16-WorkerRush-mu35upxg | claude-sonnet-5, quickdraw | loss | 0:42 | model 2: --overlap 2 --event-tick: 25 decisions (34.8/min), reaction p50 3.1 s / p90 4.6 s (wait 0.2 s), model p50 2.1 s, 46 out tokens, packet 480 real, 1 timeouts, 21 overlapped, kept 30.4%, 9 rejected, cache 100%, $0.0494 |
| 18 | basesWorkers16x16-WorkerRush-mu35uul3 | claude-sonnet-5, quickdraw | **win** | 6:06 | model 3: --microrts-cycle-ms 300 (latency-free diagnostic): 135 decisions (22.1/min), reaction p50 3.9 s / p90 5.4 s (wait 0.7 s), model p50 2.2 s, 54 out tokens, packet 545 real, 2 timeouts, kept 41.1%, 71 rejected, cache 100%, $0.2998 |
| 19 | basesWorkers16x16-WorkerRush-mu363izf | claude-sonnet-5, quickdraw | loss | 0:42 | model 4: --thinking off --overlap 2 --event-tick: 24 decisions (35.1/min), reaction p50 3.1 s / p90 4.4 s (wait 0 s), model p50 2.2 s, 50 out tokens, packet 495 real, 0 timeouts, 20 overlapped, kept 42.6%, 6 rejected, cache 95.7% (5642 written), $0.0616 |
| 20 | basesWorkers16x16-WorkerRush-mu363mff | claude-sonnet-5, quickdraw | loss | 0:48 | model 5: --effort low --overlap 2 --event-tick: 32 decisions (38.7/min), reaction p50 2.2 s / p90 3.3 s (wait 0 s), model p50 2 s, 48 out tokens, packet 505 real, 1 timeouts, 29 overlapped, kept 37.3%, 15 rejected, cache 100%, $0.0649 |
| 21 | basesWorkers16x16-WorkerRush-mu4a1wcj | claude-sonnet-5, quickdraw | **win** | 6:30 | campaign 1/3: 116 decisions (17.7/min), reaction p50 5.4 s / p90 7.5 s (wait 1.6 s), model p50 2.8 s, 122 out tokens, packet 585 real, 0 timeouts, kept 39.3%, 81 rejected, cache 100%, $0.3503 |
| 22 | basesWorkers16x16-WorkerRush-mu4aaf6x | claude-sonnet-5, quickdraw | loss | 2:12 | campaign 2/3: 42 decisions (19.1/min), reaction p50 4.8 s / p90 6.3 s (wait 0.2 s), model p50 2.4 s, 104 out tokens, packet 510 real, 0 timeouts, kept 38.6%, 12 rejected, cache 100%, $0.1122 |
| 23 | basesWorkers16x16-WorkerRush-mu4add1e | claude-sonnet-5, quickdraw | loss | 3:00 | campaign 3/3: 54 decisions (18/min), reaction p50 4.8 s / p90 6 s (wait 0.6 s), model p50 2.5 s, 104 out tokens, packet 529 real, 0 timeouts, kept 41.5%, 12 rejected, cache 100%, $0.1476 |
| 24 | basesWorkers16x16-WorkerRush-mu4ah87z | claude-sonnet-5, quickdraw | loss | 2:42 | campaign 1/2: 53 decisions (19.8/min), reaction p50 5.1 s / p90 6 s (wait 0.1 s), model p50 2.3 s, 44 out tokens, packet 460 real, 0 timeouts, kept 45.6%, 7 rejected, cache 100% (2821 written), $0.11 |
| 25 | basesWorkers16x16-WorkerRush-mu4aks2u | claude-sonnet-5, quickdraw | loss | 2:00 | campaign 2/2: 40 decisions (20/min), reaction p50 3.9 s / p90 4.5 s (wait 0 s), model p50 2.1 s, 46 out tokens, packet 468 real, 0 timeouts, kept 40.6%, 10 rejected, cache 100%, $0.0777 |
| 26 | basesWorkers16x16-WorkerRush-mu4fki7q | claude-sonnet-5, quickdraw | loss | 2:42 | campaign 1/3: 54 decisions (20/min), reaction p50 4.5 s / p90 5.4 s (wait 0.3 s), model p50 2.6 s, 149 out tokens, packet 854 real, 0 timeouts, kept 31.3%, 15 rejected, cache 100% (3718 written), $0.2149 |
| 27 | basesWorkers16x16-WorkerRush-mu4fo38c | claude-sonnet-5, quickdraw | loss | 2:36 | campaign 2/3: 54 decisions (20.4/min), reaction p50 3.9 s / p90 5.4 s (wait 0.2 s), model p50 2.4 s, 136 out tokens, packet 819 real, 0 timeouts, kept 23.1%, 10 rejected, cache 100%, $0.1972 |
| 28 | basesWorkers16x16-WorkerRush-mu4frlxk | claude-sonnet-5, quickdraw | loss | 3:00 | campaign 3/3: 57 decisions (19.2/min), reaction p50 4.2 s / p90 6 s (wait 0.6 s), model p50 2.6 s, 144 out tokens, packet 899 real, 2 timeouts, kept 37.1%, 17 rejected, cache 100%, $0.2194 |
| 29 | basesWorkers16x16-WorkerRush-mu4gu26e | claude-sonnet-5, quickdraw | loss | 3:24 | campaign 1/3: 71 decisions (21.1/min), reaction p50 4.2 s / p90 5.4 s (wait 0.8 s), model p50 2.4 s, 147 out tokens, packet 906 real, 0 timeouts, kept 37.6%, 17 rejected, cache 100% (3777 written), $0.2816 |
| 30 | basesWorkers16x16-WorkerRush-mu4gyiha | claude-sonnet-5, quickdraw | loss | 3:18 | campaign 2/3: 71 decisions (21.2/min), reaction p50 4.5 s / p90 5.4 s (wait 0.6 s), model p50 2.5 s, 138 out tokens, packet 928 real, 0 timeouts, kept 49.5%, 14 rejected, cache 100%, $0.2698 |
| 31 | basesWorkers16x16-WorkerRush-mu4h2xla | claude-sonnet-5, quickdraw | loss | 2:48 | campaign 3/3: 59 decisions (20.7/min), reaction p50 4.8 s / p90 5.7 s (wait 0.9 s), model p50 2.5 s, 129 out tokens, packet 901 real, 0 timeouts, kept 46.2%, 9 rejected, cache 100%, $0.2191 |
| 32 | basesWorkers16x16-WorkerRush-mu4h8cau | claude-sonnet-5, quickdraw | loss | 2:30 | campaign 1/3: 50 decisions (20/min), reaction p50 5.1 s / p90 6.6 s (wait 0.7 s), model p50 2.5 s, 148 out tokens, packet 781 real, 0 timeouts, kept 36.7%, 20 rejected, cache 100%, $0.1932 |
| 33 | basesWorkers16x16-WorkerRush-mu4hbo2j | claude-sonnet-5, quickdraw | **win** | 5:54 | campaign 2/3: 118 decisions (19.9/min), reaction p50 4.8 s / p90 6.3 s (wait 1.3 s), model p50 2.6 s, 172 out tokens, packet 955 real, 0 timeouts, kept 67.2%, 70 rejected, cache 100%, $0.5014 |
| 34 | basesWorkers16x16-WorkerRush-mu4hjegh | claude-sonnet-5, quickdraw | loss | 2:24 | campaign 3/3: 46 decisions (19.4/min), reaction p50 4.8 s / p90 6 s (wait 0.8 s), model p50 2.7 s, 149 out tokens, packet 762 real, 0 timeouts, kept 40%, 24 rejected, cache 100%, $0.1766 |
| 35 | basesWorkers16x16-WorkerRush-mu4hzowq | commander:rush, quickdraw | **win** | 1:48 | campaign 1/3: 114 decisions (64.5/min), reaction p50 0.5 s / p90 0.5 s (wait 0.4 s), model p50 0 s, 0 out tokens, packet 963 real, 0 timeouts, kept 50.8%, 22 rejected, cache 94.4% (2824 written), $0.1039 |
| 36 | basesWorkers16x16-WorkerRush-mu4i22va | commander:rush, quickdraw | **win** | 1:18 | campaign 2/3: 78 decisions (60.3/min), reaction p50 0.5 s / p90 0.5 s (wait 0.3 s), model p50 0 s, 0 out tokens, packet 955 real, 0 timeouts, kept 54.8%, 18 rejected, cache 100%, $0.0786 |
| 37 | basesWorkers16x16-WorkerRush-mu4i3uu3 | commander:rush, quickdraw | **win** | 1:30 | campaign 3/3: 87 decisions (58.6/min), reaction p50 0.5 s / p90 0.5 s (wait 0.3 s), model p50 0 s, 0 out tokens, packet 971 real, 0 timeouts, kept 50.8%, 20 rejected, cache 100%, $0.0905 |
| 38 | basesWorkers16x16-LightRush-mu4id71h | script:rush, quickdraw | **win** | 2:12 | campaign 1/3: 113 decisions (50.5/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 54.5%, 33 rejected, cache null%, $0 |
| 39 | basesWorkers16x16-LightRush-mu4ig6q1 | script:rush, quickdraw | loss | 2:00 | campaign 2/3: 84 decisions (43/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 54.9%, 37 rejected, cache null%, $0 |
| 40 | basesWorkers16x16-LightRush-mu4iit9d | script:rush, quickdraw | loss | 2:06 | campaign 3/3: 93 decisions (45.2/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 56.1%, 39 rejected, cache null%, $0 |
| 41 | basesWorkers16x16-HeavyRush-mu4ilgwq | script:rush, quickdraw | loss | 5:00 | campaign 1/3: 159 decisions (31.8/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 47.3%, 125 rejected, cache null%, $0 |
| 42 | basesWorkers16x16-HeavyRush-mu4is0iw | script:rush, quickdraw | loss | 1:48 | campaign 2/3: 78 decisions (44.6/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 54.6%, 22 rejected, cache null%, $0 |
| 43 | basesWorkers16x16-HeavyRush-mu4iudnz | script:rush, quickdraw | loss | 2:06 | campaign 3/3: 101 decisions (47.4/min), reaction p50 0.1 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 57.1%, 19 rejected, cache null%, $0 |
| 44 | basesWorkers16x16-RangedRush-mu4ix4oy | script:rush, quickdraw | loss | 2:12 | campaign 1/3: 106 decisions (48.7/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 51.5%, 22 rejected, cache null%, $0 |
| 45 | basesWorkers16x16-RangedRush-mu4j01j0 | script:rush, quickdraw | **win** | 1:54 | campaign 2/3: 89 decisions (45.9/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 55.2%, 17 rejected, cache null%, $0 |
| 46 | basesWorkers16x16-RangedRush-mu4j2ng7 | script:rush, quickdraw | **win** | 1:12 | campaign 3/3: 50 decisions (41.9/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 50%, 13 rejected, cache null%, $0 |
| 47 | basesWorkers16x16-CoacAI-mu4j4730 | script:rush, quickdraw | loss | 1:42 | campaign 1/3: 80 decisions (47.5/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 46.6%, 18 rejected, cache null%, $0 |
| 48 | basesWorkers16x16-CoacAI-mu4j6h4j | script:rush, quickdraw | loss | 1:42 | campaign 2/3: 81 decisions (47.2/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 50%, 13 rejected, cache null%, $0 |
| 49 | basesWorkers16x16-CoacAI-mu4j8spt | script:rush, quickdraw | loss | 1:30 | campaign 3/3: 74 decisions (50.4/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 53.4%, 9 rejected, cache null%, $0 |
| 50 | basesWorkers16x16-HeavyRush-mu4jt1b6 | script:rush, quickdraw | **win** | 2:30 | campaign 1/3: 106 decisions (42.2/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 51.6%, 16 rejected, cache null%, $0 |
| 51 | basesWorkers16x16-HeavyRush-mu4jwdnv | script:rush, quickdraw | loss | 2:06 | campaign 2/3: 73 decisions (34.5/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 60.9%, 11 rejected, cache null%, $0 |
| 52 | basesWorkers16x16-HeavyRush-mu4jz7su | script:rush, quickdraw | loss | 2:36 | campaign 3/3: 91 decisions (34.7/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 55%, 41 rejected, cache null%, $0 |
| 53 | basesWorkers16x16-HeavyRush-mu4k2lra | script:rush, quickdraw | **win** | 1:54 | campaign 1/3: 73 decisions (39.4/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 53.7%, 24 rejected, cache null%, $0 |
| 54 | basesWorkers16x16-HeavyRush-mu4k53ks | script:rush, quickdraw | loss | 1:48 | campaign 2/3: 69 decisions (38.6/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 57.5%, 21 rejected, cache null%, $0 |
| 55 | basesWorkers16x16-HeavyRush-mu4k7ihq | script:rush, quickdraw | loss | 1:48 | campaign 3/3: 75 decisions (40.9/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 59.9%, 22 rejected, cache null%, $0 |
| 56 | basesWorkers16x16-CoacAI-mu4k9vql | script:rush, quickdraw | loss | 1:54 | campaign 1/3: 94 decisions (48.6/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 51.6%, 17 rejected, cache null%, $0 |
| 57 | basesWorkers16x16-CoacAI-mu4kchdf | script:rush, quickdraw | loss | 1:30 | campaign 2/3: 65 decisions (42.8/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 53.4%, 24 rejected, cache null%, $0 |
| 58 | basesWorkers16x16-CoacAI-mu4kejpn | script:rush, quickdraw | loss | 1:54 | campaign 3/3: 98 decisions (52.2/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 53.7%, 15 rejected, cache null%, $0 |
| 59 | basesWorkers16x16-CoacAI-mu4kgz03 | script:rush, quickdraw | loss | 1:54 | campaign 1/3: 77 decisions (40.3/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 45.2%, 31 rejected, cache null%, $0 |
| 60 | basesWorkers16x16-CoacAI-mu4kjjha | script:rush, quickdraw | loss | 1:48 | campaign 2/3: 83 decisions (45.8/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 50.3%, 14 rejected, cache null%, $0 |
| 61 | basesWorkers16x16-CoacAI-mu4klzhe | script:rush, quickdraw | loss | 1:54 | campaign 3/3: 79 decisions (41.4/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 45.6%, 31 rejected, cache null%, $0 |
| 62 | basesWorkers16x16-LightRush-mu4l4iw4 | commander:rush, quickdraw | loss | 1:42 | campaign 1/3: 84 decisions (48.6/min), reaction p50 0.4 s / p90 0.5 s (wait 0.1 s), model p50 0 s, 0 out tokens, packet 940 real, 0 timeouts, kept 60.4%, 11 rejected, cache 94.1% (2979 written), $0.1019 |
| 63 | basesWorkers16x16-LightRush-mu4l6v2j | commander:rush, quickdraw | **win** | 4:36 | campaign 2/3: 236 decisions (51.5/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 962 real, 0 timeouts, kept 55.5%, 36 rejected, cache 100%, $0.2906 |
| 64 | basesWorkers16x16-LightRush-mu4lcvjk | commander:rush, quickdraw | loss | 1:48 | campaign 3/3: 96 decisions (52.4/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 942 real, 0 timeouts, kept 55.4%, 15 rejected, cache 100%, $0.1102 |
| 65 | basesWorkers16x16-CoacAI-mu4lf8o9 | commander:rush, quickdraw | loss | 1:42 | campaign 1/3: 83 decisions (48.1/min), reaction p50 0.5 s / p90 0.5 s (wait 0.1 s), model p50 0 s, 0 out tokens, packet 953 real, 0 timeouts, kept 49.7%, 12 rejected, cache 100%, $0.1001 |
| 66 | basesWorkers16x16-CoacAI-mu4lhkpc | commander:rush, quickdraw | loss | 1:48 | campaign 2/3: 87 decisions (49/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 953 real, 0 timeouts, kept 57.3%, 17 rejected, cache 100%, $0.0936 |
| 67 | basesWorkers16x16-CoacAI-mu4ljyyw | commander:rush, quickdraw | loss | 1:30 | campaign 3/3: 73 decisions (49.7/min), reaction p50 0.5 s / p90 0.5 s (wait 0.1 s), model p50 0 s, 0 out tokens, packet 927 real, 0 timeouts, kept 57.1%, 9 rejected, cache 100%, $0.0872 |
| 68 | basesWorkers16x16-LightRush-mu4tz3mk | commander:rush, quickdraw | loss | 1:54 | campaign 1/3: 94 decisions (50.2/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 959 real, 0 timeouts, kept 56.2%, 23 rejected, cache 100%, $0.116 |
| 69 | basesWorkers16x16-LightRush-mu4u1mic | commander:rush, quickdraw | loss | 2:12 | campaign 2/3: 101 decisions (46.9/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 975 real, 0 timeouts, kept 62.7%, 16 rejected, cache 100%, $0.1215 |
| 70 | basesWorkers16x16-LightRush-mu4u4i8a | commander:rush, quickdraw | **win** | 2:42 | campaign 3/3: 150 decisions (54.7/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 992 real, 0 timeouts, kept 53.7%, 18 rejected, cache 100%, $0.1648 |
| 71 | basesWorkers16x16-CoacAI-mu4u81ql | commander:rush, quickdraw | loss | 1:30 | campaign 1/3: 61 decisions (40.8/min), reaction p50 0.4 s / p90 0.5 s (wait 0.2 s), model p50 0 s, 0 out tokens, packet 939 real, 0 timeouts, kept 56.5%, 13 rejected, cache 100%, $0.0797 |
| 72 | basesWorkers16x16-CoacAI-mu4ua30o | commander:rush, quickdraw | loss | 2:00 | campaign 2/3: 109 decisions (53.4/min), reaction p50 0.5 s / p90 0.5 s (wait 0.3 s), model p50 0 s, 0 out tokens, packet 1005 real, 0 timeouts, kept 47.5%, 17 rejected, cache 100%, $0.1284 |
| 73 | basesWorkers16x16-CoacAI-mu4uctpz | commander:rush, quickdraw | loss | 1:30 | campaign 3/3: 72 decisions (49.6/min), reaction p50 0.5 s / p90 0.5 s (wait 0.1 s), model p50 0 s, 0 out tokens, packet 938 real, 0 timeouts, kept 55.9%, 10 rejected, cache 100%, $0.0911 |
| 74 | basesWorkers16x16-LightRush-mu5ek2bt | commander:rush, quickdraw | loss | 1:48 | campaign 1/3: 97 decisions (53.8/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 961 real, 0 timeouts, kept 61.5%, 18 rejected, cache 95.5% (5938 written), $0.1495 |
| 75 | basesWorkers16x16-LightRush-mu5emhzm | commander:rush, quickdraw | **win** | 2:30 | campaign 2/3: 135 decisions (53.9/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 979 real, 0 timeouts, kept 55.4%, 22 rejected, cache 100%, $0.1815 |
| 76 | basesWorkers16x16-LightRush-mu5epu4g | commander:rush, quickdraw | loss | 2:06 | campaign 3/3: 110 decisions (52.7/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 985 real, 0 timeouts, kept 59.6%, 17 rejected, cache 100%, $0.1485 |
| 77 | basesWorkers16x16-CoacAI-mu5esj41 | commander:rush, quickdraw | loss | 1:30 | campaign 1/3: 80 decisions (52/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 981 real, 0 timeouts, kept 57.4%, 9 rejected, cache 100%, $0.1044 |
| 78 | basesWorkers16x16-CoacAI-mu5eumf3 | commander:rush, quickdraw | loss | 1:36 | campaign 2/3: 76 decisions (48.5/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 970 real, 0 timeouts, kept 61.7%, 14 rejected, cache 100%, $0.1095 |
| 79 | basesWorkers16x16-CoacAI-mu5ewr47 | commander:rush, quickdraw | loss | 1:30 | campaign 3/3: 80 decisions (52/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 965 real, 0 timeouts, kept 57%, 9 rejected, cache 100%, $0.1169 |
| 80 | basesWorkers16x16-CoacAI-mu5fmewr | commander:rush, quickdraw | loss | 2:12 | campaign 1/3: 120 decisions (53.5/min), reaction p50 0.5 s / p90 0.5 s (wait 0.3 s), model p50 0 s, 0 out tokens, packet 1021 real, 0 timeouts, kept 91.6%, 19 rejected, cache 95.5% (5938 written), $0.1519 |
| 81 | basesWorkers16x16-CoacAI-mu5fpeuo | commander:rush, quickdraw | loss | 1:54 | campaign 2/3: 96 decisions (50.9/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 1014 real, 0 timeouts, kept 91.8%, 13 rejected, cache 100%, $0.1185 |
| 82 | basesWorkers16x16-CoacAI-mu5fry73 | commander:rush, quickdraw | loss | 1:42 | campaign 3/3: 87 decisions (50.7/min), reaction p50 0.5 s / p90 0.5 s (wait 0.5 s), model p50 0 s, 0 out tokens, packet 974 real, 0 timeouts, kept 89%, 19 rejected, cache 100%, $0.1183 |
| 83 | basesWorkers16x16-CoacAI-mu5ge6uv | commander:rush, quickdraw | loss | 1:36 | campaign 1/1: 79 decisions (49.6/min), reaction p50 0.5 s / p90 0.5 s (wait 0.3 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 83.8%, 25 rejected, cache null%, $0 |
| 84 | basesWorkers16x16-CoacAI-mu5guou4 | commander:rush, quickdraw | loss | 1:18 | campaign 1/1: 56 decisions (44.5/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet 848 real, 0 timeouts, kept 87.8%, 12 rejected, cache 80% (5870 written), $0.2977 |
| 85 | basesWorkers16x16-CoacAI-mu5m464l | commander:rush, quickdraw | loss | 1:42 | campaign 1/1: 84 decisions (48.2/min), reaction p50 0.5 s / p90 0.5 s (wait 0.2 s), model p50 0 s, 0 out tokens, packet 1083 real, 0 timeouts, kept 90.6%, 14 rejected, cache 100%, $0.0833 |
| 85 | basesWorkers16x16-CoacAI-mu5m464m | commander:rush, quickdraw | loss | 9:30 | campaign 1/1: 267 decisions (28.2/min), reaction p50 0.4 s / p90 0.8 s (wait 0 s), model p50 0 s, 0 out tokens, packet 974 real, 0 timeouts, kept 90.3%, 49 rejected, cache 96.4% (6853 written), $1.9799 |
| 86 | basesWorkers16x16-CoacAI-mua6w66c | script:rush, quickdraw | loss | 1:24 | campaign 1/1: 64 decisions (46.8/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 88.5%, 14 rejected, cache null%, $0 |
| 87 | basesWorkers16x16-HeavyRush-mua6xxx7 | script:rush, quickdraw | loss | 2:06 | campaign 1/3: 85 decisions (40/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 73.4%, 41 rejected, cache null%, $0 |
| 88 | basesWorkers16x16-HeavyRush-mua70sfs | script:rush, quickdraw | loss | 1:30 | campaign 2/3: 66 decisions (44.2/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 78.6%, 21 rejected, cache null%, $0 |
| 89 | basesWorkers16x16-HeavyRush-mua72tlz | script:rush, quickdraw | loss | 2:06 | campaign 3/3: 84 decisions (40/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 74.5%, 40 rejected, cache null%, $0 |
| 90 | basesWorkers16x16-CoacAI-mua7baej | script:rush, quickdraw | loss | 1:42 | campaign 1/1: 69 decisions (40.1/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 96.8%, 4 rejected, cache null%, $0 |
| 91 | basesWorkers16x16-HeavyRush-mua7dihx | script:rush, quickdraw | loss | 4:30 | campaign 1/3: 183 decisions (41/min), reaction p50 0.1 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 98.8%, 4 rejected, cache null%, $0 |
| 92 | basesWorkers16x16-HeavyRush-mua7jdfb | script:rush, quickdraw | loss | 2:42 | campaign 2/3: 117 decisions (43.2/min), reaction p50 0.2 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 94.3%, 12 rejected, cache null%, $0 |
| 93 | basesWorkers16x16-HeavyRush-mua7myxa | script:rush, quickdraw | loss | 5:00 | campaign 3/3: 197 decisions (39.4/min), reaction p50 0.1 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 98.5%, 5 rejected, cache null%, $0 |
| 94 | basesWorkers16x16-CoacAI-mua7xsgr | script:rush, quickdraw | loss | 1:54 | campaign 1/1: 91 decisions (47.5/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 96.6%, 6 rejected, cache null%, $0 |
| 95 | basesWorkers16x16-HeavyRush-mua809k4 | script:rush, quickdraw | loss | 2:00 | campaign 1/3: 70 decisions (34.8/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 84.3%, 19 rejected, cache null%, $0 |
| 96 | basesWorkers16x16-HeavyRush-mua82ynu | script:rush, quickdraw | loss | 1:48 | campaign 2/3: 56 decisions (31.5/min), reaction p50 0.3 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 93.1%, 7 rejected, cache null%, $0 |
| 97 | basesWorkers16x16-HeavyRush-mua85cyc | script:rush, quickdraw | loss | 2:00 | campaign 3/3: 70 decisions (35.9/min), reaction p50 0.4 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 82%, 24 rejected, cache null%, $0 |
| 98 | basesWorkers16x16-WorkerRush-mua88msh | script:rush, quickdraw | **win** | 3:12 | campaign 1/1: 211 decisions (66.3/min), reaction p50 0.5 s / p90 0.5 s (wait 0 s), model p50 0 s, 0 out tokens, packet null real, 0 timeouts, kept 86.2%, 58 rejected, cache null%, $0 |

**Campaign 1 (`script:rush` vs `ai.abstraction.WorkerRush`, 2026-09-15): 5 of 5**, every game 2:24–2:36, 55–60
decisions a minute, reaction p50 0.4–0.5 s (one `refreshMs`: the floor for a 500 ms state cadence), $0.

**Fidelity (oracle v3): 34% of the 716 decisions survive the packet, 28% exact, zero read errors on either side**
(`bin/oracle.mjs runs/mrts/*.jsonl --policy rush`). v1 read 100%, but its state side mirrored the encoder's shaping; v2/v3
read the full state — every unit and every enemy its own entry with its own state and cell — so the A and X folds are
measured too. Per-layer ablation against the unshaped view: A costs 456 decisions, X 71 (12 of the 18 X losses are a
raid inside DEFEND whose cluster centroid sat outside it), B/P/E 0, budget and cadence 0. **`--microrts-split-states
true` (A never mixes states) lifts it to 58% same / 51% exact for +9 tokens a packet**; what remains is positional — the
same harvesters chosen, but a cluster centroid decides which idle worker sorts nearest or which node it gets. At
298 tokens (countTokens-calibrated, divisor 1.28, 2026-09-15) the packet is a cheap carrier of this plan, not a lossless one. Layer shares: enemy 29%, economy 17%, army 17%, last 15%,
buildings 7%, production 6%, the rest 9%. Economy and buildings are 98–100% repeats — the first thing to try cutting.

`kept` sits near 60% by design, not by accident. The 443 dropped orders are all `busy`: the plan re-offers `t … li 5`
and `t … wk 5` every decision, and validate refuses one aimed at a building with a produce already in flight, because
issuing over it cancels it and burns the resources. The 442 `wait` results are the same thing a level down — a standing
goal that could not be stepped that cycle and is still in the buffer. Neither is a lost order; `pace` counts both
against `kept` because it cannot tell a standing order from a failed one.

**Bench 8/8, trajectory rules** (`bin/bench.mjs --game microrts --model script:rush`, `bin/trajectory.mjs … --every 5`):
purchases agree 89% windowed, army 100%. Two rules under-score for reasons that are the rule's, not the plan's:
`noIdle` 3/17, because a unit holding a standing goal in the buffer is not re-named in that decision's orders and a
per-decision rule cannot see the buffer; `harvesters` 20/27, because the A layer collapses a cluster to one dominant
state, so two workers in `h` and `m` read as two harvesters. Oracle v2 prices that miss: it is the whole 64% of
decisions the packet loses (v2; 66% under v3 with X unfolded). `--diff` n=4: `wk x2@3,1 r` is one worker returning and one walking, so the packet counts
two harvesters and tops up neither; n=9: a worker producing the barracks hides inside an `h` cluster, so the packet
re-buys the barracks instead of a worker. One caveat: the rule that pays is the harvester top-up, which reads a
unit's engine action (`h`/`r`) rather than its standing order, so a harvester mid-walk reads `m` on the state side and
draws a third harvester; the oracle prices what the packet does not carry (per-unit state), not which side is right.

**Campaign 2 (`--microrts-split-states true`, 2026-09-15): 2 of 5** (games 6–10). Fidelity up, play down: first Light at
cycle 474 in every game against 434 in every game of campaign 1; harvester node swaps 49–84 a game against 12–32; 14–21
distinct workers ordered to harvest against 9–11. Game 10 lost its base at cycle 444 with the barracks idle at r2 for
90 cycles (`t 32 li 5` → `wait`: an enemy worker parked beside it, the defence attack-moved onto the same cells, and a
produce needs a free neighbour). Cause: the policy's harvester rule reads a unit's engine action, so a harvester walking
to its node is `m` and counts as free; under the fold two walkers shared a centroid and sorted by id, which kept the pair
stable by accident — per-unit positions flip the nearest-first sort every decision and the pair is reassigned mid-trip
(the game-1 lesson in `rush.mjs`, back). The oracle cannot see this: its state-side reference churns the same way, and
per-decision equivalence has no notion of a standing order across decisions. Fix on the adapter side: `goal` on each
unit from the standing-order buffer, rendered as the A state under `--microrts-goal-state` (campaign 3).

**Campaign 3 (`--microrts-split-states true --microrts-goal-state true`, 2026-09-15): 5 of 5** (games 11–15), every
game 1.5–1.9 min (914–1,165 cycles) against 2:24–2:36 in campaign 1 — the fastest MicroRTS games yet. `goal-state`
renders a unit's standing order from the buffer as its A state, so a harvester walking to its node reads `h` for the
whole trip: harvest orders a game 6–13 (campaign 1: 165–206; campaign 2: 178–348), node swaps 1 (12–32; 49–84), distinct
harvesters 2–4 (9–11; 14–21). Fidelity on these recordings: **89% same / 64% exact over 471 decisions** (A 49, X 29);
`--arm --microrts-goal-state false` on the same recordings reads 64%, so the flag itself is worth 25 points of fidelity
and the whole of the churn. First Light still 464–509 (campaign 1: 434) but the harvesters never drop ore, so the
defence holds and the push lands 500 cycles sooner. Both flags are the working config from here.

**Model games 16–20 (Sonnet, `prompts/microrts/game01-sonnet.md`, working packet flags, 2026-09-15): 1 of 5, and the
one win is the diagnostic.** At the real clock (100 ms a cycle) the model lost four games in 0:41–0:49, $0.04–0.06 each:
reaction p50 3.1 s (2.2 s with `--effort low`) is 22–31 cycles a decision, so the base starts its first worker at cycle
44–76 (script: 0), the barracks lands at 364–404 or never (script: 249), and the rush that arrives around cycle 320 kills
the builder or the base before a Light exists. API time is 2.0–2.2 s of that on every config — `--thinking off` and
`--overlap 2 --event-tick` do not move it, `--effort low` takes 0.9 s off the reaction and not enough off the opening.
Game 18 at `--microrts-cycle-ms 300` (13 cycles a decision) **won in 6:06 for $0.30** with the barracks at 280 and the
first Light at 452, inside the script's range: plan and packet carry the model once its latency is not the game clock.
The model's own share, from the trajectory rules: 3–6 harvesters where the plan says two (`harvesters` 6/14, 7/21,
12/110, 3/18, 9/29), the barracks builder re-tasked to harvest or move in games 17 and 19 (the buffer's one goal per
unit cancels the build), and no answer to the raid in game 17. Two phrasings the parser refused (`a all wk 2,4`, a hunt
with two ids) now parse (`lang.mjs`). Harness-side next: a scripted opening (`opening.mjs` exists for Ashfall) so the
first 250 cycles do not wait on a 3 s call, and a sticky build so an in-flight barracks survives a re-task.

**Memory (`--memory 200`, `game02-sonnet.md`, 300 ms a cycle, 2026-09-16): 1 of 3 (games 21–23) against 1 of 3 without it
(games 18, 24–25).** The model writes a note to itself in the tool's `n` field and reads it back as layer `N` on the next
packet (core, game-agnostic; docs/REQUIREMENTS.md M12). It did what it was built for: harvest orders per game 69/24/14 →
38/12/13, barracks builders 3/2/4 → 2/1/2, the builder never re-tasked mid-build, and the note read as a plan
(`#22,#25 harvesting. Base pumping workers to 6. Next free worker with 5+ banked builds barracks near 2,2`). It cost
what a note costs: the model rewrote it on every call (116/116, 93 distinct), output 44–54 → 104–122 tokens, model p50
2.1–2.3 → 2.4–2.8 s, reaction p50 3.9–5.1 → 4.8–5.4 s. It did not move the win rate, because all four losses are the same
in-decision failure: raiders on `X` at d ≤ 6 from cycle ~205 while the model keeps ordering `t 20 wk 5`, four harvesters
instead of two, the bank at 0–2 when the barracks finishes (255), so no Light ever comes and the base is dead by 360–470.
The defence rule was never in the note, and the note cannot fire a rule the decision does not apply. Memory removes
the forgetting; the rule-following is still the loss. Also fixed: a worker building a barracks read state `?` under
`--microrts-goal-state` (STATE had no `train`); it reads `p` now, so game 18 replays 127/138 and every later run 100%.

**History (`--journal 6 --log 60 --memory 300 --microrts-foe-events true --packet-max 900`, `game03-sonnet.md`, 300 ms a
cycle, 2026-09-16): 0 of 3 (games 26–28), $0.20–0.22 a game.** The harness now keeps what happened — `G` the game so far
(their production, contacts, losses, kills in 50-cycle buckets), `R` the last six decisions with their outcomes — and the
note is asked for plan / why / doing / expect. The scaffolding worked as a scaffold: every note kept the form, the
builder was tracked from order to barracks (games 26–27 one builder each), harvest orders 14/9/23, and the model wrote
what it saw. It lost the same way as 22–25: first raider at d ≤ 6 on `X` at t218/240/222, first attack order at
t293/never/260, base making workers throughout, barracks at 253/297/260 with the bank at 1–2, no Light. Game 26's `why`
said `no threats near (d>=5)` on three consecutive packets that showed a raider at d5, d4, d3; game 27's `expect` said
`br done soon` for twelve decisions with no cycle to check. Cost of the history: packet 819–899 real tokens (was ~530),
output 136–149 (note rewritten every call), model p50 2.4–2.6 s. Conclusion after six memory games: neither memory nor
history is the bottleneck against WorkerRush — the defence and the two-harvester rules are not applied inside the
decision that sees the trigger. Script with the same flags: win 1:44, 115/115 replayed, `G`/`R`/`N` skipped by the reader.

**Games 26–31 are tainted by a budget fault.** `G`/`R` were emitted at priority 1, above `A`/`B` (2), so under
`--packet-max 900` the assembler dropped army and buildings on 13–34 packets a game (triggers too) — the model could not
see its own units or the barracks id on a third of its decisions. Fixed 2026-09-16: history is priority 3, first to go.
The defence findings below stand (the raider packets probed had every layer), but the win rates of 26–31 do not
measure memory.

**Facts-only note (`game04-sonnet.md`: `plan | doing | expect`, no `why`; same flags as 26–28; 2026-09-16).** Games 29–31
under the budget fault: 0 of 3. Games 32–34 with history at priority 3 (only `G` trimmed, on 7/7/79 packets): **1 of 3**,
the win in 5:54 at $0.50. The note held its form — `plan: 2 harvesters, wk to 6, br at 3wk+5r, li to 3, then attack |
doing: #22 mines rs#17, #25 mines rs#16, #27 builds br | expect: br on B by t180` — and verdict words fell (3–14 a game
while the base stood, 23 in the long win, vs the `why` arm's every call). The defence rule did not move: raider at d ≤ 6
at t220/220/222, first attack order at t353/280/257 (game 18 win: 263; game 21 win: 263). Game 33 won the way 18 and 21
did — a post held at 2,3/3,3 with two or three workers on every decision from t280, two named harvesters kept, Light at
639 — and lost the log on 79 packets doing it, so the win came from `R` and `N`, not `G`. Six clean games with the
note (21–23, 32–34): 2 of 6; three without (18, 24–25): 1 of 3. Not distinguishable at this sample; what is
distinguishable is that every loss, note or not, is the t220 raider answered 30–130 cycles late while the base makes workers.

**Commander split (`--model commander:rush`, `commander01-sonnet.md`, `--commander-every 5000`, memory/journal/log on,
100 ms a cycle — the real clock, 2026-09-16): 3 of 3 (games 35–37), 1:18 / 1:30 / 1:48, $0.08–0.10 a game.** The rush
script answers every packet at 0 ms (reaction p50 0.5 s, one refresh) from a parameter set; Sonnet is called in the
background every 5 s on the latest packet and returns the next parameter set and its note (core M14). Script alone at
this clock: 5/5 in 1:30–2:00; the model alone: 0/4. 15–19 commander calls a game at 3.4–3.8 s latency, one deadline
abort in 51. Its changes read as a plan: `workers 6→5` once the barracks was up ("stop worker growth, wait for light"),
`pushLight 3→2` under harassment, `defend 6→8 panic 2→3` at base hp 4 ("catch incoming wk earlier"), back to 6/2 for
the push, `target` to their base then to the far node once `X` lost its `ba`. Notes stayed facts and intent with a
cycle in every `expect`. One tool slip: a target sent as `"\"15,15\""` (apply fell back). This is the first config
where the model's latency is not the clock and the defence rule is never the model's to miss; whether the commander
adds anything over the script's own parameters needs an opponent the defaults lose to.

**Why memory did not help (probes on game 26's packets n=24–27, raider at d7/d6/d5/d4, ~$0.55 total).** Asked in text on
packet 26 the model describes N/G/R correctly ("N is my own note… G the harness's game log… R my recent decisions so I
can check if orders stuck"), quotes `wk#24 d5`, cites rule 5 and orders the attack. The same packet as the forced tool
call answers `-` and re-emits the previous note with `no threats near (d>=6)` patched to `(d>=5)`. Ablation, 8 samples
an arm (4 packets × 2): recorded 0/8 defend; N stripped 0/8 (`why: scattered but far`, `not urgent`); N reset to a
neutral note 0/8; effort high 0/8; `check:` field first 0/8 — it writes `nearest wk#24 d5, rule5 doesn't fire (d>2)`,
reading the harvesters' d ≤ 2 clause as the threshold; rule 5 rewritten (`two nearest workers hunt it, mining does not
excuse`) 0/8, and with N present the note still says `no threats near (d>=6)` on a packet showing d5; rewritten rule +
one line of text before the tool 2/8 (`d5 — under threshold ≤6, rule 5 fires` … or `d4 — just a lone worker, not an
aggressive push`); same without N 2/8. Reading: (1) the model knows what the memory is; (2) the loss is a judgement it
makes fresh each call from its priors about RTS games — a lone worker is not a raid, d6 is "borderline" — against a
rule it treats as advisory, and in the forced one-line tool mode it never states the check at all; (3) the note makes
this stickier, not better: `why` carries the previous verdict (`no threats near`) and the model inherits the verdict
and edits its number rather than re-deriving it — a conflict between rule and memory that the model itself wrote into
memory. Memory should carry facts and intent (ids, cycles, a checkable `expect`), never a conclusion.

**Script baseline vs the other bots (games 38–49, 100 ms a cycle, $0, 2026-09-16): LightRush 1/3, HeavyRush 0/3 (one
5:00 draw), RangedRush 2/3, CoacAI 0/3; WorkerRush stays 5/5.** Same opening every game — barracks at t249, first Light
at t369 — so the divergence is at first contact. LightRush: a Light at d6 by t399, before ours; the base fell at t649 in
both losses and held to t1190 in the win. HeavyRush: contact late (t825–1130) but paired Heavies beat our 4 Light; the
draw had both bases dead and our last Light attack-moving to the post by its dead base instead of their surviving
barracks — the post fallback never retargets a last building. RangedRush: the two wins pushed or killed early; the loss
ground down 4 Light without a push. CoacAI: Heavy plus Ranged together at t554, 3 of 3 losses with our highest Light count
(5) — no parameter fixes a pure-Light army. Plausible levers for the commander: `defend`/`panic` up and `barracksAt`
down vs LightRush, `pushLight` up vs HeavyRush and down vs RangedRush; CoacAI needs a unit choice the script lacks.

**Unit mix and the post fallback (games 50–61, script, `--script-params '{"train":"hv"}'` / `"li,rg"`, 100 ms, $0,
2026-09-16): HeavyRush 1/3 with each mix (was 0/3), CoacAI 0/3 with each (was 0/3).** The rush script's `train` parameter
is now a comma list from `li`, `hv`, `rg`; a single type keeps the standing count of 5 (the default is byte-identical),
a mix cycles one unit at a time. Target falls back their base → their nearest other building → the far node, and with no
enemy mobile unit on `X` every free fighter pushes the last building (`push:last`), so game 41's draw cannot recur.
HeavyRush: both wins reached three units and pushed with one raider dead at home; all four losses had two Heavies inside
`defend` at once, either stalled at two units or recalled from 8–9 tiles out after the second Heavy was already at d5.
CoacAI: not production (counts match at t600) — its Heavy closes d6→d1 in ~10 cycles while our two defenders sit 2–4 tiles
off the raider's cell, the barracks dies ~t624, a Ranged follows. Next levers: gate `push` on no enemy inside `defend`
rather than on count alone; `defend` 8–9 vs CoacAI so defenders close earlier. `--script-params <json>` runs any fixed
parameter set as a script arm.

**Commander vs LightRush and CoacAI (games 62–67, `commander01-sonnet.md`, 100 ms, $0.78 for six, 2026-09-16): LightRush
1/3, CoacAI 0/3 — the script's record on the same bots.** Read decision by decision (every commander call against the
packet it saw, each `expect` scored, the default script replayed over the same packets to isolate what the parameters
changed). The commander did one thing the script cannot: it attacked. `pushLight 2` produced sustained pushes in four
games; game 63 (win, 4:36) attack-moved at their base from t1374 where the defaults held the post, and game 64 killed
their base at t794 — no script game ever touched it — then held an empty corner for 195 cycles while four Lights walked
into ours. Everything else restated defaults: the opening was byte-identical in all six, `harvesters`/`barracksAt` never
moved in 141 calls, ~40% of changes reverted within two calls, `target` was set 11 times and never beat the script's own
fallback. It never countered a raid the script would have missed — `defend 7–12` only fired after contact, and in game
62 `defend 8` pulled the lone Light off the base to chase a d7 raider while a second took the base. Expects: 32 met, 70
failed, 39 uncheckable; the plan/expect loop worked once (game 66: three failed "base hp" expects → abort push, rebuild).
Its `train` mix churn dropped the standing count 5→1 and idled the barracks up to 29% of affordable cycles, which its own
notes then complained about — nothing tells it what a parameter did. Latency is the ceiling: packet→apply +45 cycles
median, two timeouts in 66, and in five games the last calls answered a dead board. Packet defect found: `X`'s `d` is
the distance to the cluster centroid, 1–2 low in 27/141 calls, so `defend`/`panic` fire late. Losses vs the baselines:
62/65/66/67 lost the same way 50–180 cycles slower; 63/64 were different games. Full per-call detail was produced in the
session scratchpad (`commander-analysis.md`), not kept.

**Feedback layer and `commander02-sonnet.md`, replayed offline (2026-09-16, $0.32).** Core M14 now appends `F` to the
packet the commander sees: its last parameter set, decisions in force, how many reflex orders it changed (the reflex is
re-run on the old set) and the last differing pair; recorded as `feedback` on the ride-out. The prompt rewrite gives
each parameter the rule that reads it, its effect within ~50 cycles, its cost and when it is the wrong lever, plus
"read F first; a change that differed 0/k is not repeated; a failed expect changes the lever, not the cycle". All 53
recorded commander calls of games 62, 64 and 67 were re-sent with the new prompt and a reconstructed `F` (the reflex is
deterministic, so `differed` is exact). 28/53 chose a different lever than the recorded answer: `defend` 4→0, `target`
3→1, `workers` 12→15, `harvesters`/`barracksAt` 0→2. Against CoacAI single-type `hv` in 9/16 calls (the old mix 9/16 →
1/16). Repeating a lever after `differed 0/k`: 3/53. Not fixed: "more Light" still split between `workers` down and
`pushLight` up (4/4/2 of 9); the recall rule after their base died was not followed (game 64 seq19 raised `post` 1→3);
one overcorrection (game 67 t644 `pushLight` 2→10 with the base at 2 hp). Single-step replay only — the note chain is
the old prompt's; live games are the test.

**`commander02-sonnet.md` + `F` live (games 68–73, 100 ms, $0.70, 2026-09-16): LightRush 1/3, CoacAI 0/3 — unchanged.**
`F` is read: after an "orders differed 0/k" report the next call repeated the lever 4 of 61 times (was ~40% churn), switched
30, left the set alone 28. Lever choice narrowed to `workers` (24/53 first changes) and `defend` (12); `post`, `pushWorkers`,
`target`, `train` almost gone. Game 70 (win, 2:42, $0.16) took a new route: `defend` 6→8→10, `panic` 2→3→4 from t654 held
a 2 hp base for ~1000 cycles while a 5-unit push from t689 killed their base at t1389. Expects 28 met / 38 failed / 60
uncheckable. CoacAI: `train hv` set at t294–644 in all three, one Heavy ever built (game 72, died defending), `defend`
never raised before t550 in any; the base was critical before every reaction. Prompt+F changed which lever and cut the
repeats, not when danger is noticed.

**`commander03-sonnet.md` (game knowledge: exact unit table from the recorded UTT, swing arithmetic, map timings,
four opening archetypes with tells and what beat them, engine facts; 176 lines), replayed over the same 53 calls
($0.34).** Same lever as replay02 on 36/53; `defend` 0→8 first changes, `panic`/`harvesters` 0. Names the opening by
t274–369 (one call late twice). Heavy+Ranged counter (`train hv`, `defend 8 panic 4`) set by t489, before t550, in
game 67's replay; early-Light "hold" followed in 64, not in 62 (raised `defend`, cycled `pushLight`). Still: repeat
after 0/k 4/53, recall rule after their base died missed again (`pushLight` 2–3, `post` 1→3 once), one `hv,li` mix.
Notes cite ids, cycles and the counter lever, never the swing arithmetic. Untested live.

**Commander03 live at 2500 ms (games 74–79, 100 ms clock).** LightRush 1/3 (75 win 2:30), CoacAI 0/3, $0.81. Halving `--commander-every` did nothing: apply lag 47.5→46.7 cycles, because the commander call itself takes ~3.9 s, so the loop serialises on the API and the period never enters it. Worse, the next packet is sampled before the last answer lands, so F reads `in force 0 decisions` on 98% of calls (39% at 5000 ms) and the feedback layer is blind. Cost per game +15%. Keep 5000 ms; anything under the model latency (~4 s) is a dead knob. The knowledge prompt does fire: vs CoacAI the commander set defend 8 / panic 4 / train hv at t404–444, ~200 cycles before contact, 3/3 (games 68–73: after contact or never). But **`train hv` produced zero Heavies**: the validator dropped every `t <barracks> hv` as `busy` (54 drops in game 77) while the standing Light goal kept the barracks producing, so the type could never change. Across 12 games with a non-li train set, one Heavy was ever built. Fixed: a train order to a producing building now replaces its standing goal in the buffer (the unit under way is never cancelled). No recall failure in any of these games; the army was at the base when it died. Game 75 won by never touching defend and spending every set on `workers`, 9 Lights vs 3 and 6 in the losses. CoacAI is deterministic here: games 77 and 79 are cycle-identical, so one game per config is enough.

**Commander03 + train fix vs CoacAI (games 80–82, 5000 ms, 100 ms clock).** 0/3, $0.39, but longer (2:12, 1:54, 1:42 vs 1:30) and orders kept 92% (was 57%). `train hv` now builds: 4 / 2 / 1 Heavies. Losing mechanism: every Light and Heavy died alone at d4–d8 from our base, never past d9. `defend` was raised 6→8 at t429–484 in all three games and never lowered, so each fresh unit attack-moves 8 steps out into CoacAI's 3–4 Ranged, with 1-hp Workers sent along as chaff (`workers 6` = 4 fighters past the 2 harvesters). Spawn interval 120–225 cycles, unit lifetime 100–200, so the commander's "hold until 3 Heavies then push" was never reachable and it never noticed (max 2–3 army units alive at once). Barracks idle with bank<3 for 21–40% of the game while 43–46% of ore went to workers. CoacAI is fixed: 2 workers, barracks ~t144, Heavy t344, then a Ranged every 100 cycles; their army count passes ours at t344 and never trails. Most plausible single lever: `workers` 2–3 held (no chaff, income to the barracks); second, `defend` back to 3–4 to stop the solo sortie.

**Fable 5.1 as commander (games 83–85, CoacAI, commander03 prompt unchanged).** 83: every call 400 (`tool_choice` tool/any unsupported on Fable; fixed, auto). 84: 6 s deadline aborted 2 of 3 calls, stopped ($0.05). 85 (`--decision-deadline 30000`): loss 1:18, $0.30, 5 calls at 8.5–20 s (p50 14.9). The commander loop is serial, so apply lag equals model latency and `--commander-every` is a dead letter above it: Fable landed 4 sets before the base died (t659), the 5th at t749. Games 80 and 85 are cycle-identical to t504; both models saw `foe hv#32` at t369 and both chose `train hv`. Sonnet's landed t429 and its first Heavy killed hv#32 at t634; Fable's landed t544 after the barracks had committed to a third Light, no Heavy ever built, hv#32 alone killed 3 Lights, 2 workers, barracks and base. Difference is latency, not judgement: Fable's four sets were as good or better (named the Heavy opening, held the push, added a conditional for `foe rg`), but 10x the cost per decision. Neither model revised the unreachable "hold until 3 hv" plan; Sonnet restated it 9 times while max army alive was 2, once noting the push gate was counting workers, without changing it. Fair model test: replay game 80's packets under Fable offline, or run at `--microrts-cycle-ms 400` with a Sonnet control at `--commander-every 15000`.

**Offline replay of game 80 under Sonnet and Fable 5.1 (commander03 prompt, same packets and F).** Sonnet replay $0.15 / 22 calls; Fable $1.51 / 21 calls, budget hit ($0.07 per call, 10x). Sonnet replays its own live answers almost exactly (same lever at every set: workers 5, train hv t369, panic 4 t514, post 2 t634, workers 4 t1219) and restates "hold until 3 hv" through t1104. Fable at zero latency moves more and earlier: workers 6>4 at t154, harvesters 2>3 at t259 (a lever Sonnet never touched in 30 games), and at t369 harvesters 4 + defend 8 + panic 4 + train hv in one set. It then revises: pushLight 3>2 at t634 (push with the two Heavies it has instead of waiting for three), train hv>li at t684/t739 when the bank is under 3 ("3 combat units by t880"), defend back to 6 at t684 and t839, undoing the prompt's own rule. Every expect is concrete (unit id, cycle, hp). Some thrash: pushLight 2 then 4 then 5, workers 5/4/8. Verdict: the "never revises an unreachable plan" failure is Sonnet's, not an LLM wall; Fable revises at every call. Whether its choices win is untested (a replay has no effect on the game) and at 15 s per live call it cannot be tested at the 100 ms clock without overlapping commander calls.

**Game 80 replay, Sonnet at medium and high effort ($0.15 each).** Effort changed nothing: output tokens 7.3k / 7.4k / 7.6k over 22 calls at low / medium / high (Fable 24.8k), so adaptive thinking spends about the same at every setting; lever changes 8 / 9 / 8 (Fable 49); the same levers at the same cycles (train hv t369, panic 4 t514, post 2 t634, post 1 t789), medium and high add defend 8 at t369 exactly as the prompt says, high lowers defend 8>6 once at t894, and all three write "rebuild to 3 hv" to the last call with zero Heavies alive. The plan-monitoring gap is Sonnet's at any effort, not a thinking-budget effect.

**Game 80 replay, Sonnet medium with a prod (`commander04-sonnet.md`, $0.15).** Three lines added to commander03: think hard, read the opponent's style, "if your plan's trigger has not happened after several calls, the plan is wrong: change it". No effect: 7.3k output tokens (same), 9 lever changes (same), identical picks at t369/t514/t634/t789, still "hv count reach 3 by t1150" at t1004 with one Heavy alive. At t1154 it writes "br#30 IDLE, bank starving barracks" and answers with workers 6>5 one call later. A prompt prod does not buy plan revision from Sonnet; Fable does it unprompted.

**Why Sonnet keeps the plan (game 80 debrief, $0.08) and the graded expect (`commander05-sonnet.md`, replay $0.18).** Four packets replayed then debriefed out of game: Sonnet says it never checked whether its 3-Heavy trigger was reachable, read "orders differed 0/k" plus the prompt's "or wait" as permission to hold, followed the counter line as a rule, and when asked what it would do if free named Fable's moves (pushLight 2, workers 4, recall). So the harness now grades the plan: the tool takes `plan` (one line) and `expect` `{metric, op, value, by}`; the game's `measure(packet)` reads the metric on every packet; F echoes `plan: ... | expect hv>=3 by t960: MISSED (max 2)`. The prompt describes the grade and says the plan is the model's; it prescribes nothing on MISSED, drops "or wait", and calls the counters starting points. Replay under Sonnet medium: the grade works (br==1 MET t249, hv>=1 MET t594, hv>=3 by t960 MISSED at t1004). Sonnet's response to its own MISSED was to keep the plan and set `by` 1150; then it raised the target to hv>=4, later lowered it to 3, then 2 as Heavies died. Deadline sequence for the same claim: 900, 950, 960, 1150, 1250, 1300, 1400, 1450. Lever changes 13 vs 9, workers 6>4 twice, pushLight up to 4, never down. It also narrated the live game's `train hv` as its own ("barracks now training hv") without ever setting it. Finding: given a graded prediction Sonnet edits the prediction, not the action. Next: carry the claim across sets so F reports the roll (`hv>=3: deadline moved 4x since t684, max 2`), then replay Sonnet and Fable.

**Claim history in F (replay of game 80, Sonnet medium $0.18, Fable 5.1 $1.63).** A restated expect with the same metric and op is now one claim: `best` accumulates from the first time it was made and F reads `expect hv>=3 by t1400: pending (max since t514 2, t714); claim since t514, by moved 9x, value 3>4>3`. Sonnet, shown that line, moved the deadline nine times (700, 800, 900, 950, 1000, 1150, 1250, 1300, 1400), kept "hold until 3 hv then push" to the last call, lowered `workers` five times (right) and raised `pushLight` to 4 (wrong way); 10 lever changes, 9.3k output tokens. It reads its own goalpost count and does not act on it. Fable also restates hv>=3 (by moved 3x) but changes the plan under it each time and says why: t739 "stop worker production, 4 harvesters feed br#30"; t839 "stop chasing rg at d10: defend 5" (the sortie at `defend` 8 is the losing mechanism games 80–82 analysis found); t1004 on MISSED "stop pushing", pushLight 6, claim lowered to hv>=2, MET t1114; t1104 "pull in to defend 5/post 1 so rg must walk to base; hv kills rg in 1 swing"; t1219 "switch to Light vs rg pair: li catches rg (8 vs 10/step), 1 swing kill". It picks the metric to fit the plan (foe_hv<=0 by t650, MET t634) and uses the unit table's arithmetic, which Sonnet never has. Verdict: the grade gives both models the same evidence; Fable turns it into a different plan, Sonnet into a later deadline. The gap is model capability at plan revision, not information, effort or prompt wording. Replay caveat: lever diffs are against the live game's params, nothing the replayed model sets takes effect.

**Live commander05, Sonnet and Fable vs CoacAI (games 86 mu5m464l, 87 mu5m464m).** Sonnet medium, 100 ms: loss t1029, $0.08, 14 calls, 3 timed out (medium effort; first set landed t284). Fable 5.1, 400 ms clock, 30 s deadline: loss t1301, $1.98, 28 calls, p50 19.5 s, lag 22–74 cycles, so lag was equal and this is the fair judgement test. The replay finding holds live. On a bad grade Sonnet restated 3 times, moved only the deadline twice (hv>=2: 800, 900, 950, 1050, 1150 with the count at 1, never a MISSED because it outran its own deadline) and changed a lever 3 times, once the wrong way (`workers` 4>5); at seq11 it wrote "single hv#40 alone vs 4 foe rg, avoid solo engage", changed nothing, and hv#40 died alone at d8 where its own `post 3` had put it. Fable: 1 restate, 0 deadline-only, 5 lever changes, including "do not chase rg beyond d6" → `defend 8>6`, the first model to narrow `defend` against the sortie. Fable's changes took effect: `train hv` t424, first Heavy t584 (Sonnet t684), 5 Heavies (Sonnet 1, game 80 4), barracks idle-broke 17% (Sonnet 51%, game 80 34%), harvesters 3 on the board, 7 kills (game 80 5, Sonnet 1), and its push at t722 is the only time any of our armies touched CoacAI's base, 10 → 6 hp at t890. It still lost: the push arrived strung over 3 tiles, worn to 1–2 hp by Ranged on the way, the two Heavies never swung; 7/7 fighters died alone; base sniped by Ranged at 3 tiles, same shape as every CoacAI loss. Sonnet lost on economy: `workers` capped at 4 from t284, never restored, five workers eaten by hv#32, bank 0. The ceiling is now the reflex's piecemeal push, not the commander; revising helped every downstream number at 24x the cost. Two F bugs found live: a restated claim lost its MET (Fable's hv>=3, true t873–910, graded `MISSED (max 3)`; fixed, a claim that already held stays MET), and `orders differed` is dead in a serial loop, 27/28 Fable and 10/14 Sonnet calls read `in force 0 decisions` because the next call launches on the packet the last one landed on (fixed: a set with no decisions yet reports the last window that had them and ends `| set <n> landed: <diff>`).

**Group push and engage gate in the reflex (games 86–89, script, defaults `group` 2 / `engage` 2, 100 ms, $0).** Two rules the Fable commander asked for, as script params: a push gathers at the army's centroid whenever a soldier is more than `group` from it (`push:gather`), and a raid outside `panic` is answered only with `engage` or more free army units, else they hold the post (`defend:hold`). CoacAI 0/1 (1:24, baseline 1:30): the push never fired (army never reached 3), `defend` sortied with 2 Lights, `hold` with 1, then panic; same shape, same clock. HeavyRush 0/3 (2:06, 1:30, 2:06 vs 0–1/3 baseline): games 87 and 89 pushed at 3 Light and alternated `push` / `push:gather` on about half the push decisions (9/9 and 9/7), so the march oscillates on the cluster centroid rather than closing; game 88 never pushed, `hold` 10 times with 1 Light while the Heavy walked in. Neither rule moved a result. The losing mechanism is upstream of both: 1–2 army units alive at once against a Heavy or 3–4 Ranged, so grouping and gating have nothing to group or gate. Next lever is economy (`workers` 2–3, income to the barracks), not movement.

**Workers 3 and push:join (games 90–97, script, `--script-params '{"workers":3}'`, 100 ms, $0).** Games 90–93, `workers` 3 with round-one gather: CoacAI 0/1 (1:42), HeavyRush 0/3 (4:30, 2:42, 5:00). The lever worked: barracks fed every decision (`buy:li` on 90%+), max army alive 5–6 (was 2–3), games two to three times longer. New loss mechanism: every fresh Light spawns at the barracks and the centroid gather recalled the whole front to collect it (`push:gather` 77 vs `push` 29 in game 91); the army sat at x 4–7 for 2000 cycles and never reached their base. Games 94–97, gather rewritten (a core of `pushLight` soldiers within `group` of the front pushes on, stragglers attack-move to the core's centroid, `push:join`): CoacAI 0/1 (1:54), HeavyRush 0/3 (2:00, 1:48, 2:00). The front now leaves, and dies: 3 Lights into a Heavy or into 5–8 CoacAI units, max army 3–5 against their 4–8. Round two's oscillation had been an accidental home defence. Twelve games, three rounds, no win: movement rules and the economy lever both change the shape of the loss and not the result. The script is out-produced (their barracks t144, ours ~t220; Light-only into Heavy and Ranged), so no grouping or gating of 3–5 Lights beats 8 units. That is a strategy gap (tech and timing), not a reflex gap, and it is the same gap a commander would have to close by choosing `train` and `barracksAt`, not by moving units.

**What the plan is.** Two harvesters, the base on workers to six, a barracks at three workers and five banked, then
Light forever; defend anything within six of the base (harvesters too inside two), attack at three Light. Written out in
`prompts/microrts/game01-sonnet.md` and implemented in `src/games/microrts/policy/rush.mjs`.

**What it loses to.** An earlier draft with `BR_AT = 5` lost 1 of 5: the barracks started around cycle 300 and the rush
arrived first. At `BR_AT = 3` the barracks is up by ~220 and the Lights carry the game. The remaining exposure is the
same one — a rush that reaches the base before the first Light — and the plan has no answer but the two or three workers
already standing at the post. Games 38–49: LightRush 1/3, HeavyRush 0/3, RangedRush 2/3, CoacAI 0/3.
