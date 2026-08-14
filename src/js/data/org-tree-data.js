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

    // Automation & Execution (5, 0 FL) — sub-team: Anti-Fraud
    { id: 'ayman', name: 'Ayman Albasha', role: 'Event Operations Sr. Manager', squad: 'Automation & Execution', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Syria', contract: 'Full-time', level: 'Sr. Manager', manager: 'ahmed', status: 'active', lead: true, start: '2021-02' },
    { id: 'shahad', name: 'Shahad Joudah', role: 'Event Operations Specialist — Trainer', squad: 'Automation & Execution', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Specialist', manager: 'ayman', status: 'active', lead: false, start: '2023-06' },
    { id: 'batool', name: 'Batool Emad', role: 'Event Operations Manager — Anti-Fraud', squad: 'Automation & Execution', unit: 'Anti-Fraud', country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Manager', manager: 'ayman', status: 'active', lead: true, start: '2022-05' },
    { id: 'af1', name: 'TBC', role: 'Event Operations Specialist — Anti-Fraud', squad: 'Automation & Execution', unit: 'Anti-Fraud', country: 'Saudi Arabia', city: 'Riyadh', nationality: null, contract: 'Full-time', level: 'Specialist', manager: 'batool', status: 'open', lead: false, start: null },
    { id: 'af2', name: 'TBC', role: 'Event Operations Coordinator — Anti-Fraud', squad: 'Automation & Execution', unit: 'Anti-Fraud', country: 'Saudi Arabia', city: 'Riyadh', nationality: null, contract: 'Full-time', level: 'Coordinator', manager: 'batool', status: 'open', lead: false, start: null },

    // Sports (7, 1 FL) — sub-team: Akram’s Pod
    { id: 'motaa', name: 'Motaa Aldarra', role: 'Event Operations Sr. Manager', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Syria', contract: 'Full-time', level: 'Sr. Manager', manager: 'ahmed', status: 'active', lead: true, start: '2021-04' },
    { id: 'akram', name: 'Mohammed Akram', role: 'Event Operations Manager', squad: 'Sports', unit: 'Akram’s Pod', country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Manager', manager: 'motaa', status: 'active', lead: true, start: '2022-09', you: true },
    { id: 'maksosah', name: 'Abdulrahman Maksousa', role: 'Event Operations Sr. Specialist', squad: 'Sports', unit: 'Akram’s Pod', country: 'Saudi Arabia', city: 'Jeddah', nationality: 'Syria', contract: 'Freelance', level: 'Sr. Specialist', manager: 'akram', status: 'active', lead: false, start: '2023-01' },
    { id: 'khaled', name: 'Khaled Jeneina', role: 'Event Operations Sr. Specialist', squad: 'Sports', unit: 'Akram’s Pod', country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Jordan', contract: 'Full-time', level: 'Sr. Specialist', manager: 'akram', status: 'active', lead: false, start: '2023-03' },
    { id: 'shamma', name: 'Shamma Alsagr', role: 'Event Operations Specialist', squad: 'Sports', unit: 'Akram’s Pod', country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Specialist', manager: 'akram', status: 'active', lead: false, start: '2024-02' },
    { id: 'idris', name: 'Mohammed Idris', role: 'Event Operations Specialist', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: 'Saudi Arabia', contract: 'Full-time', level: 'Specialist', manager: 'motaa', status: 'active', lead: false, start: '2023-11' },
    { id: 'sp1', name: 'TBC', role: 'Event Operations Specialist', squad: 'Sports', unit: null, country: 'Saudi Arabia', city: 'Riyadh', nationality: null, contract: 'Full-time', level: 'Specialist', manager: 'motaa', status: 'open', lead: false, start: null },

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

  WP.orgTreeData = { PEOPLE: PEOPLE, SQUADS: SQUADS, COUNTRY_FLAG: COUNTRY_FLAG, SLACK_TITLES: SLACK_TITLES };
})(window.WP = window.WP || {});
