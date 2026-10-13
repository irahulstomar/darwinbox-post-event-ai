// M1b · Merge the Clay callback with the HubSpot contact and build the DeepSeek classification request.
// Runs once per item (Clay calls back one row at a time).

const clay = $('Clay callback').item.json.body || {};
const contact = $json.properties || {};

// Clay returns sizes as numbers or ranges ("1,001-5,000", "10001+"). Keep the lower bound.
const parseCount = v => {
  if (v === null || v === undefined || v === '') return null;
  const nums = String(v).replace(/,/g, '').match(/\d+/g);
  return nums ? Number(nums[0]) : null;
};
const company = {
  name: clay.company_name || contact.company || '',
  domain: (clay.final_domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase(),
  employee_count: parseCount(clay.employee_count),
  industry: clay.industry || '',
  hq_country: clay.hq_country || '',
  linkedin_url: clay.linkedin_url || '',
  description: (clay.description || '').slice(0, 600),
};

const system = `You normalise B2B lead data for Darwinbox, an enterprise HCM (HR software) platform.
Its buyers are HR leaders and HR tech owners at mid-size and large enterprises in India, Southeast Asia, the Middle East and the US.
Return ONLY a JSON object with exactly these keys:
{
 "normalized_title": string | null,           // clean, readable job title, e.g. "Senior Manager, HR"
 "job_function": one of ["HR","HRIS","Talent Acquisition","L&D","Total Rewards","Finance","IT","Operations","Leadership","Student","Consulting","Other"],
 "seniority": one of ["C-level","VP","Director","Manager","IC","Unknown"],
 "industry": string | null,                   // short normalised industry, e.g. "IT Services", "Banking & Financial Services"
 "employee_count_estimate": integer | null,   // ONLY if company.employee_count is null and you know the company well
 "contact_country": string | null,            // ONLY if contact.country is empty; use the company HQ country
 "disqualifier": one of ["none","student","consultant_or_agency","hr_tech_vendor","personal_use"],
 "inferred": [ { "field": string, "value": string, "confidence": number, "basis": string } ],
 "fit_note": string                            // one sentence: why this person/company is or is not a fit for Darwinbox
}
Rules:
- Use the given data first. Only infer what is missing, and list every inferred value in "inferred" with a 0-1 confidence and a short basis.
- If the title is empty, infer function/seniority only if the company + context make it reasonable; otherwise use "Other"/"Unknown".
- Never invent facts about the person. In fit_note, refer to the contact by role, not by gendered pronouns.
- No markdown, no extra keys.`;

const user = JSON.stringify({
  contact: {
    name: `${contact.firstname || ''} ${contact.lastname || ''}`.trim(),
    job_title: contact.jobtitle || '',
    company: contact.company || '',
    country: contact.country || '',
    attendance: contact.event_attendance_status || '',
  },
  company,
});

return {
  json: {
    hs_contact_id: clay.row_id || $json.id,
    contact, company,
    request_body: {
      model: 'deepseek-flash',
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500,
      thinking: { type: 'disabled' },   // classification needs no reasoning; keeps it fast and the JSON complete
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    },
  },
};
