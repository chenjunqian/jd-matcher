# AI Agent Job Matching Evaluation Rubric

This document defines the criteria and scoring standards for the AI Agent when evaluating candidate resumes (`resume.md`) and preferences (`expectations.md`) against retrieved Job Descriptions (JDs).

---

## 1. Two-Step Evaluation Methodology

The AI Agent must evaluate each candidate JD in a strict two-step sequence:

### Step 1: Hard Expectations Gate (Strict Veto)
**Single Veto Rule**: If a job posting violates ANY hard constraint defined in `expectations.md`, it must be immediately rejected and omitted from recommendation.
- **Geographic & Timezone Restrictions**: For instance, if the candidate requires global remote work and the JD explicitly mandates "US Only / Must be US Citizen / EU residency required", reject immediately.
- **Compensation Floor**: If the listed salary ceiling is strictly below the candidate's stated minimum acceptable compensation.
- **Work Type Mismatch**: For instance, if the candidate seeks full-time employment and the JD is exclusively for part-time hourly or freelance contract work.
- **Core Function Mismatch**: For instance, if the candidate is a full-stack/backend engineer and the JD is for UI/UX designer or QA automation tester.

### Step 2: Skill & Background Fit Scoring (0.0 - 10.0 Scale)
Once past the hard constraints gate, evaluate the candidate's core skills, years of experience, and project achievements:

| Score Range | Tier | Criteria & Assessment | Action |
|---|---|---|---|
| **9.0 - 10.0** | **Top Match** | Core tech stack 100% aligned, seniority and domain experience match perfectly. Exceptional fit. | Priority recommendation, highlighted at the top. |
| **7.5 - 8.9** | **Good Fit** | Vast majority of requirements met (e.g. strong React/Node, only minor secondary tools missing). | Recommended for application with preparation tips. |
| **6.0 - 7.4** | **Borderline** | Meets minimum baseline requirements, but notable skill or experience gaps exist. | Secondary recommendation with explicit risk warnings. |
| **< 6.0** | **Reject** | Low skill overlap or significant experience gap. Low probability of interview conversion. | Excluded from the final recommendation report. |

---

## 2. Recommendation Output Elements

For each job recommended to the user, the AI Agent must provide detailed assessment across four dimensions:

1. **Role Overview**: Title, company, location/timezone, compensation, and link.
2. **Match Score**: Explicit score (e.g., `8.8 / 10`).
3. **Core Alignment (Why Match)**: Direct citations of matching skills, technologies, and achievements from the candidate's resume.
4. **Skill Gaps & Application Tips**: Explicitly highlight any JD requirements not prominent in the resume, offering resume tailoring and interview preparation advice.

---

## 3. Reporting Standard

All recommendations should be archived in `data/matches/YYYY-MM-DD-report.md`, and an executive summary presented to the user in the active chat session.
