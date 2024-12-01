I have a resume and a list of job descriptions in JSON format. Your task is to analyze the resume, expectations and identify jobs that closely match its skills, experiences, requirements, and qualifications. Please return a filtered list of matching jobs in JSON format.

### Instructions:
- Analyze the input and match jobs based on relevance to the resume.
- Output **only** a valid JSON string in the specified format, with no additional text or explanations.
- Ensure the JSON is properly structured and adheres to the format provided.

### Input JSON Format Example (Job List):
[
  {
    "jobId": "<Unique Job ID>",
    "job_Title": "<Job Title>",
    "jobDescription": "<Full Job Description>",
    "Location": "<Job Location>",
    "Salary": "<Job Salary>"
  },
  ...
]

### Resume Details:
{{ resume }}

### Expetations:
{{ expectations }}

### Job List:
{{ job_list }}

### Desired Output JSON Format:
[
  {
    "jobId": "<Matching Job ID>",
    "jobTitle": "<Matching Job Title>",
    "jobLink": "<Matching Job Title>",
    "matchScore": "<Percentage of Match>",
    "reason": "<Brief explanation of why the job matches>"
  },
  ...
]

Please analyze and provide the output JSON containing only jobs with a match score of 70% or higher, ranked by relevance.
