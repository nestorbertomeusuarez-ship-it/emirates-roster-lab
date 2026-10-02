# PilotTalk evidence and monthly lifestyle metrics

Source supplied by the user on 3 October 2026: `PilotTalk_2022_Final_Integrado_v2.docx`, an editorial compilation of twelve monthly PilotTalk 2022 transcripts and nine later thematic videos. The observed year concerns Caner's B777 operation, not an audited A350/A380 sample. Later testimony from Caner and Joe supports some operating mechanisms but does not establish fleet averages or current contractual entitlements. No external verification or current Emirates policy update is implied by this integration.

## Six metrics implemented in the monthly roster

| Metric | Definition | Exclusions and interpretation |
| --- | --- | --- |
| OFF oficiales | Number of explicitly assigned `OFF` codes in the month's roster cells | VACATION, STANDBY, SIM, GROUND_SCHOOL and unassigned cells are separate. A generated OFF remains a simulated assignment, not an official Emirates roster. Recovery can overlap an OFF. |
| Real Work Days | Unique Dubai calendar dates touched by flying duty, including report and debrief, plus dates assigned SIM or ground school | Layover-only dates are away time, not actual work. Unactivated standby is restricted availability, not active work. Duty crossing midnight can touch two dates with one presentation. |
| Home Days | Full 24-hour days assumed physically at home, excluding the modeled trip/commute interval | Partial home hours / 24 are also shown as equivalents. Assumes the base-resident pilot stays home on OFF unless rostered away. Personal travel on OFF is not modeled. Standby location is configurable; untimed training and leave with unknown location do not prove a full home day. |
| Family Quality Days | Full dates with no work or standby and an entirely available 08:00–22:00 family window at home outside recovery | Also show available window hours / 14 as equivalents, blocks of at least three clean days and the longest block. This estimates availability; it does not measure actual family interaction or a child's schedule. |
| Night / Jetlag Burden | Duty hours overlapping 00:00–06:00 Dubai base time, night-duty count, trips returning home with a station clock shift ≥3h, and days touched by modeled recovery | Separate exposure indicators, never a combined clinical score, GCAA WOCL determination or legality limit. Station offsets use the travel date, including DST and fractional offsets. |
| Reports / mes | Number of distinct duty starts in the Dubai month: DXB flying, outstation flying and untimed training | Trips, sectors and calendar work dates are different counts. Unactivated standby has no report. Repeated continuation cells do not duplicate a report. |

These metrics overlap. They must never be added together or inferred from `calendar days minus OFF`. An OFF may also be a home day and a recovery day; a layover may be neither OFF, work nor home. The existing calendar and block/duty header retain their established UTC service-date conventions. The lifestyle panel explicitly uses Dubai local dates for interval allocation.

## Planning assumptions and limits

The pure engine is `src/lifestyle/monthLifestyle.ts`; the monthly UI is `LifestylePanel.tsx`. The engine reads the persisted roster and real adjacent-month pairings. It uses the existing report offset of 90 minutes and debrief of 30 minutes, plus a configurable 30-minute commute each way. Flight legs separated by the pairing search's minimum layover (8 hours) are treated as different duties. A short turnaround stays one duty across UTC or Dubai midnight. This infers duty boundaries from flight schedules; actual duty, positioning/deadhead, augmented-crew rest and non-flying report/release records would improve accuracy.

Defaults chosen for **sensitivity analysis**, not taken numerically from PilotTalk:

| Parameter | Default |
| --- | --- |
| Recovery after each duty overlapping the base night window | 12 hours after release |
| Clock shift ≥3h on a trip | 24 hours after arriving home |
| Clock shift ≥6h, or missing station timezone | 36 hours after arriving home |
| Family availability window | 08:00–22:00 Dubai |
| Standby location | Assumed home; configurable as unknown / airport |
| Annual leave location | Unknown; can explicitly be assumed home |

The monthly page offers recovery and commute controls. OFF at home, home standby and the family window are modeling conventions, not observations from a family's daily life. Night and jetlag recovery are combined as a union of time intervals, never deducted twice. Recovery can overlap layover/away time and therefore need not reduce home time by its full duration. Missing timezones are flagged and use the longer recovery sensitivity, while the jetlag trip count remains based on known offsets.

Missing previous-month history blocks claims of clean family time during the longest configured recovery window at the start of the month. It does not invent a prior trip or count an unknown day as active work. Unassigned roster dates remain unknown, not OFF or home. Adjacent months are loaded only when real roster rows exist. SIM and ground-school dates count as work and one assumed presentation each, but their absent timestamps prevent estimating night exposure or precise home hours. Leave is kept separate and location is unknown by default. Personal travel, standby activation and commuting away from Dubai need additional records.

The summary describes the current stored roster, not an airline population or a guarantee. It does not alter any GCAA evaluator, operator override, generator legality constraint, roster assignment or database schema. An existing limitation in the compliance reconstruction (non-flight duties collapsed to OFF-equivalent) is not evidence of rest: lifestyle explicitly reads the original duty code and does not reproduce that collapse.

## Historical monthly observations

The compilation's monthly table is preserved below as reference evidence. No timestamps sufficient for a complete six-metric reconstruction are available in this table; missing values must remain missing. Reports cannot be recovered from block hours or an ambiguous count of flights/trips.

| Month 2022 | Block | OFF | Leave | Context |
| --- | --- | --- | --- | --- |
| January | 49:16 | 13 | — | 3 sick days and simulator support |
| February | 80:36 | 8 | — | 3 rest days and simulator |
| March | 74:04 | 13 | — | Reserve; 3 rest and 2 unactivated standby |
| April | 81:19 | 10 | 3 | 4 rest and 2 simulator days |
| May | 55:51 | 16 | 1 | 3 rest; freighter cancellation |
| June | 53:40 | 10 | 10 | Extra leave; Orlando ULR |
| July | 61:42 | 10 | 3 | 3 rest; approximately 75 paid hours |
| August | Approximately 11:24 | Unknown | 25 | Mostly leave |
| September | 78:34 | 10 | — | Full line month |
| October | 76:10 | 12 | — | 6 simulator hours, 2 rest, standby |
| November | 62:01 | 11 | 4 | 3 rest and standby |
| December | 68:55 | 11 | 4 | 3 rest |

Approximately 753:32 annual block; 62:48 monthly mean. February, March, April, September and October average approximately 78:09. Excluding August, 124 declared OFF over eleven months gives 11.27 OFF/month with median 11. The table's 50 leave days span cycles and extra leave; they must not replace the stated 42-day entitlement. The source's March example (13 OFF + 3 rest + 2 home standby = 18 reported home days) and May example (16 OFF + 3 rest + 1 leave = 20 non-flying days) illustrate why category totals differ. They do not establish 18 or 20 full Family Quality Days.

## What the evidence changes in roster interpretation

**Production and workload.** Typical productive months in this individual sample sit around 75–80 block hours. Long-haul/ULR can produce many hours with fewer trips or presentations, while regional night turns fragment home life. Direct ULR should not be penalized solely for block length: crew augmentation and post-trip recovery matter. Multi-sector sequences can consume more calendar time and transitions than a longer direct sector. Paid hours can exceed flown block through positioning or other credits; flying workload is not a remuneration measure.

**A350 and A380.** The source suggests greater production compression on A380 and a more mixed A350 network. Neither implies 15 guaranteed OFF or less physiological fatigue. Later A380 claims of five or six flights/trips and roughly fifteen duty/non-duty dates are qualitative and have ambiguous counting units; they are not calibrated report counts. Comparisons should control for block production and show reports, work dates, away time, clean family blocks and circadian exposure together. Fleet assignment, network evolution and manpower can change both lifestyle and command progression.

Illustrative source hypotheses, not generated targets or current Emirates statistics:

| Scenario | A350 | A380 |
| --- | --- | --- |
| Monthly block | 75–82h | 75–82h |
| Duty blocks / trips | 5–7 | 4–6 |
| Central OFF range | 10–12 | 11–13 |
| Additional rest / no-duty dates | Approximately 2–3 | Approximately 2–4 |
| Dubai non-operating dates | Approximately 12–15 | Approximately 13–16 |
| Main tradeoff | Mixed missions; more activations | Compression; more jetlag/intense trips |

These ranges are not percentiles from a statistical sample. They do not overwrite the generator's independent pacing, routing or safety checks and do not establish a numerical Family Quality Days target.

**Bidding and predictability.** Caner and Joe describe five rotating bid groups; top and second-top groups use requests, others mainly preferences. Up to seven ordered requests are alternatives, with one fulfilled request satisfying the pilot in the account given. Top bid therefore does not provide control of every duty. Seniority within a group differs from a pure seniority system. Requests, preferences across month boundaries, successive swaps and live leave are distinct optimization mechanisms. Swaps depend on another pilot accepting and operational limits; live leave can resolve very late and requires cancellation if circumstances change. Occasional 7–10-day blocks are plausible in the testimony, not a monthly entitlement or a stable commuting arrangement outside Dubai.

**Reserve and leave.** Reserve can deliver substantial physical time at home but weak advance predictability. Home standby must retain its restriction penalty in Family Quality Days. The testimony describes roughly one reserve month per ten months, publication around the 16th of the previous month, 42 annual leave days and an April–March leave year with a December main bid. These are dated descriptions requiring current policy confirmation before becoming program rules. Combining leave, OFF, swaps and month boundaries can lengthen usable breaks without increasing entitlement. Publication lead time and stability after publication are different: Caner recalled very few post-publication changes outside COVID. The engine does not claim to predict bids, swaps, reserve activation or successful leave requests.

**Family, housing and career context.** The later videos favor company villas for families needing comparable space, with Meydan South described as stronger for children's community, school access and services, and Meydan Heights as more compact and central. Housing choices, transport and commuting time affect usable home hours but cannot be inferred from a flight roster. Historical 2023 cash-allowance figures are not adopted as current prices. Medical/school/housing benefits and the Provident Fund matter for family economics; the illustrative career-value model's 30-year tenure, six-year upgrade, 8% return and assumed profit share are not guarantees. No salary or profit-sharing assumptions are changed here.

**Attributed concerns.** Persistent night flying, limited improvement through pure seniority, ties among employment/residency/housing, contractual uncertainty and Caner's opinion of a checking-oriented training culture remain contextual concerns. His favorable views of wide-body experience, infrastructure, package, leave and career portability also remain attributed. His later preference for a US seniority career follows his individual priorities and is not a universal ranking of Emirates. Command progression must be modeled by fleet demand and deliveries, not inferred from a good family roster.

## Verification cases

Pure tests cover midnight turns, layover versus work, DXB versus outstation reports, previous-month return/recovery, OFF with recovery, unassigned/standby/training/leave distinctions, trip deduplication, recovery overlap, DST/fractional station offsets, missing context/timezones and clean family blocks. They verify interval accounting rather than treating the qualitative source ranges as exact expected outputs.
