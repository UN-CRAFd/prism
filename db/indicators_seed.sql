Replace the sample `VALUES` block with the following, using the indicators from your attached list. 

```sql
INSERT INTO reporting_platform.indicators (
  name,
  description,
  means_of_verification,
  category,
  cycle,
  is_standard,
  project_id
) VALUES
(
  'Datasets made available to intended users',
  'Measures the number of project-supported datasets made available to intended users during the reporting period.',
  'Dataset license metadata; repository access settings; project data portal access logs',
  'Data outputs & quality',
  'yearly',
  TRUE,
  NULL
),
(
  'Datasets provided in non-proprietary formats',
  'Measures the number of project datasets released in at least one non-proprietary file format.',
  'Dataset file format metadata on distribution platform; repository format list; accompanying codebook or data dictionary; schema documentation; internal release checklist',
  'Data outputs & quality',
  'yearly',
  TRUE,
  NULL
),
(
  'Analytics products made available to intended users',
  'Measures the number of analytics products made available to intended users.',
  'Internal product registry; project website publication log; partner distribution records',
  'Analytics products',
  'yearly',
  TRUE,
  NULL
),
(
  'Datasets and analytics products released with accessible code or methodology documentation',
  'Measures the number of project-supported datasets and analytics products for which analytical code, processing scripts, reproducibility materials, or methodology documentation are made available to intended users.',
  'Public code repository; license file; README; dependency specification; verification of public accessibility',
  'Analytics products',
  'yearly',
  TRUE,
  NULL
),
(
  'Datasets and analytics products with SADDD or other relevant disaggregation',
  'Measures the number of project datasets and analytics products that include at least one populated, structured SADDD or other qualifying disaggregation variable.',
  'Codebook; data dictionary; dataset inspection; internal release checklist; WG-SS documentation where applicable',
  'Data outputs & quality',
  'yearly',
  TRUE,
  NULL
),
(
  'Unique downloads of project outputs',
  'Measures the number of unique download events for project outputs, including datasets and analytics products.',
  'Download statistics; Google Analytics; data portal download logs; repository traffic reports',
  'Access & usage',
  'yearly',
  TRUE,
  NULL
),
(
  'Unique users accessing the project outputs',
  'Measures the number of unique active users who access one or more project outputs.',
  'Registered user records; user analytics; authenticated logins; survey-based user reporting; DOI tracking',
  'Access & usage',
  'yearly',
  TRUE,
  NULL
),
(
  'API calls to project data',
  'Measures the total number of API calls made to the project data API during the reporting period.',
  'API server logs; platform analytics; developer dashboards; cloud infrastructure monitoring',
  'Access & usage',
  'yearly',
  TRUE,
  NULL
),
(
  'External products referencing or incorporating project outputs',
  'Measures the number of external publications, reports, assessments or policy documents that explicitly cite, reference or use project datasets or analytics products.',
  'Citation monitoring; stakeholder-reported citations; web searches; partner reporting',
  'Reach & influence',
  'yearly',
  TRUE,
  NULL
),
(
  'Knowledge and capacity building initiatives conducted as part of the project',
  'Measures the number of knowledge and capacity building initiatives delivered as part of the project.',
  'Event registers; attendance lists; completion records; evaluation surveys; training portal logs; partner reports',
  'Capacity & partnerships',
  'yearly',
  TRUE,
  NULL
),
(
  'Participants in knowledge and capacity building initiatives as part of the project',
  'Measures the number of in-person or virtual participants in knowledge and capacity building initiatives.',
  'Event registers; attendance lists; training completion records; evaluation surveys; partner reports',
  'Capacity & partnerships',
  'yearly',
  TRUE,
  NULL
),
(
  'Partners contributing to the project',
  'Measures the number of entities formally engaged in or contributing to the project.',
  'Partner agreements; project reports; consortium documentation; data sharing records',
  'Capacity & partnerships',
  'yearly',
  TRUE,
  NULL
),
(
  'Entities that use project outputs to support crisis action',
  'Measures the number of entities that use project outputs to inform crisis-related programming, decision-making or resource allocation.',
  'Stakeholder surveys; interviews; humanitarian response plans; meeting minutes; published reports',
  'Reach & influence',
  'yearly',
  TRUE,
  NULL
),
(
  'People benefiting from crisis assistance informed by project outputs',
  'Number of people who demonstrably benefit from crisis assistance informed by the project outputs.',
  'Beneficiary surveys; project reports; partner utilisation reports; UN OCHA reports; third-party evaluations',
  'Reach & influence',
  'yearly',
  TRUE,
  NULL
),
(
  'Crisis funding informed by project outputs',
  'Measures the total amount of crisis funding, in USD, where project outputs directly or indirectly informed funding decisions.',
  'Financial decision records; HRP funding tables; donor reports; Financial Tracking Service; IATI; donor data collection',
  'Reach & influence',
  'yearly',
  TRUE,
  NULL
)
ON CONFLICT DO NOTHING;
```
