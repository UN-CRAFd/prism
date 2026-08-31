-- Load Annex B guidance text into the narrative sections.
--
-- Step 1 sets the description on the standard library, which seeds all future
-- projects. Step 2 copies the library text into the per-project snapshots in
-- project_narratives, which is what the ProDoc editor actually renders — those
-- are taken at project creation and do not otherwise pick up library edits.
--
-- Safe to re-run: UPDATEs only, no inserts or deletes.
-- Verified before first run: no project had a customised description.

-- ── Step 1: standard library ──────────────────────────────────────────────

UPDATE reporting_platform.standard_narrative_questions SET description =
'Provide an overview of the thematic focus of your project and explain how it prioritizes the interests of populations in fragile and crisis-affected settings to leave no one behind in pursuit of the 2030 Agenda. Justify its relevance by elaborating on the following questions:
- Explain the challenge you want to address with the project.
- Elaborate on the scope and urgency of the challenge.
- Outline the populations impacted by this challenge, identify the key stakeholders involved, and describe the primary audience or users of the project.'
WHERE narrative_key = 'background_relevance';

UPDATE reporting_platform.standard_narrative_questions SET description =
'Outline how the project is expected to produce specific results or outcomes to provide the theory of change for the project. Explain the logical sequence of events expected due to the project, including the underlying assumptions and the relationships between activities, outputs, and outcomes.

A detailed description of project outcomes, outputs, and activities must be provided in Gateway''s "Results Based Management" tab. The project''s impact, outcome and outputs from the RBM section must all be referenced in the Theory of Change, including the numbering convention. For example, if you have an outcome 1 and 2 and outputs 1.1, 1.2, 1.3, 2.1 and 2.2, these should all be referenced in the Theory of Change Framework.'
WHERE narrative_key = 'theory_of_change';

UPDATE reporting_platform.standard_narrative_questions SET description =
'Describe the methodologies you plan to implement in this project, ensuring a comprehensive understanding of your approach. If applicable to your project, include the following aspects:
- Summarize your approach to data collection and validation.
- Describe models, algorithms, and AI solutions applied for the project and outline your strategy for validating those.
- Mention methods for ongoing evaluation and refinement of methodologies.
- Outline how you ensure the responsible use of data, including fairness, transparency, and privacy principles.
- Describe how you will provide open access to outputs funded by CRAF''d using interoperable and open data standards.'
WHERE narrative_key = 'methodology';

UPDATE reporting_platform.standard_narrative_questions SET description =
'Please describe the ways how your project aligns and is committed to the CRAF''d Principles (Terms of Reference, p. 6). Please make sure to elaborate on each principle:
- Prioritize the interests of populations in vulnerable situations to leave no-one behind in pursuit of the 2030 Agenda, and share the conviction that this is only possible with a strong emphasis on broad stakeholder engagement, local capacity building, data/model validation, and expert analysis in the field.
- Commit to the responsible use of data, including principles of fairness, transparency, and privacy.
- Provide open access to outputs funded by CRAF''d using interoperable and open data standards.
- Incentivize data providers to not exclusively rely on financial support from CRAF''d.'
WHERE narrative_key = 'crafd_principles';

UPDATE reporting_platform.standard_narrative_questions SET description =
'Describe the project''s multiplier effects and how it creates synergies across the global crisis data ecosystem:
- Explain how the project integrates seamlessly with existing data infrastructure and initiatives within the global crisis data ecosystem, fostering a collaborative environment.
- Describe how the project''s outcomes will serve as building blocks, fostering data interoperability and compatibility with other projects and systems.
- Discuss any partnerships, data exchanges, or cross-project synergies that the project envisions or has already established, emphasizing the benefits of such collaborations for the overall ecosystem''s growth and effectiveness.
- Please also refer to emerging collaborations with other projects from the current open call cohort or project partners that are already part of the CRAF''d data ecosystem.
- Explain how the project will ensure an inclusive approach to stakeholder engagement and local capacity building.'
WHERE narrative_key = 'ecosystem_impact';

UPDATE reporting_platform.standard_narrative_questions SET description =
'Outline how the project will provide reliable, long-term outputs that the global crisis data ecosystem can depend on. Ensure that you include the following aspects:
- Outline the planned frequency and method for automatic updates in the project.
- Explain the procedures that will be implemented for quality assurance to maintain the integrity of the project''s outputs.
- Elaborate on the measures to maintain the highest possible accessibility for the broader ecosystem.
- Outline plans to sustain the project''s success beyond CRAF''d funding.'
WHERE narrative_key = 'sustainability';

UPDATE reporting_platform.standard_narrative_questions SET description =
'Detail the project''s scalability in both geographic and thematic aspects. If applicable to your project, include the following aspects:
- Explain how you will ensure the delivery of consistent and reliable data across various regions and a range of thematic areas.
- Describe your strategy for adapting the project to encompass a broader spectrum of topics and larger geographic scopes.'
WHERE narrative_key = 'scalability';

UPDATE reporting_platform.standard_narrative_questions SET description =
'Describe the project''s innovative aspects, specifically how it employs novel approaches to address longstanding barriers and challenges deeply embedded in existing systems. If applicable to your project, include the following aspects:
- Describe the expected outcomes of these innovative approaches, particularly how they improve efficiency, effectiveness, or scalability.
- Detail any new challenges or risks introduced by these innovative approaches and your strategies for managing them.'
WHERE narrative_key = 'innovation';

UPDATE reporting_platform.standard_narrative_questions SET description =
'Provide a detailed account of your project''s financial management strategies to ensure the most economical use of funds. Your explanation should also include the following key aspects:
- Discuss how the project will sustain its activities and outcomes beyond the period of CRAF''d funding, emphasizing any strategies for long-term financial stability.
- If applicable, explain how your approach to using CRAF''d funding offers a comparative advantage in terms of cost-effectiveness compared to similar projects or initiatives.
- Explain how the project will leverage synergies with other projects, infrastructures, or resources to enhance cost-effectiveness and resource optimization.'
WHERE narrative_key = 'cost_effectiveness';

-- ── Step 2: copy into existing projects ───────────────────────────────────

UPDATE reporting_platform.project_narratives p
SET description = s.description
FROM reporting_platform.standard_narrative_questions s
WHERE s.narrative_key = p.narrative_key
  AND s.description IS NOT NULL;