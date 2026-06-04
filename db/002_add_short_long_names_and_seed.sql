SET search_path TO reporting_platform;

-- ── Add short/long name columns ──────────────────────────────────────────────

ALTER TABLE partners ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS long_name  TEXT;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS long_name  TEXT;

-- ── Clean existing test data ─────────────────────────────────────────────────
-- Remove the test rows we seeded earlier so we can do a clean insert
DELETE FROM implementing_partners;
DELETE FROM indicator_sections;
DELETE FROM reports;
DELETE FROM projects;
DELETE FROM partners;

-- Reset sequences
ALTER SEQUENCE partners_id_seq RESTART WITH 1;
ALTER SEQUENCE projects_id_seq RESTART WITH 1;

-- ── Insert 15 partner organizations ──────────────────────────────────────────

INSERT INTO partners (organization_name, short_name, long_name, organization_website, password_hash, mail_account) VALUES
('Armed Conflict Location & Event Data',        'ACLED',        'Armed Conflict Location & Event Data (ACLED)',                          'https://acleddata.com/',                           'acled2024',  'acled@crafd.org'),
('IGAD Climate Prediction and Applications Centre', 'ICPAC',    'IGAD Climate Prediction and Applications Centre (ICPAC)',               'https://www.icpac.net/',                           'icpac2024',  'icpac@crafd.org'),
('Internal Displacement Monitoring Centre',      'IDMC',         'Norwegian Refugee Council (NRC) / Internal Displacement Monitoring Centre (IDMC)', 'https://www.internal-displacement.org/',   'idmc2024',   'idmc@crafd.org'),
('IFRC',                                         'IFRC',         'International Federation of Red Cross and Red Crescent Societies',     'https://www.ifrc.org/',                            'ifrc2024',   'ifrc@crafd.org'),
('International Organization for Migration',     'IOM',          'International Organization for Migration Displacement Tracking Matrix','https://dtm.iom.int/',                             'iom2024',    'iom@crafd.org'),
('Feminist Humanitarian Network',                'FHN',          'Feminist Humanitarian Network (Hosted by ActionAid International)',    'https://www.feministhumanitariannetwork.org/',     'fhn2024',    'fhn@crafd.org'),
('University of Denver - Josef Korbel School',   'Korbel',       'University of Denver - Josef Korbel School of International Studies',  'https://korbel.du.edu/',                           'korbel2024', 'korbel@crafd.org'),
('Norwegian Refugee Council',                    'NORCAP',       'Norwegian Refugee Council (NRC)',                                      'https://www.nrc.no/',                              'norcap2024', 'norcap@crafd.org'),
('OHCHR',                                        'OHCHR',        'Office of the United Nations High Commissioner for Human Rights (OHCHR)', 'https://www.ohchr.org/',                       'ohchr2024',  'ohchr@crafd.org'),
('Peace Research Institute Oslo',                'PRIO',         'Peace Research Institute Oslo (PRIO)',                                 'https://www.prio.org/',                            'prio2024',   'prio@crafd.org'),
('Red Cross Red Crescent Climate Centre',        'RCCC',         'Red Cross Red Crescent Climate Centre (RCCC)',                         'https://www.climatecentre.org/',                   'rccc2024',   'rccc@crafd.org'),
('UNHCR',                                        'UNHCR',        'United Nations High Commissioner for Refugees',                        'https://www.unhcr.org',                            'unhcr2024',  'unhcr@crafd.org'),
('UN Women',                                     'UN Women',     'UN Women',                                                             'https://www.unwomen.org',                          'unwomen2024','unwomen@crafd.org'),
('International Crisis Group',                   'ICG',          'International Crisis Group',                                            'http://www.crisisgroup.org',                       'icg2024',    'icg@crafd.org'),
('United Nations Development Programme',         'UNDP',         'United Nations Development Programme (UNDP)',                           'https://www.undp.org/',                            'undp2024',   'undp@crafd.org');

-- ── Insert 17 projects ───────────────────────────────────────────────────────
-- partner_id references use subselects on short_name for clarity

INSERT INTO projects (partner_id, project_title, short_name, long_name, mptfo_project_number, grant_size_usd, project_duration, geographic_scope) VALUES
-- 1. ACLED: Maintaining ACLED
((SELECT id FROM partners WHERE short_name = 'ACLED'),
 'Maintaining & Improving ACLED''s Core Operations, Accessibility, and Interoperability',
 'MaintainingACLED',
 'Maintaining & Improving ACLED''s Core Operations, Accessibility, and Interoperability',
 '00140841', 14708969.00, '24 months', 'Global'),

-- 2. ICPAC: Hazard Modeling
((SELECT id FROM partners WHERE short_name = 'ICPAC'),
 'Hazard modeling, impact estimation, climate storylines for event catalogue on drought and flood disasters in Eastern Africa',
 'HazardModeling',
 'Hazard modeling, impact estimation, climate storylines for event catalogue on drought and flood disasters in the Eastern Africa',
 '00140904', 500064.00, '24 months', 'Regional - East Africa'),

-- 3. IDMC: Internal Displacement
((SELECT id FROM partners WHERE short_name = 'IDMC'),
 'Global harmonized data on internal displacement to inform prevention, response and solutions',
 'InternalDisplacement',
 'Global harmonized data on internal displacement to inform prevention, response and solutions',
 '00140773', 1500000.00, '24 months', 'Global'),

-- 4. IFRC: GUARD
((SELECT id FROM partners WHERE short_name = 'IFRC'),
 'GUARD',
 'GUARD',
 'GUARD',
 '00141337', 599735.00, '24 months', 'Global'),

-- 5. IOM: PRIMARI
((SELECT id FROM partners WHERE short_name = 'IOM'),
 'Progressive Representation of Internal Migration and Risk Intelligence (PRIMARI)',
 'PRIMARI',
 'Progressive Representation of Internal Migration and Risk Intelligence (PRIMARI)',
 '00140673', 500000.00, '16 months', 'Global'),

-- 6. FHN: Kente Threads
((SELECT id FROM partners WHERE short_name = 'FHN'),
 'Kente Threads: Weaving leadership from displacement data',
 'KenteThreads',
 'Kente Threads: Weaving leadership from displacement data',
 '00141356', 299749.00, '12 months', 'Global'),

-- 7. Korbel: WAAR
((SELECT id FROM partners WHERE short_name = 'Korbel'),
 'Women''s Mobilization Within Armed Groups During and After War (WAAR)',
 'WAAR',
 'Women''s Mobilization Within Armed Groups During and After War (WAAR)',
 '00141160', 400000.00, '24 months', 'Global'),

-- 8. NORCAP: Strengthening Ecosystem
((SELECT id FROM partners WHERE short_name = 'NORCAP'),
 'Strengthening the CRAF''d Data Ecosystem for More Effective Crisis Action',
 'StrengtheningEcosystem',
 'Strengthening the CRAF''d Data Ecosystem for More Effective Crisis Action',
 '00140302', 1000000.00, '51 months', 'Global'),

-- 9. OHCHR: Rapid Assessment Data
((SELECT id FROM partners WHERE short_name = 'OHCHR'),
 'Rapid Assessment Data: Preventing conflict-related violence',
 'RapidAssessmentData',
 'Rapid Assessment Data: Preventing conflict-related violence',
 '00141135', 499968.00, '24 months', 'Global'),

-- 10. PRIO: EMPOW
((SELECT id FROM partners WHERE short_name = 'PRIO'),
 'Women''s Empowerment in Peace Processes (EMPOW)',
 'EMPOW',
 'Women''s Empowerment in Peace Processes (EMPOW)',
 '00141160', 1200000.00, '24 months', 'Global'),

-- 11. PRIO: VIEWS
((SELECT id FROM partners WHERE short_name = 'PRIO'),
 'VIEWS-PIN: People in Need',
 'VIEWS',
 'VIEWS-PIN: People in Need',
 '00140560', 700000.00, '30 months', 'Global'),

-- 12. RCCC: Conflict Climate
((SELECT id FROM partners WHERE short_name = 'RCCC'),
 'OPTICC: Conflict-climate-displacement & vulnerability data in Africa and MENA',
 'ConflictClimate',
 'OPTICC: Conflict-climate-displacement & vulnerability data in Africa and MENA',
 '00140919', 499986.00, '24 months', 'Global'),

-- 13. UNHCR: CLIFDEW
((SELECT id FROM partners WHERE short_name = 'UNHCR'),
 'CLIFDEW-GRID: Early Warning Grid-Based Risk Modelling of Climate Induced Forced Displacement',
 'CLIFDEW',
 'CLIFDEW-GRID: Early Warning Grid-Based Risk Modelling of Climate Induced Forced Displacement',
 '00140268', 500071.00, '29 months', 'East and West Africa'),

-- 14. UN Women: Transformative Outcomes
((SELECT id FROM partners WHERE short_name = 'UN Women'),
 'Transformative Outcomes: Leveraging Crisis Data in Conflict',
 'TransformativeOutcomes',
 'Transformative Outcomes: Leveraging Crisis Data in Conflict',
 '00141136', 1000000.00, '24 months', 'Global, CAR, Haiti, Lebanon, Myanmar, Palestine, Sudan'),

-- 15. ICG: EEARTH
((SELECT id FROM partners WHERE short_name = 'ICG'),
 'Environmental Early Action and Risk Tracking Hub (EEARTH)',
 'EEARTH',
 'Environmental Early Action and Risk Tracking Hub (EEARTH)',
 '00140353', 700000.00, '24 months', 'Horn of Africa (South Sudan, Somalia)'),

-- 16. UNDP: INFORM
((SELECT id FROM partners WHERE short_name = 'UNDP'),
 'INFORM WARNING - An open system to aggregate and present quantified multihazard information',
 'INFORM',
 'INFORM WARNING - An open system to aggregate and present quantified multihazard information',
 '00140249', 700000.00, '30 months', 'Global'),

-- 17. UNDP: DataHub
((SELECT id FROM partners WHERE short_name = 'UNDP'),
 'Risk Anticipation Data Hub',
 'DataHub',
 'Risk Anticipation Data Hub',
 '00140727', 500000.00, '20 months', 'Global');
