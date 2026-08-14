/* ============================================================
 * Tempo — Organisation Tree data (Event Operations)
 * ------------------------------------------------------------
 * THE ONLY THING TO REPLACE. Every count, dropdown entry, city filter and stat
 * derives from PEOPLE. "people/headcount" excludes status:'open'; "positions"
 * includes them. Sample data — real personnel stays out of the public build
 * (this view is director/admin gated; ships on a feature branch, not main).
 * ========================================================== */
(function (WP) {
  'use strict';

  var PEOPLE = [
    // Leadership (2)
    { id: 'hamdi', name: 'Hamdi Missaoui', role: 'Chief Commercial Officer', squad: 'Leadership', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Tunisia', contract: 'Full-time', level: 'Exec', manager: null, status: 'active', lead: true, start: '2019-01' },
    { id: 'ahmed', name: 'Ahmed Othman', role: 'Event Operations Director', squad: 'Leadership', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Egypt', contract: 'Full-time', level: 'Director', manager: 'hamdi', status: 'active', lead: true, start: '2020-03' },

    // Automation & Execution (4, 0 FL) — Ayman → Batool (leads Anti-Fraud) + Shahad
    { id: 'ayman', name: 'Ayman Albasha', role: 'Event Operations Sr. Manager', squad: 'Automation & Execution', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Syria', contract: 'Full-time', level: 'Sr. Manager', manager: 'ahmed', status: 'active', lead: true, start: '2021-02' },
    { id: 'batool', name: 'Batool Emad', role: 'Event Operations Manager — Anti-Fraud', squad: 'Automation & Execution', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Manager', manager: 'ayman', status: 'active', lead: true, start: '2022-05' },
    { id: 'alhanouf', name: 'Alhanouf Alkhalaf', role: 'Event Operations Specialist — Anti-Fraud', squad: 'Automation & Execution', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Specialist', manager: 'batool', status: 'active', lead: false, start: '2024-02' },
    { id: 'shahad', name: 'Shahad Joudah', role: 'Event Operations Specialist — Trainer', squad: 'Automation & Execution', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Specialist', manager: 'ayman', status: 'active', lead: false, start: '2023-06' },

    // Sports (11, 1 FL) — Motaa → three team leads (Akram · Khaled · Maksousa), each with their own reports
    { id: 'motaa', name: 'Motaa Aldarra', role: 'Event Operations Sr. Manager', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Syria', contract: 'Full-time', level: 'Sr. Manager', manager: 'ahmed', status: 'active', lead: true, start: '2021-04' },
    // — Akram's team
    { id: 'akram', name: 'Mohammed Akram', role: 'Event Operations Manager', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Manager', manager: 'motaa', status: 'active', lead: true, start: '2022-09', you: true, order: 1 },
    { id: 'idris', name: 'Mohammed Idris', role: 'Event Operations Specialist', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Specialist', manager: 'akram', status: 'active', lead: false, start: '2023-11' },
    { id: 'osama', name: 'Osama', role: 'Event Operations Specialist', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Specialist', manager: 'akram', status: 'active', lead: false, start: '2024-04' },
    { id: 'mgamal', name: 'Muhammad Gamal Ali', role: 'Event Operations Specialist', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Egypt', contract: 'Full-time', level: 'Specialist', manager: 'akram', status: 'active', lead: false, start: '2024-06' },
    // — Khaled's team
    { id: 'khaled', name: 'Khaled Jeneina', role: 'Event Operations Sr. Specialist', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Jordan', contract: 'Full-time', level: 'Sr. Specialist', manager: 'motaa', status: 'active', lead: true, start: '2023-03', order: 2 },
    { id: 'saleh', name: 'Saleh Almohaimeed', role: 'Event Operations Specialist', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Specialist', manager: 'khaled', status: 'active', lead: false, start: '2024-05' },
    { id: 'ibrahim', name: 'Ibrahim Saleh al-bard', role: 'Event Operations Specialist', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Specialist', manager: 'khaled', status: 'active', lead: false, start: '2024-07' },
    // — Maksousa's team
    { id: 'maksosah', name: 'Abdulrahman Maksousa', role: 'Event Operations Sr. Specialist', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Jeddah', nationality: 'Syria', contract: 'Freelance', level: 'Sr. Specialist', manager: 'motaa', status: 'active', lead: true, start: '2023-01', order: 3 },
    { id: 'shamma', name: 'Shamma Alsagr', role: 'Event Operations Specialist', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Specialist', manager: 'maksosah', status: 'active', lead: false, start: '2024-02' },
    { id: 'tala', name: 'Tala', role: 'Event Operations Specialist', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Specialist', manager: 'maksosah', status: 'active', lead: false, start: '2024-08' },

    // Entertainment (6, 2 FL) — sub-team: Live Shows
    { id: 'ayah', name: 'Ayah Nasif', role: 'Event Operations Sr. Manager', squad: 'Entertainment', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Sr. Manager', manager: 'ahmed', status: 'active', lead: true, start: '2021-07' },
    { id: 'farah', name: 'Farah Alsmay', role: 'Event Operations Manager — Live Shows', squad: 'Entertainment', unit: 'Live Shows', country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Manager', manager: 'ayah', status: 'active', lead: true, start: '2022-08' },
    { id: 'amen', name: 'Amen Shannah', role: 'Event Operations Sr. Specialist', squad: 'Entertainment', unit: 'Live Shows', country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Syria', contract: 'Full-time', level: 'Sr. Specialist', manager: 'farah', status: 'active', lead: false, start: '2023-05' },
    { id: 'howshan', name: 'Meshal Bin Howshan', role: 'Event Operations Sr. Specialist', squad: 'Entertainment', unit: 'Live Shows', country: 'UAE', city: 'Abu Dhabi', nationality: 'Saudi Arabia', contract: 'Freelance', level: 'Sr. Specialist', manager: 'farah', status: 'active', lead: false, start: '2023-09' },
    { id: 'alsmari', name: 'Meshal Alsmari', role: 'Event Operations Coordinator', squad: 'Entertainment', unit: null, country: 'Saudi Arabia', city: 'Jeddah', nationality: 'Saudi Arabia', contract: 'Freelance', level: 'Coordinator', manager: 'ayah', status: 'active', lead: false, start: '2024-01' },
    { id: 'raghdaa', name: 'Raghdaa Abuazzah', role: 'Event Operations Coordinator', squad: 'Entertainment', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Coordinator', manager: 'ayah', status: 'incoming', lead: false, start: '2026-09' },

    // On Ground (4, 1 FL) — sub-team: Execution
    { id: 'hani', name: 'Hani Ahmed', role: 'Event Operations Sr. Manager', squad: 'On Ground', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Egypt', contract: 'Full-time', level: 'Sr. Manager', manager: 'ahmed', status: 'active', lead: true, start: '2021-05' },
    { id: 'zaidan', name: 'Mohamed Zaidan', role: 'Event Operations Manager — Execution', squad: 'On Ground', unit: 'Execution', country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Egypt', contract: 'Full-time', level: 'Manager', manager: 'hani', status: 'active', lead: true, start: '2022-06' },
    { id: 'faraj', name: 'Ahmed Faraj', role: 'Event Operations Manager — Execution', squad: 'On Ground', unit: 'Execution', country: 'UAE', city: 'Dubai', nationality: 'Egypt', contract: 'Full-time', level: 'Manager', manager: 'zaidan', status: 'active', lead: false, start: '2022-10' },
    { id: 'batarfi', name: 'Mohammed Batarfi', role: 'Event Operations Sr. Specialist — Logistics', squad: 'On Ground', unit: 'Execution', country: 'UAE', city: 'Dubai', nationality: 'Saudi Arabia', contract: 'Freelance', level: 'Sr. Specialist', manager: 'zaidan', status: 'active', lead: false, start: '2023-07' },

    // Cashless (5, 2 FL)
    { id: 'omar', name: 'Omar Zarea', role: 'Event Operations Manager', squad: 'Cashless', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Egypt', contract: 'Full-time', level: 'Manager', manager: 'ahmed', status: 'active', lead: true, start: '2022-01' },
    { id: 'rafah', name: 'Rafah Alansari', role: 'Event Operations Sr. Specialist', squad: 'Cashless', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Sr. Specialist', manager: 'omar', status: 'active', lead: false, start: '2023-02' },
    { id: 'aljazi', name: 'Aljazi Alshubaike', role: 'Event Operations Sr. Specialist', squad: 'Cashless', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Freelance', level: 'Sr. Specialist', manager: 'omar', status: 'active', lead: false, start: '2023-08' },
    { id: 'rosa', name: 'Rosa Alansari', role: 'Event Operations Specialist', squad: 'Cashless', unit: null, country: 'Saudi Arabia', city: 'Jeddah', nationality: 'Saudi Arabia', contract: 'Freelance', level: 'Specialist', manager: 'omar', status: 'active', lead: false, start: '2024-03' },
    { id: 'altahini', name: 'Mohammed Altahini', role: 'Event Operations Specialist', squad: 'Cashless', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Specialist', manager: 'omar', status: 'active', lead: false, start: '2024-05' },
  ];

  var SQUADS = [
    { name: 'Automation & Execution', color: '#8b5cf6' },
    { name: 'Sports', color: '#2563eb' },
    { name: 'Entertainment', color: '#ff2c79' },
    { name: 'On Ground', color: '#f97316' },
    { name: 'Cashless', color: '#22e3b0' },
  ];

  var COUNTRY_FLAG = { 'Saudi Arabia': '🇸🇦', 'UAE': '🇦🇪' };

  // Real self-set Slack job titles (fetched from the #event-operations-department
  // directory). Kept separate from the editable roster; surfaced in the drawer.
  // (Slack exposes profile text but NOT avatar image URLs, so photos aren't here.)
  var SLACK_TITLES = {
    ahmed: 'Event Operations Director',
    ayman: 'Event Operations Sr. Manager',
    shahad: 'Event Operation Specialist',
    batool: 'Events Operation Manager',
    motaa: 'Events Ticketing Manager',
    akram: 'Events Operation Manager',
    maksosah: 'Sr. Event Operations Specialist',
    shamma: 'Event Operations Specialist',
    ayah: 'Sr. Event Operation Manager',
    farah: 'Events Operations Manager',
    howshan: 'Sr. Event Operation Specialist',
    raghdaa: 'Events operation specialist',
    hani: 'Event Operations Sr. Manager',
    zaidan: 'Event Operations Manager',
    faraj: 'Event Operations Manager',
    batarfi: 'Events Operation Department',
    omar: 'Event Operation Manager - Cashless',
    rafah: 'Event Operations Senior Specialist',
    aljazi: 'Senior Events Operation Specialist',
    rosa: 'events operation specialist',
    altahini: 'Event Operations Specialist',
  };

  // Slack profile photos, snapshotted from the #event-operations-department
  // directory (id → avatar URL). Re-sync on demand: re-scrape + replace this map.
  // Missing here = no uploaded Slack photo (Meshal Alsmari), not a channel member
  // (Hamdi), or a newer hire not yet snapshotted (Alhanouf, Osama, Muhammad Gamal
  // Ali, Saleh, Ibrahim, Tala) → the card + drawer fall back to initials.
  var E = 'https://ca.slack-edge.com/T06CF6Y0ETC-';
  var IMG = {
    ahmed: E + 'U099EREBS23-5eaec9a8cc3c-192',
    ayman: E + 'U06D1GQ7XL2-3f81f365db07-192',
    shahad: E + 'U06EA95C70W-959ffd1ed9f1-192',
    batool: E + 'U06CM0JKYGP-74e279d52d0a-192',
    motaa: E + 'U06CYJMJPJR-cd85e03b0c0b-192',
    akram: E + 'U06H0ASQ761-53f137cdf645-192',
    maksosah: E + 'U07LF0D3KSN-1fbe4f7bcf66-192',
    khaled: E + 'U06D1GM1RRQ-8c9298f22d31-192',
    shamma: E + 'U09AH1Z1X6C-833ee0a7c097-192',
    idris: E + 'U09E1NA1B0W-4ec7d0a5589f-192',
    ayah: E + 'U06DE5USEEM-e5386ad93e75-192',
    farah: E + 'U0A2W19C2C8-553222f85c03-192',
    amen: E + 'U06EY8NJHLG-f0e1a2776405-192',
    howshan: E + 'U09PSSEP0HM-0604eee17742-192',
    raghdaa: E + 'U0BAR4N4FPH-85afb2628a24-192',
    hani: E + 'U06D1GQ58HG-8c6bc0f588ab-192',
    zaidan: E + 'U06G2SHJB9R-c75c35bb7476-192',
    faraj: E + 'U06G5DNPZA8-f8c3f8eaa8c1-192',
    batarfi: E + 'U06CUT8FT4N-8c6bc6f01576-192',
    omar: E + 'U09CC2V09NZ-e9746e70723f-192',
    rafah: E + 'U099C2KP1NU-e21952c27f82-192',
    aljazi: E + 'U097HCNCAG3-e77f77e8c551-192',
    rosa: E + 'U09CC2R0H29-95f79433181c-192',
    altahini: E + 'U097HCRUYCB-16b4f569fed9-192',
  };

  WP.orgTreeData = { PEOPLE: PEOPLE, SQUADS: SQUADS, COUNTRY_FLAG: COUNTRY_FLAG, SLACK_TITLES: SLACK_TITLES, IMG: IMG };
})(window.WP = window.WP || {});
